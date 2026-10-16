import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildEhakmilik, emptyEhakmilik, ehakmilikFields, ehakmilikFilename } from "@/lib/ehakmilik";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kfyqyxiycvdknlcpjmts.supabase.co", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Fs_FX9W23A3AbS-T8szB1g_pW_pNDui", { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  const { data: profile } = await client.from("profiles").select("active,role").eq("id", auth.user.id).single();
  if (!profile?.active || profile.role === "sales_manager") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 24000) throw new Error("Borang terlalu besar.");
    const payload = await request.json();
    const data = emptyEhakmilik();
    for (const key of Object.keys(ehakmilikFields) as (keyof typeof ehakmilikFields)[]) {
      if (typeof payload[key] !== "string" || payload[key].length > 200) throw new Error("Maklumat tidak sah.");
      data[key] = payload[key].trim();
    }
    if (!data.customerName || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || new Date(data.date).toISOString().slice(0, 10) !== data.date) throw new Error("Isi nama pelanggan dan tarikh yang sah.");
    const bytes = await buildEhakmilik(await readFile(join(process.cwd(), "assets/ehakmilik-template.pdf")), data);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${ehakmilikFilename(data)}"`, "Cache-Control": "no-store" } });
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "PDF gagal dijana." }, { status: 400 });
  }
}
