import { extractLeadContact } from "../_shared/lead-contact.ts";
import { extractLeadVehicle } from "../_shared/lead-vehicle.ts";

export type IngestPayload = {
  sourceLeadId: string;
  name: string;
  phone: string;
  email: string;
  brand: string;
  model: string;
  note: string;
  sourceDetail: string;
  createdAt: string | null;
};

function value(input: Record<string, unknown>, keys: string[], limit: number) {
  for (const key of keys) {
    const raw = input[key];
    if (typeof raw === "string" || typeof raw === "number") {
      const text = String(raw).trim();
      if (text && !["null", "undefined", "no data"].includes(text.toLowerCase())) {
        return text.slice(0, limit);
      }
    }
  }
  return "";
}

const metadataKeys = new Set(["source_system", "source", "source_lead_id", "lead_id", "id", "note", "remark", "message", "inquiry"]);

function noteValue(raw: unknown): string {
  if (raw == null) return "";
  const text = typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
    ? String(raw).trim()
    : JSON.stringify(raw);
  return ["", "null", "undefined", "no data"].includes(text.toLowerCase()) ? "" : text;
}

function buildNote(input: Record<string, unknown>): string {
  const explicitNote = value(input, ["note", "remark", "message", "inquiry"], 3000);
  const extras = Object.entries(input)
    .filter(([key]) => !metadataKeys.has(key))
    .map(([key, raw]) => [key.replace(/_/g, " "), noteValue(raw)] as const)
    .filter(([, text]) => text);
  return [explicitNote, ...extras.map(([key, text]) => `${key}: ${text}`)]
    .filter(Boolean).join("\n").slice(0, 16000);
}

export function repairMalaysiaPhone(value: string): string {
  if (!/^\+?\d[\d\s().-]*$/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  const repaired = digits.startsWith("0060") ? digits.slice(2).replace(/^600+/, "60")
    : digits.startsWith("60") ? digits.replace(/^600+/, "60")
    : digits.replace(/^00+(?=1)/, "0");
  const national = repaired.startsWith("60") ? repaired : repaired.startsWith("0") ? `60${repaired.slice(1)}` : repaired;
  return repaired !== digits && /^601\d{8,9}$/.test(national) ? `+${national}` : value;
}

export function parseIngestPayload(input: Record<string, unknown>): IngestPayload {
  const sourceLeadId = value(input, ["source_lead_id", "lead_id", "id"], 200);
  const note = buildNote(input).split("\n").map(line => {
    const labelled = /^(\s*(?:phone(?: number)?|customer phone|no phone|telefon|mobile|whatsapp|no hp|no tel|nombor telefon)\s*[:=]\s*)(.+)$/i.exec(line);
    if (labelled) return labelled[1] + repairMalaysiaPhone(labelled[2].trim());
    return line.replace(/(?<![\w])\+600+1[0-9 \t().-]*[0-9]/g, match => repairMalaysiaPhone(match));
  }).join("\n");
  const contact = extractLeadContact(note, {
    name: value(input, ["name", "full_name", "customer_name"], 200),
    phone: value(input, ["phone", "phone_number", "customer_phone"], 50),
    email: value(input, ["email"], 254),
  });
  const vehicle = extractLeadVehicle(note, {
    brand: value(input, ["brand", "car_brand"], 100),
    model: value(input, ["model", "car_model"], 150),
  });
  const createdAtInput = value(input, ["created_at", "created_time"], 80);
  const createdAt = createdAtInput && !Number.isNaN(Date.parse(createdAtInput))
    ? new Date(createdAtInput).toISOString()
    : null;

  return {
    sourceLeadId,
    name: contact.name,
    phone: repairMalaysiaPhone(contact.phone),
    email: contact.email,
    brand: vehicle.brand,
    model: vehicle.model,
    note,
    sourceDetail: value(input, ["campaign", "campaign_name", "form_name", "source_detail"], 200),
    createdAt,
  };
}
