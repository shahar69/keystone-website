'use strict';
const crypto=require('node:crypto');
// Owner notifications and explicitly requested utility reports. No marketing send path.
function createWhatsAppNotifier(store,env={},fetchImpl=fetch,{review=false,timeoutMs=12000,usageLedger}={}){
 const recipients=(env.WA_OWNER_NUMBERS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const startAt=Date.parse(env.WA_START_AT||'');
 const baseEnabled=!review&&env.INTEGRATIONS_ENABLED==='1'&&!!env.WA_ACCESS_TOKEN&&/^\d{5,30}$/.test(env.WA_PHONE_NUMBER_ID||'')&&/^v\d{1,3}\.0$/.test(env.WA_API_VERSION||'')&&/^[a-z]{2}(?:_[A-Z]{2})?$/.test(env.WA_TEMPLATE_LANGUAGE||'');
 const enabled=baseEnabled&&env.WA_NOTIFICATIONS_ENABLED==='1'&&env.WA_OWNER_OPT_IN==='yes'&&(/^[a-z0-9_]{1,100}$/.test(env.WA_TEMPLATE_NAME||'')||/^[a-z0-9_]{1,100}$/.test(env.WA_V4_TEMPLATE_NAME||''))&&recipients.length>0&&recipients.length<=2&&recipients.every(x=>/^[1-9]\d{7,14}$/.test(x));
 let callbackKey;try{callbackKey=Buffer.from(env.WA_CALLBACK_KEY||'','base64url');}catch{}
 let publicOrigin='';try{const u=new URL(env.WA_PUBLIC_ORIGIN||env.SITE_ORIGIN);if(u.protocol==='https:'&&!u.username&&!u.password)publicOrigin=u.origin;}catch{}
 const dailyLimit=Number(env.WA_DAILY_MESSAGE_LIMIT),quotaReady=!!usageLedger&&Number.isInteger(dailyLimit)&&dailyLimit>=1&&dailyLimit<=200;let quotaQueue=Promise.resolve();
 const reserve=()=>{const p=quotaQueue.catch(()=>{}).then(async()=>{const day=new Date().toISOString().slice(0,10),rows=await usageLedger.list();if(rows.filter(r=>r.day===day).length>=dailyLimit)return false;await usageLedger.add({day,operation:'template'});return true;});quotaQueue=p.catch(()=>{});return p;};
 const v4Enabled=enabled&&quotaReady&&env.WA_V4_ENABLED==='1'&&env.WA_V4_TEMPLATE_READY==='yes'&&env.WA_PUBLIC_URL_CONFIRMED==='yes'&&callbackKey?.length===32&&!!publicOrigin&&/^[a-z0-9_]{1,100}$/.test(env.WA_V4_TEMPLATE_NAME||'');
 const reportEnabled=baseEnabled&&quotaReady&&env.WA_REPORT_ENABLED==='1'&&env.WA_REPORT_TEMPLATE_READY==='yes'&&env.WA_PUBLIC_URL_CONFIRMED==='yes'&&!!publicOrigin&&/^[a-z0-9_]{1,100}$/.test(env.WA_REPORT_TEMPLATE_NAME||'');
 const sign=(id,expires)=>{const value=Buffer.from(JSON.stringify({id,expires})).toString('base64url');return value+'.'+crypto.createHmac('sha256',callbackKey).update(value).digest('base64url');};
 function readCall(token){try{if(callbackKey?.length!==32||typeof token!=='string'||token.length>1000)return null;const [value,signature,...rest]=token.split('.');if(rest.length||!value||!signature)return null;const expected=crypto.createHmac('sha256',callbackKey).update(value).digest(),supplied=Buffer.from(signature,'base64url');if(expected.length!==supplied.length||!crypto.timingSafeEqual(expected,supplied))return null;const data=JSON.parse(Buffer.from(value,'base64url').toString());return /^[a-zA-Z0-9-]{1,80}$/.test(data.id||'')&&Number.isSafeInteger(data.expires)&&data.expires>Date.now()&&data.expires<=Date.now()+25*3600000?data:null;}catch{return null;}}
 async function template(to,name,components){if(!quotaReady||!await reserve())return {state:'unknown',code:'WA_DAILY_LIMIT'};try{const response=await fetchImpl(`https://graph.facebook.com/${env.WA_API_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:'Bearer '+env.WA_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template:{name,language:{code:env.WA_TEMPLATE_LANGUAGE},components}})});const data=await response.json();if(response.ok&&typeof data.messages?.[0]?.id==='string'&&data.messages[0].id.length<512)return {state:'accepted',providerId:data.messages[0].id};return {state:response.status===429?'retryable':response.status>=400&&response.status<500?'rejected':'unknown'};}catch{return {state:'unknown'};}}
 async function report(job){if(!reportEnabled)return {state:'disabled'};let url,cancel;try{url=new URL(job.url);cancel=new URL(job.cancelUrl);}catch{return {state:'rejected',code:'REPORT_URL'};}if(url.origin!==publicOrigin||cancel.origin!==publicOrigin||!/^\/report\/[a-f0-9]{64}$/.test(url.pathname)||!/^\/report-delivery\/cancel\/[a-f0-9]{64}$/.test(cancel.pathname)||!/^\+[1-9]\d{7,14}$/.test(job.recipient))return {state:'rejected',code:'REPORT_URL'};return template(job.recipient.slice(1),env.WA_REPORT_TEMPLATE_NAME,[{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:url.pathname.split('/').at(-1)}]},{type:'button',sub_type:'url',index:'1',parameters:[{type:'text',text:cancel.pathname.split('/').at(-1)}]}]);}
 let running=null,rerun=false;
 async function run(){if(!enabled||!Number.isFinite(startAt))return;const leads=await store.list();for(const lead of leads.filter(l=>Date.parse(l.source==='experience'?(l.consentAt||l.receivedAt):l.receivedAt)>=startAt).slice(-500)){
   if(lead.source==='experience'&&(!v4Enabled||!lead.email&&!lead.phone))continue;
   if(lead.source!=='experience'&&!/^[a-z0-9_]{1,100}$/.test(env.WA_TEMPLATE_NAME||''))continue;
   const state={...(lead.whatsapp||{})};
   for(const to of recipients){if(state[to]&&!(state[to].state==='pending_retry'&&Date.parse(state[to].nextAt)<=Date.now()))continue;
     // A crash or an ambiguous response must not cause a duplicate external send.
     const attempts=(state[to]?.attempts||0)+1;state[to]={state:'needs_review',attemptedAt:new Date().toISOString(),attempts};await store.update(lead.id,{whatsapp:{...state}});
     if(lead.source==='experience'){
       const summary=[lead.business||lead.name||'פנייה חדשה',lead.nextAction||'לחזור לפונה'].join(' · ').replace(/\s+/g,' ').slice(0,240),token=sign(lead.id,Date.now()+24*3600000);
       const result=await template(to,env.WA_V4_TEMPLATE_NAME,[{type:'body',parameters:[{type:'text',text:summary}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:token}]}]);
       state[to]={...state[to],state:result.state==='accepted'?'accepted':result.state==='rejected'?'rejected':result.state==='retryable'&&attempts<3?'pending_retry':'needs_review',...(result.providerId?{providerId:result.providerId}:{}),...(result.state==='retryable'?{nextAt:new Date(Date.now()+60000*2**(attempts-1)).toISOString()}: {})};
       await store.update(lead.id,{whatsapp:{...state}});if(store.appendEvent)await store.appendEvent(lead.id,{at:new Date().toISOString(),type:'owner-whatsapp',detail:result.state==='accepted'?'התראת המייסדים התקבלה אצל Meta; מסירה לא אושרה':'התראת המייסדים דורשת בדיקה'});continue;
     }
     try{const response=await fetchImpl(`https://graph.facebook.com/${env.WA_API_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+env.WA_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template:{name:env.WA_TEMPLATE_NAME,language:{code:env.WA_TEMPLATE_LANGUAGE},components:[{type:'body',parameters:[{type:'text',text:lead.id}]}]}})});
       const payload=await response.json();state[to]={...state[to],state:response.ok&&typeof payload.messages?.[0]?.id==='string'?'accepted':response.status>=400&&response.status<500?'rejected':'needs_review'};
     }catch{ /* The operator must inspect Meta before retrying an ambiguous request. */ }
     await store.update(lead.id,{whatsapp:{...state}});
   }
 }}
 return {enabled:enabled&&Number.isFinite(startAt),reportEnabled,ownerEnabled:enabled&&Number.isFinite(startAt),status:()=>({owners:enabled&&Number.isFinite(startAt),v4:v4Enabled,reports:reportEnabled,mode:review?'mock':baseEnabled?'live':'disabled'}),report,readCall,drain(){rerun=true;if(!running)running=(async()=>{do{rerun=false;await run();}while(rerun);})().finally(()=>{running=null;});return running;},async close(){await running;}};
}
module.exports={createWhatsAppNotifier};
