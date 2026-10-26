import { getSupabaseClient } from "@/lib/supabase";
export async function aiRequest<T>(action: string, payload?: Record<string, unknown>, signal?: AbortSignal, query: Record<string, string> = {}): Promise<T> {
  const { data } = await getSupabaseClient().auth.getSession();
  if (!data.session) throw new Error("Sesi tamat. Log masuk semula.");
  const res = await fetch(`/api/ai-follow-up${payload ? "" : `?${new URLSearchParams({ action, ...query })}`}`, {
    method: payload ? "POST" : "GET", cache: "no-store", signal,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
    ...(payload ? { body: JSON.stringify({ ...payload, action }) } : {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Permintaan gagal. Cuba semula.");
  return body;
}
