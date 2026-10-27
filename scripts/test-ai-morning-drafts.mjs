import test from 'node:test';
import assert from 'node:assert/strict';
import {morningDay,morningExpiry,morningCutoff,morningEligible,morningWindow,draftPurpose} from '../src/lib/ai-morning-drafts.ts';
import {sealSecret,openSecret} from '../src/lib/server/ai-follow-up-core.ts';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
test('Malaysia morning preparation is 08:30 for 09:30 due, not midnight UTC or later leads',()=>{
 assert.equal(morningDay(new Date('2026-10-27T16:00:00Z')),'2026-10-28');
 assert.equal(morningCutoff('2026-10-28').toISOString(),'2026-10-28T01:30:00.000Z');
 assert.equal(morningExpiry('2026-10-28'),'2026-10-28T15:59:59.999Z');
 assert.equal(morningWindow(new Date('2026-10-28T00:29:59Z')),false);
 assert.equal(morningWindow(new Date('2026-10-28T00:30:00Z')),true);
 assert.equal(morningWindow(new Date('2026-10-28T04:00:00Z')),false);
 const l={owner_id:'a',status:'contacted',follow_up_count:3,follow_up_activity_at:'2026-10-27T01:30:00Z'};
 assert.equal(morningEligible(l,'a','2026-10-28'),true);
 for(const bad of [{...l,status:'new'},{...l,status:'rejected'},{...l,follow_up_count:4},{...l,owner_id:'b'},{...l,deleted_at:'now'},{...l,follow_up_activity_at:'2026-10-27T01:30:01Z'}])assert.equal(morningEligible(bad,'a','2026-10-28'),false);
});
test('cached draft ciphertext is bound to both owner and draft id',()=>{
 process.env.AI_SETTINGS_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 const text='Draf sulit sementara',sealed=sealSecret(text,draftPurpose('owner','one'));
 assert.ok(!sealed.includes(text));assert.equal(openSecret(sealed,draftPurpose('owner','one')),text);
 assert.throws(()=>openSecret(sealed,draftPurpose('other','one')));
 assert.throws(()=>openSecret(sealed,draftPurpose('owner','two')));
});
test('scheduler only dispatches protected worker in morning, does not alter reminder schedules or expose service key',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261027163043_ai_morning_drafts.sql',import.meta.url),'utf8');
 assert.match(sql,/time '08:30'/);assert.match(sql,/time '12:00'/);assert.match(sql,/vault\.create_secret/);assert.match(sql,/authorize_ai_morning_worker/);assert.match(sql,/x-casepilot-ai-worker/);
 assert.ok(!sql.includes('SUPABASE_SERVICE_ROLE_KEY'));assert.ok(!sql.includes('cron.unschedule'));assert.ok(!sql.includes('send_message'));assert.ok(!sql.includes('approve_followup'));
});
