"use client";

import { Check, Copy, KeyRound, Plus, RefreshCw, RotateCw, ShieldX, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  createLeadConnector,
  loadLeadConnectors,
  rotateLeadConnector,
  updateLeadConnector,
  type LeadConnector,
} from "@/lib/integration-store";
import { getSupabaseClient, getSupabaseUrl } from "@/lib/supabase";
import type { LeadRecord, Profile } from "@/lib/types";

const sourceLabels = { meta_ads: "Meta Ads", tiktok_ads: "TikTok Ads" } as const;
const endpoint = `${getSupabaseUrl()}/functions/v1/ingest-lead`;

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

export function IntegrationPanel({ teamMembers, leads }: { teamMembers: Profile[]; leads: LeadRecord[] }) {
  const owners = teamMembers.filter((member) => member.active && ["customer_service", "broker"].includes(member.role));
  const [connectors, setConnectors] = useState<LeadConnector[]>([]);
  const [source, setSource] = useState<LeadConnector["source"]>("meta_ads");
  const [label, setLabel] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [revealedKey, setRevealedKey] = useState<{ label: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function refresh() {
    try {
      setConnectors(await loadLeadConnectors());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load connectors.");
    }
  }

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase.channel("casepilot-lead-integrations")
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_connectors" }, () => { void refresh(); })
      .subscribe((status) => { if (status === "SUBSCRIBED") void refresh(); });
    void refresh();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  async function copy(value: string, name: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Clipboard unavailable. Select and copy the value manually.");
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerId || !label.trim()) return;
    setBusy(true);
    setError("");
    try {
      const key = await createLeadConnector({ source, label, ownerId });
      setRevealedKey({ label, value: key });
      setLabel("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create connector.");
    } finally {
      setBusy(false);
    }
  }

  async function changeOwner(connector: LeadConnector, nextOwnerId: string) {
    setBusy(true);
    try {
      await updateLeadConnector(connector.id, { ownerId: nextOwnerId });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to change owner.");
    } finally {
      setBusy(false);
    }
  }

  async function rotate(connector: LeadConnector) {
    if (!window.confirm(`Rotate key for ${connector.label}? The previous Pabbly key will stop working immediately.`)) return;
    setBusy(true);
    setError("");
    try {
      const key = await rotateLeadConnector(connector.id);
      setRevealedKey({ label: connector.label, value: key });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to rotate key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(connector: LeadConnector) {
    if (!window.confirm(`Revoke ${connector.label}? Pabbly requests using this key will be rejected.`)) return;
    setBusy(true);
    setError("");
    try {
      await updateLeadConnector(connector.id, { active: false });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to revoke connector.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-white">Integration</h2><p className="text-sm text-zinc-400">Pabbly Connect</p></div>
        <button type="button" className="icon-button" aria-label="Refresh connectors" title="Refresh connectors" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></button>
      </div>
      {error ? <p role="alert" className="rounded-md border border-red-800 bg-red-950/60 p-3 text-sm text-red-100">{error}</p> : null}

      <section className="grid gap-3 border-y border-zinc-800 py-4">
        <h3 className="text-sm font-semibold text-zinc-200">Lead endpoint</h3>
        <div className="flex min-w-0 gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 px-3 py-3 text-xs text-zinc-200">{endpoint}</code>
          <button type="button" className="icon-button shrink-0" aria-label="Copy endpoint" title="Copy endpoint" onClick={() => void copy(endpoint, "endpoint")}>{copied === "endpoint" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
        </div>
        <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="text-zinc-500">Method</span><br />POST</p>
          <p><span className="text-zinc-500">Payload</span><br />JSON</p>
          <p><span className="text-zinc-500">Authentication</span><br />No Auth</p>
          <p><span className="text-zinc-500">Header</span><br /><code>X-CasePilot-Key</code></p>
        </div>
        <details className="text-sm text-zinc-300"><summary className="cursor-pointer">Payload fields</summary><p className="mt-2 leading-6">Optional: <code>source_lead_id</code>, <code>name</code>, <code>phone</code>, <code>email</code>, <code>brand</code>, <code>model</code>, <code>note</code>, <code>campaign</code>, <code>created_at</code>. Labelled details in the note are detected automatically. Duplicate contacts posted within 10 minutes of the last accepted lead are ignored; a later POST starts a new 10-minute window.</p></details>
      </section>

      <form className="grid gap-3 border-b border-zinc-800 pb-5" onSubmit={create}>
        <h3 className="text-sm font-semibold text-zinc-200">New connector</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_auto] lg:items-end">
          <label className="grid gap-1 text-sm">Source<select className="field" value={source} onChange={(event) => setSource(event.target.value as LeadConnector["source"])}><option value="meta_ads">Meta Ads</option><option value="tiktok_ads">TikTok Ads</option></select></label>
          <label className="grid gap-1 text-sm">Workflow name<input className="field" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Campaign or Pabbly workflow" maxLength={80} required /></label>
          <label className="grid gap-1 text-sm">Assign to<select className="field" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required><option value="">Select CS or Broker</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName} · {owner.role === "broker" ? "Broker" : "Customer Service"}</option>)}</select></label>
          <button className="primary-button min-h-11" disabled={busy || !owners.length}><Plus className="h-4 w-4" /> Create</button>
        </div>
      </form>

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold text-zinc-200">Connectors ({connectors.length})</h3>
        {connectors.map((connector) => (
          <article key={connector.id} className="surface-card grid gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h4 className="font-semibold text-white">{connector.label}</h4><p className="text-sm text-zinc-400">{sourceLabels[connector.source]} · Key ending {connector.keyHint}</p></div>
              <span className={`rounded-md border px-2 py-1 text-xs ${connector.active ? "border-emerald-800 bg-emerald-950/50 text-emerald-200" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>{connector.active ? "Active" : "Revoked"}</span>
            </div>
            <div className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-3"><p>Created<br /><span className="text-zinc-200">{dateTime(connector.createdAt)}</span></p><p>Last used<br /><span className="text-zinc-200">{connector.lastUsedAt ? dateTime(connector.lastUsedAt) : "Not yet"}</span></p><p>Active leads<br /><span className="text-zinc-200">{leads.filter((lead) => lead.connectorId === connector.id).length}</span></p></div>
            <div className="flex flex-wrap items-end gap-2 border-t border-zinc-800 pt-3">
              <label className="grid min-w-0 flex-1 gap-1 text-xs text-zinc-400 sm:max-w-xs">Assigned to<select className="field" value={connector.ownerId} disabled={busy || !connector.active} onChange={(event) => void changeOwner(connector, event.target.value)}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName} · {owner.role === "broker" ? "Broker" : "Customer Service"}</option>)}</select></label>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void rotate(connector)}><RotateCw className="h-4 w-4" /> Rotate key</button>
              {connector.active ? <button type="button" className="secondary-button border-red-900 text-red-200" disabled={busy} onClick={() => void revoke(connector)}><ShieldX className="h-4 w-4" /> Revoke</button> : null}
            </div>
          </article>
        ))}
        {!connectors.length ? <p className="text-sm text-zinc-500">No connectors yet.</p> : null}
      </section>

      {revealedKey ? <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label="New connector key"><div className="surface-card w-full max-w-xl p-5"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5" /> {revealedKey.label}</h3><button type="button" className="icon-button" aria-label="Close key" onClick={() => setRevealedKey(null)}><X className="h-4 w-4" /></button></div><p className="mt-3 text-sm text-amber-200">This key is shown once. Add it to Pabbly as the <code>X-CasePilot-Key</code> header.</p><div className="mt-3 flex min-w-0 gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs">{revealedKey.value}</code><button type="button" className="icon-button shrink-0" aria-label="Copy connector key" onClick={() => void copy(revealedKey.value, "key")}>{copied === "key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div><button type="button" className="secondary-button mt-4" onClick={() => setRevealedKey(null)}>Done</button></div></div> : null}
    </section>
  );
}
