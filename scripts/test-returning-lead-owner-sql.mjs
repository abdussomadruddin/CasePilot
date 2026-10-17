import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "/tmp/casepilot-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const db = new PGlite();
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12,"0")}`;
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key,active boolean,role text);
    create table lead_connectors(id uuid primary key,owner_id uuid,source text,active boolean);
    create table leads(id uuid primary key default gen_random_uuid(),owner_id uuid,source text,source_lead_id text,source_detail text,source_note text,connector_id uuid,
      customer_name text,customer_phone text,email text,car_brand text,car_model text,status text,created_at timestamptz default now(),updated_at timestamptz default now(),
      deleted_at timestamptz,has_ever_contacted boolean default false,phone_revealed_at timestamptz,follow_up_count int default 0,follow_up_activity_at timestamptz,
      rejection_reason text,received_at timestamptz,receipt_id uuid default gen_random_uuid(),return_count int default 0);
    create table lead_notes(id uuid primary key default gen_random_uuid(),lead_id uuid,author_id uuid,body text,created_at timestamptz default now());
    create table lead_events(lead_id uuid,actor_id uuid,status text,event_kind text,previous_owner_id uuid);
    create table lead_follow_up_actions(lead_id uuid);
    create table lead_ingest_windows(identity_key text primary key,last_accepted_at timestamptz,last_lead_id uuid);
    create table new_lead_alert_queue(lead_id uuid,owner_id uuid,receipt_id uuid,queued_at timestamptz,claimed_at timestamptz,sent_at timestamptz,last_error text,unique(lead_id,owner_id));
    create schema net;
    create table net.requests(body jsonb);
    create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language plpgsql as $$begin insert into net.requests values(body);return 1;end$$;
    insert into profiles values('${id(1)}',true,'broker'),('${id(2)}',true,'customer_service');
    insert into lead_connectors values('${id(11)}','${id(1)}','meta_ads',true),('${id(12)}','${id(2)}','tiktok_ads',true);
  `);
  const base = await readFile(new URL("../supabase/migrations/20261010155300_reactivate_returning_pabbly_leads.sql", import.meta.url),"utf8");
  await db.exec(base.slice(base.indexOf("create function public.normalize_lead_phone"),base.indexOf("create index leads_normalized_phone_active")));
  await db.exec(base.slice(base.indexOf("create or replace function public.queue_new_lead_alert"),base.indexOf("drop trigger queue_new_lead_alert")));
  await db.exec("create trigger queue_new_lead_alert after insert or update of owner_id,receipt_id on leads for each row execute function queue_new_lead_alert();");
  await db.exec(await readFile(new URL("../supabase/migrations/20261017140927_retain_returning_lead_owner.sql", import.meta.url),"utf8"));
  const ingest = async (connector, phone, note, email="test@example.com") => (await db.query("select * from ingest_external_lead($1,$2::jsonb)",[connector,JSON.stringify({customer_name:"Test",customer_phone:phone,email,source_note:note})])).rows[0];
  const first = await ingest(id(11),"0171234567","Original inquiry");
  await db.query("update leads set status='contacted',phone_revealed_at=now(),follow_up_count=3 where id=$1",[first.lead_id]);
  await db.query("insert into lead_notes(lead_id,author_id,body) values($1,$2,'Existing follow-up note')",[first.lead_id,id(1)]);
  await db.exec("update lead_ingest_windows set last_accepted_at=now()-interval '11 minutes'");
  const returning = await ingest(id(12),"+60 17-123 4567","Different incoming inquiry");
  assert.equal(returning.lead_id,first.lead_id); assert.equal(returning.duplicate,false);
  const lead = (await db.query("select * from leads where id=$1",[first.lead_id])).rows[0];
  assert.equal(lead.owner_id,id(1)); assert.equal(lead.status,"new"); assert.equal(lead.source_note,"Original inquiry");
  assert.equal(lead.follow_up_count,0); assert.equal(lead.phone_revealed_at,null); assert.equal(lead.has_ever_contacted,true); assert.equal(lead.return_count,1);
  const notes = (await db.query("select body from lead_notes where lead_id=$1",[first.lead_id])).rows.map(n=>n.body);
  assert.deepEqual(notes.sort(),["Existing follow-up note","Incoming inquiry: Different incoming inquiry"].sort());
  const recipients = (await db.query("select body->>'owner_id' as owner from net.requests")).rows;
  assert.deepEqual(recipients.map(r=>r.owner),[id(1),id(1)]);
  const event = (await db.query("select * from lead_events")).rows[0];
  assert.equal(event.actor_id,id(1)); assert.equal(event.previous_owner_id,id(1));
  const duplicate = await ingest(id(12),"60171234567","Should be throttled");
  assert.equal(duplicate.duplicate,true);
  assert.equal((await db.query("select count(*)::int as n from net.requests")).rows[0].n,2);
  await db.exec("update lead_ingest_windows set last_accepted_at=now()-interval '11 minutes'");
  const fresh = await ingest(id(12),"0189876543","Brand new inquiry","new@example.com");
  assert.notEqual(fresh.lead_id,first.lead_id);
  assert.equal((await db.query("select owner_id from leads where id=$1",[fresh.lead_id])).rows[0].owner_id,id(2));
  assert.equal((await db.query("select has_function_privilege('authenticated','ingest_external_lead(uuid,jsonb)','execute') as ok")).rows[0].ok,false);
  console.log("PASS: original owner retained across connectors; New/reset; original notes preserved; incoming inquiry archived; notification to old owner; 10-minute throttle; fresh lead routing; RPC access");
} finally { await db.close(); }
