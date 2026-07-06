import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

type ExpiredDocumentRow = {
  id: string;
  case_id: string;
  file_name: string;
  storage_path: string | null;
  expires_at: string | null;
};

const bucketName = "case-documents";
const retentionDays = 60;
const batchSize = 100;
const driveScope = "https://www.googleapis.com/auth/drive";
const tokenEndpoint = "https://oauth2.googleapis.com/token";

function encodeBase64Url(bytes: Uint8Array | string) {
  const binary =
    typeof bytes === "string"
      ? bytes
      : Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parsePrivateKey(rawPrivateKey: string) {
  const pem = rawPrivateKey.replace(/\\n/g, "\n");
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  return decodeBase64(base64);
}

async function getServiceAccountAssertion() {
  const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const rawPrivateKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");

  if (!clientEmail || !rawPrivateKey) return "";

  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encodeBase64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: driveScope,
      aud: tokenEndpoint,
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsignedToken = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    parsePrivateKey(rawPrivateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function getGoogleAccessToken() {
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (refreshToken && clientId && clientSecret) {
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.access_token) {
      throw new Error(result.error || "Unable to get Google access token.");
    }

    return result.access_token as string;
  }

  const assertion = await getServiceAccountAssertion();
  if (assertion) {
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.access_token) {
      throw new Error(result.error || "Unable to get Google service token.");
    }

    return result.access_token as string;
  }

  return "";
}

function parseDriveStoragePath(storagePath: string | null) {
  if (!storagePath) return null;

  const match = storagePath.match(/^google-drive:([^:]+):([^:]+)$/);
  if (!match) return null;

  return {
    folderId: match[1],
    fileId: match[2],
  };
}

async function deleteDriveFolder(accessToken: string, folderId: string) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(body || "Unable to delete Google Drive folder.");
  }
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase environment", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();

  const { data: documents, error } = await supabase
    .from("case_documents")
    .select("id,case_id,file_name,storage_path,expires_at")
    .is("deleted_at", null)
    .lte("expires_at", now.toISOString())
    .limit(batchSize);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const expiredDocuments = (documents || []) as ExpiredDocumentRow[];

  if (!expiredDocuments.length) {
    return Response.json({
      ok: true,
      deleted_documents: 0,
      deleted_files: 0,
    });
  }

  const driveFolders = new Map<string, ExpiredDocumentRow[]>();
  const supabaseStoragePaths = expiredDocuments
    .map((document) => document.storage_path)
    .filter((path): path is string => Boolean(path));

  for (const document of expiredDocuments) {
    const drivePath = parseDriveStoragePath(document.storage_path);
    if (!drivePath) continue;

    driveFolders.set(drivePath.folderId, [
      ...(driveFolders.get(drivePath.folderId) || []),
      document,
    ]);
  }

  const storagePaths = supabaseStoragePaths.filter(
    (path) => !parseDriveStoragePath(path),
  );

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove(storagePaths);

    if (storageError) {
      return Response.json(
        { ok: false, error: storageError.message },
        { status: 500 },
      );
    }
  }

  let deletedDriveFolders = 0;
  const driveDeletedDocuments: ExpiredDocumentRow[] = [];
  let googleAccessToken = "";

  if (driveFolders.size) {
    try {
      googleAccessToken = await getGoogleAccessToken();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to get Google Drive token.";

      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }

  for (const [folderId] of driveFolders) {
    const { data: folderDocuments, error: folderError } = await supabase
      .from("case_documents")
      .select("id,case_id,file_name,storage_path,expires_at")
      .is("deleted_at", null)
      .like("storage_path", `google-drive:${folderId}:%`);

    if (folderError) {
      return Response.json({ ok: false, error: folderError.message }, { status: 500 });
    }

    const activeFolderDocuments = ((folderDocuments || []) as ExpiredDocumentRow[]).filter(
      (document) => parseDriveStoragePath(document.storage_path)?.folderId === folderId,
    );
    const folderReadyForDeletion =
      activeFolderDocuments.length > 0 &&
      activeFolderDocuments.every(
        (document) => document.expires_at && new Date(document.expires_at) <= now,
      );

    if (!folderReadyForDeletion) continue;

    if (!googleAccessToken) {
      return Response.json(
        { ok: false, error: "Google Drive cleanup is not configured." },
        { status: 500 },
      );
    }

    await deleteDriveFolder(googleAccessToken, folderId);
    deletedDriveFolders += 1;
    driveDeletedDocuments.push(...activeFolderDocuments);
  }

  const expiredDocumentIds = [
    ...new Set([
      ...expiredDocuments
        .filter((document) => !parseDriveStoragePath(document.storage_path))
        .map((document) => document.id),
      ...driveDeletedDocuments.map((document) => document.id),
    ]),
  ];
  const deletedAt = now.toISOString();

  if (expiredDocumentIds.length) {
    const { error: updateError } = await supabase
      .from("case_documents")
      .update({
        deleted_at: deletedAt,
        delete_reason: `Auto-deleted after ${retentionDays} days.`,
        storage_deleted: true,
      })
      .in("id", expiredDocumentIds);

    if (updateError) {
      return Response.json({ ok: false, error: updateError.message }, { status: 500 });
    }
  }

  const activityDocuments = [
    ...expiredDocuments.filter((document) => !parseDriveStoragePath(document.storage_path)),
    ...driveDeletedDocuments,
  ];
  const activityRows = activityDocuments.map((document) => ({
    case_id: document.case_id,
    type: "document",
    actor_role: "admin",
    actor_name: "System",
    message: `Auto-deleted expired document after ${retentionDays} days: ${document.file_name}.`,
    created_at: deletedAt,
  }));

  if (activityRows.length) {
    const { error: activityError } = await supabase
      .from("case_activities")
      .insert(activityRows);

    if (activityError) {
      return Response.json({ ok: false, error: activityError.message }, { status: 500 });
    }
  }

  return Response.json({
    ok: true,
    deleted_documents: expiredDocumentIds.length,
    deleted_files: storagePaths.length,
    deleted_drive_folders: deletedDriveFolders,
  });
});
