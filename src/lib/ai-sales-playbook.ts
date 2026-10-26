export type SalesStage = { id: string; name: string; goal: string; instructions: string; transition: string; examples: string; prohibitions: string; active: boolean };
export type KnowledgeEntry = { id: string; title: string; category: string; model: string; content: string; active: boolean; validFrom: string; validUntil: string };
export type SalesPlaybook = { revision: number; rules: string; stages: SalesStage[]; knowledge: KnowledgeEntry[]; updatedAt?: string; updatedBy?: string | null };
export type SalesState = { stageId: string; previousStageId: string; revision: number; corrected: boolean; conversationHash: string };
export const defaultSalesRules = `Gunakan Bahasa Melayu Malaysia semula jadi, ringkas dan sopan; campur English apabila sesuai dengan conversation. Panggil pelanggan “cik” secara default. Jangan mendesak.
Tanya satu soalan pada satu masa. Jawab soalan terus pelanggan sebelum qualification. Jangan tanya maklumat yang sudah dijawab dalam conversation. Kumpul hanya maklumat yang relevan; elakkan data sensitif yang tidak diperlukan.
Tentukan langkah seterusnya daripada pertukaran terakhir. Jangan mula INTRO semula apabila pelanggan membalas. Kekalkan konteks semasa bertukar fasa.
Jangan mereka harga, diskaun, stok, spesifikasi, angka pembiayaan, promosi atau tarikh akhir. Gunakan fakta perniagaan yang diluluskan dan masih sah sahaja. Bezakan anggaran daripada angka disahkan. Jangan janji kelulusan loan atau hasil terjamin.
Bantahan: akui kebimbangan, fahami puncanya, jelaskan secara relevan dan kembali ke fasa sebelumnya apabila selesai. Jangan terus tawarkan diskaun atau berdebat.
Closing mengikut kesediaan pelanggan. Booking, permohonan, quotation akhir dan semakan dokumen memerlukan pengesahan manusia. Hormati permintaan masa dan jangan hubungi. Jangan buat dakwaan berdasarkan gambar, PDF atau voice note yang belum dibaca.`;
function stage(id: string, goal: string, instructions: string, transition: string, examples: string): SalesStage {
  return { id, name: id.replaceAll("_", " "), goal, instructions, transition, examples, prohibitions: "Jangan mereka fakta, mendesak atau mengulang soalan yang sudah dijawab.", active: true };
}
export function defaultSalesPlaybook(): SalesPlaybook {
  return { revision: 1, rules: defaultSalesRules, knowledge: [], stages: [
    stage("INTRO", "Akui enquiry dan fahami minat awal.", "Kenal pasti produk daripada conversation. Jawab soalan pelanggan dahulu. Elakkan presentation penuh terlalu awal.", "Ke FACT_FINDING selepas minat awal difahami; jangan ulang INTRO bagi conversation sedia ada.", "Cik berminat varian yang mana ya?"),
    stage("FACT_FINDING", "Fahami keperluan secara berperingkat.", "Tanya maklumat relevan seperti model, varian, tujuan, bajet, kerja, lokasi, trade-in, deposit, timeline dan kesediaan dokumen. Tidak perlu lengkap semua medan. Pendapatan hanya jika benar-benar perlu.", "Ke PRESENTATION apabila maklumat cukup untuk cadangan relevan.", "Cik lebih selesa bayaran bulanan sekitar berapa?"),
    stage("PRESENTATION", "Cadangkan pilihan yang relevan.", "Keperluan pelanggan → cadangan → manfaat relevan → fakta disahkan → langkah seterusnya. Gunakan Knowledge Base aktif sahaja untuk fakta produk.", "Ke OBJECTION_HANDLING apabila ada bantahan; CLOSING apabila pelanggan bersedia.", "Pilih manfaat yang berkait dengan keperluan pelanggan; jangan hantar senarai panjang."),
    stage("OBJECTION_HANDLING", "Selesaikan kebimbangan sebenar.", "Akui, fahami bantahan, tanya penjelasan jika perlu, beri jawapan relevan dan semak sama ada selesai. Harga, ansuran, deposit, loan, kepercayaan, pesaing, masa, keluarga dan kesesuaian ialah kemungkinan bantahan.", "Kembali ke fasa sebelumnya selepas bantahan selesai. Hormati pelanggan yang perlukan masa.", "Faham cik. Yang cik risau lebih kepada deposit atau komitmen bulanan?"),
    stage("CLOSING", "Bantu pelanggan mengambil langkah yang mereka bersedia.", "Minat rendah: fahami keperluan. Sederhana: banding pilihan dan selesaikan kebimbangan. Tinggi: bantu quotation atau terangkan proses. Booking, permohonan dan angka akhir perlu pengesahan salesperson.", "Ke WON hanya apabila pembelian jelas disahkan. Ke LOST apabila pelanggan jelas menolak. Jika belum selesai, follow-up pada langkah terakhir.", "Jika pelanggan sudah setuju semakan loan, terangkan dokumen diluluskan yang diperlukan."),
    stage("FOLLOW_UP", "Sambung langkah terakhir tanpa mengulang mesej generik.", "FOLLOW_UP ialah tindakan pada fasa sebelumnya. Kekalkan konteks bantahan, quotation atau dokumen yang belum selesai. Rujuk mesej terakhir dan follow-up terdahulu; jangan tanya semula minat umum.", "Apabila pelanggan membalas, sambung fasa jualan yang relevan. Tiada jadual atau penghantaran automatik.", "Cik, dah sempat sediakan payslip 3 bulan terkini untuk semakan yang kita bincang hari tu?"),
    stage("WON", "Pembelian sudah disahkan.", "Hentikan follow-up jualan. Serahkan urusan selepas jualan kepada salesperson.", "Hanya pengguna berakses boleh membetulkan fasa jika tersalah.", ""),
    stage("LOST", "Pelanggan jelas tidak meneruskan.", "Hentikan follow-up jualan. Jangan cuba memaksa pelanggan kembali.", "Hanya pengguna berakses boleh membetulkan fasa jika tersalah. Opt-out tetap mengatasi pembetulan.", ""),
  ] };
}
export function terminalStage(id: string) { return id === "WON" || id === "LOST"; }
export function validateSalesPlaybook(input: unknown): SalesPlaybook {
  const p = input as SalesPlaybook;
  const str = (v: unknown, max: number, required = false): v is string => typeof v === "string" && v.length <= max && (!required || Boolean(v.trim()));
  const id = (v: unknown) => str(v, 64, true) && /^[A-Z0-9_-]+$/i.test(v as string);
  const day = (v: unknown) => v === "" || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
  if (!p || !Number.isInteger(p.revision) || p.revision < 1 || !str(p.rules, 8000, true) || !Array.isArray(p.stages) || p.stages.length < 1 || p.stages.length > 20 || !Array.isArray(p.knowledge) || p.knowledge.length > 60) throw new Error("Playbook tidak sah. Had: 20 fasa dan 60 entri knowledge.");
  for (const s of p.stages) if (!s || !id(s.id) || !str(s.name,80,true) || !str(s.goal,1000,true) || !str(s.instructions,3000,true) || !str(s.transition,1500) || !str(s.examples,2000) || !str(s.prohibitions,1500) || typeof s.active !== "boolean") throw new Error("Lengkapkan nama, tujuan dan arahan setiap fasa.");
  if (new Set(p.stages.map(s=>s.id)).size !== p.stages.length || !p.stages.some(s=>s.active && !terminalStage(s.id))) throw new Error("ID fasa mesti unik dan sekurang-kurangnya satu fasa jualan perlu aktif.");
  for (const k of p.knowledge) if (!k || !id(k.id) || !str(k.title,120,true) || !str(k.category,80,true) || !str(k.model,160) || !str(k.content,4000,true) || typeof k.active !== "boolean" || !day(k.validFrom) || !day(k.validUntil) || (k.validFrom && k.validUntil && k.validFrom > k.validUntil)) throw new Error("Entri knowledge atau tempoh sah tidak lengkap/sah.");
  if (new Set(p.knowledge.map(k=>k.id)).size !== p.knowledge.length || JSON.stringify(p).length > 120000) throw new Error("Knowledge terlalu besar atau ID berulang.");
  return { revision:p.revision, rules:p.rules.trim(), stages:p.stages.map(s=>({...s})), knowledge:p.knowledge.map(k=>({...k})) };
}
export function knowledgeValid(k: KnowledgeEntry, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kuala_Lumpur", year:"numeric",month:"2-digit",day:"2-digit" }).format(now);
  return k.active && (!k.validFrom || k.validFrom <= today) && (!k.validUntil || k.validUntil >= today);
}
export function knowledgeExpiry(entries: KnowledgeEntry[]) {
  const times = entries.filter(k=>k.validUntil).map(k=>new Date(`${k.validUntil}T23:59:59.999+08:00`).getTime());
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}
export function selectKnowledge(entries: KnowledgeEntry[], conversation: string, now = new Date()) {
  const norm = (v:string) => v.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu," ").trim();
  const text = ` ${norm(conversation)} `;
  const words = new Set(norm(conversation).split(" ").filter(w=>w.length>2));
  return entries.filter(k=>knowledgeValid(k,now) && (!k.model.trim() || k.model.split(/[,;\n]/).some(model=>Boolean(norm(model)) && text.includes(` ${norm(model)} `))))
    .map((entry,index)=>({entry,index,score:norm(`${entry.title} ${entry.category} ${entry.model} ${entry.content.slice(0,1000)}`).split(" ").filter(w=>w.length>2 && words.has(w)).length + (entry.model.trim()?5:0)}))
    .sort((a,b)=>b.score-a.score || a.index-b.index).slice(0,8).map(r=>r.entry);
}
