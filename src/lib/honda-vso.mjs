import { rgb } from "pdf-lib";
const FIELD_IDS = [
  "bookingDate",
  "customerName",
  "nric",
  "mobilePhone",
  "homePhone",
  "officePhone",
  "address",
  "model",
  "salesType",
  "variant",
  "colour",
  "estimatedDelivery",
  "referenceDealer",
  "chassisNo",
  "engineNo",
  "sellingPrice",
  "discount",
  "numberPlate",
  "roadTax",
  "registrationFee",
  "ownershipFee",
  "accessories",
  "miscSales",
  "insurance",
  "ncd",
  "totalAmount",
  "bookingFeePaid",
  "totalOutstanding",
  "paymentRef",
  "salesAdvisorName",
  "salesAdvisorNric",
  "salesManagerName",
  "salesManagerNric",
  "clearCustomerSignature",
];

const PRICE_COMPONENT_FIELDS = [
  "sellingPrice",
  "discount",
  "numberPlate",
  "roadTax",
  "registrationFee",
  "ownershipFee",
  "accessories",
  "miscSales",
  "insurance",
];

const priceRows = {
  sellingPrice: { y: 524.0 },
  discount: { y: 512.0 },
  subtotal: { y: 499.2 },
  numberPlate: { y: 487.7 },
  roadTax: { y: 475.2 },
  registrationFee: { y: 463.2 },
  ownershipFee: { y: 451.2 },
  accessories: { y: 439.2 },
  miscSales: { y: 427.1 },
  insurance: { y: 415.1 },
  totalAmount: { y: 390.4 },
  bookingFeePaid: { y: 377.3 },
  totalOutstanding: { y: 366.0 },
};

const fillLineSegments = [
  { x1: 493.75, x2: 575.75, y: 727.5, kind: "rectDash" },
  { x1: 493.75, x2: 575.75, y: 698.0, kind: "rectDash" },
  { x1: 493.7, x2: 575.7, y: 686.5, kind: "rectDash" },
  { x1: 493.7, x2: 575.7, y: 674.5, kind: "rectDash" },
  { x1: 119.75, x2: 417.75, y: 666.5, kind: "rectDash" },
  { x1: 118.75, x2: 417.75, y: 653.1, kind: "rectDash" },
  { x1: 118.0, x2: 417.0, y: 640.9, kind: "rectDash" },
  { x1: 118.75, x2: 417.75, y: 623.7, kind: "rectDash" },
  { x1: 118.8, x2: 417.0, y: 699.8, kind: "vectorDash" },
  { x1: 118.8, x2: 417.0, y: 684.2, kind: "vectorDash" },
  { x1: 118.9, x2: 337.9, y: 595.4, kind: "vectorDash" },
  { x1: 437.6, x2: 570.45, y: 595.4, kind: "vectorDash" },
  { x1: 118.65, x2: 307.3, y: 583.4, kind: "vectorDash" },
  { x1: 118.65, x2: 337.9, y: 572.0, kind: "vectorDash" },
  { x1: 437.85, x2: 577.2, y: 582.2, kind: "vectorDash" },
  { x1: 437.85, x2: 577.2, y: 570.2, kind: "vectorDash" },
  { x1: 118.65, x2: 337.9, y: 558.8, kind: "vectorDash" },
  { x1: 440.6, x2: 580.2, y: 556.8, kind: "vectorDash" },
  { x1: 79.9, x2: 150.95, y: 400.4, kind: "vectorDash" },
  { x1: 217.65, x2: 339.95, y: 521.0, kind: "vectorDash" },
  { x1: 219.7, x2: 337.9, y: 509.0, kind: "vectorDash" },
  { x1: 217.9, x2: 339.7, y: 496.2, kind: "vectorDash" },
  { x1: 219.6, x2: 338.0, y: 484.65, kind: "vectorDash" },
  { x1: 218.5, x2: 339.0, y: 472.2, kind: "vectorDash" },
  { x1: 219.45, x2: 338.15, y: 460.2, kind: "vectorDash" },
  { x1: 219.6, x2: 338.0, y: 448.2, kind: "vectorDash" },
  { x1: 219.1, x2: 338.5, y: 436.2, kind: "vectorDash" },
  { x1: 222.7, x2: 336.8, y: 424.05, kind: "vectorDash" },
  { x1: 219.1, x2: 338.5, y: 412.05, kind: "vectorDash" },
  { x1: 218.0, x2: 337.8, y: 387.35, kind: "solid" },
  { x1: 218.0, x2: 337.8, y: 386.15, kind: "solid" },
  { x1: 219.7, x2: 337.9, y: 374.25, kind: "vectorDash" },
  { x1: 218.15, x2: 340.4, y: 363.0, kind: "solid" },
  { x1: 218.15, x2: 340.4, y: 361.8, kind: "solid" },
  { x1: 83.0, x2: 192.0, y: 287.5, kind: "rectDash" },
  { x1: 340.0, x2: 449.0, y: 287.5, kind: "rectDash" },
  { x1: 278.75, x2: 385.75, y: 154.0, kind: "rectDash" },
  { x1: 467.75, x2: 574.75, y: 154.0, kind: "rectDash" },
  { x1: 279.0, x2: 386.0, y: 138.0, kind: "rectDash" },
  { x1: 468.8, x2: 575.8, y: 138.2, kind: "rectDash" },
  { x1: 32.0, x2: 191.0, y: 173.9, kind: "rectDash", group: "customerSignature" },
];

