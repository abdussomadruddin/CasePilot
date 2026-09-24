import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { sendPushesForUsers } from "../_shared/web-push.ts";
import { parseIngestPayload } from "./payload.ts";

const jsonHeaders = { "content-type": "application/json" };

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: jsonHeaders });
}

async function readPayload(request: Request) {
  const body = await request.text();
  if (body.length > 32_000) throw new Error("Payload exceeds 32 KB.");
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON object required.");
    return parsed as Record<string, unknown>;
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(body));
  }
  throw new Error("Send application/json or form-encoded parameters.");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply({ ok: false, error: "POST required." }, 405);

  const key = request.headers.get("x-casepilot-key")?.trim() || "";
  if (!/^cp_[a-f0-9]{64}$/.test(key)) return reply({ ok: false, error: "Invalid connector key." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply({ ok: false, error: "Service unavailable." }, 503);

  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: connector, error: connectorError } = await supabase
    .from("lead_connectors")
    .select("id,source,owner_id")
    .eq("key_hash", hash)
    .eq("active", true)
    .maybeSingle();
  if (connectorError) return reply({ ok: false, error: "Connector unavailable." }, 503);
  if (!connector) return reply({ ok: false, error: "Invalid connector key." }, 401);

  let payload;
  try {
    payload = parseIngestPayload(await readPayload(request));
  } catch (caught) {
    return reply({ ok: false, error: caught instanceof Error ? caught.message : "Invalid payload." }, 400);
  }

  const { data: owner, error: ownerError } = await supabase.from("profiles")
    .select("id").eq("id", connector.owner_id).eq("active", true)
    .in("role", ["customer_service", "broker"]).maybeSingle();
  if (ownerError || !owner) return reply({ ok: false, error: "Assigned owner is unavailable." }, 409);

  const { data: lead, error: insertError } = await supabase.from("leads").insert({
    owner_id: connector.owner_id,
    source: connector.source,
    source_lead_id: payload.sourceLeadId || null,
    source_detail: payload.sourceDetail || null,
    source_note: payload.note || null,
    connector_id: connector.id,
    customer_name: payload.name || null,
    customer_phone: payload.phone || null,
    email: payload.email || null,
    car_brand: payload.brand || null,
    car_model: payload.model || null,
    status: "new",
    ...(payload.createdAt ? { created_at: payload.createdAt } : {}),
  }).select("id").single();

  if (insertError) {
    console.error("Lead ingestion failed", insertError.code, insertError.message);
    return reply({ ok: false, error: "Unable to save lead." }, 500);
  }

  const { error: usageError } = await supabase.from("lead_connectors")
    .update({ last_used_at: new Date().toISOString() }).eq("id", connector.id);
  if (usageError) console.warn("Unable to update connector usage", usageError.message);

  try {
    await sendPushesForUsers(supabase, [connector.owner_id], {
      title: "CasePilot · New lead",
      body: `${payload.name || "New lead"} is ready to contact.`,
      url: "/?section=leads",
    });
  } catch (caught) {
    console.warn("Unable to send new lead push", caught);
  }

  return reply({ ok: true, lead_id: lead.id, owner_id: connector.owner_id, source: connector.source }, 201);
});
