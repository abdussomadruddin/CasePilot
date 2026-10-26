"use client";

import { useCallback, useEffect, useState } from "react";
import { aiRequest } from "@/lib/ai-follow-up-client";
import { defaultSalesPlaybook, validateSalesPlaybook, type SalesPlaybook, type SalesStage, type KnowledgeEntry } from "@/lib/ai-sales-playbook";

export function AiSalesPlaybookEditor({ section, onDirty }: { section: "playbook" | "knowledge"; onDirty: (dirty:boolean)=>void }) {
  const [book,setBook] = useState<SalesPlaybook | null>(null);
  const [saved,setSaved] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [remote,setRemote] = useState<SalesPlaybook | null>(null);
  const dirty = Boolean(book && JSON.stringify(book)!==saved);
  const load = useCallback(async()=>{
    setBusy(true);setError("");
    try { const b = await aiRequest<SalesPlaybook>("sales_playbook");setBook(b);setSaved(JSON.stringify(b));setRemote(null); }
    catch(e){setError(e instanceof Error?e.message:"Tidak dapat memuatkan tetapan.");}finally{setBusy(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{onDirty(dirty);return ()=>onDirty(false);},[dirty,onDirty]);
  useEffect(()=>{
    const prevent = (event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",prevent);return ()=>window.removeEventListener("beforeunload",prevent);
  },[dirty]);
  function change(next:SalesPlaybook){setBook(next);setError("");setMessage("");}
  async function save(){
    if(!book)return;
    setBusy(true);setError("");setMessage("");
    try {validateSalesPlaybook(book);const b = await aiRequest<SalesPlaybook>("save_playbook",{playbook:book});setBook(b);setSaved(JSON.stringify(b));setRemote(null);setMessage("Tetapan disimpan. Draf terdahulu perlu dibuat semula.");}
    catch(e){setError(e instanceof Error?e.message:"Gagal disimpan. Input dikekalkan.");}
    finally{setBusy(false);}
  }
  async function compare(){
    setBusy(true);
    try{setRemote(await aiRequest<SalesPlaybook>("sales_playbook"));}catch(e){setError(e instanceof Error?e.message:"Gagal membaca versi terkini.");}finally{setBusy(false);}
  }
  function stage(index:number,patch:Partial<SalesStage>){if(book)change({...book,stages:book.stages.map((s,i)=>i===index?{...s,...patch}:s)});}
  function knowledge(index:number,patch:Partial<KnowledgeEntry>){if(book)change({...book,knowledge:book.knowledge.map((k,i)=>i===index?{...k,...patch}:k)});}
  function move(index:number,direction:number){if(!book)return;const list=[...book.stages];[list[index],list[index+direction]]=[list[index+direction],list[index]];change({...book,stages:list});}
  return <section className="surface-card grid min-w-0 gap-5 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-semibold">{section==="playbook"?"AI Playbook":"Knowledge Base"}</h3><p className="text-sm text-zinc-400">Tetapan pusat untuk semua CS/Broker · {book?`Versi ${book.revision}`:"Memuatkan…"}</p></div><span className="text-xs text-zinc-400">{dirty?"Belum disimpan":""}</span></div>
    <p className="text-sm text-zinc-400">{section==="playbook"?"Flow closing menentukan pendekatan. Conversation WhatsApp terkini menentukan konteks pelanggan; nota Lead/Case tidak digunakan.":"Isi fakta yang telah diluluskan. Hanya entri aktif, relevan dan dalam tempoh sah digunakan. Tiada harga atau promosi contoh diaktifkan."}</p>
    {book?<fieldset disabled={busy} className="grid min-w-0 gap-4">
      {section==="playbook"?<>
        <label className="grid gap-2 text-sm">Peraturan umum<textarea className="field min-h-56 w-full" maxLength={8000} value={book.rules} onChange={e=>change({...book,rules:e.target.value})}/></label>
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Fasa closing ({book.stages.length}/20)</h4><button type="button" className="secondary-button" disabled={book.stages.length>=20} onClick={()=>change({...book,stages:[...book.stages,{id:`STAGE_${crypto.randomUUID()}`,name:"Fasa baharu",goal:"",instructions:"",transition:"",examples:"",prohibitions:"",active:true}]})}>Tambah fasa</button></div>
        {book.stages.map((s,i)=><details key={s.id} className="min-w-0 rounded-lg border border-zinc-700 p-3" open={book.stages.length===1?true:undefined}><summary className="cursor-pointer break-words font-medium">{i+1}. {s.name} {!s.active?"· Tidak aktif":""}</summary><div className="mt-4 grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.active} onChange={e=>stage(i,{active:e.target.checked})}/>Aktif</label><button type="button" className="secondary-button" disabled={i===0} aria-label={`Naik ${s.name}`} onClick={()=>move(i,-1)}>Naik</button><button type="button" className="secondary-button" disabled={i===book.stages.length-1} aria-label={`Turun ${s.name}`} onClick={()=>move(i,1)}>Turun</button><span className="break-all text-xs text-zinc-500">{s.id}</span></div>
          <label className="grid gap-1 text-sm">Nama fasa<input className="field w-full" value={s.name} maxLength={80} onChange={e=>stage(i,{name:e.target.value})}/></label>
          {([ ["goal","Tujuan",1000], ["instructions","Arahan",3000], ["transition","Syarat peralihan",1500], ["examples","Contoh ayat / gaya",2000], ["prohibitions","Larangan",1500] ] as const).map(([key,label,max])=><label key={key} className="grid gap-1 text-sm">{label}<textarea className="field min-h-24 w-full" maxLength={max} value={s[key]} onChange={e=>stage(i,{[key]:e.target.value})}/></label>)}
          {["WON","LOST"].includes(s.id)?<p className="text-xs text-amber-300">Fasa ini sentiasa menyekat draf jualan walaupun nama atau arahan diubah.</p>:null}
        </div></details>)}
        <button type="button" className="secondary-button justify-self-start" onClick={()=>{if(window.confirm("Pulihkan lapan fasa dan peraturan asal? Knowledge Base dikekalkan. Perubahan belum disimpan akan diganti.")){const defaults=defaultSalesPlaybook();change({...book,rules:defaults.rules,stages:defaults.stages});}}}>Pulihkan flow asal</button>
      </>:<>
        <p className="text-xs text-zinc-400">Model/varian: padanan frasa dalam conversation; asingkan beberapa pilihan dengan koma. Kosong bermaksud umum. Tarikh mengikut Malaysia, termasuk hari akhir. Maksimum 8 entri paling relevan digunakan bagi satu draf.</p>
        <button type="button" className="secondary-button justify-self-start" disabled={book.knowledge.length>=60} onClick={()=>change({...book,knowledge:[...book.knowledge,{id:crypto.randomUUID(),title:"",category:"FAQ",model:"",content:"",active:false,validFrom:"",validUntil:""}]})}>Tambah entri ({book.knowledge.length}/60)</button>
        {!book.knowledge.length?<p className="rounded-lg border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">Belum ada fakta perniagaan. Tambah entri, semak kandungan dan aktifkan sebelum Simpan.</p>:null}
        {book.knowledge.map((k,i)=><details className="min-w-0 rounded-lg border border-zinc-700 p-3" key={k.id} open><summary className="cursor-pointer break-words font-medium">{k.title||"Entri baharu"} · {k.active?"Aktif":"Tidak aktif"}</summary><div className="mt-4 grid min-w-0 gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={k.active} onChange={e=>knowledge(i,{active:e.target.checked})}/>Aktif — kandungan diluluskan</label>
          <label className="grid gap-1 text-sm">Tajuk<input className="field w-full" maxLength={120} value={k.title} onChange={e=>knowledge(i,{title:e.target.value})}/></label>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm">Kategori<input className="field w-full" maxLength={80} list="ai-kb-categories" value={k.category} onChange={e=>knowledge(i,{category:e.target.value})}/></label><label className="grid min-w-0 gap-1 text-sm">Model / varian (pilihan)<input className="field w-full" maxLength={160} value={k.model} onChange={e=>knowledge(i,{model:e.target.value})}/></label></div>
          <label className="grid gap-1 text-sm">Kandungan diluluskan<textarea className="field min-h-40 w-full" maxLength={4000} value={k.content} onChange={e=>knowledge(i,{content:e.target.value})}/></label>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm">Sah dari (pilihan)<input type="date" className="field min-w-0 w-full max-w-full" value={k.validFrom} onChange={e=>knowledge(i,{validFrom:e.target.value})}/></label><label className="grid min-w-0 gap-1 text-sm">Sah hingga (pilihan)<input type="date" className="field min-w-0 w-full max-w-full" value={k.validUntil} onChange={e=>knowledge(i,{validUntil:e.target.value})}/></label></div>
        </div></details>)}
        <datalist id="ai-kb-categories">{["Harga","Promosi","Spesifikasi","Pembiayaan","Proses","Dokumen","FAQ"].map(v=><option key={v} value={v}/>)}</datalist>
      </>}
      <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4"><button type="button" className="primary-button" disabled={!dirty} onClick={()=>void save()}>{busy?"Menyimpan…":"Simpan"}</button><button type="button" className="secondary-button" onClick={()=>{if(!dirty||window.confirm("Buang perubahan belum disimpan dan muat semula?"))void load();}}>Muat semula</button></div>
    </fieldset>:!busy?<button className="secondary-button" onClick={()=>void load()}>Cuba semula</button>:<p role="status">Memuatkan tetapan…</p>}
    {error?<div role="alert" className="grid gap-2 text-sm text-red-300"><p>{error}</p>{book?<button type="button" className="secondary-button" disabled={busy} onClick={()=>void compare()}>Semak versi server tanpa membuang input</button>:null}</div>:null}
    {remote?<div className="grid gap-3 rounded-lg border border-amber-800 p-3 text-sm"><p>Versi server: {remote.revision}. Input anda masih dikekalkan.</p><details><summary className="cursor-pointer">Lihat kandungan server</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify({rules:remote.rules,stages:remote.stages,knowledge:remote.knowledge},null,2)}</pre></details><button type="button" className="secondary-button" onClick={()=>{if(window.confirm("Ganti input anda dengan versi server?")){setBook(remote);setSaved(JSON.stringify(remote));setRemote(null);setError("");}}}>Guna versi server</button><button type="button" className="secondary-button" onClick={()=>{if(book&&window.confirm("Kekalkan semua input anda untuk menggantikan versi server selepas menekan Simpan?")){setBook({...book,revision:remote.revision});setRemote(null);setError("");}}}>Kekalkan input saya untuk simpan semula</button></div>:null}
    {message?<p role="status" className="text-sm text-emerald-300">{message}</p>:null}
  </section>;
}
