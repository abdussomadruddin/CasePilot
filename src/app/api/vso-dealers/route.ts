import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validateDealer } from "@/lib/vso-dealers";
import { getSupabaseUrl } from "@/lib/supabase";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function actor(req: NextRequest) {
  const bearer = req.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) return { error: json({ error: "Log masuk diperlukan." }, 401) };
  const db = createClient(getSupabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Fs_FX9W23A3AbS-T8szB1g_pW_pNDui", { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } });
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return { error: json({ error: "Sesi tamat." }, 401) };
  const { data: profile } = await db.from("profiles").select("active,role").eq("id", data.user.id).single();
  if (!profile?.active || !["admin", "broker", "customer_service"].includes(profile.role)) return { error: json({ error: "Akses ditolak." }, 403) };
  return { db, admin: profile.role === "admin" };
}
export async function GET(req: NextRequest) {
  const a = await actor(req); if (a.error) return a.error;
  const { data, error } = await a.db.from("vso_dealers").select("id,data,active,version,updated_at").order("created_at");
  return error ? json({ error: "Senarai dealer gagal dibaca. Cuba semula." }, 503) : json({ dealers: data });
}
export async function POST(req: NextRequest) {
  const a = await actor(req); if (a.error) return a.error;
  if (!a.admin) return json({ error: "Admin sahaja boleh mengurus dealer." }, 403);
  try {
    if (Number(req.headers.get("content-length")) > 12000) throw new Error("Borang terlalu besar.");
    const body = await req.json();
    if (!Number.isSafeInteger(body.version) || body.version < 0 || typeof body.active !== "boolean" || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new Error("Rekod dealer tidak sah.");
    const details = validateDealer(body.data);
    const { data, error } = await a.db.rpc("save_vso_dealer", { p_id: body.id, p_version: body.version, p_data: details, p_active: body.active });
    if (error) return json({ error: error.message.includes("DEALER_CONFLICT") ? "Dealer sudah berubah. Input dikekalkan; muat semula rekod sebelum menyimpan." : "Dealer gagal disimpan. Cuba semula." }, error.message.includes("DEALER_CONFLICT") ? 409 : 503);
    return json({ dealer: Array.isArray(data) ? data[0] : data });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Maklumat tidak sah." }, 400); }
}
