import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { sendPushesForRoles } from "../_shared/web-push.ts";

type Role =
  | "admin"
  | "customer_service"
  | "finance"
  | "caller"
  | "operator"
  | "sales_manager";

type CaseDealer = "kah_motor" | "other_dealer";

type CurrentCaseStatus =
  | "documents_collected"
  | "more_documents_needed"
  | "submission"
  | "rejected"
  | "lou_received"
  | "pending_sign_agreement"
  | "pending_allocation"
  | "waiting_ehakmilik"
  | "registered"
  | "grant_roadtax_collected"
  | "prepare_delivery"
  | "car_delivery"
  | "cancelled";

type LegacyCaseStatus =
  | "hint_submitted"
  | "booking_form_received"
  | "registration_needed"
  | "roadtax_grant_process";

type CaseStatus = CurrentCaseStatus | LegacyCaseStatus;

type CaseRow = {
  id: string;
  dealer: CaseDealer | null;
  customer_name: string | null;
  car_model: string | null;
  car_variant: string | null;
  status: CaseStatus;
  updated_at: string;
  next_follow_up_at: string | null;
};

const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  customer_service: "Customer Service",
  finance: "Finance",
  caller: "Caller",
  operator: "Operator",
  sales_manager: "Sales Manager",
};

const statusLabels: Record<CurrentCaseStatus, string> = {
  documents_collected: "Document collected",
  more_documents_needed: "More document needed",
  submission: "Submission",
  rejected: "Rejected",
  lou_received: "LOU received",
  pending_sign_agreement: "Pending sign agreement",
  pending_allocation: "Pending allocation",
  waiting_ehakmilik: "Waiting ehakmilik",
  registered: "Registered",
  grant_roadtax_collected: "Grant & roadtax collected",
  prepare_delivery: "Prepare delivery",
  car_delivery: "Delivered",
  cancelled: "Cancelled",
};

function normalizeStatus(status: CaseStatus): CurrentCaseStatus {
  switch (status) {
    case "hint_submitted":
      return "pending_allocation";
    case "booking_form_received":
      return "waiting_ehakmilik";
    case "registration_needed":
      return "registered";
    case "roadtax_grant_process":
      return "grant_roadtax_collected";
    default:
      return status;
  }
}

function assignedRoles(status: CurrentCaseStatus): Role[] {
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
    case "pending_sign_agreement":
    case "pending_allocation":
    case "waiting_ehakmilik":
    case "registered":
    case "grant_roadtax_collected":
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

function progressRoles(status: CurrentCaseStatus, dealer?: CaseDealer | null): Role[] {
  const roles = assignedRoles(status);
  return dealer === "kah_motor" ? [...roles, "sales_manager"] : roles;
}

function caseLine(record: CaseRow) {
  const customer = record.customer_name?.trim() || "Case";
  const car = [record.car_model, record.car_variant].filter(Boolean).join(" ");

  return car ? `${customer} • ${car}` : customer;
}

function isKualaLumpurEightAm(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");

  return hour === 8 && minute < 15;
}

function groupedPushBodyFor(role: Role, records: CaseRow[]) {
  const preview = records
    .slice(0, 5)
    .map(
      (record, index) =>
        `${index + 1}. ${caseLine(record)} • ${statusLabels[normalizeStatus(record.status)]}`,
    );
  const extraCount = records.length - preview.length;

  return [
    `Trigger: Follow Up Due > 3 days → ${roleLabels[role]}.`,
    `${records.length} case${records.length > 1 ? "s" : ""} need follow up.`,
    ...preview,
    extraCount > 0 ? `+${extraCount} more cases.` : "",
    "Open CasePilot to review.",
  ].filter(Boolean).join("\n");
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase environment", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();

  if (!isKualaLumpurEightAm(now)) {
    return Response.json({
      ok: true,
      skipped: "scheduled_for_8am_kuala_lumpur",
      notifications: 0,
      activities: 0,
      push: { sent: 0, failed: 0 },
    });
  }

  const { data: cases, error } = await supabase
    .from("cases")
    .select("id,dealer,customer_name,car_model,car_variant,status,updated_at,next_follow_up_at")
    .is("deleted_at", null);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const notificationRows: Array<{
    case_id: string;
    role: Role;
    reason: string;
    status: CurrentCaseStatus;
    due_at: string;
  }> = [];

  const activityRows: Array<{
    case_id: string;
    type: string;
    actor_role: Role;
    actor_name: string;
    message: string;
    status: CurrentCaseStatus;
  }> = [];
  const casesByRole: Partial<Record<Role, CaseRow[]>> = {};
  const notifiedCaseIds = new Set<string>();

  for (const record of (cases || []) as CaseRow[]) {
    const status = normalizeStatus(record.status);
    const isTerminal =
      status === "rejected" || status === "car_delivery" || status === "cancelled";

    if (isTerminal) continue;

    const nextFollowUp = record.next_follow_up_at
      ? new Date(record.next_follow_up_at)
      : new Date(+new Date(record.updated_at) + twoDaysMs);

    if (+now - +nextFollowUp > threeDaysMs) {
      const followUpRoles = progressRoles(status, record.dealer);
      const rolesToNotify: Role[] = followUpRoles.length
        ? followUpRoles
        : ["customer_service"];

      for (const role of rolesToNotify) {
        if (!casesByRole[role]) casesByRole[role] = [];
        casesByRole[role]?.push(record);

        notificationRows.push({
          case_id: record.id,
          role,
          reason: "Follow Up Due has been overdue for more than 3 days.",
          status,
          due_at: now.toISOString(),
        });
      }

      notifiedCaseIds.add(record.id);
      activityRows.push({
        case_id: record.id,
        type: "follow_up",
        actor_role: rolesToNotify[0] || "customer_service",
        actor_name: "System",
        message: "Grouped follow up due notification sent.",
        status,
      });
    }
  }

  const payloadsByRole = Object.fromEntries(
    Object.entries(casesByRole).map(([role, records]) => [
      role,
      {
        title: `CasePilot • ${records.length} Follow Up Due`,
        body: groupedPushBodyFor(role as Role, records),
        url: "/",
      },
    ]),
  ) as Partial<Record<Role, { title: string; body: string; url: string }>>;

  let pushResult = { sent: 0, failed: 0 };

  if (notificationRows.length) {
    await supabase.from("case_notifications").insert(notificationRows);
    pushResult = await sendPushesForRoles(
      supabase,
      Object.keys(casesByRole) as Role[],
      payloadsByRole,
    );
  }

  if (activityRows.length) {
    await supabase.from("case_activities").insert(activityRows);
  }

  if (notifiedCaseIds.size) {
    await supabase
      .from("cases")
      .update({
        next_follow_up_at: new Date(+now + twoDaysMs).toISOString(),
      })
      .in("id", [...notifiedCaseIds]);
  }

  return Response.json({
    ok: true,
    notifications: notificationRows.length,
    activities: activityRows.length,
    push: pushResult,
  });
});
