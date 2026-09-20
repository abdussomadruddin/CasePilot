import { getValidAccessToken } from "@/lib/auth";
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

async function invokeManageTeam(
  action: "create" | "update" | "delete",
  values: Pick<TeamMemberFormValues, "id"> | TeamMemberFormValues,
) {
  const accessToken = await getValidAccessToken();

  const password = "password" in values ? values.password.trim() : "";

  const response = await fetch("/api/manage-team-member", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      ...values,
      email: "email" in values ? values.email.trim().toLowerCase() : undefined,
      fullName: "fullName" in values ? values.fullName.trim() : undefined,
      phone: "phone" in values ? values.phone.trim() : undefined,
      password: password || undefined,
    }),
  });
  const data = (await response.json().catch(() => null)) as TeamMemberSaveResult | null;

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Unable to save team member.");
  }

  return data || { ok: true };
}

export async function createTeamMember(values: TeamMemberFormValues) {
  return invokeManageTeam("create", values);
}

export async function updateTeamMember(values: TeamMemberFormValues) {
  return invokeManageTeam("update", values);
}

export async function deleteTeamMember(id: string) {
  return invokeManageTeam("delete", { id });
}
