import { NextRequest } from "next/server";

const casePilotSupabaseHost = "kfyqyxiycvdknlcpjmts.supabase.co";
const shortenerEndpoints = [
  (url: string) => `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
  (url: string) => `https://v.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
];

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isAllowedUrl(url: URL, request: NextRequest) {
  const requestHost = request.nextUrl.hostname;
  const sameAppHost = url.hostname === requestHost;
  const localDevHost = isLocalHost(url.hostname) && isLocalHost(requestHost);

  if ((sameAppHost || localDevHost) && url.pathname === "/api/download-document") {
    return true;
  }

  return (
    url.protocol === "https:" &&
    url.hostname === casePilotSupabaseHost &&
    url.pathname.startsWith("/storage/v1/object/public/case-documents/")
  );
}

function isUsableShortUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.href.length < 80;
  } catch {
    return false;
  }
}

async function createShortUrl(url: string) {
  for (const endpoint of shortenerEndpoints) {
    try {
      const response = await fetch(endpoint(url), {
        cache: "no-store",
        headers: { accept: "text/plain" },
      });

      if (!response.ok) continue;

      const shortUrl = (await response.text()).trim();
      if (isUsableShortUrl(shortUrl)) return shortUrl;
    } catch {
      continue;
    }
  }

  return url;
}

export async function POST(request: NextRequest) {
  let payload: { url?: unknown };

  try {
    payload = (await request.json()) as { url?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof payload.url !== "string" || !payload.url.trim()) {
    return Response.json({ error: "Missing URL." }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(payload.url);
  } catch {
    return Response.json({ error: "Invalid URL." }, { status: 400 });
  }

  if (!isAllowedUrl(url, request)) {
    return Response.json({ error: "URL is not allowed." }, { status: 400 });
  }

  const shortUrl = await createShortUrl(url.toString());

  return Response.json({ shortUrl });
}
