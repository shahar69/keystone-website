'use strict';
const crypto=require('node:crypto');
const {HttpError}=require('./security');
const {publicURL}=require('./website-check');
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
function parsePerformance(raw,url){
 const lh=raw?.lighthouseResult;if(!lh||lh.runtimeError)return {state:'unknown',reason:lh?.runtimeError?'runtime_error':'missing_data'};
 const metric=id=>{const a=lh.audits?.[id];return a&&!a.errorMessage&&a.scoreDisplayMode!=='error'&&a.numericUnit==='millisecond'?finite(a.numericValue):null;};
 const page=raw.loadingExperience,origin=raw.originLoadingExperience,p=finite(page?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile),o=finite(origin?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile);
 const field=p!==null?{inpP75Ms:p,scope:page.origin_fallback?'origin':'url',windowDays:28}:o!==null?{inpP75Ms:o,scope:'origin',windowDays:28}:null;
 return {state:'complete',source:'Google PageSpeed Insights',strategy:'mobile',measuredAt:typeof lh.fetchTime==='string'&&Number.isFinite(Date.parse(lh.fetchTime))?lh.fetchTime:new Date().toISOString(),lighthouseVersion:typeof lh.lighthouseVersion==='string'?lh.lighthouseVersion.slice(0,40):null,requestedUrl:url,lab:{lcpMs:metric('largest-contentful-paint'),tbtMs:metric('total-blocking-time')},field};
}
function createPagespeed({env={},jobs,store,review=false,fetchImpl=fetch,timeoutMs=60000,now=Date.now}){
 const limit=Number(env.PERFORMANCE_DAILY_LIMIT),enabled=()=>!review&&env.INTEGRATIONS_ENABLED==='1'&&env.PERFORMANCE_ENABLED==='1'&&env.PERFORMANCE_QUOTA_CONFIRMED==='yes'&&!!env.GOOGLE_PSI_API_KEY&&Number.isInteger(limit)&&limit>=1&&limit<=100;
 let serialQueue=Promise.resolve(),running;
 const serial=fn=>{const p=serialQueue.catch(()=>{}).then(fn);serialQueue=p.catch(()=>{});return p;};
 async function enqueue({leadId,url,consent}){
  if(!enabled()||consent!==true)return {state:'not_requested'};const target=publicURL(url).href,identity=crypto.createHash('sha256').update(leadId+'|'+target+'|'+new Date(now()).toISOString().slice(0,10)).digest('hex');
  return serial(async()=>{const rows=await jobs.list(),old=rows.find(r=>r.identity===identity);if(old)return {state:old.state,jobId:old.id};const day=new Date(now()).toISOString().slice(0,10);if(rows.filter(r=>r.day===day).length>=limit)throw new HttpError(429,'performance_daily_limit');const job=await jobs.add({identity,day,leadId,url:target,state:'pending',queuedAt:new Date(now()).toISOString()});return {state:job.state,jobId:job.id};});
 }
 async function drain(){if(!enabled())return;if(running)return running;running=(async()=>{for(const job of await jobs.list()){
  if(job.state==='running'){await jobs.update(job.id,{state:'unknown',result:{state:'unknown',reason:'interrupted'},finishedAt:new Date(now()).toISOString()});continue;}
  if(job.state==='pending'&&job.day!==new Date(now()).toISOString().slice(0,10)){await jobs.update(job.id,{state:'unknown',result:{state:'unknown',reason:'expired_queue'},finishedAt:new Date(now()).toISOString()});continue;}
  if(job.state!=='pending')continue;await jobs.update(job.id,{state:'running'});let result;
  try{const response=await fetchImpl('https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?'+new URLSearchParams({url:job.url,strategy:'mobile',category:'performance',key:env.GOOGLE_PSI_API_KEY}),{method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});result=response.ok?parsePerformance(await response.json(),job.url):{state:'unknown',reason:response.status===429?'provider_quota':'provider_unavailable'};}catch{result={state:'unknown',reason:'provider_unavailable'};}
  // Keep normalized, dated metrics only, never the raw provider response or a missing-as-zero score.
  await jobs.update(job.id,{state:result.state,result,finishedAt:new Date(now()).toISOString()});if(store.appendEvent)await store.appendEvent(job.leadId,{at:new Date(now()).toISOString(),type:'performance-'+result.state,detail:result.state==='complete'?'מדידת מובייל הסתיימה; מדדי מעבדה ושטח מוצגים בנפרד':'מדידת המובייל אינה זמינה; לא הוסק ציון לאתר'});
 }})().finally(()=>{running=null;});return running;}
 async function forLead(leadId,jobId){const row=(await jobs.list()).find(r=>r.id===jobId&&r.leadId===leadId);if(!row)return {state:'unknown'};return row.result||{state:row.state};}
 return {status:()=>({enabled:enabled(),mode:review?'mock':enabled()?'live':'disabled'}),enqueue,drain,forLead,close:async()=>{await running;await serialQueue;}};
}
module.exports={createPagespeed,parsePerformance};
