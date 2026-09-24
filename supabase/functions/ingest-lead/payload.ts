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

export function parseIngestPayload(input: Record<string, unknown>): IngestPayload {
  const sourceLeadId = value(input, ["source_lead_id", "lead_id", "id"], 200);
  const note = buildNote(input);
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
    phone: contact.phone,
    email: contact.email,
    brand: vehicle.brand,
    model: vehicle.model,
    note,
    sourceDetail: value(input, ["campaign", "campaign_name", "form_name", "source_detail"], 200),
    createdAt,
  };
}
