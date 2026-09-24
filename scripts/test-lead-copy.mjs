import assert from "node:assert/strict";
import test from "node:test";
import { formatLeadCopy } from "../src/lib/lead-copy.ts";

test("TikTok lead copies the exact heading and original answer order without a separator", () => {
  const note = "Abdussomad Ruddin\n+60 17-355 9147\nabdussomad.ruddin@gmail.com\nCity Sedan\nKerja Kerajaan\nRM2500 - RM3500\n0\nNak trade-in\nTiada (Nak Full Loan)\nsecepat yang boleh (ASAP)";
  const result = formatLeadCopy({
    source: "tiktok_ads", sourceNote: note,
    customerName: "Abdussomad Ruddin", customerPhone: "+60 17-355 9147",
    email: "abdussomad.ruddin@gmail.com", carBrand: "Honda", carModel: "Honda City", notes: [],
  });
  assert.equal(result, `*New Car Sales Inquiry From Tiktok*\n\n${note}`);
  assert.equal(result.includes("==="), false);
});

test("missing contact details and later notes are included once", () => {
  const result = formatLeadCopy({
    source: "meta_ads", sourceNote: "Looking for an SUV",
    customerName: "Farah", customerPhone: "0123456789", email: "farah@example.com",
    carBrand: "JAECOO", carModel: "JAECOO J7",
    notes: [{ id: "1", authorId: "a", body: "Call back tomorrow", createdAt: "2026-09-24T00:00:00Z" }],
  });
  assert.equal(result, "*New Car Sales Inquiry From Meta*\n\nFarah\n0123456789\nfarah@example.com\nLooking for an SUV\n\nFollow-up notes:\nCall back tomorrow");
});

test("manual lead copies available details without a trailing delimiter", () => {
  const result = formatLeadCopy({
    source: "manual_upload", sourceNote: "", customerName: "Nur Aini",
    customerPhone: "", email: "aini@example.com", carBrand: "Proton",
    carModel: "Proton S70", notes: [],
  });
  assert.equal(result, "*New Car Sales Inquiry From Manual*\n\nNur Aini\naini@example.com\nProton S70");
});

test("copy before Call hides phone in contact and notes", () => {
  const result = formatLeadCopy({
    source: "tiktok_ads", sourceNote: "Aina\n+60 17-355 9147\nInterested in City",
    customerName: "Aina", customerPhone: "+60 17-355 9147", email: "",
    carBrand: "Honda", carModel: "Honda City",
    notes: [{ id: "1", authorId: "a", body: "Call +60 17-355 9147", createdAt: "2026-09-24T00:00:00Z" }],
  }, false);
  assert.equal(result.includes("+60 17-355 9147"), false);
  assert.match(result, /\[phone hidden until Call\]/);
});
