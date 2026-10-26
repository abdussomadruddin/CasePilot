"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Copy, LoaderCircle, MessageCircle, RefreshCw, Save, Sparkles, X } from "lucide-react";
import { aiRequest } from "@/lib/ai-follow-up-client";
import type { AiDevice, AiDraft, AiSettings } from "@/lib/ai-follow-up";
import type { LeadRecord, Profile } from "@/lib/types";

export function openAiSettings() { window.dispatchEvent(new Event("casepilot:ai-settings")); }
function Dialog({ title, busy = false, onClose, children }: { title: string; busy?: boolean; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex='0']") || []).filter((n) => n.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (!nodes.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", key, true);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, [busy]);
  return createPortal(<div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"><div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="surface-card mx-auto w-full max-w-xl min-w-0 outline-none"><div className="flex items-center justify-between border-b border-zinc-800 p-4"><h2 className="text-lg font-semibold">{title}</h2><button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Tutup"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-4">{children}</div></div></div>, document.body);
}
function errorText(e: unknown) { return e instanceof Error ? e.message : "Permintaan gagal. Cuba semula."; }

export function AiFollowUpSettings({ profile, onClose, provider, embedded = false }: { profile: Profile; onClose: () => void; provider?: "murpati" | "openai"; embedded?: boolean }) {
  const admin = profile.role === "admin";
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [murpatiKey, setMurpatiKey] = useState("");
  const [dailyLimit, setDailyLimit] = useState(50);
  const [devices, setDevices] = useState<AiDevice[]>([]);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const s = await aiRequest<AiSettings>("settings"); setSettings(s); setDailyLimit(s.dailyLimit); }
    catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(action: string, payload: Record<string, unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await aiRequest<AiSettings>(action, payload);
      setSettings(result); setDailyLimit(result.dailyLimit); setMessage(success);
      if (action === "save_settings") { setOpenaiKey(""); setMurpatiKey(""); setDevices([]); }
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function checkDevices() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { const result = await aiRequest<{ devices: AiDevice[] }>("devices", {}); setDevices(result.devices); setMessage(`${result.devices.length} device biasa ditemui.`); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const content = <>
    <p className="text-sm text-zinc-400">Murpati membaca conversation. AI CasePilot menyediakan draf. Penghantaran dibuat sendiri dalam WhatsApp.</p>
    {loading ? <p role="status">Memuatkan tetapan…</p> : settings ? <>
      <div className="rounded-md border border-zinc-700 p-3 text-sm"><p>AI: {settings.configured ? "Key tersimpan" : "Belum disediakan"}</p><p>Murpati: {settings.murpatiConfigured ? "Key tersimpan" : "Belum disambungkan"}</p></div>
      {admin ? <>
        {!settings.encryptionReady ? <p role="alert" className="text-sm text-amber-300">Penyulitan server belum disediakan. Simpan key tersedia selepas konfigurasi keselamatan dipasang.</p> : null}
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void run("save_settings", { revision: settings.revision, openaiKey, murpatiKey, dailyLimit }, "Tetapan disimpan. Key lama telah diganti jika key baharu diisi."); }}>
          {provider !== "murpati" ? <label className="grid gap-2 text-sm">API key OpenAI<input type="password" autoComplete="new-password" spellCheck={false} className="field w-full min-w-0" maxLength={2048} value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value.trim())} placeholder={settings.configured ? "Isi hanya untuk menggantikan key" : "Masukkan key Admin"} disabled={busy} /></label> : null}
          {provider !== "openai" ? <label className="grid gap-2 text-sm">API key / connector MCP Murpati<input type="password" autoComplete="new-password" spellCheck={false} className="field w-full min-w-0" maxLength={2048} value={murpatiKey} onChange={(e) => setMurpatiKey(e.target.value.trim())} placeholder={settings.murpatiConfigured ? "Isi hanya untuk menggantikan key" : "Masukkan connector link MCP atau API key Murpati"} disabled={busy} /></label> : null}
          <p className="text-xs text-zinc-400">Medan kosong mengekalkan key lama. Mengganti key Murpati memerlukan penetapan device semula. OpenAI adalah pilihan: GPT-6 Luna menggunakan key Admin. AI Murpati manual menggunakan kredit di Inbox Murpati.</p>
          {provider !== "murpati" ? <label className="grid gap-2 text-sm">Had penjanaan seorang sehari<input className="field w-full" type="number" min={1} max={500} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} disabled={busy} /></label> : null}
          <button className="primary-button" disabled={busy || !settings.encryptionReady}><Save className="h-4 w-4" />{busy ? "Menyimpan…" : "Simpan tetapan"}</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {provider !== "murpati" && settings.configured ? <button className="secondary-button" disabled={busy} onClick={() => void run("save_settings", { revision: settings.revision, clearAi: true, dailyLimit }, "Key AI dipadam.")}>Padam key AI</button> : null}
          {provider !== "openai" && settings.murpatiConfigured ? <button className="secondary-button" disabled={busy} onClick={() => void run("save_settings", { revision: settings.revision, clearMurpati: true, dailyLimit }, "Sambungan Murpati dipadam daripada CasePilot.")}>Putus sambungan Murpati</button> : null}
        </div>
        {provider !== "openai" ? <div className="grid gap-3 border-t border-zinc-800 pt-4"><h3 className="font-semibold">Device dan pemilik</h3><p className="text-xs text-zinc-400">Tetapkan setiap nombor kepada pemiliknya. CS/Broker hanya dapat menggunakan device sendiri. CasePilot tidak mencipta atau memutuskan device dalam Murpati.</p>
          <button className="secondary-button" disabled={busy || !settings.murpatiConfigured} onClick={() => void checkDevices()}><RefreshCw className="h-4 w-4" />Semak device Murpati</button>
          {devices.map((device) => <div key={device.sessionId} className="grid gap-2 rounded-md border border-zinc-700 p-3"><p className="break-words text-sm">{device.name} · {device.phone} · {device.status}</p><label className="sr-only" htmlFor={`owner-${device.sessionId}`}>Pemilik {device.phone}</label><select id={`owner-${device.sessionId}`} className="field w-full min-w-0" disabled={busy} value={owners[device.sessionId] ?? settings.devices.find((d) => d.sessionId === device.sessionId)?.userId ?? ""} onChange={(e) => setOwners((v) => ({ ...v, [device.sessionId]: e.target.value }))}><option value="">Pilih pemilik</option>{settings.members?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="secondary-button" disabled={busy || !(owners[device.sessionId] ?? settings.devices.find((d) => d.sessionId === device.sessionId)?.userId)} onClick={() => void run("assign", { sessionId: device.sessionId, userId: owners[device.sessionId] ?? settings.devices.find((d) => d.sessionId === device.sessionId)?.userId }, "Pemilik device disimpan.")}>Tetapkan pemilik</button></div>)}
        </div> : null}
      </> : <p className="text-sm text-zinc-400">Admin mengurus sambungan dan penetapan nombor. Pilih device anda ketika menjana AI Follow Up.</p>}
      {provider !== "openai" ? <div className="grid gap-2"><h3 className="font-semibold">Device ditetapkan</h3>{settings.devices.length ? settings.devices.map((d) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-zinc-900 p-3 text-sm" key={d.sessionId}><span className="min-w-0 break-words">{d.name} · {d.phone}{admin ? ` · ${settings.members?.find((m) => m.id === d.userId)?.name || "Pemilik"}` : ""}</span>{admin ? <button className="secondary-button" disabled={busy} onClick={() => void run("unassign", { sessionId: d.sessionId }, "Penetapan ditarik balik.")}>Tarik balik</button> : null}</div>) : <p className="text-sm text-zinc-400">Tiada device ditetapkan.</p>}</div> : null}
    </> : null}
    {error ? <div role="alert" className="grid gap-2 text-sm text-red-300"><p>{error}</p><button className="secondary-button" disabled={busy} onClick={() => void load()}>Muat semula tetapan</button></div> : null}
    {message ? <p role="status" className="text-sm text-emerald-300">{message}</p> : null}
  </>;
  return embedded ? <section className="surface-card grid gap-4 p-4">{content}</section> : <Dialog title="AI Follow Up" busy={busy} onClose={onClose}>{content}</Dialog>;
}

export function AiFollowUpButton({ lead, profile, onRefresh }: { lead: LeadRecord; profile: Profile; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  if (!["admin", "customer_service", "broker"].includes(profile.role) || lead.status === "rejected") return null;
  return <><button type="button" className="secondary-button" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4" />AI Follow Up</button>{open ? <DraftDialog lead={lead} onRefresh={onRefresh} onClose={() => setOpen(false)} /> : null}</>;
}
function DraftDialog({ lead, onRefresh, onClose }: { lead: LeadRecord; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [device, setDevice] = useState("");
  const [provider, setProvider] = useState<"openai" | "murpati_manual">("openai");
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const automaticAttempt = useRef("");
  const initialLead = useRef(`${lead.id}|${lead.updatedAt}|${lead.receiptId}`);
  const clickLock = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const s = await aiRequest<AiSettings>("settings"); setSettings(s); setProvider(s.configured ? "openai" : "murpati_manual"); setDevice(s.devices.length === 1 ? s.devices[0].sessionId : ""); }
    catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const stale = initialLead.current !== `${lead.id}|${lead.updatedAt}|${lead.receiptId}`;
  const generate = useCallback(async () => {
    if (clickLock.current || stale) return;
    clickLock.current = true; setBusy(true); setError(""); setDraft(null); setText(""); setCopied(false);
    try { const d = await aiRequest<AiDraft>("draft", { leadId: lead.id, sessionId: device, provider }); setDraft(d); setText(d.text); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); clickLock.current = false; }
  }, [device, lead.id, provider, stale]);
  useEffect(() => {
    if (loading || !settings?.murpatiConfigured || !device || stale || (provider === "openai" && !settings.configured)) return;
    const attempt = `${lead.id}|${device}|${provider}`;
    if (automaticAttempt.current === attempt) return;
    automaticAttempt.current = attempt;
    void generate();
  }, [loading, settings, device, stale, provider, lead.id, generate]);
  async function handoff() {
    if (!draft || clickLock.current || stale) return;
    if (!lead.customerPhone && !copied) { setError("Copy ayat dahulu untuk ditampal dalam chat username WhatsApp."); return; }
    clickLock.current = true; setBusy(true); setError("");
    try {
      const result = await aiRequest<{ url: string }>("handoff", { id: draft.id, text });
      // Refresh is best effort after the atomic write; it must never block navigation or cause a second count.
      void onRefresh().catch(() => {});
      window.location.assign(result.url);
    } catch (e) { setError(errorText(e)); }
    finally { clickLock.current = false; setBusy(false); }
  }
  return <Dialog title="AI Follow Up" busy={busy} onClose={onClose}>
    <p className="break-words font-medium">{draft?.customerName || lead.customerName || "Lead"} · {draft?.recipient || lead.customerPhone || `@${lead.whatsappUsername}`}</p>
    {loading ? <p role="status">Memuatkan device…</p> : settings ? <>
      <div className="grid gap-2 text-sm"><label htmlFor="ai-follow-up-provider">Penyedia AI</label><select id="ai-follow-up-provider" className="field w-full min-w-0" disabled={busy} value={provider} onChange={(e) => { setProvider(e.target.value as "openai" | "murpati_manual"); setDraft(null); setText(""); setCopied(false); setError(""); automaticAttempt.current = ""; }}><option value="murpati_manual">AI Murpati — kredit sedia ada (manual)</option><option value="openai">OpenAI — API key Admin</option></select></div>
      {provider === "murpati_manual" ? <p className="text-sm text-zinc-400">Jana ayat dalam Inbox Murpati menggunakan kredit akaun anda, kemudian Copy dan tampal di sini. CasePilot tidak menjana ayat melalui API Murpati.</p> : null}
      {(provider === "openai" && !settings.configured) || !settings.murpatiConfigured || !settings.devices.length ? <><p className="text-sm text-amber-300">{(provider === "openai" && !settings.configured) || !settings.murpatiConfigured ? "AI Follow Up belum disediakan." : "Tiada device ditetapkan kepada anda."} Hubungi Admin atau buka tetapan.</p><button className="secondary-button" onClick={() => { onClose(); openAiSettings(); }}>Buka tetapan AI Follow Up</button></> : <>
        <div className="grid gap-2 text-sm"><label htmlFor="ai-follow-up-device">Nombor WhatsApp anda</label><select id="ai-follow-up-device" className="field w-full min-w-0" value={device} disabled={busy} onChange={(e) => { setDevice(e.target.value); setDraft(null); setText(""); setCopied(false); setError(""); automaticAttempt.current = ""; }}><option value="">Pilih nombor WhatsApp anda</option>{settings.devices.map((d) => <option key={d.sessionId} value={d.sessionId}>{d.name} · {d.phone}</option>)}</select></div>
        {busy ? <p role="status" className="flex items-center gap-2 text-sm text-zinc-300"><LoaderCircle className="h-4 w-4 animate-spin" />{provider === "openai" ? "Membaca conversation dan menyediakan draf…" : "Menyemak conversation…"}</p> : draft || error ? <button className="secondary-button" disabled={stale || !device} onClick={() => void generate()}><RefreshCw className="h-4 w-4" />{error && !draft ? "Cuba semula" : provider === "openai" ? "Buat draf baharu" : "Semak semula konteks"}</button> : null}
      </>}
    </> : <button className="secondary-button" onClick={() => void load()}>Cuba semula</button>}
    {stale ? <p role="alert" className="text-sm text-amber-300">Maklumat Lead berubah. Tutup dan buka semula AI Follow Up.</p> : null}
    {draft ? <>
      {draft.provider === "murpati_manual" && !draft.blocked ? <div className="grid gap-3 rounded-md border border-zinc-700 p-3 text-sm"><p>1. Buka Inbox Murpati dan pilih nombor penghantar <strong>{draft.device.phone}</strong>.</p><p>2. Cari penerima <strong>{draft.recipient}</strong>, semak conversation dan gunakan butang AI untuk menulis follow-up. Setiap penjanaan menggunakan kredit Murpati.</p><p>3. Copy ayat, kembali ke CasePilot dan tampal dalam medan di bawah. Jangan hantar atau simpan jadual penghantaran di Murpati.</p><a className="secondary-button" href="https://murpati.com/inbox" target="_blank" rel="noopener noreferrer">Buka Inbox Murpati</a><button className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(draft.recipient); setError(""); } catch { setError("Salin nombor penerima secara manual."); } }}>Copy penerima untuk carian</button><p className="text-xs text-zinc-400">Jika tiada conversation, semak nombor, device dan sync Murpati. Nota Lead tidak digunakan untuk draf.</p></div> : null}
      <p className="text-xs text-zinc-400">{draft.source === "conversation" ? `Berdasarkan conversation · ${draft.lastMessageAt ? new Date(draft.lastMessageAt).toLocaleString("en-MY") : ""}` : "Conversation tidak dapat disahkan"}</p>
      {draft.blocked ? <p role="alert" className="text-sm text-amber-300">{draft.reason}</p> : <>
        <div className="grid gap-2 text-sm"><label htmlFor="ai-follow-up-text">{draft.provider === "murpati_manual" ? "Tampal ayat AI Murpati" : "Draf follow-up"}</label><textarea id="ai-follow-up-text" className="field min-h-48 w-full" placeholder={draft.provider === "murpati_manual" ? "Tampal ayat yang dijana dalam Murpati…" : undefined} maxLength={4000} value={text} disabled={busy || stale} onChange={(e) => { setText(e.target.value); setCopied(false); }} /></div>
        <p className="text-xs text-zinc-400">Semak fakta sebelum menghantar. Pastikan WhatsApp yang dibuka menggunakan nombor {draft.device.phone}. CasePilot merekod pembukaan WhatsApp sahaja.</p>
        {!lead.customerPhone ? <div className="grid gap-2 text-xs text-amber-300"><p>Untuk username, Copy ayat dahulu dan tampal selepas chat dibuka.</p><label className="flex items-center gap-2"><input type="checkbox" checked={copied} onChange={(e) => setCopied(e.target.checked)} disabled={busy} />Saya sudah salin ayat (Copy atau salinan manual)</label></div> : null}
        <div className="flex flex-wrap gap-2"><button className="secondary-button" disabled={busy || stale || !text.trim()} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setError(""); } catch { setError("Copy gagal. Pilih dan salin teks secara manual."); } }}><Copy className="h-4 w-4" />{copied ? "Disalin" : "Copy"}</button><button className="primary-button" disabled={busy || stale || !text.trim()} onClick={() => void handoff()}><MessageCircle className="h-4 w-4" />{busy ? "Memproses…" : "Buka WhatsApp"}</button></div>
      </>}
    </> : null}
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
  </Dialog>;
}
export function AiFollowUpHistory({ leadId }: { leadId: string }) {
  const [entries, setEntries] = useState<{ id: string; opened_at: string }[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    aiRequest<{ entries: { id: string; opened_at: string }[] }>("history", undefined, abort.signal, { leadId })
      .then((r) => setEntries(r.entries)).catch((e) => { if (!abort.signal.aborted) setError(errorText(e)); });
    return () => abort.abort();
  }, [leadId, retry]);
  if (error) return <button className="secondary-button text-sm" onClick={() => { setError(""); setRetry((n) => n + 1); }}>Cuba semula History AI</button>;
  return entries.length ? <div className="grid gap-2 border-t border-zinc-800 pt-3 text-sm"><p className="font-semibold">History AI Follow Up</p>{entries.map((e) => <p key={e.id} className="rounded-md bg-zinc-900 p-2"><span className="text-xs text-zinc-500">{new Date(e.opened_at).toLocaleString("en-MY")}</span><br />AI Follow Up — WhatsApp dibuka</p>)}</div> : null;
}
