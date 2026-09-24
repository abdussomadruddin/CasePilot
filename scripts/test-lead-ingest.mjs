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
