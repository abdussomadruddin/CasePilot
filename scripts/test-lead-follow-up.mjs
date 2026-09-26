import assert from "node:assert/strict";
import test from "node:test";
import { availableLeadFollowUpStages, isLeadFollowUpDue } from "../src/lib/types.ts";

test("follow-up filter shows only stages containing callable leads", () => {
  const leads = [
    { phoneRevealedAt: "", followUpCount: 0 },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 0 },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 1 },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 1 },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 3 },
  ];
  assert.deepEqual(availableLeadFollowUpStages(leads), [
    { count: 0, total: 1 },
    { count: 1, total: 2 },
    { count: 3, total: 1 },
  ]);
  assert.deepEqual(availableLeadFollowUpStages(leads.slice(0, 1)), []);
});
import { groupLeadReminders, reminderMessage, reminderTypeAt } from "../supabase/functions/lead-follow-up/reminders.ts";

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

test("new and contacted reminders go only to the active CS or Broker owner", () => {
  const groups = groupLeadReminders(
    [{ id: "new-1", owner_id: "cs" }, { id: "new-2", owner_id: "broker" }, { id: "new-3", owner_id: "finance" }, { id: "new-4", owner_id: "cs" }],
    [{ id: "due-1", owner_id: "cs" }],
    [
      { id: "cs", role: "customer_service" }, { id: "broker", role: "broker" },
      { id: "admin", role: "admin" }, { id: "finance", role: "finance" },
    ],
  );
  assert.deepEqual(groups.get("cs"), { newCount: 2, contactedCount: 1 });
  assert.deepEqual(groups.get("broker"), { newCount: 1, contactedCount: 0 });
  assert.equal(groups.has("admin"), false);
  assert.equal(groups.has("finance"), false);
  assert.equal(reminderMessage(groups.get("cs")), "2 new leads waiting for a call; 1 contacted lead needs follow-up.");
});

test("Admin receives no reminder when only new leads exist", () => {
  const groups = groupLeadReminders(
    [{ id: "new-1", owner_id: "broker" }], [],
    [{ id: "broker", role: "broker" }, { id: "admin", role: "admin" }],
  );
  assert.deepEqual([...groups.keys()], ["broker"]);
});

test("New slots are 10, 11, 12, 14 and 16 Kuala Lumpur time only", () => {
  for (const hour of [10, 11, 12, 14, 16]) {
    assert.equal(reminderTypeAt(new Date(Date.UTC(2026, 8, 25, hour - 8))), "new");
  }
  for (const hour of [9, 13, 15, 17, 21]) {
    assert.notEqual(reminderTypeAt(new Date(Date.UTC(2026, 8, 25, hour - 8))), "new");
  }
});

test("Contacted slots stay at 9, 15 and 21 Kuala Lumpur time", () => {
  for (const hour of [9, 15, 21]) {
    assert.equal(reminderTypeAt(new Date(Date.UTC(2026, 8, 25, hour - 8))), "contacted");
  }
  assert.equal(reminderTypeAt(new Date("2026-09-25T02:11:00Z")), null);
});
