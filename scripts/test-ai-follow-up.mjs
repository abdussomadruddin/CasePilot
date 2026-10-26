import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sealSecret, openSecret, latestMessages, resolveChatJid, conversationContext, generateDraft, optedOut, redactContext, normalizedPhone } from '../src/lib/server/ai-follow-up-core.ts';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
test('encrypted credentials require server master key, purpose and authentication tag', () => {
  process.env.AI_SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const cipher = sealSecret('fixture-credential', 'openai');
  assert.ok(!cipher.includes('fixture-credential'));
  assert.equal(openSecret(cipher, 'openai'), 'fixture-credential');
  assert.throws(() => openSecret(cipher, 'murpati'));
  const parts = cipher.split('.'); parts[2] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => openSecret(parts.join('.'), 'openai'));
  delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
  assert.throws(() => sealSecret('fixture', 'openai'), /keselamatan/);
});
const chatPage = { success:true, total_count:1,has_more:false,chats:[{chat_jid:'60123456789@c.us',chat_type:'dm',name:'Unrelated display name'}] };
test('oldest-first API selects last 100 messages with frozen date range and exact phone JID', async () => {
  const calls = [];
  const messages = Array.from({ length: 100 }, (_, i) => ({ message_id: String(i + 150), timestamp: '2026-10-25T12:00:00Z', is_from_me: false, message_type: 'text', content: 'hello', media_url: 'secret-url' }));
  const fetcher = async (url, options) => {
    calls.push(new URL(url)); assert.equal(options.method, 'GET'); assert.equal(options.cache, 'no-store');
    if (new URL(url).pathname === '/v1/chats') return response(chatPage);
    return response(calls.length === 2 ? { success: true, total_count: 250 } : { success: true, total_count: 250, has_more: false, messages });
  };
  const result = await latestMessages('fixture', 'sess_fixture', '60123456789', new Date('2026-10-26T00:00:00Z'), fetcher);
  assert.equal(calls[2].searchParams.get('offset'), '150');
  assert.equal(calls[2].searchParams.get('chat_jid'), '60123456789@c.us');
  assert.equal(calls[1].searchParams.get('to'), calls[2].searchParams.get('to'));
  assert.equal(result.length, 100); assert.equal(result[0].media_url, undefined);
});
test('network/permission/quota/malformed history never turns into no-conversation fallback', async () => {
  await assert.rejects(latestMessages('fixture','sess_fixture','60123456789',new Date(),async () => { throw Error('network'); }), /tidak dapat/);
  await assert.rejects(latestMessages('fixture','sess_fixture','60123456789',new Date(),async () => response({},403)), /Credential/);
  await assert.rejects(latestMessages('fixture','sess_fixture','60123456789',new Date(),async () => response({},429)), /Had API/);
  await assert.rejects(latestMessages('fixture','sess_fixture','60123456789',new Date(),async () => response({ success:true })), /Format senarai chat/);
  assert.deepEqual(await latestMessages('fixture','sess_fixture','',new Date(),async () => { throw Error('must not read username as a phone'); }), []);
});
test('no chat is explicit; inconsistent pages rejected', async () => {
  assert.deepEqual(await latestMessages('fixture','sess_fixture','60123456789',new Date(),async () => response({ success:true,total_count:0,chats:[],has_more:false })),[]);
  let n=0;
  await assert.rejects(latestMessages('fixture','sess_fixture','60123456789',new Date(),async (url) => response(new URL(url).pathname === '/v1/chats' ? chatPage : ++n===1 ? {success:true,total_count:2} : {success:true,total_count:3,messages:[]})), /berubah/);
});
test('draft generation sends no tools, no persistence, safe schema and bounded output', async () => {
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store,false); assert.equal(body.tools,undefined); assert.equal(body.model,'gpt-6-luna'); assert.equal(body.reasoning.effort,'none'); assert.equal(body.text.format.strict,true);
    return response({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({text:'Salam, saya kongsikan perkembangan terkini.',blocked:false,reason:'',stageId:'FACT_FINDING',previousStageId:'',stageReason:'Semakan dokumen',nextAction:'Minta dokumen',knowledgeIds:[]})}]}]});
  };
  assert.equal((await generateDraft('fixture',{conversation:[{from:'adviser',text:'Hantar payslip'}]},fetcher)).blocked,false);
  await assert.rejects(generateDraft('fixture',{},async () => response({status:'incomplete'})), /tidak lengkap/);
  await assert.rejects(generateDraft('fixture',{},async () => response({},401)), /API key/);
  await assert.rejects(generateDraft('fixture',{},async () => response({},429)), /Kuota/);
});
test('opt out, identity redaction and phone normalisation', () => {
  assert.equal(optedOut([{is_from_me:false,content:'Tolong jangan hubungi saya lagi'}]),true);
  assert.equal(optedOut([{is_from_me:true,content:'Jangan contact'}]),false);
  const text=redactContext('IC 900101-10-1234 email saya@example.com https://private.test');
  assert.ok(!text.includes('900101')); assert.ok(!text.includes('saya@example.com')); assert.ok(!text.includes('https://'));
  assert.equal(normalizedPhone('017-355 9147'),'60173559147');
});

test('exact phone matches provider JID across pages; never match names, groups or opaque LID', async () => {
 let calls=0;
 const jid=await resolveChatJid('fixture','sess_fixture','60123456789',async()=>{
  calls++;return response(calls===1?{success:true,total_count:2,has_more:true,chats:[{chat_jid:'777777@lid',name:'60123456789'}]}:chatPage);
 });
 assert.equal(jid,'60123456789@c.us');assert.equal(calls,2);
 assert.equal(await resolveChatJid('fixture','sess_fixture','60123456789',async()=>response({success:true,total_count:1,has_more:false,chats:[{chat_jid:'60123456789@g.us',chat_type:'group',name:'60123456789'}]})),null);
});
test('context is WhatsApp only, prioritises last request and rejects empty history',()=>{
 const messages=[{message_id:'1',timestamp:'2026-10-26T02:00:00Z',is_from_me:false,message_type:'text',content:'Nak City'}, {message_id:'2',timestamp:'2026-10-26T03:41:00Z',is_from_me:true,message_type:'text',content:'Untuk semakan kelayakan, hantar 3 bulan latest payslip'}];
 const c=conversationContext(messages);
 assert.match(c.last_message.text,/payslip/);assert.equal(c.last_message.from,'adviser');assert.equal(c.lead,undefined);assert.equal(c.case,undefined);
 assert.throws(()=>conversationContext([]),/Draf tidak dibuat daripada nota/);
 assert.throws(()=>conversationContext([{...messages[0],content:''}]),/tiada teks/);
});
