import assert from "node:assert/strict";
import test from "node:test";
import { buildFunnel, funnelDayRange, funnelRate, klDayKey } from "../src/lib/funnel.ts";

const now = Date.parse("2026-09-25T01:00:00Z"); // 9:00 AM in Kuala Lumpur.
const lead = (id, createdAt) => ({ id, createdAt });
const caseRecord = (id, leadId, createdAt, status = "submission", dealer = "kah_motor") => ({ id, leadId, createdAt, status, dealer });

test("Kuala Lumpur day boundaries and rolling periods are inclusive", () => {
  assert.equal(klDayKey("2026-09-24T16:00:00Z"), "2026-09-25");
  assert.deepEqual(funnelDayRange("today", now), { start: "2026-09-25", end: "2026-09-25" });
  assert.deepEqual(funnelDayRange("yesterday", now), { start: "2026-09-24", end: "2026-09-24" });
  assert.deepEqual(funnelDayRange("7d", now), { start: "2026-09-19", end: "2026-09-25" });
  assert.deepEqual(funnelDayRange("30d", now), { start: "2026-08-27", end: "2026-09-25" });
  assert.deepEqual(funnelDayRange("90d", now), { start: "2026-06-28", end: "2026-09-25" });
});

test("admin includes direct cases in case and delivery totals without inflating lead conversion", () => {
  const result = buildFunnel("admin", [
    lead("a", "2026-09-24T16:00:00Z"),
    lead("b", "2026-09-25T04:00:00Z"),
    lead("old", "2026-09-24T15:59:59Z"),
  ], [
    caseRecord("linked", "a", "2026-09-26T00:00:00Z", "car_delivery"),
    caseRecord("direct", "", "2026-09-25T02:00:00Z", "car_delivery"),
    caseRecord("older-lead", "old", "2026-09-25T02:00:00Z", "car_delivery"),
  ], "today", now);
  assert.deepEqual(result.leadIds, ["a", "b"]);
  assert.deepEqual(result.caseIds, ["linked", "direct"]);
  assert.deepEqual(result.deliveredIds, ["linked", "direct"]);
  assert.deepEqual(result.directCaseIds, ["direct"]);
  assert.equal(result.leadToCase, "50%");
  assert.equal(result.caseToDelivered, "100%");
  assert.equal(result.leadToDelivered, "50%");
  assert.equal(result.notConverted, 1);
  assert.equal(result.notDelivered, 0);
});

test("admin counts direct cases even when there are no leads", () => {
  const result = buildFunnel("admin", [], [
    caseRecord("delivered", "", "2026-09-25T02:00:00Z", "car_delivery"),
    caseRecord("pending", null, "2026-09-25T03:00:00Z"),
    caseRecord("outside", "", "2026-09-24T15:59:59Z", "car_delivery"),
  ], "today", now);
  assert.deepEqual(result.caseIds, ["delivered", "pending"]);
  assert.deepEqual(result.deliveredIds, ["delivered"]);
  assert.equal(result.leadToCase, "—");
  assert.equal(result.leadToDelivered, "—");
  assert.equal(result.caseToDelivered, "50%");
  assert.equal(result.notDelivered, 1);
});

test("sales manager sees only Kah Motor case cohort and current deliveries", () => {
  const result = buildFunnel("sales_manager", [], [
    caseRecord("delivered", "", "2026-09-25T02:00:00Z", "car_delivery"),
    caseRecord("pending", "", "2026-09-25T02:00:00Z"),
    caseRecord("rejected", "", "2026-09-25T02:00:00Z", "rejected"),
    caseRecord("other-dealer", "", "2026-09-25T02:00:00Z", "car_delivery", "other_dealer"),
  ], "today", now);
  assert.deepEqual(result.caseIds, ["delivered", "pending", "rejected"]);
  assert.deepEqual(result.deliveredIds, ["delivered"]);
  assert.equal(result.caseToDelivered, "33.3%");
  assert.equal(result.notDelivered, 2);
  assert.deepEqual(result.leadIds, []);
});

test("zero denominator shows a dash instead of zero percent", () => {
  assert.equal(funnelRate(0, 0), "—");
  assert.equal(buildFunnel("admin", [], [], "30d", now).leadToDelivered, "—");
});
