export const receiptFields = {
  companyName: "Nama syarikat", companyAddress: "Alamat syarikat", customerName: "Nama customer", address: "Alamat customer", receiptNo: "Receipt no.", date: "Tarikh", accountNo: "Customer account no.", debtorCode: "Debtor code", dealNo: "Deal no.", description: "Description", reference: "Reference", cash: "Cash", cheque: "Cheque", card: "Credit card", qr: "QR Pay", transfer: "Account transfer", totalOverride: "Jumlah override", wordsOverride: "Ringgit Malaysia override", make: "Brand", model: "Model", variant: "Variant", chassisNo: "Chassis no.", colour: "Warna", engineNo: "Engine no.", transmission: "Transmission", preparedName: "Prepared by", preparedPhone: "Telefon penyedia", forCompany: "For company",
} as const;
export type ReceiptData = Record<keyof typeof receiptFields, string>;
export const receiptMoneyFields = ["cash", "cheque", "card", "qr", "transfer", "totalOverride"] as const;
export function emptyReceipt(): ReceiptData {
  return { ...Object.fromEntries(Object.keys(receiptFields).map(key => [key, ""])), companyName: "KM IPOH CAPITAL RESOURCES", companyAddress: "NO 86-2, JLN MERU BESTARI B7,\nBANDAR MERU RAYA, 30020 IPOH, PERAK", forCompany: "KM Ipoh (Perak)", date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) } as ReceiptData;
}
export function exampleReceipt(): ReceiptData {
  return { ...emptyReceipt(), customerName: "LOKMAN HAKIM BIN NORAZHAR", address: "PERSIARAN KUALA PARI HILIR, 31450\nMENGLEMBU, PERAK", receiptNo: "0009", date: "2026-09-18", accountNo: "KM214347", description: "Downpayment", reference: "Full Settlement", cash: "0", cheque: "0", card: "0", qr: "0", transfer: "2500", make: "Honda", model: "Honda City Hatchback", variant: "1.5 V", chassisNo: "PMHGN5860SD501888", colour: "IGNITE RED MERALLIC", engineNo: "L15ZE6901873", transmission: "Automatic", preparedName: "Muiz Nazmi", preparedPhone: "014-2204366" };
}
export function receiptTotal(data: ReceiptData) {
  if (data.totalOverride.trim()) return Number(data.totalOverride);
  return [data.cash, data.cheque, data.card, data.qr, data.transfer].reduce((sum, value) => sum + Math.round(Number(value || 0) * 100), 0) / 100;
}
const small = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
function integerWords(n: number): string {
  if (n < 20) return small[n];
  if (n < 100) return ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"][Math.floor(n / 10)] + (n % 10 ? ` ${small[n % 10]}` : "");
  for (const [unit, label] of [[1000000, "MILLION"], [1000, "THOUSAND"], [100, "HUNDRED"]] as const) if (n >= unit) return `${integerWords(Math.floor(n / unit))} ${label}${n % unit ? ` ${integerWords(n % unit)}` : ""}`;
  return "";
}
export function ringgitWords(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 99999999) return "";
  const cents = Math.round(value * 100);
  return `${integerWords(Math.floor(cents / 100))}${cents % 100 ? ` AND ${integerWords(cents % 100)} SEN` : ""} ONLY`;
}
export function receiptFilename(data: ReceiptData) {
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").slice(0, 80);
  return `RECEIPT_${safe(data.customerName)}_${safe(data.receiptNo)}_${data.date.split("-").reverse().join("-")}.pdf`;
}
export async function buildReceipt(template: Uint8Array, data: ReceiptData) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(template);
  const page = doc.getPage(0);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  function draw(text: string, x: number, baseline: number, width: number, strong = false, right = false, white = false, size = 8.5) {
    if (!text) return;
    const font = strong ? bold : normal;
    while (font.widthOfTextAtSize(text, size) > width && size > 6) size -= 0.25;
    if (font.widthOfTextAtSize(text, size) > width) throw new Error("Maklumat terlalu panjang untuk ruang receipt.");
    page.drawText(text, { x: right ? x + width - font.widthOfTextAtSize(text, size) : x, y: page.getHeight() - baseline, font, size, color: white ? rgb(1, 1, 1) : rgb(0, 0, 0) });
  }
  function lines(text: string, x: number, top: number, width: number, max: number, size = 8.5) {
    const result: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        if (current && normal.widthOfTextAtSize(`${current} ${word}`, size) > width) { result.push(current); current = word; }
        else current = current ? `${current} ${word}` : word;
      }
      result.push(current);
    }
    if (result.length > max) throw new Error("Alamat atau maklumat terlalu panjang untuk ruang receipt.");
    result.forEach((line, i) => draw(line, x, top + i * 13, width, false, false, false, size));
  }
  draw(data.companyName, 189.76, 25.5, 420, true);
  lines(data.companyAddress, 189.76, 38.5, 420, 3, 8);
  draw(data.customerName, 140, 128.5, 212);
  lines(data.address, 140, 142.5, 212, 4);
  [data.receiptNo, data.date.split("-").reverse().join("/"), data.accountNo, data.debtorCode, data.dealNo].forEach((value, i) => draw(value, 510, 128.5 + i * 16, 280));
  draw(data.description, 120, 220.5, 208);
  draw(data.reference, 120, 238.5, 208);
  const money = (value: number) => `RM${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  [data.cash, data.cheque, data.card, data.qr, data.transfer].forEach((value, i) => draw(money(Number(value || 0)), 416, 238.5 + i * 15, 120, false, true));
  draw(money(receiptTotal(data)), 484, 321, 300, true, false, true, 9.5);
  [[data.make, 48, 369.5], [data.chassisNo, 302, 369.5], [data.colour, 558, 369.5], [[data.model, data.variant].filter(Boolean).join(" "), 48, 407.5], [data.engineNo, 302, 407.5], [data.transmission, 558, 407.5]].forEach(([value, x, y]) => draw(String(value), Number(x), Number(y), 236, true));
  draw(`RINGGIT MALAYSIA: ${data.wordsOverride || ringgitWords(receiptTotal(data))}`, 40, 439.5, 762, true);
  draw(data.preparedName ? `Prepared by ${data.preparedName}` : "", 620, 521.5, 182, true);
  draw(data.preparedPhone, 620, 534.5, 182, false, false, false, 8);
  draw(data.forCompany ? `For ${data.forCompany}` : "", 620, 545.5, 182, true);
  doc.setTitle("Official Receipt"); doc.setAuthor("CasePilot");
  return doc.save();
}
