export type LeadContact = { name: string; phone: string; email: string };

const missing = new Set(["", "null", "undefined", "no data", "n/a", "-"]);
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phonePattern = /(?:\+?60[ \t().-]*|0)1[0-9 \t().-]{7,18}\d/g;

function clean(value: string) {
  const text = value.trim().replace(/^["']|["']$/g, "").trim();
  return missing.has(text.toLowerCase()) ? "" : text;
}

function keyKind(key: string): keyof LeadContact | "" {
  const words = key.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/^res\d+ /, "").replace(/^\d+ /, "");
  if (["email", "e mail", "emel", "e mel", "alamat emel", "customer email"].includes(words)) return "email";
  if (["phone", "phone no", "no phone", "telephone", "telefon", "mobile", "whatsapp", "no hp", "no tel", "no telefon", "nombor telefon", "nombor hp", "contact number", "phone number", "customer phone"].includes(words)) return "phone";
  if (["name", "nama", "full name", "nama penuh", "customer name", "lead name", "contact name"].includes(words)) return "name";
  return "";
}

function validPhone(value: string) {
  return /^\+?\d[\d\s().-]*$/.test(value) && value.replace(/\D/g, "").length >= 9;
}

export function extractLeadContact(note: string, supplied: Partial<LeadContact> = {}): LeadContact {
  const found: LeadContact = { name: "", phone: "", email: "" };
  for (const line of note.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:=]{1,80})\s*[:=]\s*(.+?)\s*$/);
    if (!match) continue;
    const kind = keyKind(match[1]);
    const candidate = clean(match[2]);
    if (kind && candidate && !found[kind]) found[kind] = candidate;
  }
  const name = clean(supplied.name || "") || found.name;
  const suppliedPhone = clean(supplied.phone || "");
  const phoneFromNote = validPhone(found.phone) ? found.phone : note.match(phonePattern)?.find((item) => validPhone(item.trim())) || "";
  const phone = validPhone(suppliedPhone) ? suppliedPhone : validPhone(phoneFromNote.trim()) ? phoneFromNote.trim() : "";
  const suppliedEmail = clean(supplied.email || "");
  const email = suppliedEmail.match(emailPattern)?.[0] || found.email.match(emailPattern)?.[0] || note.match(emailPattern)?.[0] || "";
  return { name: name.slice(0, 200), phone: phone.slice(0, 50), email: email.slice(0, 254) };
}

export function hideLeadPhoneInNote(note: string, revealed: boolean) {
  return revealed ? note : note.replace(phonePattern, (match) => validPhone(match.trim()) ? "[phone hidden until Call]" : match);
}
