"use client";
import { useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

export function SavedPdfDownload({ result, disabled, onSave, onError }: { result: { url: string; filename: string } | null; disabled: boolean; onSave: () => Promise<boolean>; onError: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  return <button type="button" className="secondary-button min-w-0 flex-1" disabled={!result || disabled || saving} onClick={async () => {
    if (!result || pending.current) return;
    pending.current = true; setSaving(true);
    const snapshot = result;
    try {
      if (!await onSave()) { onError("Gagal disimpan. Semak status Client dan cuba Download semula."); return; }
      const link = document.createElement("a");
      link.href = snapshot.url; link.download = snapshot.filename;
      document.body.appendChild(link); link.click(); link.remove();
      onError("");
    } catch { onError("Gagal disimpan. Input dikekalkan; cuba Download semula."); }
    finally { pending.current = false; setSaving(false); }
  }}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{saving ? "Menyimpan..." : "Download"}</button>;
}
