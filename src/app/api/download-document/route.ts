import { NextRequest } from "next/server";

const casePilotSupabaseHost = "kfyqyxiycvdknlcpjmts.supabase.co";

function isAllowedDocumentUrl(url: URL) {
  if (url.protocol === "https:" && url.hostname.endsWith("drive.google.com")) {
    return true;
  }

  return (
    url.protocol === "https:" &&
    url.hostname === casePilotSupabaseHost &&
    url.pathname.startsWith("/storage/v1/object/public/case-documents/")
  );
}

function safeFileName(name: string | null) {
  const cleaned = (name || "document")
    .replace(/[\r\n"\\/]/g, "_")
    .trim();

  return cleaned || "document";
}

function safeAsciiFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\/]/g, "_")
    .trim();

  return cleaned || "document";
}

function encodeHeaderValue(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  const fileName = safeFileName(request.nextUrl.searchParams.get("name"));
  const asciiFileName = safeAsciiFileName(fileName);

  if (!rawUrl) {
    return new Response("Missing document URL.", { status: 400 });
  }

  let documentUrl: URL;
  try {
    documentUrl = new URL(rawUrl);
  } catch {
    return new Response("Invalid document URL.", { status: 400 });
  }

  if (!isAllowedDocumentUrl(documentUrl)) {
    return new Response("Document URL is not allowed.", { status: 400 });
  }

  if (documentUrl.hostname.endsWith("drive.google.com")) {
    return Response.redirect(documentUrl.toString(), 302);
  }

  const upstream = await fetch(documentUrl.toString(), { cache: "no-store" });

  if (!upstream.ok || !upstream.body) {
    return new Response("Document unavailable.", { status: upstream.status || 404 });
  }

  const headers = new Headers();
  const contentLength = upstream.headers.get("content-length");
  headers.set("content-type", upstream.headers.get("content-type") || "application/octet-stream");
  if (contentLength) {
    headers.set("content-length", contentLength);
  }
  headers.set(
    "content-disposition",
    `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeHeaderValue(fileName)}`,
  );

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
