import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildVsoPdf, buildFileName, emptyVsoData, vsoFields, type VsoData } from "@/lib/honda-vso.mjs";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kfyqyxiycvdknlcpjmts.supabase.co", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Fs_FX9W23A3AbS-T8szB1g_pW_pNDui", {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  const { data: profile } = await client.from("profiles").select("active,role").eq("id", auth.user.id).single();
  if (!profile?.active || profile.role === "sales_manager") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 24000) throw new Error("Borang terlalu besar.");
    const payload = await request.json();
    const data: VsoData = emptyVsoData();
    for (const key of vsoFields) {
      if (key.startsWith("dealer") && payload[key] === undefined) continue;
      if (typeof payload[key] !== "string" || payload[key].length > (key === "dealerSnapshot" ? 5000 : key === "address" || key === "dealerAddress" ? 1000 : 200)) throw new Error("Maklumat borang tidak sah.");
      data[key] = payload[key].trim();
    }
    if (data.dealerId && !data.dealerName) throw new Error("Isi nama dealer sebelum menjana PDF.");
    data.clearCustomerSignature = payload.clearCustomerSignature !== false;
    if (!data.customerName || !/^\d{4}-\d{2}-\d{2}$/.test(data.bookingDate)) throw new Error("Isi nama customer dan tarikh.");
    const numbers = ["sellingPrice", "discount", "numberPlate", "roadTax", "registrationFee", "ownershipFee", "accessories", "miscSales", "insurance", "ncd", "totalAmount", "bookingFeePaid", "totalOutstanding"] as const;
    for (const key of numbers) if (data[key] && (!Number.isFinite(Number(data[key])) || Number(data[key]) < 0 || Number(data[key]) > (key === "ncd" ? 100 : 99999999))) throw new Error("Nilai harga tidak sah.");
    const template = await readFile(join(process.cwd(), "assets", data.clearCustomerSignature ? "honda-vso-no-signature.pdf" : "honda-vso-template.pdf"));
    const bytes = await buildVsoPdf(template, data);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${buildFileName(data)}.pdf"`, "Cache-Control": "no-store" } });
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "PDF gagal dijana." }, { status: 400 });
  }
}
