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

const contactKeys = new Set([
  "source_system", "source", "source_lead_id", "lead_id", "id",
  "name", "full_name", "customer_name", "phone", "phone_number",
  "customer_phone", "email", "note", "remark", "message", "inquiry",
]);

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
    .filter(([key]) => !contactKeys.has(key))
    .map(([key, raw]) => [key.replace(/_/g, " "), noteValue(raw)] as const)
    .filter(([, text]) => text);
  return [explicitNote, ...extras.map(([key, text]) => `${key}: ${text}`)]
    .filter(Boolean).join("\n").slice(0, 3000);
}

export function parseIngestPayload(input: Record<string, unknown>): IngestPayload {
  const sourceLeadId = value(input, ["source_lead_id", "lead_id", "id"], 200);
  const name = value(input, ["name", "full_name", "customer_name"], 200);
  const phone = value(input, ["phone", "phone_number", "customer_phone"], 50);
  const createdAtInput = value(input, ["created_at", "created_time"], 80);
  const createdAt = createdAtInput && !Number.isNaN(Date.parse(createdAtInput))
    ? new Date(createdAtInput).toISOString()
    : null;

  if (!name) throw new Error("name is required.");
  if (!phone || phone.replace(/\D/g, "").length < 7) throw new Error("A valid phone is required.");

  return {
    sourceLeadId,
    name,
    phone,
    email: value(input, ["email"], 254),
    brand: value(input, ["brand", "car_brand"], 100),
    model: value(input, ["model", "car_model"], 150),
    note: buildNote(input),
    sourceDetail: value(input, ["campaign", "campaign_name", "form_name", "source_detail"], 200),
    createdAt,
  };
}
