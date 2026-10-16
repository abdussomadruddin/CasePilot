"use client";

import { useEffect, useRef, useState, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { CarFront, FileCheck2, FileText, LoaderCircle, RotateCcw, Store, UserRound, Wallet, ClipboardList } from "lucide-react";
import { exampleVsoData } from "@/lib/honda-vso-example";
import { SavedPdfDownload } from "@/components/saved-pdf-download";
import { getValidAccessToken } from "@/lib/auth";
import { buildFileName, emptyVsoData, resolvePricing, type VsoData, type VsoField } from "@/lib/honda-vso.mjs";
import { vehicleCatalog } from "../../supabase/functions/_shared/vehicle-catalog";

const sections = [
  { title: "Customer", icon: UserRound, fields: [["bookingDate", "Tarikh", "date"], ["customerName", "Nama customer", "text"], ["nric", "NRIC / Passport", "text"], ["mobilePhone", "H/P", "tel"], ["homePhone", "Home", "tel"], ["officePhone", "Office", "tel"], ["address", "Alamat", "textarea"]] },
  { title: "Kenderaan", icon: CarFront, fields: [["model", "Model", "text"], ["variant", "Variant", "text"], ["colour", "Warna", "text"], ["salesType", "Sales type", "select"], ["estimatedDelivery", "Estimated delivery", "text"], ["referenceDealer", "Reference dealer", "text"], ["chassisNo", "Chassis no.", "text"], ["engineNo", "Engine no.", "text"]] },
  { title: "Harga", icon: Wallet, fields: [["sellingPrice", "Selling price", "number"], ["discount", "Discount", "number"], ["numberPlate", "Number plate", "number"], ["roadTax", "Road tax", "number"], ["registrationFee", "Registration fee", "number"], ["ownershipFee", "Ownership fee", "number"], ["accessories", "Accessories", "number"], ["miscSales", "Misc sales", "number"], ["insurance", "Insurance", "number"], ["ncd", "NCD %", "number"], ["bookingFeePaid", "Booking fee paid", "number"], ["paymentRef", "Cheque / ref no.", "text"]] },
  { title: "Dealer", icon: Store, fields: [["salesAdvisorName", "Sales advisor", "text"], ["salesAdvisorNric", "SA NRIC", "text"], ["salesManagerName", "Sales manager", "text"], ["salesManagerNric", "Manager NRIC", "text"]] },
] as const;
const money = (value: number | null) => value === null ? "-" : `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PdfPreview({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    async function render() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url });
        cleanup = () => { void task.destroy(); };
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        if (disposed || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const viewport = page.getViewport({ scale: 1.8 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Preview unavailable");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      } catch { if (!disposed) setError("Preview tidak tersedia. PDF masih boleh dimuat turun."); }
    }
    void render();
    return () => { disposed = true; cleanup?.(); };
  }, [url]);
  return error ? <p role="alert" className="p-4 text-sm text-amber-300">{error}</p> : <canvas ref={canvasRef} aria-label="Preview PDF VSO halaman pertama" className="block h-auto w-full bg-white" />;
}

export function HondaVsoPanel({ data, onChange, onSample, onSave }: { data: VsoData; onSave: () => Promise<boolean>; onChange: (value: VsoData) => void; onSample: (value: VsoData) => void }) {
  const setData = (value: SetStateAction<VsoData>) => onChange(typeof value === "function" ? value(data) : value);
  const [totalOverride, setTotalOverride] = useState(Boolean(data.totalAmount));
  const [balanceOverride, setBalanceOverride] = useState(Boolean(data.totalOutstanding));
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const pending = useRef(false);
  const revision = useRef(data);
  revision.current = data;
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setResult(null); setError(""); }, [data]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  const pricing = resolvePricing(data);
  const models = vehicleCatalog.filter(item => item.brand === "Honda");
  const variants = models.find(item => item.model.toLowerCase() === data.model.toLowerCase())?.variants || [];
  function update(key: VsoField, value: string) {
    setData(current => ({ ...current, [key]: value }));
    setResult(null);
    setError("");
  }
  async function generate() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setResult(null);
    const snapshot = data;
    try {
      const token = await getValidAccessToken();
      const response = await fetch("/api/honda-vso", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "PDF gagal dijana."); }
      const blob = await response.blob();
      if (revision.current === snapshot) setResult({ url: URL.createObjectURL(blob), filename: `${buildFileName(snapshot)}.pdf` });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "PDF gagal dijana. Cuba semula."); }
    finally { setBusy(false); pending.current = false; }
  }
  return <section className="vso-panel pb-28">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-xl font-bold"><FileText className="h-5 w-5 text-red-400" />Honda VSO</h1><div className="flex items-center gap-2"><button type="button" className="secondary-button" disabled={busy} onClick={() => { if (!window.confirm("Ganti borang dengan contoh VSO?")) return; onSample(exampleVsoData()); setTotalOverride(true); setBalanceOverride(true); setResult(null); setError(""); }}><ClipboardList className="h-4 w-4" />Isi contoh</button><button type="button" className="icon-button" aria-label="Kosongkan borang VSO" title="Kosongkan" disabled={busy} onClick={() => { if (!window.confirm("Kosongkan borang VSO?")) return; setData(emptyVsoData()); setTotalOverride(false); setBalanceOverride(false); setResult(null); setError(""); }}><RotateCcw className="h-4 w-4" /></button></div></div>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <form className="min-w-0" onSubmit={event => { event.preventDefault(); void generate(); }}>
        <fieldset disabled={busy} className="min-w-0">
          {sections.map(({ title, icon: Icon, fields }) => <section key={title} className="mb-6 border-b border-zinc-800 pb-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200"><Icon className="h-4 w-4 text-zinc-400" />{title}</h2>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map(([name, label, type]) => <label key={name} className={`grid min-w-0 gap-1.5 text-xs text-zinc-400 ${type === "textarea" ? "sm:col-span-2" : ""}`}>
                <span>{label}</span>
                {type === "textarea" ? <textarea className="field min-w-0 w-full" rows={3} value={data[name]} onChange={event => update(name, event.target.value)} maxLength={1000} /> : type === "select" ? <select className="field min-w-0 w-full" value={data[name]} onChange={event => update(name, event.target.value)}><option value="">Pilih</option>{["NON-PANEL HIRE PURCHASE", "PANEL HIRE PURCHASE", "CASH"].map(value => <option key={value}>{value}</option>)}</select> : <input className="field min-w-0 w-full" type={type} value={data[name]} onChange={event => update(name, event.target.value)} required={name === "customerName" || name === "bookingDate"} min={type === "number" ? 0 : undefined} max={name === "ncd" ? 100 : type === "number" ? 99999999 : undefined} step={type === "number" ? "0.01" : undefined} inputMode={type === "number" ? "decimal" : undefined} maxLength={200} list={name === "model" ? "vso-models" : name === "variant" ? "vso-variants" : undefined} />}
              </label>)}
            </div>
            {title === "Harga" ? <div className="mt-4 grid gap-3">
              <div className="flex items-center justify-between gap-3 text-sm"><span>Subtotal</span><output>{money(pricing.subtotal)}</output></div>
              {([ ["totalAmount", "Jumlah harga", totalOverride, setTotalOverride, pricing.total], ["totalOutstanding", "Baki selepas booking fee", balanceOverride, setBalanceOverride, pricing.outstanding] ] as const).map(([key, label, override, setOverride, value]) => <div key={key} className="grid gap-2 border-t border-zinc-800 pt-3"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{label}</span><output className="font-bold">{money(value)}</output></div><label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={override} onChange={event => { setOverride(event.target.checked); update(key, event.target.checked ? String(value ?? 0) : ""); }} />Override manual</label>{override ? <input aria-label={`${label} override`} className="field w-full" type="number" min="0" step="0.01" value={data[key]} onChange={event => update(key, event.target.value)} /> : null}</div>)}
            </div> : null}
          </section>)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.clearCustomerSignature} onChange={event => { setData(current => ({ ...current, clearCustomerSignature: event.target.checked })); setResult(null); }} />Padam tandatangan customer lama</label>
        </fieldset>
        <datalist id="vso-models">{models.map(item => <option key={item.model} value={item.model} />)}</datalist>
        <datalist id="vso-variants">{variants.map(value => <option key={value} value={value} />)}</datalist>
      </form>
      <div ref={previewRef} className="min-w-0 scroll-mt-28 self-start lg:sticky lg:top-24"><h2 className="mb-3 text-sm font-semibold">Preview PDF</h2><div className="overflow-hidden rounded-md border border-zinc-700">{result ? <PdfPreview key={result.url} url={result.url} /> : <div className="grid min-h-60 place-items-center bg-zinc-900 text-zinc-500"><FileText className="h-10 w-10" aria-hidden="true" /></div>}</div></div>
    </div>
    {mounted ? createPortal(<div className="vso-action-dock fixed inset-x-0 bottom-0 z-40 border-t border-zinc-700 bg-zinc-950/95 px-3 pt-3 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl">{error ? <p role="alert" className="mb-2 text-sm text-red-300">{error}</p> : result ? <p role="status" className="mb-2 text-xs text-emerald-300">PDF siap</p> : null}<div className="flex gap-2"><button type="button" className="primary-button min-w-0 flex-1" disabled={busy} onClick={() => void generate()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} {busy ? "Menjana..." : "Jana PDF"}</button><button type="button" className="icon-button shrink-0" aria-label="Lihat preview PDF" title="Preview" disabled={!result || busy} onClick={() => previewRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}><FileText className="h-4 w-4" /></button><SavedPdfDownload result={result} disabled={busy} onSave={onSave} onError={setError} /></div></div>
    </div>, document.body) : null}
  </section>;
}
