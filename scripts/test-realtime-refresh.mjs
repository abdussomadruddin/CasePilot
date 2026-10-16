import assert from "node:assert/strict";
import { createRealtimeRefresh } from "../src/lib/realtime-refresh.ts";

const applied = [];
const waiting = [];
let disposed = false;
const refresh = createRealtimeRefresh(
  () => new Promise((resolve) => waiting.push(resolve)),
  (value) => applied.push(value),
  () => disposed,
  (error) => { throw error; },
);
const first = refresh();
assert.equal(refresh(), first);
waiting.shift()("stale");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(applied, []);
waiting.shift()("latest");
await first;
assert.deepEqual(applied, ["latest"]);
const last = refresh();
disposed = true;
waiting.shift()("after unmount");
await last;
assert.deepEqual(applied, ["latest"]);

let attempts = 0;
let errors = 0;
const recover = createRealtimeRefresh(async () => {
  if (++attempts === 1) throw new Error("offline");
  return "reconnected";
}, (value) => applied.push(value), () => false, () => errors++);
await recover();
await recover();
assert.equal(errors, 1);
assert.equal(applied.at(-1), "reconnected");
console.log("PASS: burst coalescing, stale response suppression, unmount and error recovery");
