import assert from "node:assert/strict";
import test from "node:test";
import { parseIngestPayload } from "../supabase/functions/ingest-lead/payload.ts";
import { extractLeadContact, hideLeadPhoneInNote } from "../supabase/functions/_shared/lead-contact.ts";
import { extractLeadVehicle, leadVehicleModels } from "../supabase/functions/_shared/lead-vehicle.ts";
import { readFileSync } from "node:fs";

test("Pabbly payload maps required and optional lead fields", () => {
  assert.deepEqual(parseIngestPayload({
    source_lead_id: "ads-123",
    full_name: "Aminah",
    phone_number: "+60123456789",
    email: "aminah@example.com",
    campaign_name: "September offers",
    note: "Interested in a test drive",
  }), {
    sourceLeadId: "ads-123",
    name: "Aminah",
    phone: "+60123456789",
    email: "aminah@example.com",
    brand: "",
    model: "",
    note: "Interested in a test drive\nfull name: Aminah\nphone number: +60123456789\nemail: aminah@example.com\ncampaign name: September offers",
    sourceDetail: "September offers",
    createdAt: null,
  });
});

test("additional Pabbly fields are retained in the CasePilot note", () => {
  const lead = parseIngestPayload({
    source_lead_id: "tt-456",
    name: "Aminah",
    phone: "+60123456789",
    email: "aminah@example.com",
    note: "Interested in an SUV",
    job_status: "Kerja Kerajaan",
    net_salary: "RM2500-RM3500",
    campaign_name: "September offers",
    ad_name: "SUV video",
    empty_field: "No Data",
  });
  assert.equal(lead.note, "Interested in an SUV\nname: Aminah\nphone: +60123456789\nemail: aminah@example.com\njob status: Kerja Kerajaan\nnet salary: RM2500-RM3500\ncampaign name: September offers\nad name: SUV video");
});

test("missing source ID is accepted because each POST creates a lead", () => {
  assert.equal(parseIngestPayload({ source_lead_id: "No Data", name: "Aminah", phone: "+60123456789" }).sourceLeadId, "");
});

test("missing or invalid contact fields do not reject a new lead", () => {
  const lead = parseIngestPayload({ source_lead_id: "ads-123", phone: "123", campaign_name: "Autumn" });
  assert.equal(lead.name, "");
  assert.equal(lead.phone, "");
  assert.equal(lead.note, "phone: 123\ncampaign name: Autumn");
});

test("contact fields are found in a TikTok note regardless of order", () => {
  const lead = parseIngestPayload({
    note: "Salary: RM2500-RM3500\nEmail: nor@example.com\nNo Phone: +60 12-345 6789\nNama: Nor Aini",
    campaign_name: "S70 campaign",
  });
  assert.equal(lead.name, "Nor Aini");
  assert.equal(lead.phone, "+60 12-345 6789");
  assert.equal(lead.email, "nor@example.com");
});

test("unlabelled TikTok answers identify a person without treating model or job as a name", () => {
  const note = "Abdussomad Ruddin\n+60 17-355 9147\nabdussomad.ruddin@gmail.com\nCity Sedan\nKerja Kerajaan\nRM2500 - RM3500\n0\nNak trade-in";
  const lead = parseIngestPayload({ note });
  assert.equal(lead.name, "Abdussomad Ruddin");
  assert.equal(lead.phone, "+60 17-355 9147");
  assert.equal(lead.email, "abdussomad.ruddin@gmail.com");
  assert.equal(lead.brand, "Honda");
  assert.equal(lead.model, "Honda City");
  assert.equal(parseIngestPayload({ name: "secepat yang boleh (ASAP)", note }).name, "Abdussomad Ruddin");
  assert.equal(extractLeadContact("City Sedan\nKerja Kerajaan\n+60 17-355 9147").name, "");
});

test("all known TikTok form answers are excluded when the name arrives last", () => {
  const answers = [
    "City Sedan", "City Hatchback", "Civic", "HR-V", "CR-V", "WR-V",
    "secepat yang boleh (ASAP)", "1-3 bulan", "3-6 bulan", "Survey sahaja",
    "Kerja Kerajaan", "Kerja Swasta", "Berniaga/Freelance",
    "RM2500 - RM3500", "RM3500 - RM5000", "RM5000 keatas",
    "Nak trade-in", "Tiada", "Tiada (Nak Full Loan)",
    "10% Deposit", "Custom Deposit", "Nak beli cash tunai",
  ];
  const note = ["+60 17-355 9147", "abdussomad.ruddin@gmail.com", ...answers, "Abdussomad Ruddin"].join("\n");
  assert.equal(extractLeadContact(note, { name: "Custom Deposit" }).name, "Abdussomad Ruddin");
  assert.equal(extractLeadContact(["+60 17-355 9147", ...answers].join("\n")).name, "");
});

