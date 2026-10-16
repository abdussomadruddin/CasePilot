"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Download, FileCheck2, FileText, LoaderCircle } from "lucide-react";
import { getValidAccessToken } from "@/lib/auth";
import { exampleReceipt, receiptFields, receiptFilename, receiptMoneyFields, receiptTotal, ringgitWords, type ReceiptData } from "@/lib/receipt";
import { PdfPreview } from "@/components/honda-vso-panel";

export function ReceiptPanel({ data, onChange, onSample }: { data: ReceiptData; onChange: (value: ReceiptData) => void; onSample: (value: ReceiptData) => void }) {
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const pending = useRef(false);
  const revision = useRef(data);
  revision.current = data;
  useEffect(() => setMounted(true), []);
  useEffect(() => { setResult(null); setError(""); }, [data]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  async function generate() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setResult(null);
    const snapshot = data;
    try {
      const token = await getValidAccessToken();
      const response = await fetch("/api/receipt", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(snapshot) });
      if (!response.ok) throw new Error((await response.json()).error || "PDF gagal dijana.");
      const blob = await response.blob();
      if (revision.current === snapshot) setResult({ url: URL.createObjectURL(blob), filename: receiptFilename(snapshot) });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "PDF gagal dijana. Cuba semula."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="vso-panel pb-28">
    <div className="mb-4 flex items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-xl font-bold"><FileText className="h-5 w-5" />Receipt</h1><button className="secondary-button" disabled={busy} onClick={() => { if (window.confirm("Ganti borang dengan contoh receipt?")) onSample(exampleReceipt()); }}><ClipboardList className="h-4 w-4" />Isi contoh</button></div>
    <div className="grid min-w-0 gap-6 lg:grid-cols-2"><form onSubmit={event => { event.preventDefault(); void generate(); }}><fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{Object.entries(receiptFields).map(([key, label]) => {
      const name = key as keyof ReceiptData;
      const numeric = (receiptMoneyFields as readonly string[]).includes(name);
      const multiline = name === "address" || name === "companyAddress";
      return <label key={name} className={`grid min-w-0 gap-1.5 text-xs text-zinc-400 ${multiline ? "sm:col-span-2" : ""}`}><span>{label}</span>{multiline ? <textarea className="field min-w-0 w-full" rows={3} value={data[name]} maxLength={1000} onChange={event => onChange({ ...data, [name]: event.target.value })} /> : <input className="field min-w-0 w-full" type={name === "date" ? "date" : numeric ? "number" : "text"} min={numeric ? 0 : undefined} max={numeric ? 99999999 : undefined} step={numeric ? "0.01" : undefined} inputMode={numeric ? "decimal" : undefined} required={name === "customerName" || name === "date" || name === "receiptNo"} maxLength={200} value={data[name]} onChange={event => onChange({ ...data, [name]: event.target.value })} />}</label>;
    })}<div className="border-t border-zinc-800 pt-3 sm:col-span-2"><output className="block text-lg font-semibold">RM {receiptTotal(data).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</output><output className="mt-1 block text-xs text-zinc-400">{data.wordsOverride || ringgitWords(receiptTotal(data))}</output></div></fieldset></form><div className="min-w-0"><h2 className="mb-3 text-sm font-semibold">Preview PDF</h2><div className="overflow-hidden rounded-md border border-zinc-700">{result ? <PdfPreview key={result.url} url={result.url} /> : <div className="grid min-h-60 place-items-center bg-zinc-900 text-zinc-500"><FileText className="h-10 w-10" /></div>}</div></div></div>
    {mounted ? createPortal(<div className="vso-action-dock fixed inset-x-0 bottom-0 z-40 border-t border-zinc-700 bg-zinc-950/95 px-3 pt-3 backdrop-blur-sm"><div className="mx-auto max-w-3xl">{error ? <p role="alert" className="mb-2 text-sm text-red-300">{error}</p> : result ? <p role="status" className="mb-2 text-xs text-emerald-300">PDF siap</p> : null}<div className="flex gap-2"><button className="primary-button flex-1" disabled={busy} onClick={() => void generate()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}{busy ? "Menjana..." : "Jana PDF"}</button><a className={`secondary-button flex-1 ${!result || busy ? "pointer-events-none opacity-40" : ""}`} href={result?.url} download={result?.filename} aria-disabled={!result || busy} tabIndex={result && !busy ? 0 : -1}><Download className="h-4 w-4" />Download</a></div></div></div>, document.body) : null}
  </section>;
}
