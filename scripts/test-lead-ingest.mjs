import assert from "node:assert/strict";
import test from "node:test";
import { parseIngestPayload } from "../supabase/functions/ingest-lead/payload.ts";

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
    note: "Interested in a test drive\ncampaign name: September offers",
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
  assert.equal(lead.note, "Interested in an SUV\njob status: Kerja Kerajaan\nnet salary: RM2500-RM3500\ncampaign name: September offers\nad name: SUV video");
});

test("missing mapped values are rejected before insert", () => {
  assert.throws(() => parseIngestPayload({ source_lead_id: "No Data", name: "Aminah", phone: "+60123456789" }), /source_lead_id/);
  assert.throws(() => parseIngestPayload({ source_lead_id: "ads-123", name: "Aminah", phone: "123" }), /phone/);
});
