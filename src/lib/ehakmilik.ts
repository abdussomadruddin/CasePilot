export const ehakmilikFields = { date: "Tarikh", customerName: "Nama pelanggan", nric: "No. kad pengenalan / Passport", model: "Model kenderaan", variant: "Varian", colour: "Warna kenderaan", chassisNo: "No. casis", engineNo: "No. enjin", bankName: "Nama bank", bankerName: "Nama banker", salesAdvisorName: "Nama penasihat jualan" } as const;
export type EhakmilikData = Record<keyof typeof ehakmilikFields, string>;
export function emptyEhakmilik(): EhakmilikData {
  return { ...Object.fromEntries(Object.keys(ehakmilikFields).map(key => [key, ""])), date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) } as EhakmilikData;
}
export function exampleEhakmilik(): EhakmilikData {
  return { ...emptyEhakmilik(), date: "2026-10-12", customerName: "IRFAN FARIS", nric: "010812101659", model: "Honda City Hatchback", variant: "RS", colour: "Ignite Red Metallic", chassisNo: "PMHGN5880SD305909", engineNo: "L15ZE7005901", bankName: "Hong Leong Bank", bankerName: "HONG LEONG", salesAdvisorName: "MUIZ NAZMI" };
}
export function ehakmilikFilename(data: EhakmilikData) { return `e-hakmilik_${data.customerName.replace(/[^a-z0-9]+/gi, "_").slice(0, 80)}_${data.date}.pdf`; }
export async function buildEhakmilik(template: Uint8Array, data: EhakmilikData) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(template);
  const page = doc.getPage(0), font = await doc.embedFont(StandardFonts.Helvetica);
  const date = new Date(`${data.date}T00:00:00Z`);
  const formatted = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const rows: [string, number, number, number][] = [[formatted, 136.06, 211.4, 395], [data.customerName, 270.43, 279.4, 260], [data.nric, 270.43, 307.75, 260], [[data.model, data.variant].filter(Boolean).join(" "), 270.43, 370.1, 260], [data.colour, 270.43, 398.45, 260], [data.chassisNo, 270.43, 426.8, 260], [data.engineNo, 270.43, 455.15, 260], [data.bankName, 270.43, 517.5, 260], [data.bankerName, 270.43, 545.85, 260], [data.salesAdvisorName, 270.43, 608.2, 260]];
  for (const [text, x, baseline, width] of rows) {
    if (!text) continue;
    let size = 9;
    while (font.widthOfTextAtSize(text, size) > width && size > 6) size -= .25;
    if (font.widthOfTextAtSize(text, size) > width) throw new Error("Maklumat terlalu panjang untuk ruang e-hakmilik.");
    page.drawText(text, { x, y: page.getHeight() - baseline, size, font, color: rgb(.06, .1, .18) });
  }
  doc.setTitle("Borang Hak Milik Kenderaan"); doc.setAuthor("CasePilot");
  return doc.save();
}