export const vsoFields = FIELD_IDS.filter(id => id !== "clearCustomerSignature");
export function emptyVsoData() {
  return { ...Object.fromEntries(vsoFields.map(id => [id, ""])), bookingDate: todayIso(), salesType: "NON-PANEL HIRE PURCHASE", bookingFeePaid: "0", ncd: "0", clearCustomerSignature: true };
}
export async function buildVsoPdf(template, data) {
 const PDFLib = await import("pdf-lib");
 const pdfDoc = await PDFLib.PDFDocument.load(template);
 keepFirstPageOnly(pdfDoc);
 const page = pdfDoc.getPage(0);
 const regular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
 const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
 if (data.clearCustomerSignature) cover(page, 32, 172, 160, 45);
 restoreFillLines(page, data);
 drawCustomer(page, regular, data);
 drawVehicle(page, regular, data);
 drawPricing(page, regular, bold, data, resolvePricing(data));
 drawDealer(page, regular, data);
 pdfDoc.setTitle("Honda VSO");
 pdfDoc.setAuthor("CasePilot");
 return pdfDoc.save();
}
function keepFirstPageOnly(pdfDoc) {
  for (let index = pdfDoc.getPageCount() - 1; index > 0; index -= 1) {
    pdfDoc.removePage(index);
  }
}

function restoreFillLines(page, data) {
  fillLineSegments.forEach((line) => {
    if (line.group === "customerSignature" && !data.clearCustomerSignature) return;
    coverFillLine(page, line);
    drawFillLine(page, line);
  });
}

function drawCustomer(page, font, data) {
  const name = upper(data.customerName);
  const nric = upper(data.nric);
  const addressBaselines = [669.5, 656.1, 643.9, 626.9];

  drawFit(page, formatDate(data.bookingDate), 513, 730.5, 62, { font, size: 9, align: "center" });
  drawFit(page, name, 119, 703, 296, { font, size: 10 });
  drawFit(page, nric, 119, 687.2, 165, { font, size: 10 });

  const addressLines = wrapText(upperMultiline(data.address), font, 8.6, 302, 4);
  addressLines.forEach((line, index) => {
    drawFit(page, line, 119, addressBaselines[index], 302, { font, size: 8.6 });
  });

  drawFit(page, upper(data.homePhone), 494, 701, 80, { font, size: 8.8 });
  drawFit(page, upper(data.officePhone), 494, 689.5, 80, { font, size: 8.8 });
  drawFit(page, upper(data.mobilePhone), 494, 677.5, 80, { font, size: 8.8 });

}

