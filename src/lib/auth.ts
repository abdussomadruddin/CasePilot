import { getSupabaseClient } from "@/lib/supabase";
import type { Profile, Role } from "@/lib/types";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  phone: string | null;
  active: boolean | null;
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

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

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
