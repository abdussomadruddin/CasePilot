import { followUpWhatsAppUrls } from "./follow-up-whatsapp.ts";

type Contact = { customerPhone: string; whatsappUsername?: string };

export function normalizeWhatsAppUsername(input: string): string {
  let value = input.trim();
  if (!value) return "";
  if (/^https?:|wa\.me\//i.test(value)) {
    let url: URL;
    try { url = new URL(value.startsWith("wa.me/") ? `https://${value}` : value); }
    catch { throw new Error("Username / pautan WhatsApp tidak sah."); }
    if (url.protocol !== "https:" || url.hostname !== "wa.me" || url.port || url.username || url.password || url.search || url.hash || !/^\/[^/]+\/?$/.test(url.pathname)) {
      throw new Error("Gunakan pautan https://wa.me/username tanpa key atau parameter.");
    }
    value = url.pathname.replace(/^\/|\/$/g, "");
  }
  value = value.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_][a-z0-9_.]{1,33}[a-z0-9_]$/.test(value) || !/[a-z]/.test(value) || value.includes("..")) {
    throw new Error("Username WhatsApp mesti 3–35 aksara, mengandungi huruf dan hanya huruf, nombor, titik atau underscore.");
  }
  return value;
}

export function leadWhatsAppUrl(lead: Contact): string {
  if (lead.customerPhone.trim()) return followUpWhatsAppUrls(lead.customerPhone)[2];
  const username = normalizeWhatsAppUsername(lead.whatsappUsername || "");
  if (!username) throw new Error("Tambah nombor telefon atau username WhatsApp dahulu.");
  return `https://wa.me/${username}`;
}

export function hasLeadWhatsApp(lead: Contact): boolean {
  try { leadWhatsAppUrl(lead); return true; } catch { return false; }
}
