import { morningDay, morningExpiry, morningEligible, morningWindow, draftPurpose } from "@/lib/ai-morning-drafts";
import type { AiDraft } from "@/lib/ai-follow-up";
import { validateSalesPlaybook, selectKnowledge, knowledgeExpiry, terminalStage, type SalesPlaybook, type SalesState } from "@/lib/ai-sales-playbook";
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
async function salesBook(db: SupabaseClient): Promise<SalesPlaybook> {
  const row = checked(await db.from("ai_sales_playbook").select("revision,rules,stages,knowledge,updated_at,updated_by").eq("id",true).single());
  if (!row) throw new AiError("AI Playbook belum dipasang. Hubungi Admin.",503);
  return { ...validateSalesPlaybook(row), updatedAt:row.updated_at, updatedBy:row.updated_by };
}
async function salesState(actor: Actor, leadId: string, sessionId: string): Promise<SalesState | null> {
  const row = checked(await actor.db.from("ai_sales_stage_state").select("stage_id,previous_stage_id,revision,corrected,conversation_hash").eq("lead_id",leadId).eq("session_id",sessionId).maybeSingle());
  return row ? { stageId:row.stage_id, previousStageId:row.previous_stage_id, revision:row.revision, corrected:row.corrected, conversationHash:row.conversation_hash } : null;
}
async function saveStage(actor: Actor, leadId: string, sessionId: string, bookRevision: number, old: SalesState | null, stageId: string, previousStageId: string, corrected: boolean, hash: string): Promise<number> {
  const {data,error} = await actor.db.rpc("save_ai_sales_stage", {p_actor:actor.userId,p_lead:leadId,p_session:sessionId,p_revision:old?.revision || 0,p_book_revision:bookRevision,p_stage:stageId,p_previous:previousStageId,p_corrected:corrected,p_hash:hash});
  if (error) throw new AiError("Fasa atau tetapan berubah. Muat semula dan cuba lagi.",409);
  return data;
}
async function snapshot(db: SupabaseClient, id: string): Promise<string> { return checked(await db.rpc("ai_lead_snapshot", { p_lead_id: id })); }
async function leadFor(actor: Actor, id: string, contactRequired = true) {
  if (!uuid(id)) throw new AiError("Lead tidak sah.");
  let query = actor.db.from("leads").select("id,owner_id,customer_name,customer_phone,whatsapp_username,status,receipt_id,follow_up_count,follow_up_activity_at,deleted_at").eq("id", id).is("deleted_at", null);
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
  const preference = checked(await actor.db.from("ai_morning_preferences").select("session_id,enabled").eq("user_id",actor.userId).maybeSingle());
  const todayJobs=checked(await actor.db.from("ai_morning_jobs").select("status").eq("user_id",actor.userId).eq("batch_day",morningDay()));
  const morningSummary={ready:0,pending:0,blocked:0,failed:0};
  for (const j of todayJobs || []) { if(j.status==="ready") morningSummary.ready++; else if(["queued","running"].includes(j.status)) morningSummary.pending++; else if(j.status==="blocked") morningSummary.blocked++; else morningSummary.failed++; }
  const own = devices.filter(d=>d.userId===actor.userId);
  return { morningSummary, morningEnabled:preference?.enabled !== false, configured: Boolean(config?.openai_secret), murpatiConfigured: Boolean(config?.murpati_secret), revision: config?.revision || 0, dailyLimit: config?.daily_limit || 50, encryptionReady, devices, selectedDevice: preference?.session_id ? (own.some(d=>d.sessionId===preference.session_id) ? preference.session_id : "") : own.length===1 ? own[0].sessionId : "", members };
}
type DraftInput = { leadId: string; sessionId: string; provider?: string };
async function createDraft(actor: Actor, p: DraftInput, preparedFor?: string) {
    let lead = await leadFor(actor, p.leadId);
    if (preparedFor && !morningEligible(lead,actor.userId,preparedFor)) throw new AiError("Lead tidak lagi layak untuk draf pagi.",409);
    const config = await settings(actor.db);
    const manual = p.provider === "murpati_manual";
    if (p.provider !== undefined && !["openai", "murpati_manual"].includes(p.provider)) throw new AiError("Penyedia AI tidak sah.");
    if (!config?.murpati_secret || (!manual && !config.openai_secret)) throw new AiError("AI Follow Up belum disediakan. Buka Account → AI Follow Up atau hubungi Admin.", 409);
    const key = openSecret(config.murpati_secret, "murpati");
    // Validate assignment before any external read, and claim a cross-server lease before API usage.
    await ownDevice(actor, p.sessionId);
    const book = await salesBook(actor.db);
    const state = await salesState(actor,lead.id,p.sessionId);
    const id = randomUUID();
    const claimed = checked(await actor.db.rpc("claim_ai_generation", { p_user_id: actor.userId, p_request_id: id }));
    if (!claimed) throw new AiError("Penjanaan lain masih berjalan. Tunggu dan cuba semula.", 429);
    try {
      const version = await snapshot(actor.db, lead.id);
      lead = await leadFor(actor, lead.id);
      checked(await actor.db.from("ai_follow_up_drafts").insert({ id, user_id: actor.userId, lead_id: lead.id, session_id: p.sessionId, phone: "", revision: config.revision, snapshot: version, recipient_phone: lead.customer_phone || "", recipient_username: lead.whatsapp_username || "", playbook_revision:book.revision, stage_revision:state?.revision || 0 }));
      const device = await verifiedDevice(actor, key, p.sessionId);
      const messages = await latestMessages(key, device.sessionId, normalizedPhone(lead.customer_phone || ""));
      const context = conversationContext(messages);
      if (version !== await snapshot(actor.db, lead.id)) throw new AiError("Maklumat Lead atau Case berubah. Jana semula.", 409);
      const blocked = optedOut(messages);
      const knowledge = selectKnowledge(book.knowledge,messages.map(m=>m.content).join("\n"));
      const terminal = Boolean(state && terminalStage(state.stageId));
      let result = { text:"", blocked:blocked || terminal, reason:blocked ? "Pelanggan meminta supaya tidak dihubungi. Draf jualan disekat." : terminal ? "Fasa WON/LOST: follow-up jualan dihentikan. Betulkan fasa jika tersalah." : "", stageId:state?.stageId || "",previousStageId:state?.previousStageId || "",stageReason:"",nextAction:"",knowledgeIds:[] as string[] };
      if (!blocked && !terminal && !manual) result = await generateDraft(openSecret(config.openai_secret,"openai"),context,fetch,{playbook:book,state,knowledge,stageLock:state?.corrected && state.conversationHash===chatDigest(messages) ? state.stageId : undefined});
      // Revalidate permissions and configuration after the external generation.
      await leadFor(actor, lead.id); await ownDevice(actor, device.sessionId);
      const current = await settings(actor.db);
      if (current?.revision !== config.revision || version !== await snapshot(actor.db, lead.id)) throw new AiError("Maklumat atau tetapan berubah. Jana semula.", 409);
      if ((await salesBook(actor.db)).revision !== book.revision || ((await salesState(actor,lead.id,device.sessionId))?.revision || 0) !== (state?.revision || 0)) throw new AiError("Playbook atau fasa berubah. Buat draf semula.",409);
      let stageRevision = state?.revision || 0;
      if (!blocked && !terminal && !manual) stageRevision = await saveStage(actor,lead.id,device.sessionId,book.revision,state,result.stageId,result.previousStageId,Boolean(state?.corrected && state.conversationHash===chatDigest(messages)),chatDigest(messages));
      const knowledgeExpiresAt = knowledgeExpiry(knowledge);
      if (knowledgeExpiresAt && Date.parse(knowledgeExpiresAt)<=Date.now()) throw new AiError("Knowledge tamat tempoh. Buat draf semula.",409);
      const expiresAt = preparedFor ? morningExpiry(preparedFor) : new Date(Date.now() + 15 * 60000).toISOString();
      const payload: AiDraft = { id, ...result, stageRevision, playbookRevision:book.revision, stages:book.stages.filter(s=>s.active).map(s=>({id:s.id,name:s.name})), references:knowledge.filter(k=>result.knowledgeIds.includes(k.id)).map(k=>({id:k.id,title:k.title})), provider: manual ? "murpati_manual" : "openai", device, recipient: lead.customer_phone || `@${lead.whatsapp_username}`, customerName: lead.customer_name || "Lead", source: "conversation", lastMessageAt: messages.at(-1)?.timestamp || null, expiresAt, preparedAt:preparedFor ? new Date().toISOString() : undefined };
      if (preparedFor && !morningEligible(await leadFor(actor,lead.id),actor.userId,preparedFor)) throw new AiError("Lead tidak lagi due. Draf pagi dibatalkan.",409);
      // A draft for another lead must remain ready. Only replace this lead/device's ticket.
      checked(await actor.db.from("ai_follow_up_drafts").update({outcome:"superseded",cached_payload:null}).eq("user_id",actor.userId).eq("lead_id",lead.id).eq("session_id",device.sessionId).eq("outcome","ready").neq("id",id));
      checked(await actor.db.from("ai_follow_up_drafts").update({ outcome: result.blocked ? "blocked" : "ready", phone: device.phone, conversation_hash: chatDigest(messages), expires_at: expiresAt, stage_revision:stageRevision, knowledge_expires_at:knowledgeExpiresAt, prepared_for:preparedFor || null, cached_payload:preparedFor ? sealSecret(JSON.stringify(payload),draftPurpose(actor.userId,id)) : null }).eq("id", id));
      return json(payload);
    } catch (error) {
      await actor.db.from("ai_follow_up_drafts").update({ outcome: "failed" }).eq("id", id).eq("outcome", "generating");
      throw error;
    } finally { await actor.db.from("ai_generation_locks").delete().eq("user_id", actor.userId).eq("request_id", id); }

}
async function preparedDraft(actor: Actor, leadId:string, sessionId:string): Promise<AiDraft | null> {
  const lead=await leadFor(actor,leadId); const device=await ownDevice(actor,sessionId);
  const rows=checked(await actor.db.from("ai_follow_up_drafts").select("*").eq("user_id",actor.userId).eq("lead_id",leadId).eq("session_id",sessionId).eq("prepared_for",morningDay()).in("outcome",["ready","blocked"]).order("created_at",{ascending:false}).limit(1));
  const d=rows?.[0];
  if (!d?.cached_payload || d.phone!==device.phone || d.recipient_phone!==(lead.customer_phone || "") || d.recipient_username!==(lead.whatsapp_username || "") || Date.parse(d.expires_at)<=Date.now() || (d.knowledge_expires_at && Date.parse(d.knowledge_expires_at)<=Date.now()) || !morningEligible(lead,actor.userId)) return null;
  const config=await settings(actor.db), book=await salesBook(actor.db), state=await salesState(actor,leadId,sessionId);
  if (!config?.openai_secret || !config.murpati_secret || config.revision!==d.revision || book.revision!==d.playbook_revision || (state?.revision || 0)!==d.stage_revision || await snapshot(actor.db,leadId)!==d.snapshot) return null;
  try { return JSON.parse(openSecret(d.cached_payload,draftPurpose(actor.userId,d.id))) as AiDraft; }
  catch { throw new AiError("Draf pagi tidak dapat dibuka. Buat draf baharu.",409); }
}
async function runMorningWorker(req:NextRequest) {
  const token=req.headers.get("x-casepilot-ai-worker") || "";
  if (!token || token.length>256 || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new AiError("Akses worker ditolak.",401);
  const db=createClient(getSupabaseUrl(),process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const allowed=checked(await db.rpc("authorize_ai_morning_worker",{p_token:token}));
  if (allowed!==true) throw new AiError("Akses worker ditolak.",401);
  if (!morningWindow()) return json({skipped:"outside_morning_window"});
  const jobs=checked(await db.rpc("claim_ai_morning_jobs")) || [];
  const outcomes=await Promise.all(jobs.map(async(job:{id:string;user_id:string;lead_id:string;session_id:string;batch_day:string;attempts:number;lease_id:string})=>{
    const actor:Actor={db,auth:db,userId:job.user_id,admin:false};
    let status="failed",reason="",draftId:string|null=null;
    try {
      const profile=checked(await db.from("profiles").select("role,active").eq("id",job.user_id).single());
      const preference=checked(await db.from("ai_morning_preferences").select("enabled,session_id").eq("user_id",job.user_id).maybeSingle());
      if (!profile?.active || !["customer_service","broker"].includes(profile.role) || preference?.enabled===false || (preference?.session_id && preference.session_id!==job.session_id)) throw new AiError("Pemilik atau tetapan device berubah.",403);
      const existing=await preparedDraft(actor,job.lead_id,job.session_id);
      const d=existing || await (await createDraft(actor,{leadId:job.lead_id,sessionId:job.session_id,provider:"openai"},job.batch_day)).json();
      draftId=d.id;status=d.blocked?"blocked":"ready";
    } catch(e) {
      reason=e instanceof AiError ? e.message.slice(0,300) : "Penjanaan gagal. Cuba semula secara manual.";
      status=e instanceof AiError && [400,403,409].includes(e.status)?"skipped":job.attempts<3?"queued":"failed";
      if (e instanceof AiError && e.status===429 && reason.includes("Had harian")) status="skipped";
    }
    checked(await db.from("ai_morning_jobs").update({status,last_error:reason || null,draft_id:draftId,lease_until:null,next_attempt_at:new Date(Date.now()+120000).toISOString(),updated_at:new Date().toISOString()}).eq("id",job.id).eq("lease_id",job.lease_id));
    return {status};
  }));
  return json({processed:outcomes.length,ready:outcomes.filter(o=>o.status==="ready").length,failed:outcomes.filter(o=>o.status==="failed").length});
}
async function handleGet(req: NextRequest) {
  const actor = await authenticate(req);
  const action = req.nextUrl.searchParams.get("action");
  if (action === "settings") return json(await viewSettings(actor));
  if (action === "prepared") {
    const leadId=req.nextUrl.searchParams.get("leadId") || "", sessionId=req.nextUrl.searchParams.get("sessionId") || "";
    const draft=await preparedDraft(actor,leadId,sessionId);
    const jobs=checked(await actor.db.from("ai_morning_jobs").select("status,last_error").eq("user_id",actor.userId).eq("lead_id",leadId).eq("session_id",sessionId).eq("batch_day",morningDay()).limit(1));
    return json({draft,preparation:jobs?.[0] || null});
  }
  if (action === "sales_playbook") return json(await salesBook(actor.db));
  if (action === "sales_stage") {
    const lead = await leadFor(actor,req.nextUrl.searchParams.get("leadId") || "");
    const session = req.nextUrl.searchParams.get("sessionId") || "";
    await ownDevice(actor,session);
    return json({state:await salesState(actor,lead.id,session)});
  }
  if (action === "history") {
    const leadId = req.nextUrl.searchParams.get("leadId") || "";
    await leadFor(actor, leadId, false);
    return json({ entries: checked(await actor.db.from("ai_follow_up_drafts").select("id,opened_at,user_id").eq("lead_id", leadId).eq("outcome", "opened").order("opened_at", { ascending: false }).limit(30)) });
  }
  throw new AiError("Tindakan tidak sah.");
}
async function handlePost(req: NextRequest) {
  if (req.headers.has("x-casepilot-ai-worker")) return runMorningWorker(req);
  const actor = await authenticate(req);
  if (Number(req.headers.get("content-length")) > 140000) throw new AiError("Permintaan terlalu besar.");
  const raw = await req.text();
  if (raw.length > 140000) throw new AiError("Permintaan terlalu besar.");
  let p;
  try { p = JSON.parse(raw); } catch { throw new AiError("Permintaan tidak sah."); }
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new AiError("Permintaan tidak sah.");
  if (p.action === "morning_preference") {
    if (typeof p.enabled!=="boolean" || typeof p.sessionId!=="string") throw new AiError("Tetapan draf pagi tidak sah.");
    if (p.sessionId) await ownDevice(actor,p.sessionId);
    checked(await actor.db.from("ai_morning_preferences").upsert({user_id:actor.userId,session_id:p.sessionId || null,enabled:p.enabled,updated_at:new Date().toISOString()}));
    return json(await viewSettings(actor));
  }
  if (p.action === "save_playbook") {
    if (!actor.admin) throw new AiError("Tetapan ini untuk Admin sahaja.",403);
    let book: SalesPlaybook;
    try { book = validateSalesPlaybook(p.playbook); } catch(e) { throw new AiError(e instanceof Error ? e.message : "Playbook tidak sah."); }
    const {error} = await actor.db.rpc("save_ai_sales_playbook",{p_actor:actor.userId,p_revision:book.revision,p_rules:book.rules,p_stages:book.stages,p_knowledge:book.knowledge});
    if (error) throw new AiError("Playbook berubah atau belum dapat disimpan. Input dikekalkan; muat versi terkini untuk semak konflik.",409);
    return json(await salesBook(actor.db));
  }
  if (raw.length > 20000) throw new AiError("Permintaan terlalu besar.");
  if (p.action === "correct_stage") {
    const lead = await leadFor(actor,p.leadId); await ownDevice(actor,p.sessionId);
    const book = await salesBook(actor.db), old = await salesState(actor,lead.id,p.sessionId);
    if (p.bookRevision !== book.revision || p.revision !== (old?.revision || 0)) throw new AiError("Fasa atau playbook berubah. Muat semula dahulu.",409);
    if (!book.stages.some(s=>s.id===p.stageId && s.active)) throw new AiError("Pilih fasa aktif yang sah.");
    const candidate = old && !["FOLLOW_UP","OBJECTION_HANDLING","WON","LOST"].includes(old.stageId) ? old.stageId : old?.previousStageId || "";
    const previous = ["FOLLOW_UP","OBJECTION_HANDLING"].includes(p.stageId) && book.stages.some(s=>s.id===candidate && s.active && !terminalStage(s.id) && s.id!=="FOLLOW_UP") ? candidate : "";
    let hash = old?.conversationHash || "";
    if (p.draftId !== undefined) {
      if (!uuid(p.draftId)) throw new AiError("Draf tidak sah.");
      const d = checked(await actor.db.from("ai_follow_up_drafts").select("conversation_hash,stage_revision,playbook_revision").eq("id",p.draftId).eq("user_id",actor.userId).eq("lead_id",lead.id).eq("session_id",p.sessionId).maybeSingle());
      if (!d || d.stage_revision !== p.revision || d.playbook_revision !== book.revision) throw new AiError("Draf berubah. Buka semula AI Follow Up.",409);
      hash = d.conversation_hash;
    }
    await saveStage(actor,lead.id,p.sessionId,book.revision,old,p.stageId,previous,true,hash);
    return json({state:await salesState(actor,lead.id,p.sessionId)});
  }
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
  if (p.action === "draft") return createDraft(actor,p);
  if (p.action === "handoff") {
    if (!uuid(p.id) || typeof p.text !== "string" || !p.text.trim() || p.text.length > 4000) throw new AiError("Draf tidak sah.");
    const d = checked(await actor.db.from("ai_follow_up_drafts").select("*").eq("id", p.id).eq("user_id", actor.userId).maybeSingle());
    if (!d || !["ready", "opened"].includes(d.outcome) || Date.parse(d.expires_at) <= Date.now()) throw new AiError("Draf tidak tersedia atau tamat. Jana semula.", 409);
    const lead = await leadFor(actor, d.lead_id);
    if ((lead.customer_phone || "") !== d.recipient_phone || (lead.whatsapp_username || "") !== d.recipient_username) throw new AiError("Penerima berubah. Jana semula.", 409);
    const config = await settings(actor.db);
    if (!config?.murpati_secret || config.revision !== d.revision) throw new AiError("Tetapan berubah. Jana semula.", 409);
    const book = await salesBook(actor.db), state = await salesState(actor,d.lead_id,d.session_id);
    if (book.revision !== d.playbook_revision || (state?.revision || 0) !== d.stage_revision || (state && terminalStage(state.stageId)) || (d.knowledge_expires_at && Date.parse(d.knowledge_expires_at)<=Date.now())) throw new AiError("Playbook, fasa atau knowledge berubah/tamat tempoh. Buat draf semula.",409);
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
