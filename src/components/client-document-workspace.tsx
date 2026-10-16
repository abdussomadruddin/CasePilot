"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CloudUpload, FilePlus2, LoaderCircle, Plus, RefreshCw, Search, UserRound } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { asInvoice, asReceipt, asVso, blankBundle, clientFields, documentWithShared, listClients, listPurchases, loadBundle, newDraft, normalizedClientPhone, purchaseFields, saveBundle, updateDocument, type ClientBundle, type ClientRow, type DocumentData, type DocumentKind, type PurchaseRow } from "@/lib/client-documents";
import type { Profile } from "@/lib/types";
import type { InvoiceData } from "@/lib/invoice";

const InvoicePanel = dynamic(() => import("@/components/invoice-panel").then(m => m.InvoicePanel));
const HondaVsoPanel = dynamic(() => import("@/components/honda-vso-panel").then(m => m.HondaVsoPanel));
const ReceiptPanel = dynamic(() => import("@/components/receipt-panel").then(m => m.ReceiptPanel));
type SaveState = "draft" | "saving" | "saved" | "error" | "conflict" | "sample";
export type InvoiceSeed = { id: string; data: InvoiceData; phone: string };

export function ClientDocumentWorkspace({ section, profile, invoiceSeed, onNavigate }: { section: string; profile: Profile; invoiceSeed: InvoiceSeed | null; onNavigate: (section: "clients" | DocumentKind) => void }) {
  const [bundle, setBundle] = useState<ClientBundle>(() => blankBundle(profile.id));
  const current = useRef(bundle);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [allReceipts, setAllReceipts] = useState<{ id: string; purchase_id: string; data: DocumentData }[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [status, setStatus] = useState<SaveState>("draft");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(false);
  const [search, setSearch] = useState("");
  const [ignoredMatch, setIgnoredMatch] = useState("");
  const revision = useRef(0), savedRevision = useRef(0), pending = useRef(false), sample = useRef(false);
  const retry = useRef<{ bundle: ClientBundle; token: string; revision: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const seenSeed = useRef("");
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const kind: DocumentKind | null = section === "invoice" || section === "honda_vso" || section === "receipt" ? section : null;
  const phone = normalizedClientPhone(bundle.client.data.phone || "");
  const matches = clients.filter(item => item.id !== bundle.client.id && item.owner_id === bundle.client.owner_id && phone && normalizedClientPhone(item.data.phone || "") === phone);
  const blockedByMatch = matches.length > 0 && ignoredMatch !== phone;
  const matchingRef = useRef(blockedByMatch);
  matchingRef.current = blockedByMatch;

  const replace = useCallback((value: ClientBundle) => { current.current = value; setBundle(value); }, []);
  function change(value: ClientBundle, isSample = false) {
    revision.current += 1;
    sample.current = isSample;
    replace(value);
    setStatus(isSample ? "sample" : "draft");
    setError("");
    if (timer.current) clearTimeout(timer.current);
  }
  const flush = useCallback(async () => {
    if (pending.current || sample.current || matchingRef.current || revision.current === savedRevision.current) return;
    const value = current.current;
    if (!(value.client.data.customerName || "").trim() && !(value.client.data.phone || "").trim()) return;
    pending.current = true;
    const attempt = retry.current || { bundle: value, token: crypto.randomUUID(), revision: revision.current };
    retry.current = attempt;
    setStatus("saving");
    setError("");
    try {
      const saved = await saveBundle(attempt.bundle, attempt.token);
      if (!alive.current) return;
      const latest = current.current;
      if (latest.client.id === saved.client.id && latest.purchase.id === saved.purchase.id) {
        replace({ client: { ...latest.client, version: saved.client.version, updated_at: saved.client.updated_at }, purchase: { ...latest.purchase, version: saved.purchase.version, updated_at: saved.purchase.updated_at }, documents: latest.documents.map(item => {
          const remote = saved.documents.find(d => d.id === item.id);
          return remote ? { ...item, version: remote.version, updated_at: remote.updated_at } : item;
        }) });
        savedRevision.current = attempt.revision;
        setStatus(revision.current === savedRevision.current ? "saved" : "draft");
      }
      retry.current = null;
      void refreshRef.current();
    } catch (caught) {
      if (!alive.current) return;
      const conflict = (caught as { code?: string }).code === "40001";
      setStatus(conflict ? "conflict" : "error");
      setError(conflict ? "Data dikemas kini di peranti lain. Input anda masih dikekalkan." : "Gagal disimpan. Input anda masih dikekalkan; cuba semula.");
    } finally { pending.current = false; }
  }, [replace]);
  flushRef.current = flush;

  const refresh = useCallback(async () => {
    const rows = await listClients();
    if (!alive.current) return;
    setClients(rows); setAvailable(true);
    if (current.current.client.version) {
      const purchaseRows = await listPurchases(current.current.client.id);
      if (!alive.current || current.current.client.id !== rows.find(row => row.id === current.current.client.id)?.id) return;
      setPurchases(purchaseRows);
      const receiptRows: { id: string; purchase_id: string; data: DocumentData }[] = [];
      for (const item of purchaseRows) {
        const { data, error } = await getSupabaseClient().from("client_document_drafts").select("id,purchase_id,data").eq("purchase_id", item.id).eq("kind", "receipt");
        if (error) throw error;
        receiptRows.push(...(data || []));
      }
      if (alive.current && current.current.client.id === rows.find(row => row.id === current.current.client.id)?.id) setAllReceipts(receiptRows);
    }
    const local = current.current;
    if (!local.client.version) return;
    const client = rows.find(row => row.id === local.client.id);
    if (!client) { setError("Client ini tidak lagi boleh diakses."); setAvailable(false); return; }
    const sets = await listPurchases(client.id);
    if (!alive.current || current.current.client.id !== client.id) return;
    setPurchases(sets);
    const purchase = sets.find(row => row.id === current.current.purchase.id);
    if (!purchase || pending.current || revision.current !== savedRevision.current) return;
    const remote = await loadBundle(client, purchase);
    if (!alive.current || pending.current || revision.current !== savedRevision.current || current.current.purchase.id !== purchase.id) return;
    const versionsDiffer = current.current.client.version !== client.version || current.current.purchase.version !== purchase.version || remote.documents.some(d => current.current.documents.find(x => x.id === d.id)?.version !== d.version);
    if (versionsDiffer) replace(remote);
  }, [replace]);
  refreshRef.current = refresh;
  useEffect(() => {
    alive.current = true;
    const sync = () => { void refresh().catch(() => { if (alive.current) { setError("Senarai Client belum dapat dimuatkan. Cuba refresh."); setAvailable(false); } }); };
    sync();
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 200); };
    const db = getSupabaseClient();
    const channel = db.channel(`client-documents:${profile.id}`);
    for (const table of ["document_clients", "client_purchases", "client_document_drafts"]) channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    channel.subscribe();
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    return () => { alive.current = false; clearTimeout(syncTimer); if (timer.current) clearTimeout(timer.current); void db.removeChannel(channel); window.removeEventListener("online", sync); window.removeEventListener("focus", sync); };
  }, [profile.id, refresh]);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (available && status === "draft" && !blockedByMatch) timer.current = setTimeout(() => void flushRef.current(), 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [bundle, available, blockedByMatch, status, flush]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (revision.current !== savedRevision.current && !sample.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function mayReplace() {
    if (loading) return false;
    if (pending.current) return false;
    return revision.current === savedRevision.current || window.confirm("Masih ada perubahan belum disimpan. Ganti draft semasa?");
  }
  function selectBundle(value: ClientBundle) {
    retry.current = null; revision.current = 0; savedRevision.current = 0; sample.current = false;
    replace(value); setActiveDraftId(""); setIgnoredMatch(""); setStatus(value.client.version ? "saved" : "draft"); setError("");
  }
  async function selectClient(client: ClientRow) {
    if (!mayReplace()) return;
    setLoading(true);
    try {
      const sets = await listPurchases(client.id);
      const next = sets[0] ? await loadBundle(client, sets[0]) : { ...blankBundle(profile.id), client };
      if (!sets[0]) next.purchase.client_id = client.id;
      selectBundle(next); setPurchases(sets);
    } catch { setError("Client gagal dibuka. Draft semasa dikekalkan."); }
    finally { setLoading(false); }
  }
  async function selectPurchase(purchase: PurchaseRow) {
    if (!mayReplace()) return;
    setLoading(true);
    try { selectBundle(await loadBundle(current.current.client, purchase)); }
    catch { setError("Set pembelian gagal dibuka."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!kind) return;
    const local = current.current;
    const selected = local.documents.find(d => d.kind === kind && d.id === activeDraftId) || local.documents.find(d => d.kind === kind);
    if (selected) { if (activeDraftId !== selected.id) setActiveDraftId(selected.id); return; }
    const draft = newDraft(kind, local.purchase.id, profile.fullName, profile.phone || "");
    replace({ ...local, documents: [...local.documents, draft] });
    if (local.client.version && !sample.current) { revision.current += 1; setStatus("draft"); }
    setActiveDraftId(draft.id);
  }, [kind, activeDraftId, bundle.purchase.id, bundle.documents, profile.fullName, profile.phone, replace]);
  useEffect(() => {
    if (!invoiceSeed || seenSeed.current === invoiceSeed.id) return;
    seenSeed.current = invoiceSeed.id;
    if (pending.current || (revision.current !== savedRevision.current && !window.confirm("Ganti draft belum disimpan dengan maklumat case?"))) return;
    const next = blankBundle(profile.id);
    const phone = normalizedClientPhone(invoiceSeed.phone);
    const matchedClient = phone ? clients.find(client => normalizedClientPhone(client.data.phone || "") === phone) : undefined;
    if (matchedClient) {
      void (async () => {
        try {
          const sets = await listPurchases(matchedClient.id);
          const target = sets[0] ? await loadBundle(matchedClient, sets[0]) : { ...blankBundle(profile.id), client: matchedClient };
          if (!sets[0]) target.purchase.client_id = matchedClient.id;
          const purchase = { ...target.purchase, data: { ...target.purchase.data, model: invoiceSeed.data.model, variant: invoiceSeed.data.variant, colour: invoiceSeed.data.colour } };
          const draft = target.documents.find(item => item.kind === "invoice") || newDraft("invoice", purchase.id, profile.fullName, profile.phone || "");
          const docs = target.documents.some(item => item.id === draft.id) ? target.documents : [...target.documents, draft];
          const seeded = updateDocument({ ...target, purchase, documents: docs }, draft, { ...draft.data, ...invoiceSeed.data });
          if (!alive.current) return;
          replace(seeded); setActiveDraftId(draft.id); setPurchases(sets); setStatus("draft"); setError("");
        } catch { setError("Maklumat case dimuatkan sebagai draft baharu kerana client sepadan gagal dibuka."); }
      })();
      return;
    }
    next.client.data.phone = invoiceSeed.phone;
    next.client.data.customerName = invoiceSeed.data.customerName;
    next.purchase.data.model = invoiceSeed.data.model;
    next.purchase.data.variant = invoiceSeed.data.variant;
    next.purchase.data.colour = invoiceSeed.data.colour;
    const draft = newDraft("invoice", next.purchase.id, profile.fullName, profile.phone || "");
    next.documents = [draft];
    const seeded = updateDocument(next, draft, invoiceSeed.data);
    retry.current = null; revision.current += 1; sample.current = false;
    replace(seeded); setActiveDraftId(draft.id); setPurchases([]); setIgnoredMatch(""); setStatus("draft"); setError("");
  }, [clients, invoiceSeed, profile.id, profile.fullName, profile.phone, replace]);

  const draft = bundle.documents.find(d => d.kind === kind && d.id === activeDraftId) || bundle.documents.find(d => d.kind === kind);
  const draftData = draft?.data, draftKind = draft?.kind;
  const clientData = bundle.client.data, purchaseData = bundle.purchase.data;
  const data = useMemo(() => draftData && draftKind ? documentWithShared(draftKind, draftData, clientData, purchaseData) : null, [draftData, draftKind, clientData, purchaseData]);
  function editDocument(value: DocumentData) { if (draft) change(updateDocument(current.current, draft, value)); }
  function useSample(value: DocumentData) {
    if (!kind) return;
    const next = blankBundle(profile.id);
    const sampleDraft = { ...newDraft(kind, next.purchase.id, profile.fullName, profile.phone || ""), data: value };
    next.documents = [sampleDraft];
    retry.current = null;
    change(updateDocument(next, sampleDraft, value), true);
    setActiveDraftId(sampleDraft.id); setPurchases([]);
  }
  const visible = section === "clients" || Boolean(kind);
  const filteredClients = clients.filter(c => `${c.data.customerName || ""} ${c.data.phone || ""} ${c.data.email || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <section hidden={!visible} className="min-w-0" onBlurCapture={event => { const next = event.relatedTarget as Node | null; if (next && event.currentTarget.contains(next)) return; if (available && status !== "error" && status !== "conflict") { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void flushRef.current(), 0); } }}>
    <fieldset disabled={loading} className="min-w-0">
    <div className="mb-4 border-b border-zinc-800 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <UserRound className="h-4 w-4 text-zinc-400" />
        <select aria-label="Pilih client" className="field min-w-0 flex-1" value={bundle.client.version ? bundle.client.id : ""} disabled={loading || status === "saving"} onChange={e => { const client = clients.find(c => c.id === e.target.value); if (client) void selectClient(client); }}><option value="">Client baharu</option>{clients.map(c => <option value={c.id} key={c.id}>{c.data.customerName || c.data.phone || "Client"}</option>)}</select>
        <button className="icon-button" title="Client baharu" aria-label="Client baharu" disabled={loading || status === "saving"} onClick={() => { if (mayReplace()) { selectBundle(blankBundle(profile.id)); setPurchases([]); } }}><Plus className="h-4 w-4" /></button>
        <button className="icon-button" title="Refresh Client" aria-label="Refresh Client" onClick={() => void refresh().catch(() => setError("Senarai Client gagal dimuatkan."))}><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 flex items-center gap-2"><select aria-label="Pilih set pembelian" className="field min-w-0 flex-1" disabled={loading || status === "saving"} value={bundle.purchase.version ? bundle.purchase.id : ""} onChange={e => { const p = purchases.find(x => x.id === e.target.value); if (p) void selectPurchase(p); }}><option value="">Set pembelian baharu</option>{purchases.map(p => <option key={p.id} value={p.id}>{p.data.label || [p.data.model, p.data.variant, p.data.plate].filter(Boolean).join(" ") || "Set pembelian"}</option>)}</select><button className="icon-button" title="Set pembelian baharu" aria-label="Set pembelian baharu" disabled={status === "saving"} onClick={() => { if (!mayReplace()) return; const next = blankBundle(profile.id); next.client = bundle.client; next.purchase.client_id = bundle.client.id; selectBundle(next); }}><FilePlus2 className="h-4 w-4" /></button></div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400"><span role="status" className="flex items-center gap-1">{status === "saving" ? <LoaderCircle className="h-3 w-3 animate-spin" /> : status === "saved" ? <Check className="h-3 w-3 text-emerald-400" /> : <CloudUpload className="h-3 w-3" />}{status === "saving" ? "Saving..." : status === "saved" ? "Saved" : status === "sample" ? "Contoh belum disimpan" : status === "error" || status === "conflict" ? "Gagal disimpan" : "Draft"}</span>{status === "sample" ? <button className="text-emerald-300 underline" onClick={() => { sample.current = false; setStatus("draft"); }}>Simpan contoh sebagai client</button> : null}{status === "error" ? <button className="underline" onClick={() => void flush()}>Cuba semula</button> : null}{status === "conflict" ? <button className="underline" onClick={async () => { if (!window.confirm("Buang input belum disimpan dan muatkan versi server?")) return; try { const rows = await listClients(); const c = rows.find(x => x.id === bundle.client.id); if (!c) throw new Error(); const sets = await listPurchases(c.id); const p = sets.find(x => x.id === bundle.purchase.id); if (!p) throw new Error(); selectBundle(await loadBundle(c, p)); setClients(rows); setPurchases(sets); } catch { setError("Versi server gagal dimuatkan. Input dikekalkan."); } }}>Muatkan versi server</button> : null}</div>
      {error ? <p role="alert" className="mt-2 text-sm text-amber-300">{error}</p> : null}
      {blockedByMatch ? <div className="mt-3 flex flex-wrap items-center gap-2 border-l-2 border-amber-400 pl-3 text-sm"><span>Telefon sepadan: {matches[0].data.customerName || matches[0].data.phone}</span><button className="secondary-button" onClick={() => void selectClient(matches[0])}>Guna client ini</button><button className="secondary-button" onClick={() => setIgnoredMatch(phone)}>Simpan berasingan</button></div> : null}
    </div>
    {kind === "receipt" ? <div className="mb-4 flex gap-2"><select className="field min-w-0 flex-1" aria-label="Pilih receipt" value={draft?.id || ""} onChange={e => { const selected = allReceipts.find(d => d.id === e.target.value); if (selected && mayReplace()) { const purchase = purchases.find(p => p.id === selected.purchase_id); if (purchase) void selectPurchase(purchase); } }}>{allReceipts.filter(d => purchases.some(p => p.id === d.purchase_id)).map((d, i) => <option key={d.id} value={d.id}>{String(d.data.receiptNo || `Receipt ${i + 1}`)}{d.purchase_id !== bundle.purchase.id ? ` · ${purchases.find(p => p.id === d.purchase_id)?.data.label || "Pembelian lain"}` : ""}</option>)}{bundle.documents.filter(d => d.kind === "receipt" && !allReceipts.some(x => x.id === d.id)).map((d, i) => <option key={d.id} value={d.id}>{String(d.data.receiptNo || `Receipt ${i + 1}`)}</option>)}</select><button className="secondary-button" disabled={status === "saving"} onClick={() => { if (!mayReplace()) return; const d = newDraft("receipt", bundle.purchase.id, profile.fullName, profile.phone || ""); change({ ...bundle, documents: [...bundle.documents, d] }); setActiveDraftId(d.id); }}><Plus className="h-4 w-4" />Receipt</button></div> : null}
    {section === "clients" ? <div className="pb-24"><h1 className="mb-4 text-xl font-bold">Client</h1><div className="grid gap-6 lg:grid-cols-2"><div><fieldset disabled={loading} className="grid min-w-0 gap-3 sm:grid-cols-2">{Object.entries(clientFields).map(([key, label]) => <label key={key} className="grid min-w-0 gap-1.5 text-xs text-zinc-400"><span>{label}</span>{key === "address" ? <textarea className="field w-full" maxLength={1000} value={bundle.client.data[key] || ""} onChange={e => change({ ...bundle, client: { ...bundle.client, data: { ...bundle.client.data, [key]: e.target.value } } })} /> : <input className="field min-w-0 w-full" type={key === "phone" ? "tel" : key === "email" ? "email" : "text"} maxLength={200} value={bundle.client.data[key] || ""} onChange={e => change({ ...bundle, client: { ...bundle.client, data: { ...bundle.client.data, [key]: e.target.value } } })} />}</label>)}</fieldset><h2 className="mb-3 mt-6 text-sm font-semibold">Pembelian / Kenderaan</h2><div className="grid min-w-0 gap-3 sm:grid-cols-2">{Object.entries(purchaseFields).map(([key, label]) => <label key={key} className="grid min-w-0 gap-1.5 text-xs text-zinc-400"><span>{label}</span><input className="field min-w-0 w-full" maxLength={200} value={bundle.purchase.data[key] || ""} onChange={e => change({ ...bundle, purchase: { ...bundle.purchase, data: { ...bundle.purchase.data, [key]: e.target.value } } })} /></label>)}</div><div className="mt-4 flex flex-wrap gap-2">{([ ["invoice", "Invoice"], ["honda_vso", "Honda VSO"], ["receipt", "Receipt"] ] as const).map(([id, label]) => <button className="secondary-button" key={id} onClick={() => onNavigate(id)}><FilePlus2 className="h-4 w-4" />{label}</button>)}</div></div><div><label className="mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-zinc-400" /><input aria-label="Cari client" className="field min-w-0 w-full" placeholder="Cari client" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="divide-y divide-zinc-800">{filteredClients.map(c => <button key={c.id} className="flex w-full flex-col gap-1 py-3 text-left" onClick={() => void selectClient(c)}><strong className="text-sm">{c.data.customerName || "Client"}</strong><span className="text-xs text-zinc-400">{[c.data.phone, c.data.email].filter(Boolean).join(" · ")}</span></button>)}{!filteredClients.length ? <p className="py-6 text-sm text-zinc-500">Tiada client.</p> : null}</div></div></div></div> : null}
    {kind === "invoice" && data && draft ? <InvoicePanel key={draft.id} data={asInvoice(data)} onChange={editDocument} onSample={useSample} /> : null}
    {kind === "honda_vso" && data && draft ? <HondaVsoPanel key={draft.id} data={asVso(data)} onChange={editDocument} onSample={useSample} /> : null}
    {kind === "receipt" && data && draft ? <ReceiptPanel key={draft.id} data={asReceipt(data)} onChange={editDocument} onSample={useSample} /> : null}
    </fieldset>
  </section>;
}
