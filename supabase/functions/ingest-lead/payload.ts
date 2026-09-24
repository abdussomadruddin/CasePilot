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

export function parseIngestPayload(input: Record<string, unknown>): IngestPayload {
  const sourceLeadId = value(input, ["source_lead_id", "lead_id", "id"], 200);
  const name = value(input, ["name", "full_name", "customer_name"], 200);
  const phone = value(input, ["phone", "phone_number", "customer_phone"], 50);
  const createdAtInput = value(input, ["created_at", "created_time"], 80);
  const createdAt = createdAtInput && !Number.isNaN(Date.parse(createdAtInput))
    ? new Date(createdAtInput).toISOString()
    : null;

  if (!sourceLeadId) throw new Error("source_lead_id is required for duplicate protection.");
  if (!name) throw new Error("name is required.");
  if (!phone || phone.replace(/\D/g, "").length < 7) throw new Error("A valid phone is required.");

  return {
    sourceLeadId,
    name,
    phone,
    email: value(input, ["email"], 254),
    brand: value(input, ["brand", "car_brand"], 100),
    model: value(input, ["model", "car_model"], 150),
    note: value(input, ["note", "remark", "message", "inquiry"], 3000),
    sourceDetail: value(input, ["campaign", "campaign_name", "form_name", "source_detail"], 200),
    createdAt,
  };
}
