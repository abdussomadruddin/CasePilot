import { createSign } from "crypto";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const googleDriveParentFolderId =
  process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID ||
  "11RVjbofIY6eUbdTpHEzBFrZHIAeMXf9B";
const defaultSupabaseUrl = "https://kfyqyxiycvdknlcpjmts.supabase.co";
const defaultSupabaseKey = "sb_publishable_Fs_FX9W23A3AbS-T8szB1g_pW_pNDui";
const oldSupabaseUrl = "https://rfqwyhafvfvafiqrcmxa.supabase.co";
const driveScope = "https://www.googleapis.com/auth/drive";
const tokenEndpoint = "https://oauth2.googleapis.com/token";

type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
};

type SupabaseUser = {
  id: string;
};

type ProfileRow = {
  role: string | null;
  active: boolean | null;
};

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function driveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function getSupabaseConfig() {
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const useDefaultProject =
    !configuredSupabaseUrl || configuredSupabaseUrl === oldSupabaseUrl;
  const supabaseUrl = useDefaultProject ? defaultSupabaseUrl : configuredSupabaseUrl;
  const supabaseAnonKey = useDefaultProject
    ? defaultSupabaseKey
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || defaultSupabaseKey;

  return { supabaseAnonKey, supabaseUrl };
}

async function authenticateRole(request: NextRequest) {
  const { supabaseAnonKey, supabaseUrl } = getSupabaseConfig();
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) return null;

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      authorization,
    },
    cache: "no-store",
  });

  if (!userResponse.ok) return null;

  const user = (await userResponse.json()) as SupabaseUser;
  if (!user.id) return null;

  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(
      user.id,
    )}&select=role,active&limit=1`,
    {
      headers: {
        apikey: supabaseAnonKey,
        authorization,
        accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!profileResponse.ok) return null;

  const profiles = (await profileResponse.json()) as ProfileRow[];
  const profile = profiles[0];

  if (!profile || profile.active === false || !profile.role) return null;

  return profile.role;
}

function getServiceAccountAssertion() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!clientEmail || !rawPrivateKey) return "";

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: driveScope,
      aud: tokenEndpoint,
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsignedToken = `${header}.${claim}`;
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  return `${unsignedToken}.${base64Url(signer.sign(privateKey))}`;
}

async function getAccessToken() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

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
      cache: "no-store",
    });

    const result = (await response.json()) as { access_token?: string; error?: string };
    if (!response.ok || !result.access_token) {
      throw new Error(result.error || "Unable to get Google Drive access token.");
    }

    return result.access_token;
  }

  const assertion = getServiceAccountAssertion();
  if (assertion) {
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      }),
      cache: "no-store",
    });

    const result = (await response.json()) as { access_token?: string; error?: string };
    if (!response.ok || !result.access_token) {
      throw new Error(result.error || "Unable to get Google Drive service token.");
    }

    return result.access_token;
  }

  throw new Error("Google Drive is not configured.");
}

async function driveFetch<T>(
  accessToken: string,
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${accessToken}`);

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
  });

  const text = await response.text();
  const result = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const errorResult = result as { error?: { message?: string } | string };
    const message =
      typeof errorResult.error === "string"
        ? errorResult.error
        : typeof errorResult.error?.message === "string"
          ? errorResult.error.message
          : "Google Drive request failed.";
    throw new Error(message);
  }

  return result as T;
}

async function findCaseFolders(accessToken: string, caseId: string) {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    `'${driveQueryValue(googleDriveParentFolderId)}' in parents`,
    `appProperties has { key='caseId' and value='${driveQueryValue(caseId)}' }`,
  ].join(" and ");
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,webViewLink,createdTime,modifiedTime)",
    pageSize: "20",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });

  const result = await driveFetch<{ files?: DriveFile[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );

  return result.files || [];
}

async function markCaseDocumentsDeleted(caseId: string, deletedAt: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Supabase service role key is not configured.");
  }

  const { supabaseUrl } = getSupabaseConfig();
  const response = await fetch(
    `${supabaseUrl}/rest/v1/case_documents?case_id=eq.${encodeURIComponent(
      caseId,
    )}&deleted_at=is.null`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        deleted_at: deletedAt,
        delete_reason: "case_deleted",
        storage_deleted: true,
      }),
      cache: "no-store",
    },
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || "Unable to mark case documents deleted.");
  }

  const rows = text ? (JSON.parse(text) as unknown[]) : [];
  return rows.length;
}

async function listFolderFiles(accessToken: string, folderId: string) {
  const q = [
    `'${driveQueryValue(folderId)}' in parents`,
    "trashed=false",
    "mimeType!='application/vnd.google-apps.folder'",
  ].join(" and ");
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,webViewLink,webContentLink,createdTime,modifiedTime,size)",
    pageSize: "100",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });

  const result = await driveFetch<{ files?: DriveFile[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );

  return result.files || [];
}

export async function GET(request: NextRequest) {
  const role = await authenticateRole(request);

  if (!role || !["admin", "customer_service"].includes(role)) {
    return Response.json({ error: "Not allowed to read Drive folder." }, { status: 403 });
  }

  const caseId = request.nextUrl.searchParams.get("caseId")?.trim();

  if (!caseId) {
    return Response.json({ error: "Missing case ID." }, { status: 400 });
  }

  try {
    const accessToken = await getAccessToken();
    const folders = await findCaseFolders(accessToken, caseId);
    const folder = folders[0] || null;
    const files = folder ? await listFolderFiles(accessToken, folder.id) : [];

    return Response.json({
      folder,
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        fileUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        downloadUrl: file.webContentLink,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        size: file.size,
      })),
    });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Unable to read Google Drive folder.";

    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const role = await authenticateRole(request);

  if (role !== "admin") {
    return Response.json({ error: "Only admin can delete Drive case folders." }, { status: 403 });
  }

  let payload: { caseId?: unknown };

  try {
    payload = (await request.json()) as { caseId?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof payload.caseId !== "string" || !payload.caseId.trim()) {
    return Response.json({ error: "Missing case ID." }, { status: 400 });
  }

  try {
    const caseId = payload.caseId.trim();
    const deletedAt = new Date().toISOString();
    const accessToken = await getAccessToken();
    const folders = await findCaseFolders(accessToken, caseId);

    await Promise.all(
      folders.map((folder) =>
        driveFetch(
          accessToken,
          `https://www.googleapis.com/drive/v3/files/${folder.id}?supportsAllDrives=true`,
          { method: "DELETE" },
        ),
      ),
    );
    const documentsMarkedDeleted = await markCaseDocumentsDeleted(caseId, deletedAt);

    return Response.json({
      deleted: folders.length,
      folderIds: folders.map((folder) => folder.id),
      documentsMarkedDeleted,
    });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Unable to delete Google Drive folder.";

    return Response.json({ error: message }, { status: 500 });
  }
}