function drawVehicle(page, font, data) {
  drawFit(page, upper(data.model), 119, 598.6, 218, { font, size: 9.2 });
  drawFit(page, upper(data.variant), 119, 586.4, 218, { font, size: 9.2 });
  drawFit(page, upper(data.colour), 119, 575, 218, { font, size: 9.2 });
  drawFit(page, upper(data.estimatedDelivery), 119, 561.8, 218, { font, size: 9.2 });

  drawFit(page, upper(data.salesType), 438, 598.6, 134, { font, size: 8.9 });
  drawFit(page, upper(data.chassisNo), 438, 585.2, 134, { font, size: 8.9 });
  drawFit(page, upper(data.engineNo), 438, 573.2, 134, { font, size: 8.9 });
  drawFit(page, upper(data.referenceDealer), 438, 559.8, 134, { font, size: 8.9 });
}

function drawPricing(page, font, bold, data, pricing) {
  drawMoney(page, font, valueOrNull(data.sellingPrice), priceRows.sellingPrice.y);
  drawMoney(page, font, valueOrNull(data.discount), priceRows.discount.y);
  drawMoney(page, font, pricing.subtotal, priceRows.subtotal.y);
  drawMoney(page, font, valueOrNull(data.numberPlate), priceRows.numberPlate.y);
  drawMoney(page, font, valueOrNull(data.roadTax), priceRows.roadTax.y);
  drawMoney(page, font, valueOrNull(data.registrationFee), priceRows.registrationFee.y);
  drawMoney(page, font, valueOrNull(data.ownershipFee), priceRows.ownershipFee.y);
  drawMoney(page, font, valueOrNull(data.accessories), priceRows.accessories.y);
  drawMoney(page, font, valueOrNull(data.miscSales), priceRows.miscSales.y);
  drawMoney(page, font, valueOrNull(data.insurance), priceRows.insurance.y);

  const ncdText = data.ncd === "" ? "" : `${trimNumber(data.ncd)}%`;
  drawFit(page, ncdText, 84, 403.4, 66, { font, size: 9.2, align: "center" });

  drawMoney(page, bold, pricing.total, priceRows.totalAmount.y);
  drawMoney(page, bold, pricing.bookingFeePaid, priceRows.bookingFeePaid.y);
  drawMoney(page, bold, pricing.outstanding, priceRows.totalOutstanding.y);

  const bookingText = pricing.bookingFeePaid === null ? "0.00" : formatMoney(pricing.bookingFeePaid);
  drawFit(page, bookingText, 127, 293.8, 38, { font, size: 8.8, align: "right" });
  drawFit(page, upper(data.paymentRef), 341, 293.8, 104, { font, size: 8.8, align: "center" });
}

function drawDealer(page, font, data) {
  drawFit(page, upper(data.salesAdvisorName), 279, 157, 107, { font, size: 7.1, align: "center" });
  drawFit(page, upper(data.salesAdvisorNric), 279, 141, 107, { font, size: 7.1, align: "center" });
  drawFit(page, upper(data.salesManagerName), 468, 157, 107, { font, size: 7.1, align: "center" });
  drawFit(page, upper(data.salesManagerNric), 468, 141, 107, { font, size: 7.1, align: "center" });
}

export function resolvePricing(data) {
  const sellingPrice = valueOrNull(data.sellingPrice);
  const discount = valueOrNull(data.discount);
  const hasSubtotal = data.sellingPrice !== "" || data.discount !== "";
  const subtotal = hasSubtotal ? (sellingPrice ?? 0) - (discount ?? 0) : null;
  const hasPriceComponents = PRICE_COMPONENT_FIELDS.some((field) => data[field] !== "");
  const componentTotal = [
    subtotal,
    valueOrNull(data.numberPlate),
    valueOrNull(data.roadTax),
    valueOrNull(data.registrationFee),
    valueOrNull(data.ownershipFee),
    valueOrNull(data.accessories),
    valueOrNull(data.miscSales),
    valueOrNull(data.insurance),
  ].reduce((sum, value) => sum + (value ?? 0), 0);

  const total = valueOrNull(data.totalAmount) ?? (hasPriceComponents ? componentTotal : null);
  const bookingFeePaid = valueOrNull(data.bookingFeePaid) ?? 0;
  const outstanding = valueOrNull(data.totalOutstanding) ?? (total !== null ? total - bookingFeePaid : null);

  return {
    subtotal,
    total,
    bookingFeePaid,
    outstanding,
  };
}

