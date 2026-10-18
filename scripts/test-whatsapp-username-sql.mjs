import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '/tmp/casepilot-sql-tests/node_modules/@electric-sql/pglite/dist/index.js');
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table leads(id uuid primary key,owner_id uuid,status text default 'new',customer_phone text,phone_revealed_at timestamptz,follow_up_count integer default 0,deleted_at timestamptz,follow_up_activity_at timestamptz);
 create table lead_events(lead_id uuid,actor_id uuid,status text);
 create table lead_follow_up_actions(lead_id uuid,actor_id uuid,follow_up_number integer,unique(lead_id,follow_up_number));`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261018155202_lead_whatsapp_username.sql',import.meta.url),'utf8'));
 const id='22222222-2222-4222-8222-222222222222', owner='11111111-1111-4111-8111-111111111111';
 await db.query("insert into leads(id,owner_id,whatsapp_username) values($1,$2,'irfan_faris')",[id,owner]);
 await db.exec(`set request.jwt.claim.sub='${owner}'`);
 await db.query('select contact_lead($1)',[id]); await db.query('select contact_lead($1)',[id]);
 assert.equal((await db.query('select count(*)::int as n from lead_events')).rows[0].n,1);
 assert.equal((await db.query('select status,customer_phone from leads')).rows[0].status,'contacted');
 assert.equal((await db.query('select customer_phone from leads')).rows[0].customer_phone,null);
 for(let n=1;n<=6;n++) {assert.equal((await db.query('select record_lead_follow_up($1) as n',[id])).rows[0].n,n); if(n>=4) assert.equal((await db.query('select status from leads')).rows[0].status,'all_offer_presented');}
 await assert.rejects(db.query('select record_lead_follow_up($1)',[id]),/Maximum 6/);
 for(const username of ['@irfan','a','12345','BAD','bad name','a..b']) await assert.rejects(db.query('update leads set whatsapp_username=$1',[username]),/constraint/);
 // A history insert failure must roll the contact transition back.
 await db.exec("update leads set status='new',phone_revealed_at=null; alter table lead_events add constraint reject_contact check(status <> 'contacted') not valid;");
 await assert.rejects(db.query('select contact_lead($1)',[id]),/constraint/);
 assert.equal((await db.query('select status from leads')).rows[0].status,'new');
 console.log('PASS: username persistence, atomic contact retry/history failure, phone stays null, follow-up 1–6 and validation');
} finally {await db.close();}
