import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { sendPushesForUsers } from "../_shared/web-push.ts";

Deno.serve(async (request) => {
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  if (!/^[a-f0-9-]{36}$/i.test(body?.lead_id || "") || !/^[a-f0-9-]{36}$/i.test(body?.owner_id || "")) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ ok: false }, { status: 503 });
  const service = createClient(url, key);
  if (body.receipt_id && !/^[a-f0-9-]{36}$/i.test(body.receipt_id)) return Response.json({ ok: false }, { status: 400 });
  const { data: batches, error } = await service.rpc(body.receipt_id ? "claim_returning_lead_alert" : "claim_single_new_lead_alert", {
    p_lead_id: body.lead_id, p_owner_id: body.owner_id, ...(body.receipt_id ? { p_receipt_id: body.receipt_id } : {}),
  });
  if (error) return Response.json({ ok: false }, { status: 503 });
  let sent = 0;
  let failed = 0;
  for (const batch of batches || []) {
    const { data: owner } = await service.from("profiles").select("id")
      .eq("id", batch.recipient_id).eq("active", true)
      .in("role", ["customer_service", "broker"]).maybeSingle();
    if (!owner) continue;
    let query = service.from("leads").select("id,customer_name")
      .in("id", batch.lead_ids).eq("owner_id", owner.id).eq("status", "new").is("deleted_at", null);
    if (body.receipt_id) query = query.eq("receipt_id", body.receipt_id);
    const { data: leads, error: leadError } = await query;
    if (leadError || !leads?.length) continue;
    const result = await sendPushesForUsers(service, [owner.id], {
      title: `CasePilot · ${leads.length} new lead${leads.length === 1 ? "" : "s"}`,
      body: leads.slice(0, 5).map((lead) => lead.customer_name || "New lead").join(" · ")
        + (leads.length > 5 ? ` · +${leads.length - 5} more` : "") + ". Ready to contact.",
      url: "/?section=leads&view=new",
    });
    sent += result.sent;
    failed += result.failed;
    let update = service.from("new_lead_alert_queue").update({
      sent_at: result.sent ? new Date().toISOString() : null,
      last_error: result.error || result.skipped || (result.failed ? "Push delivery failed" : null),
    }).eq("owner_id", owner.id).in("lead_id", batch.lead_ids);
    if (body.receipt_id) update = update.eq("receipt_id", body.receipt_id);
    await update;
  }
  return Response.json({ ok: true, sent, failed });
});
