import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { sendPushesForRoles } from "../_shared/web-push.ts";

type Role =
  | "admin"
  | "customer_service"
  | "finance"
  | "caller"
  | "operator"
  | "sales_manager";

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

type RequestBody = {
  caseId: string;
  status: CaseStatus;
  roles: Role[];
  reason: string;
};

type CaseRow = {
  customer_name: string | null;
  car_model: string | null;
  car_variant: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

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

function buildStatusTriggerBody(
  role: Role,
  status: CurrentCaseStatus,
  reason: string,
  record?: CaseRow | null,
) {
  const customer = record?.customer_name?.trim() || "Case";
  const car = [record?.car_model, record?.car_variant].filter(Boolean).join(" ");
  const caseLine = car ? `${customer} • ${car}` : customer;

  return [
    `Trigger: ${statusLabels[status]} → ${roleLabels[role]}.`,
    caseLine,
    reason,
    "Action: add remark or update status.",
  ].join("\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Missing Supabase environment" }, 500);
  }

  const authHeader = request.headers.get("Authorization") || "";
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const body = (await request.json()) as Partial<RequestBody>;
  const roles = [...new Set(body.roles || [])];

  if (!body.caseId || !body.status || !roles.length) {
    return jsonResponse({ ok: false, error: "Invalid notification request" }, 400);
  }

  const status = normalizeStatus(body.status);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date().toISOString();
  const { data: record } = await serviceClient
    .from("cases")
    .select("customer_name,car_model,car_variant")
    .eq("id", body.caseId)
    .maybeSingle<CaseRow>();
  const notificationRows = roles.map((role) => ({
    case_id: body.caseId,
    role,
    reason: body.reason || "Case update requires attention.",
    status,
    due_at: now,
  }));

  const { error: insertError } = await serviceClient
    .from("case_notifications")
    .insert(notificationRows);

  if (insertError) {
    return jsonResponse({ ok: false, error: insertError.message }, 500);
  }

  const push = await sendPushesForRoles(
    serviceClient,
    roles,
    Object.fromEntries(
      roles.map((role) => [
        role,
        {
          title: `CasePilot • ${statusLabels[status]}`,
          body: buildStatusTriggerBody(
            role,
            status,
            body.reason || "Case update requires attention.",
            record,
          ),
          url: "/",
        },
      ]),
    ),
  );

  return jsonResponse({
    ok: true,
    notifications: notificationRows.length,
    push,
  });
});
