// Loopback-only browser fixture. No production credentials, requests or data.
import http from 'node:http';
const owner='11111111-1111-4111-8111-111111111111';
const user={id:owner,email:'lead@test.local',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
const state={leads:[],contacts:0,followups:0,fail:false,role:'broker'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'){res.end();return;}
 let raw='';for await(const chunk of req)raw+=chunk;
 const b=raw?JSON.parse(raw):{},u=new URL(req.url,'http://127.0.0.1:3334'),table=u.pathname.split('/').pop();
 const send=(data,status=200)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(u.pathname==='/test/state'){if(req.method==='POST')Object.assign(state,b);send(state);return;}
 if(u.pathname.includes('/auth/v1/token')){send({access_token:'fixture-token',refresh_token:'fixture-refresh',expires_in:3600,user});return;}
 if(u.pathname.includes('/auth/v1/user')){send(user);return;}
 if(table==='profiles'){const p={...user,full_name:'Test Broker',active:true,role:state.role};send(req.headers.accept?.includes('object')?p:[p]);return;}
 if(table==='leads'){
  if(req.method==='GET'){send(state.leads);return;}
  if(state.fail){send({message:'Simulated save failure'},503);return;}
  if(req.method==='POST'){state.leads.push({...b,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),lead_notes:[],lead_events:[],lead_follow_up_actions:[]});send({id:b.id});return;}
  if(req.method==='PATCH'){const lead=state.leads.find(l=>'eq.'+l.id===u.searchParams.get('id'));Object.assign(lead,b);send({id:lead.id});return;}
 }
 if(table==='lead_events'){state.leads.find(l=>l.id===b.lead_id).lead_events.push({...b,id:crypto.randomUUID(),created_at:new Date().toISOString()});send(null);return;}
 if(table==='contact_lead'){
  if(state.fail){send({message:'Simulated contact failure'},503);return;}
  const l=state.leads.find(l=>l.id===b.p_lead_id);
  if(!l.phone_revealed_at){l.phone_revealed_at=new Date().toISOString();l.status='contacted';l.lead_events.push({id:crypto.randomUUID(),status:'contacted',created_at:l.phone_revealed_at});state.contacts++;}
  send(null);return;
 }
 if(table==='record_lead_follow_up'){
  if(state.fail){send({message:'Simulated follow-up failure'},503);return;}
  const l=state.leads.find(l=>l.id===b.p_lead_id);l.follow_up_count=(l.follow_up_count||0)+1;
  if(l.follow_up_count>=4)l.status='all_offer_presented';
  state.followups++;send(l.follow_up_count);return;
 }
 send([]);
});
server.listen(3334,'127.0.0.1',()=>console.log('Isolated Lead fixture at 3334'));
