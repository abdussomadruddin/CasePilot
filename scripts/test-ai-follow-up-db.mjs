import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const owner='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002', admin='00000000-0000-0000-0000-000000000003', manager='00000000-0000-0000-0000-000000000004';
let db;
test('transactional AI follow-up permissions, idempotency and existing 4/6 rules', async (t) => {
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,role text,active boolean default true);
 insert into profiles values ('${owner}','customer_service',true),('${other}','broker',true),('${admin}','admin',true),('${manager}','sales_manager',true);
 create table leads(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles(id),customer_name text,customer_phone text,car_brand text,car_model text,status text default 'new',phone_revealed_at timestamptz,follow_up_activity_at timestamptz,follow_up_count integer default 0,receipt_id uuid default gen_random_uuid(),deleted_at timestamptz,updated_at timestamptz default now());
 create table lead_notes(id uuid primary key default gen_random_uuid(),lead_id uuid references leads(id),body text,created_at timestamptz default now());
 create table cases(id uuid primary key default gen_random_uuid(),lead_id uuid references leads(id),owner_id uuid,status text,remark text,car_model text,updated_at timestamptz default now(),deleted_at timestamptz);
 create table lead_events(id uuid primary key default gen_random_uuid(),lead_id uuid,actor_id uuid,status text,created_at timestamptz default now());
 create table lead_follow_up_actions(id uuid primary key default gen_random_uuid(),lead_id uuid,actor_id uuid,follow_up_number integer,created_at timestamptz default now());
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20261018155202_lead_whatsapp_username.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261026055750_ai_follow_up.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261026120314_ai_sales_playbook.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261027163001_ai_morning_drafts.sql',import.meta.url),'utf8'));
 await db.exec(`insert into ai_follow_up_settings(id) values(true); insert into ai_device_assignments values ('sess_owner','${owner}','60123456789','CS',now()),('sess_admin','${admin}','60123456780','Admin',now());`);
 async function lead(status='new',count=0) {
   const id=randomUUID(); await db.query(`insert into leads(id,owner_id,customer_phone,status,follow_up_count,phone_revealed_at) values($1,$2,'60173559147',$3,$4,case when $3='new' then null else now() end)`,[id,owner,status,count]); return id;
 }
 async function draft(leadId,user=owner,session='sess_owner') {
   const id=randomUUID(),ticket=randomUUID();
   await db.query(`insert into ai_follow_up_drafts(id,user_id,lead_id,session_id,phone,revision,snapshot,ticket,outcome,recipient_phone,playbook_revision) values($1,$2,$3,$4,$5,1,ai_lead_snapshot($3),$6,'ready','60173559147',(select revision from ai_sales_playbook where id))`,[id,user,leadId,session,session==='sess_admin'?'60123456780':'60123456789',ticket]); return {id,ticket};
 }
 async function open(d,user=owner) {
   await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);
   try { return (await db.query('select open_ai_follow_up($1,$2) as count',[d.id,d.ticket])).rows[0].count; }
   finally { await db.exec('reset role'); }
 }
 await t.test('playbook and stage CAS are server-only; stale drafts and expired facts cannot hand off',async()=>{
  const id=await lead('contacted'),d=await draft(id);
  const b=(await db.query('select revision from ai_sales_playbook')).rows[0].revision;
  await assert.rejects(db.query("select save_ai_sales_playbook($1,$2,'rules','[]'::jsonb,'[]'::jsonb)",[owner,b]));
  await db.query("select save_ai_sales_playbook($1,$2,'Updated rules',stages,knowledge) from ai_sales_playbook",[admin,b]);
  await assert.rejects(db.query("select save_ai_sales_playbook($1,$2,'Old rules',stages,knowledge) from ai_sales_playbook",[admin,b]));
  await assert.rejects(open(d));
  const fresh=await draft(id);await db.query("update ai_follow_up_drafts set knowledge_expires_at=now()-interval '1 second' where id=$1",[fresh.id]);await assert.rejects(open(fresh));
  const current=(await db.query('select revision from ai_sales_playbook')).rows[0].revision;
  const args=[owner,id,'sess_owner',0,current,'FACT_FINDING','',true,'hash'];
  await db.query('select save_ai_sales_stage($1,$2,$3,$4,$5,$6,$7,$8,$9)',args);
  await assert.rejects(db.query('select save_ai_sales_stage($1,$2,$3,$4,$5,$6,$7,$8,$9)',args));
  await assert.rejects(db.query('select save_ai_sales_stage($1,$2,$3,$4,$5,$6,$7,$8,$9)',[other,id,'sess_owner',1,current,'CLOSING','',true,'hash']));
  const staged=await draft(id);await db.query('update ai_follow_up_drafts set stage_revision=1 where id=$1',[staged.id]);
  await db.query('select save_ai_sales_stage($1,$2,$3,$4,$5,$6,$7,$8,$9)',[owner,id,'sess_owner',1,current,'WON','',true,'hash']);await assert.rejects(open(staged));
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{await assert.rejects(db.query('select * from ai_sales_playbook'));await assert.rejects(db.query('select * from ai_sales_stage_state'));await assert.rejects(db.query('select open_ai_follow_up_base($1,$2)',[staged.id,staged.ticket]));}finally{await db.exec('reset role');}}
 });
 await t.test('new lead: draft unchanged, handoff Contacted, count zero, retry exactly once',async()=>{
  const id=await lead(),d=await draft(id);
  assert.equal((await db.query('select status from leads where id=$1',[id])).rows[0].status,'new');
  assert.equal(await open(d),0); assert.equal(await open(d),0);
  assert.equal((await db.query('select status from leads where id=$1',[id])).rows[0].status,'contacted');
  assert.equal((await db.query('select count(*)::int as n from lead_events where lead_id=$1',[id])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from ai_follow_up_drafts where lead_id=$1 and opened_at is not null',[id])).rows[0].n,1);
 });
 await t.test('fourth follow-up moves status; six is capped but still opens',async()=>{
  const id=await lead('contacted',3); assert.equal(await open(await draft(id)),4);
  assert.equal((await db.query('select status from leads where id=$1',[id])).rows[0].status,'all_offer_presented');
  assert.equal(await open(await draft(id)),5); assert.equal(await open(await draft(id)),6); assert.equal(await open(await draft(id)),6);
  assert.equal((await db.query('select count(*)::int as n from lead_follow_up_actions where lead_id=$1',[id])).rows[0].n,3);
 });
 await t.test('other user, sales manager and forged ticket denied; Admin uses own device',async()=>{
  const id=await lead(),d=await draft(id);
  await assert.rejects(open(d,other)); await assert.rejects(open(d,manager));
  await assert.rejects(open({...d,ticket:randomUUID()}));
  assert.equal(await open(await draft(id,admin,'sess_admin'),admin),0);
 });
 await t.test('no client role can read encrypted secrets or insert its own draft',async()=>{
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   try { await assert.rejects(db.query('select * from ai_follow_up_settings')); await assert.rejects(db.query('select * from ai_follow_up_drafts')); await assert.rejects(db.query("insert into ai_device_assignments values('evil',null,'','',now())")); }
   finally { await db.exec('reset role'); }
  }
 });
 await t.test('changed notes, case, recipient, receipt, assignment, config and expired draft rejected',async()=>{
  for(const change of ['note','case','recipient','receipt','assignment','config','expiry']) {
   const id=await lead('contacted'),d=await draft(id);
   if(change==='note') await db.query("insert into lead_notes(lead_id,body) values($1,'changed')",[id]);
   if(change==='case') await db.query("insert into cases(lead_id,remark) values($1,'changed')",[id]);
   if(change==='recipient') await db.query("update leads set customer_phone='60111111111' where id=$1",[id]);
   if(change==='receipt') await db.query('update leads set receipt_id=gen_random_uuid() where id=$1',[id]);
   if(change==='assignment') await db.exec(`update ai_device_assignments set user_id='${other}' where session_id='sess_owner'`);
   if(change==='config') await db.exec('update ai_follow_up_settings set revision=2');
   if(change==='expiry') await db.query("update ai_follow_up_drafts set expires_at=now()-interval '1 minute' where id=$1",[d.id]);
   await assert.rejects(open(d),change);
   assert.equal((await db.query('select follow_up_count from leads where id=$1',[id])).rows[0].follow_up_count,0);
   await db.exec(`update ai_device_assignments set user_id='${owner}' where session_id='sess_owner'; update ai_follow_up_settings set revision=1`);
  }
 });
 await t.test('one generation lease across servers, invalidation and daily cap',async()=>{
  assert.equal((await db.query('select claim_ai_generation($1,$2) as ok',[owner,randomUUID()])).rows[0].ok,true);
  assert.equal((await db.query('select claim_ai_generation($1,$2) as ok',[owner,randomUUID()])).rows[0].ok,false);
  await db.exec('delete from ai_generation_locks; update ai_follow_up_settings set daily_limit=1');
  await assert.rejects(db.query('select claim_ai_generation($1,$2)',[owner,randomUUID()]),/Had harian/);
 });
 await t.test('morning queue is daily/idempotent, uses 9:30 cutoff and only own unambiguous device, bounds leases/retries and does not contact leads',async()=>{
  await db.exec("delete from ai_generation_locks;update ai_follow_up_settings set daily_limit=50,openai_secret='fixture',murpati_secret='fixture'");
  const day='2026-10-28',at=day+'T00:30:00Z';
  const a=await lead('contacted'),b=await lead('contacted'),later=await lead('contacted'),capped=await lead('contacted',4);
  await db.query("update leads set follow_up_activity_at='2026-10-27T01:30:00Z' where id=any($1::uuid[])",[[a,b,capped]]);
  await db.query("update leads set follow_up_activity_at='2026-10-27T01:30:01Z' where id=$1",[later]);
  assert.equal((await db.query('select enqueue_ai_morning_jobs($1) as n',[day+'T00:29:00Z'])).rows[0].n,0);
  assert.equal((await db.query('select enqueue_ai_morning_jobs($1) as n',[at])).rows[0].n,2);
  assert.equal((await db.query('select enqueue_ai_morning_jobs($1) as n',[at])).rows[0].n,0);
  await db.query('update ai_morning_jobs set next_attempt_at=$1',[at]);
  let jobs=(await db.query('select * from claim_ai_morning_jobs($1)',[at])).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].attempts,1);
  assert.equal((await db.query('select * from claim_ai_morning_jobs($1)',[at])).rows.length,0);
  await db.query("update ai_morning_jobs set lease_until=$1 where status='running'",[at]);
  await db.query("update ai_morning_jobs set next_attempt_at='2026-10-29' where id<>$1",[jobs[0].id]);
  jobs=(await db.query('select * from claim_ai_morning_jobs($1)',[at])).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].attempts,2);
  await db.exec("update ai_morning_jobs set status='running',attempts=3,lease_until='2026-10-28T00:00:00Z'");
  await db.query('select * from claim_ai_morning_jobs($1)',[at]);assert.equal((await db.query("select count(*)::int n from ai_morning_jobs where status='failed'")).rows[0].n,2);
  assert.equal((await db.query('select follow_up_count from leads where id=$1',[a])).rows[0].follow_up_count,0);
  assert.equal((await db.query("select count(*)::int n from lead_follow_up_actions where lead_id=any($1::uuid[])",[[a,b]])).rows[0].n,0);
  const d1=await draft(a),d2=await draft(b);await db.query("update ai_follow_up_drafts set cached_payload='encrypted' where id=any($1::uuid[])",[[d1.id,d2.id]]);
  await db.exec('delete from ai_generation_locks');await db.query('select claim_ai_generation($1,$2)',[owner,randomUUID()]);
  assert.equal((await db.query("select count(*)::int n from ai_follow_up_drafts where id=any($1::uuid[]) and outcome='ready'",[[d1.id,d2.id]])).rows[0].n,2);
  await open(d1);assert.equal((await db.query('select cached_payload from ai_follow_up_drafts where id=$1',[d1.id])).rows[0].cached_payload,null);
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{await assert.rejects(db.query('select * from ai_morning_jobs'));await assert.rejects(db.query('select * from ai_morning_preferences'));await assert.rejects(db.query('select claim_ai_morning_jobs()'));}finally{await db.exec('reset role');}}
 });
 await db.close();
});
