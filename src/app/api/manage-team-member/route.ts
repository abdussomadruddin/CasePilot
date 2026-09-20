import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { roles, type Role } from "@/lib/types";

export const runtime = "nodejs";

const defaultSupabaseUrl = "https://kfyqyxiycvdknlcpjmts.supabase.co";
const defaultSupabaseKey = "sb_publishable_Fs_FX9W23A3AbS-T8szB1g_pW_pNDui";

type TeamPayload = {
  action?: "create" | "update" | "delete";
  id?: string;
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  role?: Role;
  active?: boolean;
};

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || defaultSupabaseUrl;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || defaultSupabaseKey;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get("authorization") || "";

  if (!serviceRoleKey) {
    return response({ ok: false, error: "Supabase server environment is incomplete." }, 500);
  }

  if (!authorization.startsWith("Bearer ")) {
    return response({ ok: false, error: "Unauthorized." }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();

  if (userError || !userData.user) {
    return response({ ok: false, error: "Session expired. Please sign in again." }, 401);
  }

  const { data: admin } = await serviceClient
    .from("profiles")
    .select("role,active")
    .eq("id", userData.user.id)
    .single();

  if (admin?.role !== "admin" || admin.active === false) {
    return response({ ok: false, error: "Admin access required." }, 403);
  }

  try {
    const payload = (await request.json()) as TeamPayload;
    const action = payload.action;
    const id = payload.id;
    const email = payload.email?.trim().toLowerCase() || "";
    const password = payload.password?.trim() || "";
    const fullName = payload.fullName?.trim() || email;
    const phone = payload.phone?.trim() || "";
    const role = payload.role || "customer_service";
    const active = payload.active ?? true;

    if (!roles.includes(role)) {
      return response({ ok: false, error: "Invalid role." }, 400);
    }

    if (action === "create") {
      if (!email) return response({ ok: false, error: "Email is required." }, 400);
      if (password.length < 6) {
        return response({ ok: false, error: "Password must be at least 6 characters." }, 400);
      }

      const { data: created, error } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone, role },
      });

      if (error || !created.user) {
        return response({ ok: false, error: error?.message || "Unable to create user." }, 400);
      }

      const { error: profileError } = await serviceClient.from("profiles").upsert({
        id: created.user.id,
        email,
        full_name: fullName,
        phone,
        role,
        active,
      });

      if (profileError) {
        await serviceClient.auth.admin.deleteUser(created.user.id);
        return response({ ok: false, error: profileError.message }, 500);
      }

      return response({ ok: true, id: created.user.id, passwordUpdated: true });
    }

    if (action === "update") {
      if (!id) return response({ ok: false, error: "User id is required." }, 400);
      if (password && password.length < 6) {
        return response({ ok: false, error: "Password must be at least 6 characters." }, 400);
      }

      const userUpdate: Parameters<typeof serviceClient.auth.admin.updateUserById>[1] = {
        user_metadata: { full_name: fullName, phone, role },
      };
      if (email) userUpdate.email = email;
      if (password) userUpdate.password = password;

      const { error } = await serviceClient.auth.admin.updateUserById(id, userUpdate);
      if (error) return response({ ok: false, error: error.message }, 400);

      const { error: profileError } = await serviceClient
        .from("profiles")
        .update({ email, full_name: fullName, phone, role, active })
        .eq("id", id);

      if (profileError) return response({ ok: false, error: profileError.message }, 500);
      return response({ ok: true, passwordUpdated: Boolean(password) });
    }

    if (action === "delete") {
      if (!id) return response({ ok: false, error: "User id is required." }, 400);
      if (id === userData.user.id) {
        return response(
          { ok: false, error: "You cannot delete the admin account currently signed in." },
          400,
        );
      }

      const { data: member } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (!member) return response({ ok: false, error: "Team member was not found." }, 404);

      const cleanups = await Promise.all([
        serviceClient.from("cases").update({ created_by: null }).eq("created_by", id),
        serviceClient.from("cases").update({ updated_by: null }).eq("updated_by", id),
        serviceClient.from("cases").update({ owner_id: null }).eq("owner_id", id),
        serviceClient.from("case_documents").update({ uploaded_by: null }).eq("uploaded_by", id),
        serviceClient.from("case_activities").update({ actor_id: null }).eq("actor_id", id),
      ]);
      const cleanupError = cleanups.find((result) => result.error)?.error;
      if (cleanupError) return response({ ok: false, error: cleanupError.message }, 500);

      const { error } = await serviceClient.auth.admin.deleteUser(id);
      if (error) return response({ ok: false, error: error.message }, 400);
      return response({ ok: true });
    }

    return response({ ok: false, error: "Invalid team action." }, 400);
  } catch (error) {
    return response(
      { ok: false, error: error instanceof Error ? error.message : "Unable to manage team." },
      400,
    );
  }
}
