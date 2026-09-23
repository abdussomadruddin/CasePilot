import assert from "node:assert/strict";
import test from "node:test";
import { isLeadFollowUpDue } from "../src/lib/types.ts";

const now = Date.parse("2026-09-24T01:00:00.000Z");
const contacted = {
  status: "contacted",
  followUpActivityAt: new Date(now - 86_400_000).toISOString(),
};

test("contacted lead becomes due after 24 hours", () => {
  assert.equal(isLeadFollowUpDue(contacted, now - 1), false);
  assert.equal(isLeadFollowUpDue(contacted, now), true);
});

test("a new remark resets the due time", () => {
  assert.equal(isLeadFollowUpDue({ ...contacted, followUpActivityAt: new Date(now).toISOString() }, now), false);
});

test("other statuses and missing activity are never due", () => {
  assert.equal(isLeadFollowUpDue({ ...contacted, status: "rejected" }, now), false);
  assert.equal(isLeadFollowUpDue({ ...contacted, followUpActivityAt: "" }, now), false);
});
