import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

type Role =
  | "admin"
  | "customer_service"
  | "finance"
  | "caller"
  | "operator";

type TeamMemberPayload = {
  action?: "create" | "update";
  id?: string;
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  role?: Role;
  active?: boolean;
};

const roles: Role[] = [
  "admin",
  "customer_service",
  "finance",
  "caller",
  "operator",
];

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  customer_service: "Customer Service",
  finance: "Finance",
  caller: "Caller",
  operator: "Operator",
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

function normalizePayload(payload: TeamMemberPayload) {
  const email = payload.email?.trim().toLowerCase() || "";
  const fullName = payload.fullName?.trim() || email;
  const phone = payload.phone?.trim() || "";
  const role = payload.role || "customer_service";
  const password = payload.password?.trim() || "";

  if (!roles.includes(role)) {
    throw new Error("Invalid role.");
  }

  return {
    action: payload.action,
    id: payload.id,
    email,
    fullName,
    phone,
    role,
    password,
    active: payload.active ?? true,
  };
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
    return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin" || profile.active === false) {
    return jsonResponse({ ok: false, error: "Admin access required." }, 403);
  }

  try {
    const payload = normalizePayload((await request.json()) as TeamMemberPayload);

    if (payload.action === "create") {
      if (!payload.email) {
        return jsonResponse({ ok: false, error: "Email is required." }, 400);
      }

      if (!payload.password) {
        return jsonResponse(
          { ok: false, error: "Password is required for new team members." },
          400,
        );
      }

      const { data: created, error: createError } =
        await serviceClient.auth.admin.createUser({
          email: payload.email,
          password: payload.password,
          email_confirm: true,
          user_metadata: {
            full_name: payload.fullName,
            phone: payload.phone,
            role: payload.role,
          },
        });

      if (createError || !created.user) {
        return jsonResponse(
          { ok: false, error: createError?.message || "Unable to create user." },
          400,
        );
      }

      const { error: profileWriteError } = await serviceClient
        .from("profiles")
        .upsert({
          id: created.user.id,
          email: payload.email,
          full_name: payload.fullName || roleLabels[payload.role],
          phone: payload.phone,
          role: payload.role,
          active: payload.active,
        });

      if (profileWriteError) {
        return jsonResponse({ ok: false, error: profileWriteError.message }, 500);
      }

      return jsonResponse({ ok: true, id: created.user.id });
    }

    if (payload.action === "update") {
      if (!payload.id) {
        return jsonResponse({ ok: false, error: "User id is required." }, 400);
      }

      const userUpdate: {
        email?: string;
        password?: string;
        user_metadata: Record<string, string>;
      } = {
        user_metadata: {
          full_name: payload.fullName,
          phone: payload.phone,
          role: payload.role,
        },
      };

      if (payload.email) userUpdate.email = payload.email;
      if (payload.password) userUpdate.password = payload.password;

      const { error: authUpdateError } =
        await serviceClient.auth.admin.updateUserById(payload.id, userUpdate);

      if (authUpdateError) {
        return jsonResponse({ ok: false, error: authUpdateError.message }, 400);
      }

      const { error: profileUpdateError } = await serviceClient
        .from("profiles")
        .update({
          email: payload.email,
          full_name: payload.fullName || roleLabels[payload.role],
          phone: payload.phone,
          role: payload.role,
          active: payload.active,
        })
        .eq("id", payload.id);

      if (profileUpdateError) {
        return jsonResponse({ ok: false, error: profileUpdateError.message }, 500);
      }

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: "Invalid team action." }, 400);
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Unable to manage team member.";
    return jsonResponse({ ok: false, error: message }, 400);
  }
});
