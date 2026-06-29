import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { sendPushesForRoles } from "../_shared/web-push.ts";

type Role =
  | "admin"
  | "customer_service"
  | "finance"
  | "caller"
  | "operator";

type CaseStatus =
  | "documents_collected"
  | "more_documents_needed"
  | "submission"
  | "rejected"
  | "lou_received"
  | "hint_submitted"
  | "booking_form_received"
  | "registration_needed"
  | "roadtax_grant_process"
  | "prepare_delivery"
  | "car_delivery"
  | "cancelled";

type CaseRow = {
  id: string;
  status: CaseStatus;
  updated_at: string;
  next_follow_up_at: string | null;
};

const sixHoursMs = 6 * 60 * 60 * 1000;
const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

function assignedRoles(status: CaseStatus): Role[] {
  switch (status) {
    case "documents_collected":
      return ["finance", "caller"];
    case "submission":
      return ["customer_service", "finance", "caller"];
    case "more_documents_needed":
      return ["customer_service", "finance"];
    case "rejected":
      return ["customer_service", "finance", "caller"];
    case "lou_received":
    case "hint_submitted":
    case "booking_form_received":
    case "registration_needed":
    case "roadtax_grant_process":
      return ["customer_service", "finance", "caller"];
    case "prepare_delivery":
    case "car_delivery":
      return ["customer_service", "finance", "caller", "operator"];
    case "cancelled":
      return ["customer_service", "finance", "caller", "operator"];
    default:
      return [];
  }
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase environment", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();

  const { data: cases, error } = await supabase
    .from("cases")
    .select("id,status,updated_at,next_follow_up_at")
    .is("deleted_at", null);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const notificationRows: Array<{
    case_id: string;
    role: Role;
    reason: string;
    status: CaseStatus;
    due_at: string;
  }> = [];

  const activityRows: Array<{
    case_id: string;
    type: string;
    actor_role: Role;
    actor_name: string;
    message: string;
    status: CaseStatus;
  }> = [];

  for (const record of (cases || []) as CaseRow[]) {
    const rolesToNotify = assignedRoles(record.status);
    const isTerminal =
      record.status === "car_delivery" || record.status === "cancelled";

    for (const role of rolesToNotify) {
      const { data: latestAction } = await supabase
        .from("case_activities")
        .select("created_at")
        .eq("case_id", record.id)
        .eq("actor_role", role)
        .in("type", ["remark", "status"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastActionAt = latestAction?.created_at || record.updated_at;
      const reminderDue = +now - +new Date(lastActionAt) >= sixHoursMs;

      if (reminderDue) {
        notificationRows.push({
          case_id: record.id,
          role,
          reason: "No new remark or status update within 6 hours.",
          status: record.status,
          due_at: now.toISOString(),
        });

        activityRows.push({
          case_id: record.id,
          type: "notification",
          actor_role: role,
          actor_name: "System",
          message: "Reminder sent for pending case action.",
          status: record.status,
        });
      }
    }

    if (!isTerminal) {
      const nextFollowUp = record.next_follow_up_at
        ? new Date(record.next_follow_up_at)
        : new Date(+new Date(record.updated_at) + twoDaysMs);

      if (+nextFollowUp <= +now) {
        const followUpRoles: Role[] = rolesToNotify.length
          ? rolesToNotify
          : ["customer_service"];

        for (const role of followUpRoles) {
          notificationRows.push({
            case_id: record.id,
            role,
            reason: "Auto follow up is due.",
            status: record.status,
            due_at: now.toISOString(),
          });
        }

        activityRows.push({
          case_id: record.id,
          type: "follow_up",
          actor_role: rolesToNotify[0] || "customer_service",
          actor_name: "System",
          message: "Automatic follow up triggered.",
          status: record.status,
        });

        await supabase
          .from("cases")
          .update({
            next_follow_up_at: new Date(+now + twoDaysMs).toISOString(),
          })
          .eq("id", record.id);
      }
    }
  }

  let pushResult = { sent: 0, failed: 0 };

  if (notificationRows.length) {
    await supabase.from("case_notifications").insert(notificationRows);
    pushResult = await sendPushesForRoles(
      supabase,
      notificationRows.map((row) => row.role),
    );
  }

  if (activityRows.length) {
    await supabase.from("case_activities").insert(activityRows);
  }

  return Response.json({
    ok: true,
    notifications: notificationRows.length,
    activities: activityRows.length,
    push: pushResult,
  });
});
