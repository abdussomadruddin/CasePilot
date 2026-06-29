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

async function invokeManageTeam(action: "create" | "update", values: TeamMemberFormValues) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.functions.invoke("manage-team-member", {
    body: { action, ...values },
  });

  if (error) throw error;
  if (data?.ok === false) {
    throw new Error(data.error || "Unable to save team member.");
  }
}

export async function createTeamMember(values: TeamMemberFormValues) {
  await invokeManageTeam("create", values);
}

export async function updateTeamMember(values: TeamMemberFormValues) {
  await invokeManageTeam("update", values);
}
