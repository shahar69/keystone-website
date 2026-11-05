'use strict';
const crypto=require('node:crypto');
const {HttpError,textField}=require('./security');
function createVoice({env={},store,ledger,review=false,fetchImpl=fetch,timeoutMs=12000,now=Date.now}){
 const seconds=Number(env.VOICE_MAX_SECONDS),dailyLimit=Number(env.VOICE_DAILY_SESSION_LIMIT),minuteCeiling=Number(env.VOICE_USD_PER_MINUTE_CEILING),budget=Number(env.VOICE_DAILY_BUDGET_USD);
 const configured=!!env.ELEVENLABS_API_KEY&&/^[a-zA-Z0-9_-]{4,150}$/.test(env.ELEVENLABS_AGENT_ID||'')&&Number.isInteger(seconds)&&seconds>=30&&seconds<=180&&Number.isInteger(dailyLimit)&&dailyLimit>=1&&dailyLimit<=100&&minuteCeiling>0&&minuteCeiling<=20&&budget>0&&budget<=100;
 const enabled=()=>!review&&configured&&env.INTEGRATIONS_ENABLED==='1'&&env.VOICE_ENABLED==='1'&&env.VOICE_AGENT_READY==='yes'&&env.VOICE_SERVER_LIMIT_CONFIRMED==='yes'&&env.VOICE_PROVIDER_BUDGET_CONFIRMED==='yes';
 let queue=Promise.resolve();const serial=fn=>{const p=queue.catch(()=>{}).then(fn);queue=p.catch(()=>{});return p;};
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 async function session(body){
  if(!enabled())throw new HttpError(503,'voice_disabled');
  if(body.consent!==true)throw new HttpError(422,'voice_consent');
  const capability=textField(body,'session',64,64),key=textField(body,'key',64,20);
  if(!/^[a-f0-9]{64}$/.test(capability)||!/^[a-zA-Z0-9-]{20,64}$/.test(key))throw new HttpError(422,'voice_session');
  const lead=(await store.list()).find(l=>l.experienceHash===hash(capability));if(!lead)throw new HttpError(403,'voice_session');
  const reservation=await serial(async()=>{
   const rows=await ledger.list(),day=new Date(now()).toISOString().slice(0,10),cost=seconds/60*minuteCeiling;
   if(rows.some(r=>r.requestKey===key))throw new HttpError(409,'voice_request_exists');
   const today=rows.filter(r=>r.day===day);
   if(today.length>=dailyLimit||today.reduce((s,r)=>s+(r.reservedUSD||0),0)+cost>budget)throw new HttpError(429,'voice_daily_limit');
   return ledger.add({requestKey:key,leadId:lead.id,day,reservedUSD:cost,state:'reserved',maxSeconds:seconds});
  });
  try{
   const response=await fetchImpl('https://api.elevenlabs.io/v1/convai/conversation/token?'+new URLSearchParams({agent_id:env.ELEVENLABS_AGENT_ID}),{method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'xi-api-key':env.ELEVENLABS_API_KEY}});
   if(!response.ok)throw new HttpError(503,'voice_provider_unavailable');
   const payload=await response.json();
   if(typeof payload.token!=='string'||payload.token.length<20||payload.token.length>16000||typeof payload.conversation_id!=='string'||!/^[a-zA-Z0-9_-]{3,200}$/.test(payload.conversation_id))throw new HttpError(503,'voice_provider_payload');
   await ledger.update(reservation.id,{state:'issued',conversationId:payload.conversation_id});
   const fresh=(await store.list()).find(l=>l.id===lead.id);
   const change={voice:{provider:'elevenlabs',conversationId:payload.conversation_id,state:'started',issuedAt:new Date(now()).toISOString()}},event={at:new Date(now()).toISOString(),type:'voice-live',detail:'הונפק אסימון לחיבור קולי לאחר הסכמה; החיבור עצמו טרם אומת'};if(store.appendEvent)await store.appendEvent(lead.id,event,change);else await store.update(lead.id,{...change,timeline:[...(fresh.timeline||[]),event].slice(-100)});
   // Only the short-lived provider token reaches the browser. Never persist it.
   return {mode:'live',provider:'elevenlabs',conversationToken:payload.token,maxSeconds:seconds};
  }catch(error){await ledger.update(reservation.id,{state:'needs_review'});throw error instanceof HttpError?error:new HttpError(503,'voice_provider_unavailable');}
 }
 return {status:()=>({enabled:enabled(),mode:review?'mock':enabled()?'live':'disabled',provider:'elevenlabs',maxSeconds:configured?seconds:null}),session};
}
module.exports={createVoice};
