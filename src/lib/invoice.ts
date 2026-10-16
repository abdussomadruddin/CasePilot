export const invoiceFields = {
  customerName: "Nama customer", model: "Model", variant: "Variant", colour: "Warna", chassis: "Chassis no.", plate: "Plate no.", date: "Tarikh",
  netSellingPrice: "Net selling price", numberPlate: "Number plate", roadTax: "Road tax", registration: "Registration fees", ownership: "Ownership endorsement fee", insuranceLabel: "Label insurance / NCD", insurance: "Insurance", colourLabel: "Label caj warna", colourCharge: "Caj warna", rounding: "Rounding", otr: "On the road price", rebate: "Rebate", bookingFee: "Booking fee", loan: "Loan amount", payable: "Payable amount", refund: "Refund amount", preparedName: "Prepared by", preparedPhone: "Telefon penyedia",
} as const;
export type InvoiceData = Record<keyof typeof invoiceFields, string>;
export const moneyFields = ["netSellingPrice", "numberPlate", "roadTax", "registration", "ownership", "insurance", "colourCharge", "rounding", "otr", "rebate", "bookingFee", "loan", "payable", "refund"] as const;
export function emptyInvoice(): InvoiceData {
  return { ...Object.fromEntries(Object.keys(invoiceFields).map(key => [key, ""])), date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), insuranceLabel: "Insurance", colourLabel: "Colour surcharge" } as InvoiceData;
}
export function exampleInvoice(): InvoiceData {
  return { ...emptyInvoice(), customerName: "Mr Irfan Faris", model: "New Honda City Hatchback", variant: "1.5 Rs", colour: "Ignite Red Metallic", chassis: "PMHGN5880SD305909", date: "2026-10-13", netSellingPrice: "100560", numberPlate: "50", roadTax: "90", registration: "150", ownership: "50", insuranceLabel: "Insurance 38.33% NCD (W/Screen + S/Perils)", insurance: "2552.10", colourLabel: "Ignite Red Metallic", colourCharge: "400", rounding: "0", otr: "103852.10", rebate: "8000", loan: "91000", payable: "4852.10", preparedName: "Muiz Nazmi", preparedPhone: "014-2204366" };
}
export function invoiceFilename(data: InvoiceData) {
  return `INVOICE_${data.customerName.replace(/[^a-z0-9]+/gi, "_").slice(0, 100)}_${data.date.split("-").reverse().join("-")}.pdf`;
}
export async function buildInvoice(template: Uint8Array, data: InvoiceData) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.load(template);
  const page = doc.getPage(0);
  const normal = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  function draw(text: string, x: number, baseline: number, width: number, strong = false, right = false) {
    if (!text) return;
    const font = strong ? bold : normal;
    let size = 12;
    while (font.widthOfTextAtSize(text, size) > width && size > 8) size -= 0.25;
    if (font.widthOfTextAtSize(text, size) > width) throw new Error("Maklumat terlalu panjang untuk ruang PDF.");
    page.drawText(text, { x: right ? x + width - font.widthOfTextAtSize(text, size) : x, y: 792 - baseline, size, font });
  }
  draw(data.customerName, 90, 170.4, 340, true);
  draw([data.model, data.variant].filter(Boolean).join(" "), 90, 184.2, 340, true);
  draw(`Colour : ${data.colour}`, 90, 198, 340, true);
  draw(`Chasis No : ${data.chassis}`, 90, 211.8, 340, true);
  draw(`Plate No : ${data.plate}`, 90, 225.6, 340, true);
  draw(data.date.split("-").reverse().join("-"), 440, 239.4, 80, false, true);
  draw(`(+)${data.insuranceLabel}`, 91.08, 377.294, 365);
  draw(`(+)${data.colourLabel}`, 91.08, 389.654, 365);
  const baselines = [307.454, 321.614, 335.773, 349.934, 363.854, 377.294, 389.654, 417.014, 446.042, 473.654, 490.694, 504.254, 533.642, 578.773];
  moneyFields.forEach((key, i) => draw(data[key] ? Number(data[key]).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : key === "refund" ? "-" : "", 460, baselines[i], 85, key === "otr" || key === "payable", true));
  draw(data.preparedName ? `Prepared by ${data.preparedName}` : "", 90, 636.014, 400);
  draw(data.preparedPhone, 90, 649.814, 400);
  doc.setTitle("Invoice"); doc.setAuthor("CasePilot");
  return doc.save();
}
