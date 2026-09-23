import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { sendPushesForUsers } from "../_shared/web-push.ts";

type Appointment = {
  id: string;
  owner_id: string;
  kind: "test_drive" | "delivery";
  starts_at: string;
  updated_at: string;
  lead?: { customer_name: string; car_model: string } | null;
  case?: { customer_name: string; car_model: string } | null;
};

const offsets = [4320, 1440, 240, 60] as const;
const minuteMs = 60_000;

function appointmentLabel(appointment: Appointment) {
  const customer = appointment.lead?.customer_name || appointment.case?.customer_name || "Customer";
  const car = appointment.lead?.car_model || appointment.case?.car_model || "vehicle";
  return `${customer} • ${car}`;
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "Missing Supabase environment" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id,owner_id,kind,starts_at,updated_at,lead:leads(customer_name,car_model),case:cases(customer_name,car_model)")
    .eq("status", "scheduled")
    .gt("starts_at", now.toISOString())
    .lte("starts_at", new Date(+now + 4320 * minuteMs + 90_000).toISOString());
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const { data: admins, error: adminError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);
  if (adminError) return Response.json({ ok: false, error: adminError.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const appointment of (appointments || []) as Appointment[]) {
    const startsAt = +new Date(appointment.starts_at);
    for (const offset of offsets) {
      const dueAt = startsAt - offset * minuteMs;
      if (dueAt > +now || dueAt < +now - 90_000 || dueAt < +new Date(appointment.updated_at)) continue;

      const recipients = new Set([appointment.owner_id]);
      if (offset === 1440) {
        for (const admin of admins || []) recipients.add(admin.id);
      }

      for (const recipientId of recipients) {
        const { data: delivery, error: deliveryError } = await supabase
          .from("appointment_alert_deliveries")
          .upsert({
            appointment_id: appointment.id,
            recipient_id: recipientId,
            appointment_starts_at: appointment.starts_at,
            offset_minutes: offset,
            due_at: new Date(dueAt).toISOString(),
          }, {
            onConflict: "appointment_id,recipient_id,appointment_starts_at,offset_minutes",
            ignoreDuplicates: true,
          })
          .select("id,sent_at,last_error")
          .maybeSingle();
        if (deliveryError) {
          failed += 1;
          continue;
        }
        if (!delivery || delivery.sent_at) continue;

        const result = await sendPushesForUsers(supabase, [recipientId], {
          title: `CasePilot • ${appointment.kind === "test_drive" ? "Test Drive" : "Delivery"} appointment`,
          body: `${appointmentLabel(appointment)}\n${offset === 4320 ? "3 days" : offset === 1440 ? "1 day" : offset === 240 ? "4 hours" : "1 hour"} remaining.`,
          url: "/?section=appointments",
        });
        const successful = result.sent > 0;
        const { error: updateError } = await supabase
          .from("appointment_alert_deliveries")
          .update({
            sent_at: successful ? new Date().toISOString() : null,
            last_error: successful ? null : result.error || result.skipped || "No active push subscription",
          })
          .eq("id", delivery.id);
        if (updateError) failed += 1;
        sent += result.sent;
        failed += result.failed;
      }
    }
  }

  return Response.json({ ok: true, sent, failed });
});
