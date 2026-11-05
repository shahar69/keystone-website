'use strict';
const crypto=require('node:crypto');
const {HttpError}=require('./security');
const {findReport}=require('./report-history');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function createReportDelivery({env={},queue,store,mailer,whatsapp,review=false,now=Date.now}){
 let key;try{key=Buffer.from(env.REPORT_TOKEN_KEY||'','base64url');}catch{}
 const limit=Number(env.REPORT_DAILY_LIMIT),start=Date.parse(env.REPORT_SEND_START_AT||'');let origin='';try{const u=new URL(env.REPORT_PUBLIC_ORIGIN||env.SITE_ORIGIN);if(u.protocol==='https:'&&!u.username&&!u.password)origin=u.origin;}catch{}
 const enabled=()=>!review&&env.INTEGRATIONS_ENABLED==='1'&&env.REPORT_DELIVERY_ENABLED==='1'&&env.REPORT_PUBLIC_URL_CONFIRMED==='yes'&&key?.length===32&&Number.isInteger(limit)&&limit>=1&&limit<=200&&Number.isFinite(start)&&!!origin;
 let serialQueue=Promise.resolve(),running;
 const serial=fn=>{const p=serialQueue.catch(()=>{}).then(fn);serialQueue=p.catch(()=>{});return p;};
 function seal(value,aad){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(x=>x.toString('base64url')).join('.');}
 function open(value,aad){const parts=value.split('.').map(x=>Buffer.from(x,'base64url'));if(parts.length!==3)throw Error('Invalid encrypted payload');const cipher=crypto.createDecipheriv('aes-256-gcm',key,parts[0]);cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(parts[1]);return JSON.parse(Buffer.concat([cipher.update(parts[2]),cipher.final()]).toString('utf8'));}
 async function record(job,state,detail){const change={reportDelivery:{jobId:job.id,state,deliveryConfirmed:false}},event={at:new Date(now()).toISOString(),type:'report-'+state,detail};if(store.appendEvent)await store.appendEvent(job.leadId,event,change);else{const lead=(await store.list()).find(l=>l.id===job.leadId);if(lead)await store.update(lead.id,{...change,timeline:[...(lead.timeline||[]),event].slice(-100)});}}
 async function enqueue({lead,reportToken,recipient,channel='email'}){
  if(!enabled())return {mode:'disabled',state:'disabled',delivered:false};
  const transport=channel==='email'?mailer:channel==='whatsapp'?whatsapp:null;
  if(!transport?.enabled||typeof transport.report!=='function')return {mode:'live',state:'unavailable',delivered:false};
  if(!lead.consentAt||! /^[a-f0-9]{64}$/.test(reportToken||'')||!findReport(lead,digest(reportToken),now()))throw new HttpError(422,'report_delivery');
  if(channel==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient||''))throw new HttpError(422,'recipient');
  if(channel==='whatsapp'&&!/^\+[1-9]\d{7,14}$/.test(recipient||''))throw new HttpError(422,'recipient');
  const identity=digest([lead.id,digest(reportToken),channel,recipient.toLowerCase()].join('|'));
  return serial(async()=>{
   const rows=await queue.list(),old=rows.find(r=>r.identity===identity);if(old)return {mode:'live',state:old.state,delivered:old.state==='sent',jobId:old.id};
   const day=new Date(now()).toISOString().slice(0,10);if(rows.filter(r=>r.day===day).length>=limit)throw new HttpError(429,'report_daily_limit');
   const cancel=crypto.randomBytes(32).toString('hex');
   const row=await queue.add({identity,day,leadId:lead.id,reportHash:digest(reportToken),channel,cancelHash:digest(cancel),queuedAt:new Date(now()).toISOString(),state:'pending',attempts:0,payload:seal({recipient,reportToken,cancel,language:lead.lang||lead.language||'he'},identity)});
   await record(row,'pending','דו״ח פרטי נכנס לתור לאחר בקשה והסכמה');return {mode:'live',state:row.state,jobId:row.id,delivered:false};
  });
 }
 async function drain(){
  if(!enabled())return;if(running)return running;
  running=(async()=>{for(const job of await queue.list()){
   if(job.state!=='pending'||Date.parse(job.queuedAt)<start||(job.nextAt&&job.nextAt>now()))continue;
   const lead=(await store.list()).find(l=>l.id===job.leadId);
   if(!lead||!findReport(lead,job.reportHash,now())){await queue.update(job.id,{state:'cancelled',reason:'expired_or_replaced'});continue;}
   let payload;try{payload=open(job.payload,job.identity);}catch{await queue.update(job.id,{state:'needs_review',reason:'payload_unavailable'});continue;}
   const transport=job.channel==='email'?mailer:whatsapp;if(!transport?.enabled)continue;
   // Persist before the external operation: an interrupted/ambiguous send is never replayed blindly.
   const claimed=await serial(async()=>{const fresh=(await queue.list()).find(r=>r.id===job.id);if(fresh?.state!=='pending')return false;await queue.update(job.id,{state:'sending',attempts:job.attempts+1,attemptedAt:new Date(now()).toISOString()});return true;});if(!claimed)continue;
   let result;try{result=await transport.report({recipient:payload.recipient,url:origin+'/report/'+payload.reportToken,cancelUrl:origin+'/report-delivery/cancel/'+payload.cancel,language:payload.language,idempotencyKey:job.identity});}catch{result={state:'unknown'};}
   const current=(await queue.list()).find(r=>r.id===job.id);if(current?.state==='cancelled')continue;
   if(result.state==='sent'||result.state==='accepted'){await queue.update(job.id,{state:'sent',acceptedAt:new Date(now()).toISOString(),deliveryConfirmed:false});await record(job,'sent','הספק קיבל את הדו״ח; מסירה לתיבת הנמען לא אושרה');}
   else if(current?.stopRequested){await queue.update(job.id,{state:'cancelled'});}
   else if(result.state==='retryable'&&job.attempts+1<5){await queue.update(job.id,{state:'pending',nextAt:now()+Math.min(3600000,60000*2**job.attempts),code:result.code||'RETRY'});await record(job,'pending','דחייה זמנית מפורשת; ניסיון נוסף תוזמן');}
   else{const state=result.state==='rejected'?'failed':'needs_review';await queue.update(job.id,{state,code:result.code||'CHECK_PROVIDER'});await record(job,state,'המשלוח דורש בדיקה; מצב לא ודאי אינו נשלח שוב אוטומטית');}
  }})().finally(()=>{running=null;});return running;
 }
 async function findCancel(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;return (await queue.list()).find(r=>r.cancelHash===digest(token));}
 async function cancel(token){return serial(async()=>{const row=await findCancel(token);if(!row)throw new HttpError(404,'not_found');if(row.state==='pending')await queue.update(row.id,{state:'cancelled',cancelledAt:new Date(now()).toISOString()});else if(row.state==='sending')await queue.update(row.id,{stopRequested:true,cancelledAt:new Date(now()).toISOString()});return {ok:true,state:row.state==='sending'?'in_flight':row.state==='sent'?'already_accepted':'cancelled'};});}
 return {status:()=>({enabled:enabled(),mode:review?'mock':enabled()?'live':'disabled'}),enqueue,drain,findCancel,cancel,close:async()=>{await running;await serialQueue;}};
}
module.exports={createReportDelivery};
