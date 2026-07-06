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
const allowedUploaderRoles = new Set(["admin", "customer_service"]);

type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
};

type SupabaseUser = {
  id: string;
};

type ProfileRow = {
  role: string | null;
  active: boolean | null;
};

async function authenticateUploader(request: NextRequest) {
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const useDefaultProject =
    !configuredSupabaseUrl || configuredSupabaseUrl === oldSupabaseUrl;
  const supabaseUrl = useDefaultProject ? defaultSupabaseUrl : configuredSupabaseUrl;
  const supabaseAnonKey = useDefaultProject
    ? defaultSupabaseKey
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || defaultSupabaseKey;
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      authorization,
    },
    cache: "no-store",
  });

  if (!userResponse.ok) return false;

  const user = (await userResponse.json()) as SupabaseUser;
  if (!user.id) return false;

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

  if (!profileResponse.ok) return false;

  const profiles = (await profileResponse.json()) as ProfileRow[];
  const profile = profiles[0];

  return Boolean(
    profile &&
      profile.active !== false &&
      profile.role &&
      allowedUploaderRoles.has(profile.role),
  );
}

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

function safeDriveName(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\r\n\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return cleaned || fallback;
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

  throw new Error(
    "Google Drive is not configured. Set OAuth refresh token or service account env vars.",
  );
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

async function setAnyoneCanRead(accessToken: string, fileId: string) {
  try {
    await driveFetch(
      accessToken,
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
          allowFileDiscovery: false,
        }),
      },
    );
  } catch {
    // Some Google Workspace policies block public links. The file still uploads.
  }
}

async function findCaseFolder(accessToken: string, caseId: string) {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    `'${driveQueryValue(googleDriveParentFolderId)}' in parents`,
    `appProperties has { key='caseId' and value='${driveQueryValue(caseId)}' }`,
  ].join(" and ");
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,webViewLink)",
    pageSize: "1",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });
  const result = await driveFetch<{ files?: DriveFile[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );

  return result.files?.[0] || null;
}

async function createCaseFolder(
  accessToken: string,
  input: {
    caseId: string;
    customerName: string;
    carModel: string;
    carVariant: string;
  },
) {
  const folderName = safeDriveName(
    [
      input.customerName || "Case",
      [input.carModel, input.carVariant].filter(Boolean).join(" "),
      input.caseId.slice(0, 8),
    ]
      .filter(Boolean)
      .join(" - "),
    `Case ${input.caseId.slice(0, 8)}`,
  );

  const folder = await driveFetch<DriveFile>(
    accessToken,
    "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [googleDriveParentFolderId],
        appProperties: {
          caseId: input.caseId,
          source: "casepilot",
        },
      }),
    },
  );

  await setAnyoneCanRead(accessToken, folder.id);

  return folder;
}

async function getOrCreateCaseFolder(
  accessToken: string,
  input: {
    caseId: string;
    customerName: string;
    carModel: string;
    carVariant: string;
  },
) {
  const existingFolder = await findCaseFolder(accessToken, input.caseId);
  if (existingFolder) return existingFolder;

  return createCaseFolder(accessToken, input);
}

async function uploadFileToDrive(
  accessToken: string,
  input: {
    file: File;
    folderId: string;
    caseId: string;
  },
) {
  const boundary = `casepilot-${crypto.randomUUID()}`;
  const metadata = {
    name: safeDriveName(input.file.name, "document"),
    parents: [input.folderId],
    appProperties: {
      caseId: input.caseId,
      source: "casepilot",
    },
  };
  const fileBuffer = Buffer.from(await input.file.arrayBuffer());
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata,
      )}\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Type: ${
        input.file.type || "application/octet-stream"
      }\r\n\r\n`,
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadedFile = await driveFetch<DriveFile>(
    accessToken,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,mimeType&supportsAllDrives=true",
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );

  await setAnyoneCanRead(accessToken, uploadedFile.id);

  return uploadedFile;
}

export async function POST(request: NextRequest) {
  let canUpload = false;

  try {
    canUpload = await authenticateUploader(request);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unable to verify uploader.";

    return Response.json({ error: message }, { status: 500 });
  }

  if (!canUpload) {
    return Response.json({ error: "Not allowed to upload documents." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const caseId = String(formData.get("caseId") || "").trim();
  const customerName = String(formData.get("customerName") || "").trim();
  const carModel = String(formData.get("carModel") || "").trim();
  const carVariant = String(formData.get("carVariant") || "").trim();

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file." }, { status: 400 });
  }

  if (!caseId) {
    return Response.json({ error: "Missing case ID." }, { status: 400 });
  }

  try {
    const accessToken = await getAccessToken();
    const folder = await getOrCreateCaseFolder(accessToken, {
      caseId,
      customerName,
      carModel,
      carVariant,
    });
    const uploadedFile = await uploadFileToDrive(accessToken, {
      file,
      folderId: folder.id,
      caseId,
    });

    return Response.json({
      fileId: uploadedFile.id,
      fileName: uploadedFile.name,
      fileUrl:
        uploadedFile.webViewLink ||
        `https://drive.google.com/file/d/${uploadedFile.id}/view`,
      downloadUrl: uploadedFile.webContentLink,
      folderId: folder.id,
      folderUrl: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Unable to upload to Google Drive.";

    return Response.json({ error: message }, { status: 500 });
  }
}
