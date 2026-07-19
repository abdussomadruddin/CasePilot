import { getSupabaseClient } from "@/lib/supabase";
import type { Profile, Role } from "@/lib/types";

export const sessionExpiredMessage = "Session expired. Please sign in again.";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  phone: string | null;
  active: boolean | null;
};

export function isSessionExpiredError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : String(error || "");
  const normalized = message.toLowerCase();

  return [
    "refresh token",
    "jwt expired",
    "session expired",
    "auth session missing",
  ].some((value) => normalized.includes(value));
}

export async function clearLocalSession() {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
}

export async function getValidAccessToken() {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    await clearLocalSession();
    throw new Error(sessionExpiredMessage);
  }

  return session.access_token;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    await clearLocalSession();
    throw new Error(sessionExpiredMessage);
  }

  if (!session?.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,phone,active")
    .eq("id", session.user.id)
    .single();

  if (error || !data) return null;

  const row = data as ProfileRow;

  return {
    id: row.id,
    email: row.email || session.user.email || "",
    fullName: row.full_name || session.user.email || "User",
    role: row.role,
    phone: row.phone || undefined,
    active: row.active ?? true,
  };
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  return getCurrentProfile();
}

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}
