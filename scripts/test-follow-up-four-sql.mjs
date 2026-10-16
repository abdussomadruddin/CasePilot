import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Isolated PostgreSQL business-rule test, not a substitute for production RLS checks.
// npm install --prefix /tmp/casepilot-sql-tests @electric-sql/pglite
const { PGlite } = await import(process.env.PGLITE_MODULE || "/tmp/casepilot-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const db = new PGlite();
try {
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
    create table public.leads(id uuid primary key,owner_id uuid,status text,follow_up_count integer,
      phone_revealed_at timestamptz,customer_phone text,deleted_at timestamptz,
      follow_up_activity_at timestamptz,updated_at timestamptz);
    create table public.lead_follow_up_actions(lead_id uuid,actor_id uuid,follow_up_number integer,unique(lead_id,follow_up_number));
    create table public.lead_events(lead_id uuid,actor_id uuid,status text,event_kind text);
  `);
  const ids = Array.from({ length: 6 }, (_, i) => `22222222-2222-4222-8222-${String(i + 1).padStart(12, "0")}`);
  const states = [["contacted", 2, false], ["contacted", 4, false], ["potential", 5, false], ["rejected", 6, false], ["contacted", 6, true], ["all_offer_presented", 3, false]];
  for (const [i, [status, count, deleted]] of states.entries()) {
    await db.query("insert into leads values($1,auth.uid(),$2,$3,now(),'60173559147',case when $4 then now() else null end,now()-interval '2 days',now())", [ids[i], status, count, deleted]);
  }
  const migration = await readFile(new URL("../supabase/migrations/20261014065345_follow_up_due_ends_at_four.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const state = async id => (await db.query("select status,follow_up_count,follow_up_activity_at from leads where id=$1", [id])).rows[0];
  assert.equal((await state(ids[1])).status, "all_offer_presented");
  assert.equal((await state(ids[2])).status, "potential");
  assert.equal((await state(ids[3])).status, "rejected");
  assert.equal((await state(ids[4])).status, "contacted");
  assert.equal((await state(ids[5])).follow_up_count, 3);
  assert.equal((await db.query("select count(*)::int as n from lead_events")).rows[0].n, 1);
  for (const next of [3, 4, 5, 6]) {
    if (next >= 5) await db.query("update leads set status='contacted' where id=$1", [ids[0]]);
    const result = await db.query("select record_lead_follow_up($1) as n", [ids[0]]);
    assert.equal(result.rows[0].n, next);
    const lead = await state(ids[0]);
    assert.equal(lead.status, next < 4 ? "contacted" : "all_offer_presented");
    if (next >= 4) assert.equal(lead.follow_up_activity_at, null);
  }
  assert.equal((await db.query("select count(*)::int as n from lead_follow_up_actions")).rows[0].n, 4);
  assert.equal((await db.query("select count(*)::int as n from lead_events where lead_id=$1", [ids[0]])).rows[0].n, 3);
  await assert.rejects(db.query("select record_lead_follow_up($1)", [ids[0]]), /Maximum 6/);
  await assert.rejects(db.query("select record_lead_follow_up($1)", [ids[3]]), /not available/);
  await db.exec(migration);
  assert.equal((await db.query("select count(*)::int as n from lead_events")).rows[0].n, 4);
  console.log("PASS: transitions 2-6, backfill scope, history, rejected, six cap and repeat migration");
} finally { await db.close(); }
