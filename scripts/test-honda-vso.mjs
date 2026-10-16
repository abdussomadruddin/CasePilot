import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { buildVsoPdf, buildFileName, emptyVsoData, resolvePricing } from "../src/lib/honda-vso.mjs";
import { exampleVsoData } from "../src/lib/honda-vso-example.ts";

test("Isi contoh reproduces the supplied PDF including manual totals", () => {
  const data = exampleVsoData();
  assert.equal(data.customerName, "AZIZAN BIN ISMAIL @ ARIFFIN");
  assert.equal(data.bookingDate, "2026-01-08");
  assert.equal(data.model, "HONDA HR-V");
  assert.equal(data.sellingPrice, "115560");
  assert.equal(data.salesAdvisorName, "MUIZZUDDIN NAZMI BIN BAKRI");
  assert.deepEqual(resolvePricing(data), { subtotal: 115560, total: 122000, bookingFeePaid: 0, outstanding: 109300 });
  assert.equal(data.clearCustomerSignature, true);
});

const sample = {
  ...emptyVsoData(), bookingDate: "2026-10-16", customerName: "NUR AISYAH BINTI ABDULLAH",
  nric: "900101-10-1234", mobilePhone: "017-1234567", homePhone: "03-12345678", officePhone: "03-87654321",
  address: "NO 12 JALAN CONTOH\nTAMAN INDAH, 43000 KAJANG, SELANGOR", model: "HONDA CITY",
  variant: "1.5L V", colour: "PLATINUM WHITE PEARL", estimatedDelivery: "NOVEMBER 2026",
  sellingPrice: "95000", discount: "3000", insurance: "2500", roadTax: "90", numberPlate: "50",
  registrationFee: "150", ownershipFee: "50", accessories: "1000", bookingFeePaid: "500",
  chassisNo: "MRH123456789012345", engineNo: "L15B1234567", referenceDealer: "KAH MOTOR IPOH",
  salesAdvisorName: "SA CONTOH", salesAdvisorNric: "900101101234",
  salesManagerName: "MANAGER CONTOH", salesManagerNric: "800101101234", paymentRef: "BANK-12345",
};
test("automatic subtotal, total and outstanding after booking", () => {
  assert.deepEqual(resolvePricing(sample), { subtotal: 92000, total: 95840, bookingFeePaid: 500, outstanding: 95340 });
});
test("manual zero and nonzero overrides are respected", () => {
  assert.equal(resolvePricing({ ...sample, totalAmount: "100000" }).outstanding, 99500);
  assert.equal(resolvePricing({ ...sample, totalOutstanding: "80000" }).outstanding, 80000);
  assert.equal(resolvePricing({ ...sample, totalAmount: "0", totalOutstanding: "0" }).outstanding, 0);
});
test("filename uses customer name and booking date", () => {
  assert.equal(buildFileName(sample), "VSO_HONDA_NUR_AISYAH_BINTI_ABDULLAH_16-10-2026");
  assert.ok(!buildFileName({ ...sample, customerName: "../A/B" }).includes("/"));
});
test("output retains first page only and both signature modes generate", async () => {
  for (const clearCustomerSignature of [true, false]) {
    const template = await readFile(new URL(`../assets/${clearCustomerSignature ? "honda-vso-no-signature" : "honda-vso-template"}.pdf`, import.meta.url));
    const source = await PDFDocument.load(template);
    source.addPage();
    const bytes = await buildVsoPdf(await source.save(), { ...sample, clearCustomerSignature });
    const output = await PDFDocument.load(bytes);
    assert.equal(output.getPageCount(), 1);
    assert.deepEqual(output.getPage(0).getSize(), { width: 595, height: 860 });
    await writeFile(`/tmp/casepilot-vso-${clearCustomerSignature ? "clear" : "retain"}.pdf`, bytes);
  }
});
test("oversized text fails instead of drawing outside the field", async () => {
  const template = await readFile(new URL("../assets/honda-vso-no-signature.pdf", import.meta.url));
  await assert.rejects(buildVsoPdf(template, { ...sample, customerName: "N".repeat(500) }), /terlalu panjang/);
  await assert.rejects(buildVsoPdf(template, { ...sample, address: "JALAN PANJANG ".repeat(100) }), /Alamat terlalu panjang/);
});
