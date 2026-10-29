"use client";
import { useEffect, useState } from "react";
import { getValidAccessToken } from "@/lib/auth";
import { dealerFields, emptyDealer, type DealerProfile, type DealerKey } from "@/lib/vso-dealers";
import type { VsoData } from "@/lib/honda-vso.mjs";
export function VsoDealerPicker({ data, onChange, admin }: { data: VsoData; onChange: (data: VsoData) => void; admin: boolean }) {
  const [dealers, setDealers] = useState<DealerProfile[]>([]);
  const [editing, setEditing] = useState<DealerProfile | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [ready, setReady] = useState(false), [conflict, setConflict] = useState(false);
  async function request(body?: DealerProfile) {
    const token = await getValidAccessToken();
    const response = await fetch("/api/vso-dealers", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(result.error || "Permintaan gagal."); }
    return result;
  }
  async function load() {
    setBusy(true); setError("");
    try { setDealers((await request()).dealers); setReady(true); } catch (e) { setError(e instanceof Error ? e.message : "Senarai gagal dibaca."); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); /* Explicit profile refresh never changes the document. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function apply(profile: DealerProfile) {
    let baseline: Record<string, string> = {};
    try { baseline = JSON.parse(data.dealerSnapshot || "{}"); } catch { /* Legacy malformed snapshot is treated as edited. */ }
    const changed = Object.keys(dealerFields).some(k => (data[k as DealerKey] || "") !== (baseline[k] || ""));
    if (changed && !window.confirm("Gantikan butiran dealer yang telah disunting? Maklumat customer, kenderaan dan harga dikekalkan.")) return;
    onChange({ ...data, ...profile.data, dealerId: profile.id, dealerVersion: String(profile.version), dealerSnapshot: JSON.stringify(profile.data) });
  }
  async function save(profile: DealerProfile) {
    setBusy(true); setError("");
    try { const saved = (await request(profile)).dealer as DealerProfile; setDealers(old => [...old.filter(d => d.id !== saved.id), saved]); setEditing(null); setConflict(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Dealer gagal disimpan."); } finally { setBusy(false); }
  }
  const selected = dealers.find(d => d.id === data.dealerId);
  return <div className="mb-4 grid min-w-0 gap-3 rounded-md border border-zinc-700 p-3">
    <label className="grid gap-1 text-xs text-zinc-400">Pilih dealer<select className="field w-full min-w-0" disabled={busy || !ready} value={data.dealerId || ""} onChange={e => { const d = dealers.find(d => d.id === e.target.value); if (d) apply(d); }}><option value="" disabled={Boolean(data.dealerId)}>Butiran template / manual</option>{data.dealerId && !selected ? <option value={data.dealerId}>{data.dealerName || "Dealer tersimpan"} (tidak tersedia)</option> : null}{dealers.filter(d => d.active || d.id === data.dealerId).map(d => <option key={d.id} value={d.id}>{d.data.dealerName}{!d.active ? " (tidak aktif)" : ""}</option>)}</select></label>
    <div className="flex flex-wrap gap-2"><button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}>Segar semula senarai</button>{selected?.active ? <button type="button" className="secondary-button" disabled={busy} onClick={() => apply(selected)}>Muat semula maklumat dealer</button> : null}{admin ? <><button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditing({ id: crypto.randomUUID(), data: emptyDealer(), active: true, version: 0, updated_at: "" }); setConflict(false); }}>Tambah dealer</button>{selected ? <><button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditing({ ...selected, data: { ...selected.data } }); setConflict(false); }}>Edit</button><button type="button" className="secondary-button" disabled={busy || !selected.active} onClick={() => { if (window.confirm("Nyahaktifkan dealer untuk pilihan baharu? Draft lama dikekalkan.")) void save({ ...selected, active: false }); }}>Nyahaktifkan</button></> : null}</> : null}</div>
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
    {editing ? <div className="grid gap-3 border-t border-zinc-700 pt-3"><h3 className="font-semibold">{editing.version ? "Edit profil dealer" : "Tambah profil dealer"}</h3><div className="grid min-w-0 gap-3 sm:grid-cols-2">{(Object.entries(dealerFields) as [DealerKey, string][]).map(([key, label]) => <label key={key} className="grid min-w-0 gap-1 text-xs text-zinc-400">{label}{key === "dealerAddress" ? <textarea disabled={busy} className="field w-full" rows={3} maxLength={1000} value={editing.data[key]} onChange={e => setEditing({ ...editing, data: { ...editing.data, [key]: e.target.value } })} /> : <input disabled={busy} className="field min-w-0 w-full" maxLength={200} value={editing.data[key]} onChange={e => setEditing({ ...editing, data: { ...editing.data, [key]: e.target.value } })} />}</label>)}</div><div className="flex flex-wrap gap-2"><button type="button" className="primary-button" disabled={busy || conflict || !editing.data.dealerName.trim()} onClick={() => void save(editing)}>Simpan dealer</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(null)}>Batal</button>{conflict ? <button type="button" className="secondary-button" disabled={busy} onClick={async () => { if (!window.confirm("Buang suntingan profil ini dan muat semula rekod terkini?")) return; await load(); setEditing(null); setConflict(false); }}>Muat semula rekod</button> : null}</div><p className="text-xs text-zinc-400">Simpan profil tidak mengubah draft VSO. Pilih atau muat semula dealer untuk menggunakan maklumat terkini.</p></div> : null}
  </div>;
}
