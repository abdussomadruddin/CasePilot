import { getSupabaseClient } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export type TeamMemberFormValues = {
  id?: string;
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: Role;
  active: boolean;
};

export type TeamMemberSaveResult = {
  ok: boolean;
  id?: string;
  error?: string;
  passwordUpdated?: boolean;
};

async function invokeManageTeam(action: "create" | "update", values: TeamMemberFormValues) {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Admin session expired. Please sign in again.");
  }

  const password = values.password.trim();

  const { data, error } = await supabase.functions.invoke<TeamMemberSaveResult>("manage-team-member", {
    body: {
      action,
      ...values,
      email: values.email.trim().toLowerCase(),
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
      password: password || undefined,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  if (data?.ok === false) {
    throw new Error(data.error || "Unable to save team member.");
  }

  return data || { ok: true };
}

export async function createTeamMember(values: TeamMemberFormValues) {
  return invokeManageTeam("create", values);
}

export async function updateTeamMember(values: TeamMemberFormValues) {
  return invokeManageTeam("update", values);
}
