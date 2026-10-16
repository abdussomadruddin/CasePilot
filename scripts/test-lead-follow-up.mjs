import assert from "node:assert/strict";
import test from "node:test";
import { availableLeadFollowUpStages, canRecordLeadFollowUp, leadFollowUpAction, isLeadFollowUpDue, maxLeadFollowUps } from "../src/lib/types.ts";

test("follow-up recording stops at six", () => {
  assert.equal(maxLeadFollowUps, 6);
  assert.equal(canRecordLeadFollowUp(5, "contacted"), true);
  assert.equal(canRecordLeadFollowUp(6, "contacted"), false);
  assert.equal(canRecordLeadFollowUp(7, "contacted"), false);
  assert.equal(canRecordLeadFollowUp(2, "rejected"), false);
  assert.equal(canRecordLeadFollowUp(2, "potential"), true);
});

test("follow-up opens WhatsApp without recording after six", () => {
  assert.equal(leadFollowUpAction(5, "contacted"), "record");
  assert.equal(leadFollowUpAction(6, "contacted"), "whatsapp");
  assert.equal(leadFollowUpAction(7, "potential"), "whatsapp");
  assert.equal(leadFollowUpAction(6, "rejected"), "blocked");
});

test("follow-up filter shows only stages containing callable leads", () => {
  const leads = [
    { phoneRevealedAt: "", followUpCount: 0, status: "new" },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 0, status: "contacted" },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 1, status: "potential" },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 1, status: "contacted" },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 3, status: "all_offer_presented" },
    { phoneRevealedAt: "2026-09-26T00:00:00Z", followUpCount: 2, status: "rejected" },
  ];
  assert.deepEqual(availableLeadFollowUpStages(leads), [
    { count: 0, total: 1 },
    { count: 1, total: 2 },
    { count: 3, total: 1 },
  ]);
  assert.deepEqual(availableLeadFollowUpStages(leads.slice(0, 1)), []);
  assert.deepEqual(availableLeadFollowUpStages(leads.slice(-1)), []);
});
import { groupLeadReminders, reminderMessage, reminderTypeAt } from "../supabase/functions/lead-follow-up/reminders.ts";

const now = Date.parse("2026-09-24T01:00:00.000Z");
const contacted = {
  status: "contacted",
  followUpCount: 0,
  followUpActivityAt: new Date(now - 86_400_000).toISOString(),
};

test("contacted lead becomes due after 24 hours", () => {
  assert.equal(isLeadFollowUpDue(contacted, now - 1), false);
  assert.equal(isLeadFollowUpDue(contacted, now), true);
});

test("four or more follow-ups cannot become due even when Contacted", () => {
  for (const followUpCount of [0, 1, 2, 3]) assert.equal(isLeadFollowUpDue({ ...contacted, followUpCount }, now), true);
  for (const followUpCount of [4, 5, 6, 7]) assert.equal(isLeadFollowUpDue({ ...contacted, followUpCount }, now), false);
  assert.equal(isLeadFollowUpDue({ ...contacted, status: "all_offer_presented", followUpCount: 3 }, now), false);
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

test("New slots include every hour from 10 to 18 Kuala Lumpur time", () => {
  for (const hour of [10, 11, 12, 13, 14, 15, 16, 17, 18]) {
    assert.equal(reminderTypeAt(new Date(Date.UTC(2026, 8, 25, hour - 8))), "new");
  }
  for (const hour of [9, 19, 21]) {
    assert.notEqual(reminderTypeAt(new Date(Date.UTC(2026, 8, 25, hour - 8))), "new");
  }
});

test("Contacted slots use half hours from 9:30 to 17:30 Kuala Lumpur time", () => {
  for (const hour of [9, 10, 11, 12, 13, 14, 15, 16, 17]) {
    assert.equal(reminderTypeAt(new Date(Date.UTC(2026, 8, 25, hour - 8, 30))), "contacted");
  }
  assert.equal(reminderTypeAt(new Date("2026-09-25T07:00:00Z")), "new");
  assert.equal(reminderTypeAt(new Date("2026-09-25T01:00:00Z")), null);
  assert.equal(reminderTypeAt(new Date("2026-09-25T02:11:00Z")), null);
});
