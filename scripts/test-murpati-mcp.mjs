import test from 'node:test';
import assert from 'node:assert/strict';
import {MurpatiMcp,validateMcpUrl,murpatiMessageTime} from '../src/lib/server/murpati-mcp.ts';
import {latestMessages,conversationContext} from '../src/lib/server/ai-follow-up-core.ts';
const url='https://mcp.murpati.com/c/sk_fixture/mcp';
function fixture({mismatch=false,truncated=false,unreadable=false}={}){
 const calls=[];
 const fetcher=async(endpoint,options)=>{
  assert.equal(endpoint,url);assert.equal(options.redirect,'error');
  const request=JSON.parse(options.body);calls.push(request);
  let result;
  if(request.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{}};
  else{
   assert.equal(request.method,'tools/call');const {name,arguments:args}=request.params;
   assert.ok(['list_devices','list_conversations','read_conversations'].includes(name));
   let content;
   if(name==='list_devices')content={devices:[{id:'sess_own',phone:'60177498085',kind:'whatsapp',readable:true,name:'Own',status:'connected'}]};
   if(name==='list_conversations'){
    assert.equal(args.number,'60177498085');assert.equal(args.search,'60122164567');
    content={total:1,has_more:false,filter_truncated:truncated,conversations:[{conversation_id:'chat-uuid',channel:'whatsapp',is_group:false,phone_number:'60122164567',device_phone:mismatch?'60111111111':'60177498085'}]};
   }
   if(name==='read_conversations'){
    assert.deepEqual(args.conversation_ids,['chat-uuid']);assert.equal(args.limit,100);
    content={unreadable:unreadable?['chat-uuid']:[],conversations:[{conversation_id:'chat-uuid',owner_notes:'SECRET NOTE MUST NOT PASS',messages:[{from:'customer',at:'2026-10-25 11:40am',text:'Full loan boleh?'},{from:'us',at:'2026-10-25 11:41am',text:'[photo]'},{from:'us',at:'2026-10-25 11:41am',text:'Hantar 3 bulan latest payslip'}]}]};
   }
   result={structuredContent:content};
  }
  return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result}),{headers:{'Content-Type':'application/json','Mcp-Session-Id':'fixture-session'}});
 };
 return {calls,fetcher};
}
test('MCP resolves exact phone to conversation id, reads last messages, ignores owner notes and media placeholders',async()=>{
 const f=fixture();const messages=await latestMessages(url,'sess_own','60122164567',new Date('2026-10-26T00:00:00Z'),f.fetcher);
 assert.equal(messages.length,3);const context=conversationContext(messages);
 assert.match(context.last_message.text,/payslip/);assert.equal(context.last_message.at,'2026-10-25T03:41:00.000Z');assert.equal(context.last_message.from,'adviser');
 assert.ok(!JSON.stringify(context).includes('SECRET NOTE'));assert.ok(!JSON.stringify(context).includes('[photo]'));
 assert.equal(f.calls.filter(c=>c.params?.name==='read_conversations').length,1);
});
test('wrong sending number, truncated search and unreadable conversation fail closed',async()=>{
 let f=fixture({mismatch:true});assert.deepEqual(await latestMessages(url,'sess_own','60122164567',new Date(),f.fetcher),[]);assert.ok(!f.calls.some(c=>c.params?.name==='read_conversations'));
 f=fixture({truncated:true});await assert.rejects(latestMessages(url,'sess_own','60122164567',new Date(),f.fetcher),/tidak lengkap/);
 f=fixture({unreadable:true});await assert.rejects(latestMessages(url,'sess_own','60122164567',new Date(),f.fetcher),/tidak dapat dibaca/);
});
test('MCP blocks sends and non-Murpati endpoints; Malaysia timestamps correct',async()=>{
 const f=fixture();await assert.rejects(new MurpatiMcp(url,f.fetcher).read('send_message',{}),/tidak dibenarkan/);assert.equal(f.calls.length,0);
 for(const value of ['http://mcp.murpati.com/c/sk_fixture/mcp','https://evil.test/c/sk_fixture/mcp','https://mcp.murpati.com/c/sk_fixture/mcp?redirect=evil','https://user:pass@mcp.murpati.com/c/sk_fixture/mcp'])assert.throws(()=>validateMcpUrl(value));
 assert.equal(murpatiMessageTime('2026-10-25 12:00am'),'2026-10-24T16:00:00.000Z');assert.equal(murpatiMessageTime('2026-10-25 12:00pm'),'2026-10-25T04:00:00.000Z');
});
test('MCP SSE and errors are handled without leaking connector credentials',async()=>{
 let n=0;
 const client=new MurpatiMcp(url,async(_url,options)=>{const q=JSON.parse(options.body);n++;const result=n===1?{protocolVersion:'2025-03-26'}:{content:[{type:'text',text:JSON.stringify({devices:[]})}]};return new Response('event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});});
 assert.deepEqual(await client.read('list_devices',{}),{devices:[]});
 await assert.rejects(new MurpatiMcp(url,async()=>{throw Error(url);}).read('list_devices',{}),e=>!e.message.includes('sk_fixture'));
});
