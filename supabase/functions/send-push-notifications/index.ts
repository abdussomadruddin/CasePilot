import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { sendPushesForRoles } from "../_shared/web-push.ts";

type Role =
  | "admin"
  | "customer_service"
  | "finance"
  | "caller"
  | "operator"
  | "sales_manager";

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

type RequestBody = {
  caseId: string;
  status: CaseStatus;
  roles: Role[];
  reason: string;
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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date().toISOString();
  const notificationRows = roles.map((role) => ({
    case_id: body.caseId,
    role,
    reason: body.reason || "Case update requires attention.",
    status: body.status,
    due_at: now,
  }));

  const { error: insertError } = await serviceClient
    .from("case_notifications")
    .insert(notificationRows);

  if (insertError) {
    return jsonResponse({ ok: false, error: insertError.message }, 500);
  }

  const push = await sendPushesForRoles(serviceClient, roles);

  return jsonResponse({
    ok: true,
    notifications: notificationRows.length,
    push,
  });
});
