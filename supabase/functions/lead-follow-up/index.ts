import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { sendPushesForUsers } from "../_shared/web-push.ts";

type DueLead = { id: string; owner_id: string };
type ActiveProfile = { id: string; role: string };

const slotHoursUtc = new Set([1, 7, 13]);
const oneDayMs = 24 * 60 * 60 * 1000;

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "Missing Supabase environment" }, { status: 500 });
  }

  const now = new Date();
  if (!slotHoursUtc.has(now.getUTCHours()) || now.getUTCMinutes() > 10) {
    return Response.json({ ok: true, skipped: "outside_schedule" });
  }

  const slotAt = new Date(now);
  slotAt.setUTCMinutes(0, 0, 0);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: dueLeads, error: leadError } = await supabase
    .from("leads")
    .select("id,owner_id")
    .eq("status", "contacted")
    .is("deleted_at", null)
    .not("follow_up_activity_at", "is", null)
    .lte("follow_up_activity_at", new Date(+now - oneDayMs).toISOString());
  if (leadError) return Response.json({ ok: false, error: leadError.message }, { status: 500 });
  if (!dueLeads?.length) return Response.json({ ok: true, due: 0, sent: 0 });

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("active", true)
    .in("role", ["admin", "customer_service", "broker"]);
  if (profileError) return Response.json({ ok: false, error: profileError.message }, { status: 500 });

  const activeProfiles = (profiles || []) as ActiveProfile[];
  const activeOwners = new Set(activeProfiles.filter((profile) => profile.role !== "admin").map((profile) => profile.id));
  const grouped = new Map<string, number>();
  for (const lead of dueLeads as DueLead[]) {
    if (activeOwners.has(lead.owner_id)) grouped.set(lead.owner_id, (grouped.get(lead.owner_id) || 0) + 1);
  }
  for (const admin of activeProfiles.filter((profile) => profile.role === "admin")) {
    grouped.set(admin.id, dueLeads.length);
  }

  let sent = 0;
  let failed = 0;
  for (const [recipientId, count] of grouped) {
    const { data: delivery, error: claimError } = await supabase
      .from("lead_follow_up_deliveries")
      .upsert({ recipient_id: recipientId, slot_at: slotAt.toISOString(), due_count: count }, {
        onConflict: "recipient_id,slot_at",
        ignoreDuplicates: true,
      })
      .select("id")
      .maybeSingle();
    if (claimError) {
      failed += 1;
      continue;
    }
    if (!delivery) continue;

    const result = await sendPushesForUsers(supabase, [recipientId], {
      title: "CasePilot • Lead Follow Up",
      body: `${count} contacted lead${count === 1 ? "" : "s"} need follow-up.`,
      url: "/?section=leads&view=followup",
    });
    const successful = result.sent > 0;
    const { error: updateError } = await supabase
      .from("lead_follow_up_deliveries")
      .update({
        sent_at: successful ? new Date().toISOString() : null,
        last_error: successful ? null : result.error || result.skipped || "No active push subscription",
      })
      .eq("id", delivery.id);
    if (updateError) failed += 1;
    sent += result.sent;
    failed += result.failed;
  }

  return Response.json({ ok: true, due: dueLeads.length, recipients: grouped.size, sent, failed });
});
