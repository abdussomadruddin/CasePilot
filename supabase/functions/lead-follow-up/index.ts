import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { sendPushesForUsers } from "../_shared/web-push.ts";
import { groupLeadReminders, reminderMessage, reminderTypeAt, type ReminderLead, type ReminderProfile } from "./reminders.ts";

const oneDayMs = 24 * 60 * 60 * 1000;

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "Missing Supabase environment" }, { status: 500 });
  }

  const now = new Date();
  const reminderType = reminderTypeAt(now);
  if (!reminderType) {
    return Response.json({ ok: true, skipped: "outside_schedule" });
  }

  const slotAt = new Date(now);
  slotAt.setUTCMinutes(0, 0, 0);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let dueLeads: ReminderLead[] = [];
  let newLeads: ReminderLead[] = [];
  if (reminderType === "contacted") {
    const { data, error } = await supabase
      .from("leads")
      .select("id,owner_id")
      .eq("status", "contacted")
      .is("deleted_at", null)
      .not("follow_up_activity_at", "is", null)
      .lte("follow_up_activity_at", new Date(+now - oneDayMs).toISOString());
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    dueLeads = (data || []) as ReminderLead[];
  } else {
    const { data, error } = await supabase
      .from("leads")
      .select("id,owner_id")
      .eq("status", "new")
      .is("deleted_at", null)
      .is("phone_revealed_at", null);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    newLeads = (data || []) as ReminderLead[];
  }
  if (!dueLeads.length && !newLeads.length) return Response.json({ ok: true, due: 0, new: 0, sent: 0 });

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("active", true)
    .in("role", ["customer_service", "broker"]);
  if (profileError) return Response.json({ ok: false, error: profileError.message }, { status: 500 });

  const grouped = groupLeadReminders(
    newLeads,
    dueLeads,
    (profiles || []) as ReminderProfile[],
  );

  let sent = 0;
  let failed = 0;
  for (const [recipientId, counts] of grouped) {
    const count = counts.newCount + counts.contactedCount;
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
      title: counts.newCount ? "CasePilot • Lead Reminder" : "CasePilot • Lead Follow Up",
      body: reminderMessage(counts),
      url: counts.newCount ? "/?section=leads" : "/?section=leads&view=followup",
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

  return Response.json({ ok: true, due: dueLeads.length, new: newLeads.length, recipients: grouped.size, sent, failed });
});