test("single-word name is detected after form answers", () => {
  const note = "JAECOO\nKerja Kerajaan\nRM2500-RM3500\nabdussomad\n+60 17-355 9147\nabdussomad.ruddin@gmail.com";
  const lead = parseIngestPayload({ note });
  assert.equal(lead.name, "abdussomad");
  assert.equal(lead.brand, "JAECOO");
  assert.equal(lead.phone, "+60 17-355 9147");
  assert.equal(extractLeadContact("JAECOO\nKerja Kerajaan\n+60 17-355 9147").name, "");
});

test("name length is unrestricted while form answers stay excluded", () => {
  const note = "JAECOO\nKerja Kerajaan\nCustom Deposit\n+60 17-355 9147\nNur Abdussomad Bin Abdul Ruddin Ahmad\nabdussomad.ruddin@gmail.com";
  assert.equal(extractLeadContact(note).name, "Nur Abdussomad Bin Abdul Ruddin Ahmad");
  assert.equal(extractLeadContact("JAECOO\nJAECOO J7\nCustom Deposit\n+60 17-355 9147").name, "");
});

test("No, Tiada, dash and zero are not names when SARASVATI is present", () => {
  const note = "Civic\nvatisaras088@gmail.com\nNo\nRM2500 - RM3500\nSARASVATI\n1-3 bulan\nKerja Swasta\nTiada (Nak Full Loan)\nTiada\n+60 14-807 8900";
  for (const name of ["No", "Tiada", "-", "0"]) {
    assert.equal(parseIngestPayload({ name, note }).name, "SARASVATI");
  }
  assert.equal(extractLeadContact("No\nTiada\n-\n0\n+60 14-807 8900").name, "");
});

test("misspelled City Hatchback answer does not become the customer name", () => {
  const note = "+60 18-364 5924\nTiada (Nak Full Loan)\nsyahsjinspire@gmail.com\nsecepat yang boleh (ASAP)\nTiada\nCity Hacthback\nSyahidan\nKerja Swasta\nRM3500 - RM5000\nNak trade-in";
  const lead = parseIngestPayload({ name: "City Hacthback", note });
  assert.equal(lead.name, "Syahidan");
  assert.equal(lead.brand, "Honda");
  assert.equal(lead.model, "Honda City Hatchback");
});

test("manual note extraction prefers supplied fields and ignores campaign name", () => {
  assert.deepEqual(extractLeadContact("Campaign name: Sale\nNama: Farah\nTelefon: 0123456789\nEmail: farah@example.com", { name: "Aminah" }), {
    name: "Aminah", phone: "0123456789", email: "farah@example.com",
  });
});

test("phone numbers in notes stay hidden until Call", () => {
  assert.equal(hideLeadPhoneInNote("No Phone: +60 12-345 6789", false), "No Phone: [phone hidden until Call]");
  assert.equal(hideLeadPhoneInNote("No Phone: +60 12-345 6789", true), "No Phone: +60 12-345 6789");
});

test("brand and longest matching model are detected from note", () => {
  assert.deepEqual(extractLeadVehicle("Inquiry: Proton NEW S70 1.5 i-GT LITE"), { brand: "Proton", model: "Proton NEW S70 1.5 i-GT" });
  assert.deepEqual(extractLeadVehicle("Model: NEW S70"), { brand: "Proton", model: "Proton NEW S70 1.5 i-GT" });
  assert.deepEqual(extractLeadVehicle("Model: J5 EV"), { brand: "JAECOO", model: "JAECOO J5 EV" });
  assert.deepEqual(extractLeadVehicle("Nak Proton tapi model belum pasti"), { brand: "Proton", model: "" });
  assert.deepEqual(extractLeadVehicle("No vehicle data"), { brand: "", model: "" });
});

test("direct vehicle fields take precedence over unrelated note mentions", () => {
  assert.deepEqual(extractLeadVehicle("Campaign: Proton X50", { model: "JAECOO J7" }), { brand: "JAECOO", model: "JAECOO J7" });
});

test("lead model detector covers the CasePilot car catalog", () => {
  const dashboard = readFileSync(new URL("../src/components/case-dashboard.tsx", import.meta.url), "utf8");
  const catalogModels = [...dashboard.matchAll(/^    model: "([^"]+)"/gm)].map((match) => match[1]);
  assert.deepEqual(leadVehicleModels.map((item) => item.model).sort(), catalogModels.sort());
});
