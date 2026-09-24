import assert from "node:assert/strict";
import test from "node:test";
import { isLeadFollowUpDue } from "../src/lib/types.ts";
import { groupLeadReminders, reminderMessage } from "../supabase/functions/lead-follow-up/reminders.ts";

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

test("new lead reminders go only to the CS or Broker owner; Admin keeps contacted reminders", () => {
  const groups = groupLeadReminders(
    [{ id: "new-1", owner_id: "cs" }, { id: "new-2", owner_id: "broker" }, { id: "new-3", owner_id: "finance" }],
    [{ id: "due-1", owner_id: "cs" }],
    [
      { id: "cs", role: "customer_service" }, { id: "broker", role: "broker" },
      { id: "admin", role: "admin" }, { id: "finance", role: "finance" },
    ],
  );
  assert.deepEqual(groups.get("cs"), { newCount: 1, contactedCount: 1 });
  assert.deepEqual(groups.get("broker"), { newCount: 1, contactedCount: 0 });
  assert.deepEqual(groups.get("admin"), { newCount: 0, contactedCount: 1 });
  assert.equal(groups.has("finance"), false);
  assert.equal(reminderMessage(groups.get("cs")), "1 new lead waiting for a call; 1 contacted lead needs follow-up.");
});

test("Admin receives no reminder when only new leads exist", () => {
  const groups = groupLeadReminders(
    [{ id: "new-1", owner_id: "broker" }], [],
    [{ id: "broker", role: "broker" }, { id: "admin", role: "admin" }],
  );
  assert.deepEqual([...groups.keys()], ["broker"]);
});
