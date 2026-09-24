export type LeadContact = { name: string; phone: string; email: string };

const missing = new Set(["", "null", "undefined", "no data", "n/a", "-"]);
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phonePattern = /(?:\+?60[ \t().-]*|0)1[0-9 \t().-]{7,18}\d/g;
const formAnswers = new Set([
  "city sedan", "city hatchback", "civic", "hr-v", "cr-v", "wr-v",
  "secepat yang boleh (asap)", "1-3 bulan", "3-6 bulan", "survey sahaja",
  "kerja kerajaan", "kerja swasta", "berniaga/freelance",
  "rm2500 - rm3500", "rm3500 - rm5000", "rm5000 keatas",
  "nak trade-in", "tiada", "tiada (nak full loan)",
  "10% deposit", "custom deposit", "nak beli cash tunai",
].map(normalizedAnswer));
const vehicleAnswers = new Set([
  "honda", "proton", "jaecoo", "jetour", "chery",
  "jaecoo j5", "jaecoo j5 ev", "jaecoo j7", "jaecoo j7 phev", "jaecoo j8",
  "proton s70", "proton new s70", "proton saga", "proton persona", "proton iriz",
  "proton x50", "proton x70", "proton x90",
  "honda city", "honda city hatchback", "honda civic", "honda hr-v", "honda cr-v", "honda wr-v",
].map(normalizedAnswer));

function normalizedAnswer(value: string) {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s*\/\s*/g, "/").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
}

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

function validName(value: string) {
  if (!/^[\p{L}][\p{L} .'’/-]*$/u.test(value)) return false;
  const normalized = normalizedAnswer(value);
  return !formAnswers.has(normalized) && !vehicleAnswers.has(normalized);
}

function nameFromUnlabelledLines(note: string) {
  const lines = note.split(/\r?\n/).map(clean).filter(Boolean);
  if (!lines.some((line) => line.match(emailPattern) || line.match(phonePattern))) return "";
  return lines.find(validName) || "";
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
  const suppliedName = clean(supplied.name || "");
  const name = (validName(suppliedName) && suppliedName)
    || (validName(found.name) && found.name)
    || nameFromUnlabelledLines(note);
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
