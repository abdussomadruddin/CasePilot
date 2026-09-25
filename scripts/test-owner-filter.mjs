import assert from "node:assert/strict";
import test from "node:test";
import { matchesOwnerFilter } from "../src/lib/owner-filter.ts";

const members = [
  { id: "cs-1", role: "customer_service" },
  { id: "cs-2", role: "customer_service" },
  { id: "broker-1", role: "broker" },
];

test("owner filter supports all, role groups, and individual CS/Broker", () => {
  const records = [
    { ownerId: "cs-1" },
    { ownerId: "cs-2" },
    { ownerId: "broker-1" },
  ];
  assert.equal(records.filter((record) => matchesOwnerFilter(record, "all", members)).length, 3);
  assert.equal(records.filter((record) => matchesOwnerFilter(record, "role:customer_service", members)).length, 2);
  assert.equal(records.filter((record) => matchesOwnerFilter(record, "role:broker", members)).length, 1);
  assert.deepEqual(records.filter((record) => matchesOwnerFilter(record, "user:cs-2", members)), [{ ownerId: "cs-2" }]);
});

test("case owner role works when an old team member is absent", () => {
  assert.equal(matchesOwnerFilter({ ownerId: "removed", ownerRole: "broker" }, "role:broker", members), true);
  assert.equal(matchesOwnerFilter({ ownerId: "removed", ownerRole: "broker" }, "role:customer_service", members), false);
  assert.equal(matchesOwnerFilter({ ownerId: "removed" }, "role:broker", members), false);
});
