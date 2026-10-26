import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUrl } from "@/lib/supabase";
import { leadWhatsAppUrl } from "@/lib/whatsapp-contact";
import { followUpWhatsAppUrls } from "@/lib/follow-up-whatsapp";
import { AiError, chatDigest, conversationContext, encryptionKey, generateDraft, latestMessages, mcpDevices, murpatiRead, normalizedPhone, openSecret, optedOut, sealSecret, uuid } from "@/lib/server/ai-follow-up-core";

export const runtime = "nodejs";
export const maxDuration = 60;
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } }); }
function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error && typeof error === "object" && "message" in error && String(error.message).startsWith("Had harian AI")) throw new AiError("Had harian AI dicapai. Hubungi Admin.", 429);
  if (error) throw new AiError("Data AI tidak dapat disimpan atau dibaca. Pastikan migration dipasang dan cuba semula.", 503);
  return data;
}
async function authenticate(req: NextRequest) {
  const bearer = req.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) throw new AiError("Log masuk diperlukan.", 401);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new AiError("Konfigurasi server belum lengkap.", 503);
  const auth = createClient(getSupabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Fs_FX9W23A3AbS-T8szB1g_pW_pNDui", { global: { headers: { Authorization: bearer } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new AiError("Sesi tamat. Log masuk semula.", 401);
  const db = createClient(getSupabaseUrl(), serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const profile = checked(await db.from("profiles").select("id,role,active").eq("id", data.user.id).single());
  if (!profile?.active || !["admin", "customer_service", "broker"].includes(profile.role)) throw new AiError("Akses AI Follow Up ditolak.", 403);
  return { db, auth, userId: data.user.id, admin: profile.role === "admin" };
}
type Actor = Awaited<ReturnType<typeof authenticate>>;
async function settings(db: SupabaseClient) { return checked(await db.from("ai_follow_up_settings").select("*").eq("id", true).maybeSingle()); }
async function snapshot(db: SupabaseClient, id: string): Promise<string> { return checked(await db.rpc("ai_lead_snapshot", { p_lead_id: id })); }
async function leadFor(actor: Actor, id: string, contactRequired = true) {
  if (!uuid(id)) throw new AiError("Lead tidak sah.");
  let query = actor.db.from("leads").select("id,owner_id,customer_name,customer_phone,whatsapp_username,status,receipt_id").eq("id", id).is("deleted_at", null);
  if (!actor.admin) query = query.eq("owner_id", actor.userId);
  const lead = checked(await query.maybeSingle());
  if (!lead || (contactRequired && lead.status === "rejected")) throw new AiError("Lead tidak tersedia atau akses ditolak.", 403);
  if (!contactRequired) return lead;
  try { leadWhatsAppUrl({ customerPhone: lead.customer_phone || "", whatsappUsername: lead.whatsapp_username || "" }); }
  catch { throw new AiError("Tambah nombor telefon atau username WhatsApp yang sah dahulu."); }
  return lead;
}
async function ownDevice(actor: Actor, sessionId: string) {
  const device = checked(await actor.db.from("ai_device_assignments").select("*").eq("session_id", sessionId).eq("user_id", actor.userId).maybeSingle());
  if (!device) throw new AiError("Device ini tidak ditetapkan kepada anda. Hubungi Admin.", 403);
  return device;
}
async function sessions(key: string) {
  if (key.startsWith("https://mcp.murpati.com/")) return mcpDevices(key);
  const result = await murpatiRead(key, "/v1/sessions");
  if (!Array.isArray(result.sessions)) throw new AiError("Senarai device Murpati tidak sah.", 502);
  return result.sessions.filter((s: { session_id: string; pipeline?: string }) => typeof s.session_id === "string" && s.session_id.startsWith("sess_") && s.pipeline !== "official")
    .map((s: { session_id: string; phone_number: string; device_name?: string; status: string }) => ({ sessionId: s.session_id, phone: normalizedPhone(s.phone_number || ""), name: s.device_name || s.phone_number, status: s.status }));
}
async function verifiedDevice(actor: Actor, key: string, sessionId: string) {
  const device = await ownDevice(actor, sessionId);
  const live = (await sessions(key)).find((s: { sessionId: string; phone: string }) => s.sessionId === sessionId && s.phone === device.phone);
  if (!live || live.status !== "connected") throw new AiError("Device WhatsApp terputus atau nombor berubah. Hubungi Admin.", 409);
  return live;
}
async function viewSettings(actor: Actor) {
  const config = await settings(actor.db);
  let query = actor.db.from("ai_device_assignments").select("session_id,phone,name,user_id").order("name");
  if (!actor.admin) query = query.eq("user_id", actor.userId);
  const assignments = checked(await query);
  let encryptionReady = true;
  try { encryptionKey(); } catch { encryptionReady = false; }
  const devices = (assignments || []).map((d) => ({ sessionId: d.session_id, phone: d.phone, name: d.name, userId: d.user_id }));
  const members = actor.admin ? checked(await actor.db.from("profiles").select("id,full_name").eq("active", true).in("role", ["admin", "customer_service", "broker"]).order("full_name"))?.map((m) => ({ id: m.id, name: m.full_name })) : undefined;
  return { configured: Boolean(config?.openai_secret), murpatiConfigured: Boolean(config?.murpati_secret), revision: config?.revision || 0, dailyLimit: config?.daily_limit || 50, encryptionReady, devices, selectedDevice: "", members };
}
async function handleGet(req: NextRequest) {
  const actor = await authenticate(req);
  const action = req.nextUrl.searchParams.get("action");
  if (action === "settings") return json(await viewSettings(actor));
  if (action === "history") {
    const leadId = req.nextUrl.searchParams.get("leadId") || "";
    await leadFor(actor, leadId, false);
    return json({ entries: checked(await actor.db.from("ai_follow_up_drafts").select("id,opened_at,user_id").eq("lead_id", leadId).eq("outcome", "opened").order("opened_at", { ascending: false }).limit(30)) });
  }
  throw new AiError("Tindakan tidak sah.");
}
async function handlePost(req: NextRequest) {
  const actor = await authenticate(req);
  if (Number(req.headers.get("content-length")) > 20000) throw new AiError("Permintaan terlalu besar.");
  const raw = await req.text();
  if (raw.length > 20000) throw new AiError("Permintaan terlalu besar.");
  let p;
  try { p = JSON.parse(raw); } catch { throw new AiError("Permintaan tidak sah."); }
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new AiError("Permintaan tidak sah.");
  if (["save_settings", "devices", "assign", "unassign"].includes(p.action)) {
    if (!actor.admin) throw new AiError("Tetapan ini untuk Admin sahaja.", 403);
    const config = await settings(actor.db);
    if (p.action === "save_settings") {
      encryptionKey();
      if (!Number.isInteger(p.revision) || p.revision !== (config?.revision || 0)) throw new AiError("Tetapan diubah oleh Admin lain. Muat semula dahulu.", 409);
      const values: Record<string, unknown> = { id: true, revision: p.revision + 1, updated_at: new Date().toISOString(), updated_by: actor.userId };
      if (!Number.isInteger(p.dailyLimit) || p.dailyLimit < 1 || p.dailyLimit > 500) throw new AiError("Had harian mestilah 1–500.");
      values.daily_limit = p.dailyLimit;
      for (const field of ["openaiKey", "murpatiKey"] as const) if (p[field] !== undefined && (typeof p[field] !== "string" || p[field].length > 2048 || /\s/.test(p[field]))) throw new AiError("Format API key tidak sah.");
      if (p.murpatiKey) { await sessions(p.murpatiKey); values.murpati_secret = sealSecret(p.murpatiKey, "murpati"); }
      if (p.openaiKey) {
        let res;
        try { res = await fetch("https://api.openai.com/v1/models/gpt-6-luna", { headers: { Authorization: `Bearer ${p.openaiKey}` }, signal: AbortSignal.timeout(15000), cache: "no-store" }); }
        catch { throw new AiError("OpenAI tidak dapat dihubungi. Key belum disimpan.", 502); }
        if (!res.ok) throw new AiError("Key AI atau akses model tidak dapat disahkan. Key belum disimpan.", 400);
        values.openai_secret = sealSecret(p.openaiKey, "openai");
      }
      if (p.clearAi === true) values.openai_secret = null;
      if (p.clearMurpati === true) values.murpati_secret = null;
      if (config) {
        const saved = checked(await actor.db.from("ai_follow_up_settings").update(values).eq("id", true).eq("revision", p.revision).select("revision").maybeSingle());
        if (!saved) throw new AiError("Tetapan berubah. Muat semula dahulu.", 409);
      } else checked(await actor.db.from("ai_follow_up_settings").insert(values));
      if (p.clearMurpati === true || p.murpatiKey) checked(await actor.db.from("ai_device_assignments").delete().neq("session_id", ""));
      return json(await viewSettings(actor));
    }
    if (!config?.murpati_secret) throw new AiError("Admin perlu menyimpan API key Murpati dahulu.", 409);
    if (p.action === "unassign") {
      if (typeof p.sessionId !== "string") throw new AiError("Device tidak sah.");
      checked(await actor.db.from("ai_device_assignments").delete().eq("session_id", p.sessionId));
      return json(await viewSettings(actor));
    }
    const devices = await sessions(openSecret(config.murpati_secret, "murpati"));
    if (p.action === "devices") return json({ devices });
    const device = devices.find((d: { sessionId: string }) => d.sessionId === p.sessionId);
    if (!device?.phone || !uuid(p.userId)) throw new AiError("Device atau pemilik tidak sah.");
    const member = checked(await actor.db.from("profiles").select("id").eq("id", p.userId).eq("active", true).in("role", ["admin", "customer_service", "broker"]).maybeSingle());
    if (!member) throw new AiError("Pemilik mesti Admin, CS atau Broker yang aktif.");
    checked(await actor.db.from("ai_device_assignments").upsert({ session_id: device.sessionId, user_id: p.userId, phone: device.phone, name: device.name, updated_at: new Date().toISOString() }));
    return json(await viewSettings(actor));
  }
  if (p.action === "draft") {
    let lead = await leadFor(actor, p.leadId);
    const config = await settings(actor.db);
    const manual = p.provider === "murpati_manual";
    if (p.provider !== undefined && !["openai", "murpati_manual"].includes(p.provider)) throw new AiError("Penyedia AI tidak sah.");
    if (!config?.murpati_secret || (!manual && !config.openai_secret)) throw new AiError("AI Follow Up belum disediakan. Buka Account → AI Follow Up atau hubungi Admin.", 409);
    const key = openSecret(config.murpati_secret, "murpati");
    // Validate assignment before any external read, and claim a cross-server lease before API usage.
    await ownDevice(actor, p.sessionId);
    const id = randomUUID();
    const claimed = checked(await actor.db.rpc("claim_ai_generation", { p_user_id: actor.userId, p_request_id: id }));
    if (!claimed) throw new AiError("Penjanaan lain masih berjalan. Tunggu dan cuba semula.", 429);
    try {
      const version = await snapshot(actor.db, lead.id);
      lead = await leadFor(actor, lead.id);
      checked(await actor.db.from("ai_follow_up_drafts").insert({ id, user_id: actor.userId, lead_id: lead.id, session_id: p.sessionId, phone: "", revision: config.revision, snapshot: version, recipient_phone: lead.customer_phone || "", recipient_username: lead.whatsapp_username || "" }));
      const device = await verifiedDevice(actor, key, p.sessionId);
      const messages = await latestMessages(key, device.sessionId, normalizedPhone(lead.customer_phone || ""));
      const context = conversationContext(messages);
      if (version !== await snapshot(actor.db, lead.id)) throw new AiError("Maklumat Lead atau Case berubah. Jana semula.", 409);
      const blocked = optedOut(messages);
      const result = blocked ? { text: "", blocked: true, reason: "Pelanggan meminta supaya tidak dihubungi. Draf jualan disekat." } : manual ? { text: "", blocked: false, reason: "" } : await generateDraft(openSecret(config.openai_secret, "openai"), context);
      // Revalidate permissions and configuration after the external generation.
      await leadFor(actor, lead.id); await ownDevice(actor, device.sessionId);
      const current = await settings(actor.db);
      if (current?.revision !== config.revision || version !== await snapshot(actor.db, lead.id)) throw new AiError("Maklumat atau tetapan berubah. Jana semula.", 409);
      const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
      checked(await actor.db.from("ai_follow_up_drafts").update({ outcome: result.blocked ? "blocked" : "ready", phone: device.phone, conversation_hash: chatDigest(messages), expires_at: expiresAt }).eq("id", id));
      return json({ id, ...result, provider: manual ? "murpati_manual" : "openai", device, recipient: lead.customer_phone || `@${lead.whatsapp_username}`, customerName: lead.customer_name || "Lead", source: "conversation", lastMessageAt: messages.at(-1)?.timestamp || null, expiresAt });
    } catch (error) {
      await actor.db.from("ai_follow_up_drafts").update({ outcome: "failed" }).eq("id", id).eq("outcome", "generating");
      throw error;
    } finally { await actor.db.from("ai_generation_locks").delete().eq("user_id", actor.userId).eq("request_id", id); }
  }
  if (p.action === "handoff") {
    if (!uuid(p.id) || typeof p.text !== "string" || !p.text.trim() || p.text.length > 4000) throw new AiError("Draf tidak sah.");
    const d = checked(await actor.db.from("ai_follow_up_drafts").select("*").eq("id", p.id).eq("user_id", actor.userId).maybeSingle());
    if (!d || !["ready", "opened"].includes(d.outcome) || Date.parse(d.expires_at) <= Date.now()) throw new AiError("Draf tidak tersedia atau tamat. Jana semula.", 409);
    const lead = await leadFor(actor, d.lead_id);
    if ((lead.customer_phone || "") !== d.recipient_phone || (lead.whatsapp_username || "") !== d.recipient_username) throw new AiError("Penerima berubah. Jana semula.", 409);
    const config = await settings(actor.db);
    if (!config?.murpati_secret || config.revision !== d.revision) throw new AiError("Tetapan berubah. Jana semula.", 409);
    const key = openSecret(config.murpati_secret, "murpati");
    await verifiedDevice(actor, key, d.session_id);
    if (d.outcome !== "opened") {
      if (await snapshot(actor.db, lead.id) !== d.snapshot) throw new AiError("Maklumat Lead atau Case berubah. Jana semula.", 409);
      const messages = await latestMessages(key, d.session_id, normalizedPhone(lead.customer_phone || ""));
      if (chatDigest(messages) !== d.conversation_hash || optedOut(messages)) throw new AiError("Conversation berubah. Jana semula sebelum membuka WhatsApp.", 409);
    }
    const { data: count, error } = await actor.auth.rpc("open_ai_follow_up", { p_draft_id: d.id, p_ticket: d.ticket });
    if (error) throw new AiError("Tindakan belum disimpan. Cuba semula; jika maklumat berubah, jana semula.", 409);
    const url = lead.customer_phone ? followUpWhatsAppUrls(lead.customer_phone, p.text.trim())[2] : leadWhatsAppUrl({ customerPhone: "", whatsappUsername: lead.whatsapp_username });
    return json({ url, count, usernameOnly: !lead.customer_phone });
  }
  throw new AiError("Tindakan tidak sah.");
}
export async function GET(req: NextRequest) { try { return await handleGet(req); } catch (e) { return json({ error: e instanceof AiError ? e.message : "Permintaan AI gagal. Cuba semula." }, e instanceof AiError ? e.status : 500); } }
export async function POST(req: NextRequest) { try { return await handlePost(req); } catch (e) { return json({ error: e instanceof AiError ? e.message : "Permintaan AI gagal. Cuba semula." }, e instanceof AiError ? e.status : 500); } }
