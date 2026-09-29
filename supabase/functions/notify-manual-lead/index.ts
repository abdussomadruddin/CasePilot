import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { sendPushesForUsers } from "../_shared/web-push.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: cors });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ ok: false, error: "POST required." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("authorization") || "";
  if (!url || !serviceKey || !anonKey) return reply({ ok: false, error: "Service unavailable." }, 503);
  if (!authorization.startsWith("Bearer ")) return reply({ ok: false, error: "Unauthorized." }, 401);

  const auth = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData.user) return reply({ ok: false, error: "Unauthorized." }, 401);

  let leadId: string;
  try {
    const body = await request.json();
    leadId = body?.leadId;
  } catch {
    return reply({ ok: false, error: "Invalid request." }, 400);
  }
  if (typeof leadId !== "string" || !/^[a-f0-9-]{36}$/i.test(leadId)) {
    return reply({ ok: false, error: "Invalid lead ID." }, 400);
  }

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: actor } = await service.from("profiles")
    .select("id,role,active").eq("id", userData.user.id).maybeSingle();
  if (!actor?.active) return reply({ ok: false, error: "Forbidden." }, 403);

  const { data: lead, error: leadError } = await service.from("leads")
    .select("id,owner_id,customer_name,source,status,created_at,deleted_at")
    .eq("id", leadId).maybeSingle();
  if (leadError) return reply({ ok: false, error: "Lead unavailable." }, 503);
  if (!lead || lead.source !== "manual_upload" || lead.status !== "new" || lead.deleted_at) {
    return reply({ ok: false, error: "Not a new manual lead." }, 409);
  }
  if (Date.now() - new Date(lead.created_at).getTime() > 5 * 60_000) {
    return reply({ ok: false, error: "Notification window expired." }, 409);
  }
  if (actor.role !== "admin" && actor.id !== lead.owner_id) {
    return reply({ ok: false, error: "Forbidden." }, 403);
  }

  const { data: creation } = await service.from("lead_events")
    .select("id").eq("lead_id", lead.id).eq("actor_id", actor.id).eq("status", "new")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!creation) return reply({ ok: false, error: "Only the creator can notify this lead." }, 403);

  const { data: owner } = await service.from("profiles")
    .select("id").eq("id", lead.owner_id).eq("active", true)
    .in("role", ["customer_service", "broker"]).maybeSingle();
  if (!owner) return reply({ ok: true, skipped: "owner_not_cs_or_broker" });

  const { error: claimError } = await service.from("manual_lead_push_deliveries")
    .insert({ lead_id: lead.id });
  if (claimError?.code === "23505") return reply({ ok: true, duplicate: true });
  if (claimError) return reply({ ok: false, error: "Unable to record notification." }, 503);

  try {
    const result = await sendPushesForUsers(service, [owner.id], {
      title: "CasePilot · New lead",
      body: `${lead.customer_name || "New lead"} is ready to contact.`,
      url: "/?section=leads",
    });
    if (result.error || result.skipped || result.failed) {
      await service.from("manual_lead_push_deliveries").delete().eq("lead_id", lead.id);
      return reply({ ok: false, error: "Push could not be delivered." }, 503);
    }
    return reply({ ok: true, sent: result.sent });
  } catch (error) {
    await service.from("manual_lead_push_deliveries").delete().eq("lead_id", lead.id);
    console.error("Manual lead push failed", error);
    return reply({ ok: false, error: "Push could not be delivered." }, 503);
  }
});
