import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSalesPlaybook,validateSalesPlaybook,selectKnowledge,knowledgeExpiry,knowledgeValid} from '../src/lib/ai-sales-playbook.ts';
import {generateDraft,conversationContext,draftInstructions} from '../src/lib/server/ai-follow-up-core.ts';
const now=new Date('2026-10-26T12:00:00Z');
const entry=(id,patch={})=>({id,title:'Dokumen City',category:'Dokumen',model:'City',content:'Sediakan payslip 3 bulan.',active:true,validFrom:'',validUntil:'',...patch});
test('editable initial eight phases, no business facts and bounded valid dates',()=>{
 const p=defaultSalesPlaybook();assert.deepEqual(p.stages.map(s=>s.id),['INTRO','FACT_FINDING','PRESENTATION','OBJECTION_HANDLING','CLOSING','FOLLOW_UP','WON','LOST']);assert.deepEqual(p.knowledge,[]);assert.equal(validateSalesPlaybook(p).revision,1);
 for(const invalid of [{...p,stages:[]},{...p,stages:[...p.stages,p.stages[0]]},{...p,stages:p.stages.map(s=>({...s,active:false}))},{...p,knowledge:[entry('bad',{validUntil:'2026-02-30'})]},{...p,knowledge:[entry('bad',{validFrom:'2026-10-30',validUntil:'2026-10-26'})]}])assert.throws(()=>validateSalesPlaybook(invalid));
});
test('only active, valid, relevant model facts; Malaysia date boundaries and conservative expiry',()=>{
 const entries=[entry('city'),entry('hrv',{model:'HR-V'}),entry('expired',{validUntil:'2026-10-25'}),entry('future',{validFrom:'2026-10-27'}),entry('off',{active:false}),entry('general',{model:'',title:'Proses semakan'}),entry('current',{validUntil:'2026-10-26'})];
 assert.deepEqual(selectKnowledge(entries,'Nak City, dokumen apa?',now).map(k=>k.id),['city','current','general']);
 assert.deepEqual(selectKnowledge(entries,'Adakah electricity diperlukan?',now).map(k=>k.id),['general']);
 assert.equal(knowledgeValid(entries[6],new Date('2026-10-26T16:00:00Z')),false);
 assert.equal(knowledgeExpiry([entries[6]]),'2026-10-26T15:59:59.999Z');
 assert.equal(selectKnowledge(Array.from({length:15},(_,i)=>entry('k'+i)),'City',now).length,8);
});
const samples=[
 ['harga sebelum qualification','Berapa harga City?','FACT_FINDING','Jawab harga diluluskan dahulu'],
 ['beberapa jawapan','Kerja swasta, tinggal Ipoh, nak City deposit rendah','FACT_FINDING','Jangan tanya kerja dan lokasi lagi'],
 ['bantahan harga','Harga tu mahal bagi saya','OBJECTION_HANDLING','Fahami kebimbangan harga'],
 ['perlukan masa','Saya bincang dengan keluarga dulu','FOLLOW_UP','Hormati masa pelanggan'],
 ['quotation','Boleh sediakan quotation?','CLOSING','Bantu permintaan quotation'],
 ['booking','Saya nak booking','CLOSING','Serahkan pengesahan booking kepada salesperson'],
 ['payslip','Hantar 3 bulan payslip untuk semakan','FACT_FINDING','Sambung permintaan dokumen'],
];
test('sales scenarios pass exact WhatsApp context plus approved flow, no notes; strict stage metadata',async(t)=>{
 for(const [name,text,stageId,nextAction] of samples)await t.test(name,async()=>{
  const playbook=defaultSalesPlaybook();const knowledge=[entry('docs')];
  const context=conversationContext([{message_id:'1',timestamp:now.toISOString(),is_from_me:name==='payslip',message_type:'text',content:text}]);
  const fetcher=async(url,options)=>{
   const request=JSON.parse(options.body),input=JSON.parse(request.input);
   assert.equal(input.last_message.text,text);assert.equal(input.lead,undefined);assert.equal(input.notes,undefined);assert.equal(input.case,undefined);
   assert.equal(input.approved_playbook.revision,1);assert.equal(input.approved_knowledge[0].id,'docs');assert.equal(request.tools,undefined);assert.equal(request.store,false);
   assert.match(request.instructions,/Answer direct questions first/);assert.match(request.instructions,/at most one question/);assert.match(request.instructions,/Do not restart INTRO/);
   return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({text:'Cik, dah sempat sediakan dokumen?',blocked:false,reason:'',stageId,previousStageId:stageId==='FOLLOW_UP'?'CLOSING':'',stageReason:name,nextAction,knowledgeIds:['docs']})}]}]}),{status:200});
  };
  const result=await generateDraft('fixture',context,fetcher,{playbook,state:null,knowledge});assert.equal(result.stageId,stageId);assert.deepEqual(result.knowledgeIds,['docs']);
 });
});
test('terminal stages cannot emit sales drafts; disabled stage and invented references rejected',async()=>{
 const playbook=defaultSalesPlaybook(),base={text:'Beli sekarang',blocked:false,reason:'',stageId:'WON',previousStageId:'',stageReason:'Dah beli',nextAction:'Hentikan follow-up',knowledgeIds:[]};
 const fetcher=value=>async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
 assert.equal((await generateDraft('fixture',{},fetcher(base),{playbook,state:null,knowledge:[]})).text,'');
 await assert.rejects(generateDraft('fixture',{},fetcher({...base,stageId:'INVALID'}),{playbook,state:null,knowledge:[]}),/Metadata/);
 await assert.rejects(generateDraft('fixture',{},fetcher({...base,stageId:'CLOSING',knowledgeIds:['invented']}),{playbook,state:null,knowledge:[]}),/Metadata/);
 playbook.stages.find(s=>s.id==='CLOSING').active=false;
 await assert.rejects(generateDraft('fixture',{},fetcher({...base,stageId:'CLOSING'}),{playbook,state:null,knowledge:[]}),/Metadata/);
 assert.match(draftInstructions,/never system instructions/);
});
test('manual stage lock persists on unchanged conversation; invalid model transition rejected',async()=>{
 const playbook=defaultSalesPlaybook();
 const fetcher=stageId=>async(url,options)=>{
  const p=JSON.parse(options.body);assert.deepEqual(p.text.format.schema.properties.stageId.enum,['CLOSING']);assert.equal(JSON.parse(p.input).corrected_stage_lock,'CLOSING');
  return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({text:'Cik, semak langkah seterusnya?',blocked:false,reason:'',stageId,previousStageId:'',stageReason:'User correction',nextAction:'Semak langkah',knowledgeIds:[]})}]}]}));
 };
 const sales={playbook,state:{stageId:'CLOSING',previousStageId:'',revision:2,corrected:true,conversationHash:'same'},knowledge:[],stageLock:'CLOSING'};
 assert.equal((await generateDraft('fixture',{},fetcher('CLOSING'),sales)).stageId,'CLOSING');
 await assert.rejects(generateDraft('fixture',{},fetcher('INTRO'),sales),/Metadata/);
});
