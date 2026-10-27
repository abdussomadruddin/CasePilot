import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import ts from 'typescript';
import { defaultSalesPlaybook } from '../src/lib/ai-sales-playbook.ts';
import { morningDay,morningCutoff,morningExpiry,draftPurpose } from '../src/lib/ai-morning-drafts.ts';
import { sealSecret } from '../src/lib/server/ai-follow-up-core.ts';
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',leadId='00000000-0000-0000-0000-000000000010';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';
process.env.AI_SETTINGS_ENCRYPTION_KEY=randomBytes(32).toString('base64');
let noHistory=false,optOut=false;
let role='customer_service',active=true,snapshot='snapshot-one',claimed=true,external=[],records=[],writes=0;
let book=defaultSalesPlaybook(),stageState=null,preference=null,workerJobs=[];
const config={id:true,revision:1,daily_limit:50,openai_secret:sealSecret('fixture-openai','openai'),murpati_secret:sealSecret('fixture-murpati','murpati')};
const devices=[{session_id:'sess_owner',user_id:owner,phone:'60177498085',name:'Owner'},{session_id:'sess_other',user_id:other,phone:'60111111111',name:'Other'}];
const lead={id:leadId,owner_id:owner,customer_name:'Fixture',customer_phone:'60173559147',whatsapp_username:null,car_brand:'Honda',car_model:'City',status:'new',source_note:'City',receipt_id:'receipt'};
function builder(table){
 let operation='read',payload,filters=[],notEqual=[],includes=[],take=Infinity;
 const b={
  select(){return b},eq(k,v){filters.push([k,v]);return b},is(){return b},order(){return b},limit(n){take=n;return b},in(k,v){includes.push([k,v]);return b},neq(k,v){notEqual.push([k,v]);return b},
  insert(v){operation='insert';payload=v;return b},update(v){operation='update';payload=v;return b},delete(){operation='delete';return b},upsert(v){operation='upsert';payload=v;return b},
  async single(){return execute(true)},async maybeSingle(){return execute(true)},then(resolve,reject){return execute(false).then(resolve,reject)}
 };
 async function execute(single){
  let rows=[];
  if(table==='profiles')rows=[{id:owner,role,active,full_name:'Fixture'}];
  if(table==='ai_follow_up_settings')rows=[config];
  if(table==='ai_sales_playbook')rows=[{id:true,...book}];
  if(table==='ai_sales_stage_state')rows=stageState?[stageState]:[];
  if(table==='ai_device_assignments')rows=devices;
  if(table==='ai_morning_preferences')rows=preference?[preference]:[];
  if(table==='ai_morning_jobs')rows=workerJobs;
  if(table==='leads')rows=[lead];
  if(table==='lead_notes')rows=[{body:'City, tidak perlu reka harga.'}];
  if(table==='ai_follow_up_drafts')rows=records;
  rows=rows.filter(row=>filters.every(([k,v])=>row[k]===v)&&notEqual.every(([k,v])=>row[k]!==v)&&includes.every(([k,v])=>v.includes(row[k]))).slice(0,take);
  if(operation==='insert'&&table==='ai_follow_up_drafts')records.push({...payload,ticket:'00000000-0000-0000-0000-000000000030',outcome:'generating',expires_at:new Date(Date.now()+900000).toISOString()});
  if(operation==='upsert'&&table==='ai_morning_preferences')preference=payload;
  if(operation==='update')for(const row of rows)Object.assign(row,payload);
  return {data:single?(rows[0]||null):rows,error:null};
 }
 return b;
}
const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},from:builder,rpc:async(name,p)=>{
 if(name==='save_ai_sales_playbook') { if(p.p_revision!==book.revision)return {data:null,error:{message:'conflict'}};book={revision:book.revision+1,rules:p.p_rules,stages:p.p_stages,knowledge:p.p_knowledge};return {data:book.revision,error:null}; }
 if(name==='save_ai_sales_stage') {if(p.p_revision!==(stageState?.revision||0))return {data:null,error:{message:'conflict'}};stageState={lead_id:p.p_lead,session_id:p.p_session,stage_id:p.p_stage,previous_stage_id:p.p_previous,revision:(stageState?.revision||0)+1,corrected:p.p_corrected,conversation_hash:p.p_hash};return {data:stageState.revision,error:null};}
 if(name==='authorize_ai_morning_worker')return {data:p.p_token==='fixture-worker',error:null};
 if(name==='claim_ai_morning_jobs')return {data:workerJobs.filter(j=>j.status==='running'),error:null};
 if(name==='ai_lead_snapshot')return {data:snapshot,error:null};
 if(name==='claim_ai_generation')return {data:claimed,error:null};
 if(name==='open_ai_follow_up'){writes++;const row=records.find(r=>r.id===p.p_draft_id);row.outcome='opened';return {data:0,error:null};}
 throw Error(name);
}};
globalThis.__aiApiFixture={createClient:()=>client,NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),{...init,headers:{...init?.headers,'Content-Type':'application/json'}})}};
let source=await readFile(new URL('../src/app/api/ai-follow-up/route.ts',import.meta.url),'utf8');
source=source.replace(/import \{ createClient, type SupabaseClient \} from "@supabase\/supabase-js";/,'const { createClient } = globalThis.__aiApiFixture; type SupabaseClient = any;')
 .replace(/import \{ NextRequest, NextResponse \} from "next\/server";/,'const { NextResponse } = globalThis.__aiApiFixture; type NextRequest = any;')
 .replace(/import \{ getSupabaseUrl \} from "@\/lib\/supabase";/,'const getSupabaseUrl = () => "https://fixture.supabase.co";')
 .replaceAll('"@/lib/whatsapp-contact"',JSON.stringify(new URL('../src/lib/whatsapp-contact.ts',import.meta.url).href))
 .replaceAll('"@/lib/follow-up-whatsapp"',JSON.stringify(new URL('../src/lib/follow-up-whatsapp.ts',import.meta.url).href))
 .replaceAll('"@/lib/ai-morning-drafts"',JSON.stringify(new URL('../src/lib/ai-morning-drafts.ts',import.meta.url).href))
 .replaceAll('"@/lib/ai-sales-playbook"',JSON.stringify(new URL('../src/lib/ai-sales-playbook.ts',import.meta.url).href))
 .replaceAll('"@/lib/server/ai-follow-up-core"',JSON.stringify(new URL('../src/lib/server/ai-follow-up-core.ts',import.meta.url).href));
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const api=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);external.push({host:u.host,path:u.pathname,method:options.method||'GET'});
 let body;
 if(u.host==='api.murpati.com'){
  assert.equal(options.method,'GET');assert.ok(['/v1/sessions','/v1/messages','/v1/chats'].includes(u.pathname));
  body=u.pathname==='/v1/sessions'?{success:true,sessions:devices.map(d=>({session_id:d.session_id,phone_number:d.phone,device_name:d.name,status:'connected',pipeline:'unofficial'}))}:u.pathname==='/v1/chats'?{success:true,total_count:1,has_more:false,chats:[{chat_jid:'60173559147@c.us',chat_type:'dm'}]}:noHistory?{success:true,total_count:0,messages:[],has_more:false}:{success:true,total_count:1,has_more:false,messages:[{message_id:'m1',timestamp:new Date().toISOString().slice(0,10)+'T00:00:00Z',is_from_me:!optOut,message_type:'text',content:optOut?'Tolong jangan hubungi saya lagi':'Untuk semakan kelayakan, hantar 3 bulan latest payslip'}]};
 }else{
  assert.equal(u.host,'api.openai.com');
  const prompt=JSON.parse(options.body); const context=JSON.parse(prompt.input); assert.equal(context.lead,undefined); assert.equal(context.case,undefined); assert.ok(context.approved_playbook.stages.length>=8); assert.equal(context.previous_state?.stage_id,undefined); assert.match(context.last_message.text,/payslip/);
  body={status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({text:'Cik, dah sempat sediakan payslip?',blocked:false,reason:'',stageId:'FACT_FINDING',previousStageId:'',stageReason:'Permintaan terakhir ialah payslip',nextAction:'Semak kesediaan dokumen',knowledgeIds:[]})}]}]};
 }
 return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
};
async function get(action,auth=true){const req=new Request('http://localhost/api/ai-follow-up?action='+action,{headers:auth?{Authorization:'Bearer fixture'}:{}});req.nextUrl=new URL(req.url);return api.GET(req);}
async function post(payload){return api.POST(new Request('http://localhost/api/ai-follow-up',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(payload)}));}
test('API access and read-only Murpati contract',async(t)=>{
 try{
 await t.test('anonymous, Sales Manager and inactive accounts denied',async()=>{
  assert.equal((await get('settings',false)).status,401);
  for(const denied of ['sales_manager','finance','caller','operator']){role=denied;assert.equal((await get('settings')).status,403);}
  role='customer_service';active=false;assert.equal((await get('settings')).status,403);active=true;
 });
 await t.test('CS gets assigned device only, no secrets, cannot change keys or assignments',async()=>{
  const response=await get('settings'),body=await response.json();
  assert.equal(body.devices.length,1);assert.equal(body.devices[0].sessionId,'sess_owner');
  assert.equal(body.members,undefined);assert.ok(!JSON.stringify(body).includes(config.openai_secret));assert.ok(!JSON.stringify(body).includes('fixture-openai'));
  assert.equal((await post({action:'save_settings',revision:1,dailyLimit:50})).status,403);
  assert.equal((await post({action:'assign',sessionId:'sess_other',userId:owner})).status,403);
 });
 await t.test('other lead or unassigned device rejected before external calls',async()=>{
  external=[];lead.owner_id=other;
  assert.equal((await post({action:'draft',leadId,sessionId:'sess_owner'})).status,403);lead.owner_id=owner;
  assert.equal((await post({action:'draft',leadId,sessionId:'sess_other'})).status,403);assert.equal(external.length,0);
 });
 await t.test('empty conversation blocks before OpenAI; notes are never fallback',async()=>{
  noHistory=true;external=[];
  try { const res=await post({action:'draft',leadId,sessionId:'sess_owner',provider:'openai'}); assert.equal(res.status,409);assert.match((await res.json()).error,/Draf tidak dibuat daripada nota/);assert.ok(external.every(c=>c.host!=='api.openai.com')); }
  finally {noHistory=false;records=[];}
 });
 await t.test('manual Murpati works without OpenAI key and never calls OpenAI',async()=>{
  const saved=config.openai_secret;config.openai_secret=null;external=[];
  try {
   const res=await post({action:'draft',leadId,sessionId:'sess_owner',provider:'murpati_manual'});
   assert.equal(res.status,200);const draft=await res.json();
   assert.equal(draft.provider,'murpati_manual');assert.equal(draft.text,'');assert.equal(writes,0);
   assert.ok(external.every(c=>c.host==='api.murpati.com'&&c.method==='GET'));
   assert.equal((await post({action:'draft',leadId,sessionId:'sess_owner',provider:'openai'})).status,409);
   assert.equal((await post({action:'draft',leadId,sessionId:'sess_owner',provider:'unknown'})).status,400);
  } finally {config.openai_secret=saved;records=[];}
 });
 await t.test('playbook Admin writes only, CAS conflict retains stored data; correction checks owner/device',async()=>{
  assert.equal((await get('sales_playbook')).status,200);
  assert.equal((await post({action:'save_playbook',playbook:book})).status,403);
  external=[];assert.equal((await post({action:'correct_stage',leadId,sessionId:'sess_other',stageId:'CLOSING',revision:0,bookRevision:book.revision})).status,403);assert.equal(external.length,0);
  role='admin';const prior=structuredClone(book);
  assert.equal((await post({action:'save_playbook',playbook:prior})).status,200);
  assert.equal((await post({action:'save_playbook',playbook:prior})).status,409);
  assert.equal((await post({action:'save_playbook',playbook:{...book,stages:[]}})).status,400);
  role='customer_service';
  assert.equal((await post({action:'correct_stage',leadId,sessionId:'sess_owner',stageId:'CLOSING',revision:0,bookRevision:book.revision})).status,200);
  assert.equal((await post({action:'correct_stage',leadId,sessionId:'sess_owner',stageId:'INTRO',revision:0,bookRevision:book.revision})).status,409);
  assert.equal(stageState.stage_id,'CLOSING');
  assert.equal((await post({action:'correct_stage',leadId,sessionId:'sess_owner',stageId:'FOLLOW_UP',revision:1,bookRevision:book.revision})).status,200);
  assert.equal(stageState.previous_stage_id,'CLOSING');
  assert.equal((await post({action:'correct_stage',leadId,sessionId:'sess_owner',stageId:'OBJECTION_HANDLING',revision:2,bookRevision:book.revision})).status,200);
  assert.equal(stageState.previous_stage_id,'CLOSING');stageState=null;
 });
 await t.test('one cross-server generation using WhatsApp context; no contact writes until handoff',async()=>{
  claimed=false;assert.equal((await post({action:'draft',leadId,sessionId:'sess_owner'})).status,429);claimed=true;
  const res=await post({action:'draft',leadId,sessionId:'sess_owner'});assert.equal(res.status,200);
  const draft=await res.json();assert.equal(draft.source,'conversation');assert.equal(writes,0);assert.equal(records[0].outcome,'ready');assert.equal(records[0].text,undefined);
  snapshot='changed';assert.equal((await post({action:'handoff',id:draft.id,text:draft.text})).status,409);assert.equal(writes,0);snapshot='snapshot-one';
  const savedBookRevision=book.revision;book.revision++;
  assert.equal((await post({action:'handoff',id:draft.id,text:draft.text})).status,409);book.revision=savedBookRevision;
  const savedStageRevision=stageState.revision;stageState.revision++;
  assert.equal((await post({action:'handoff',id:draft.id,text:draft.text})).status,409);stageState.revision=savedStageRevision;
  const handoff=await post({action:'handoff',id:draft.id,text:'Draf disunting'});assert.equal(handoff.status,200);
  const body=await handoff.json();assert.equal(body.url,'https://wa.me/60173559147?text=Draf%20disunting');assert.equal(writes,1);
  assert.equal(external.filter(c=>c.host==='api.murpati.com'&&c.method!=='GET').length,0);
 });
 await t.test('WON/LOST and opt-out prevent generation and handoff',async()=>{
  records=[];external=[];stageState={lead_id:leadId,session_id:'sess_owner',stage_id:'WON',previous_stage_id:'',revision:5,corrected:true,conversation_hash:''};
  const response=await post({action:'draft',leadId,sessionId:'sess_owner'});assert.equal(response.status,200);const draft=await response.json();assert.equal(draft.blocked,true);assert.equal(draft.text,'');assert.ok(!external.some(c=>c.host==='api.openai.com'));
  assert.equal((await post({action:'handoff',id:draft.id,text:'Beli lagi'})).status,409);stageState=null;
  optOut=true;external=[];
  try {const response=await post({action:'draft',leadId,sessionId:'sess_owner'});assert.equal(response.status,200);const body=await response.json();assert.equal(body.blocked,true);assert.equal(body.text,'');assert.match(body.reason,/tidak dihubungi/);assert.ok(!external.some(c=>c.host==='api.openai.com'));assert.equal((await post({action:'handoff',id:body.id,text:'Follow-up'})).status,409);}finally{optOut=false;}
 });
 await t.test('prepared ciphertext is owner/device/date scoped and stale versions never returned; cache retrieval uses no provider tokens',async()=>{
  records=[];stageState=null;lead.status='contacted';lead.follow_up_count=0;lead.follow_up_activity_at=new Date(morningCutoff().getTime()-86400000-60000).toISOString();
  const id='00000000-0000-0000-0000-000000000055',payload={id,text:'Draf pagi',blocked:false,provider:'openai',preparedAt:new Date().toISOString()};
  records.push({id,user_id:owner,lead_id:leadId,session_id:'sess_owner',phone:devices[0].phone,recipient_phone:lead.customer_phone,recipient_username:'',prepared_for:morningDay(),outcome:'ready',revision:config.revision,playbook_revision:book.revision,stage_revision:0,snapshot,expires_at:morningExpiry(),cached_payload:sealSecret(JSON.stringify(payload),draftPurpose(owner,id))});
  async function cached(session='sess_owner'){const req=new Request('http://localhost/api/ai-follow-up?action=prepared&leadId='+leadId+'&sessionId='+session,{headers:{Authorization:'Bearer fixture'}});req.nextUrl=new URL(req.url);return api.GET(req);}
  external=[];let response=await cached();assert.equal(response.status,200);assert.equal((await response.json()).draft.text,'Draf pagi');assert.equal(external.length,0);assert.ok(!records[0].cached_payload.includes('Draf pagi'));
  assert.equal((await cached('sess_other')).status,403);
  book.revision++;assert.equal((await (await cached()).json()).draft,null);book.revision--;
  snapshot='new context';assert.equal((await (await cached()).json()).draft,null);snapshot='snapshot-one';
  lead.customer_phone='60199999999';assert.equal((await (await cached()).json()).draft,null);lead.customer_phone='60173559147';
  records[0].prepared_for='2020-01-01';assert.equal((await (await cached()).json()).draft,null);records=[];
 });
 await t.test('morning worker prepares encrypted drafts, reuses cache and skips disabled owners',async()=>{
  const NativeDate=globalThis.Date,fixed=NativeDate.parse('2026-10-28T01:00:00Z');
  globalThis.Date=class extends NativeDate { constructor(...args){super(...(args.length?args:[fixed]));} static now(){return fixed;} };
  try {
   records=[];stageState=null;preference=null;external=[];
   lead.status='contacted';lead.follow_up_count=0;lead.follow_up_activity_at='2026-10-27T01:30:00Z';
   const job={id:'job-one',user_id:owner,lead_id:leadId,session_id:'sess_owner',batch_day:morningDay(),attempts:1,lease_id:'lease-one',status:'running'};
   workerJobs=[job];
   const run=()=>api.POST(new Request('http://localhost/api/ai-follow-up',{method:'POST',headers:{'x-casepilot-ai-worker':'fixture-worker'},body:'{}'}));
   const beforeWrites=writes;
   let response=await run();assert.equal(response.status,200);assert.equal((await response.json()).ready,1);
   assert.equal(job.status,'ready');assert.ok(records[0].cached_payload);assert.ok(!records[0].cached_payload.includes('payslip'));assert.equal(writes,beforeWrites);assert.equal(lead.follow_up_count,0);
   const calls=external.length;job.status='running';response=await run();assert.equal((await response.json()).ready,1);assert.equal(external.length,calls);
   active=false;job.status='running';await run();assert.equal(job.status,'skipped');assert.equal(external.length,calls);active=true;
   records=[];stageState=null;claimed=false;job.status='running';await run();assert.equal(job.status,'queued');
   job.status='running';job.attempts=3;await run();assert.equal(job.status,'failed');claimed=true;
  } finally {globalThis.Date=NativeDate;active=true;claimed=true;workerJobs=[];records=[];stageState=null;}
 });
 await t.test('morning preference cannot choose another user device; worker rejects forged credentials',async()=>{
  assert.equal((await post({action:'morning_preference',enabled:true,sessionId:'sess_other'})).status,403);
  assert.equal((await post({action:'morning_preference',enabled:true,sessionId:'sess_owner'})).status,200);
  assert.equal(preference.session_id,'sess_owner');
  for(const token of ['','wrong']){const response=await api.POST(new Request('http://localhost/api/ai-follow-up',{method:'POST',headers:{'Content-Type':'application/json','x-casepilot-ai-worker':token},body:'{}'}));assert.equal(response.status,401);}
 });
 }finally{globalThis.fetch=originalFetch;}
});