function drawMoney(page, font, value, y) {
  if (value === null || !Number.isFinite(value)) return;
  drawFit(page, formatMoney(value), 219, y, 120, { font, size: 9.2, align: "right" });
}

function cover(page, x, y, width, height) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(1, 1, 1),
    opacity: 1,
  });
}

function coverFillLine(page, line) {
  const height = line.kind === "rectDash" ? 1.8 : 2.2;
  cover(page, line.x1 - 0.4, line.y - height / 2, line.x2 - line.x1 + 0.8, height);
}

function drawFillLine(page, line) {
  if (line.kind === "rectDash") {
    drawRectDashLine(page, line.x1, line.y, line.x2);
    return;
  }

  page.drawLine({
    start: { x: line.x1, y: line.y },
    end: { x: line.x2, y: line.y },
    thickness: 0.6,
    color: rgb(0, 0, 0),
    dashArray: line.kind === "vectorDash" ? [1.5, 1.5] : undefined,
    dashPhase: 0,
  });
}

function drawRectDashLine(page, x1, y, x2) {
  const dashWidth = 3;
  const gap = 1;
  for (let x = x1; x < x2; x += dashWidth + gap) {
    page.drawRectangle({
      x,
      y: y - 0.5,
      width: Math.min(dashWidth, x2 - x),
      height: 1,
      color: rgb(0, 0, 0),
    });
  }
}

function drawFit(page, text, x, y, maxWidth, options) {
  const value = text ? String(text) : "";
  if (!value) return;

  const font = options.font;
  const minSize = options.minSize ?? 5.8;
  let size = options.size ?? 9;
  let width = font.widthOfTextAtSize(value, size);

  while (width > maxWidth && size > minSize) {
    size -= 0.25;
    width = font.widthOfTextAtSize(value, size);
  }

  if (width > maxWidth) throw new Error("Teks terlalu panjang untuk ruangan PDF. Sila pendekkan.");
  const align = options.align ?? "left";
  const textX = align === "right" ? x + maxWidth - width : align === "center" ? x + (maxWidth - width) / 2 : x;

  if (options.clear) {
    cover(page, textX - 1.2, y - 1.3, width + 2.4, size + 3.1);
  }

  page.drawText(value, {
    x: textX,
    y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function wrapText(value, font, size, maxWidth, maxLines) {
  const rawLines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = [];

  rawLines.forEach((rawLine) => {
    let current = "";
    rawLine.split(/\s+/).forEach((word) => {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        current = test;
        return;
      }

      if (current) lines.push(current);
      current = word;
    });
    if (current) lines.push(current);
  });

  if (lines.length > maxLines) throw new Error("Alamat terlalu panjang. Had empat baris PDF.");
  return lines;
}

function formatDate(value) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function todayIso() {
 const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
 return ["year", "month", "day"].map(key => parts.find(p => p.type === key).value).join("-");
}

function upper(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function upperMultiline(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim().toUpperCase())
    .filter(Boolean)
    .join("\n");
}

function valueOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function formatMoney(value) {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function trimNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Number.isInteger(number) ? String(number) : String(number).replace(/0+$/, "").replace(/\.$/, "");
}

export function buildFileName(data) {
  const name = upper(data.customerName) || "CUSTOMER";
  const date = formatDate(data.bookingDate) || todayIso();
  return `VSO_HONDA_${name}_${date}`.replace(/[^A-Z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

