'use strict';
const crypto=require('node:crypto');
const {HttpError,readBody,textField,escape:e}=require('./security');
const {publicURL}=require('./website-check');
const {withIdentity}=require('./identity-lock');
const {archiveReports}=require('./report-history');
const {header,footer}=require('./site-shell');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const domains=[['growth','צמיחה ומכירות','Growth and sales'],['service','לקוחות ושירות','Customers and service'],['operations','תפעול','Operations'],['finance','כספים','Finance'],['knowledge','הנהלה וידע','Management and knowledge']];
const labels={heading:['כותרת ראשית','Main heading'],language:['הגדרת שפה וכיווניות','Language and direction'],alt:['תיאורי תמונות במדגם','Image descriptions in sample'],privacy:['קישור למידע פרטיות','Privacy information link'],accessibility:['קישור למידע נגישות','Accessibility information link'],sharing:['תגי תצוגת שיתוף','Sharing-preview tags'],schema:['נתונים מובנים','Structured data']};
const signals={
 contact:['דרכי פנייה בקוד העמוד','Contact paths in page HTML','מענה ופניות','Enquiry handling','לא זוהה קישור חיוג, מייל או WhatsApp בקוד שנבדק.','No phone, email or WhatsApp link was detected in the checked HTML.','להוסיף דרך פנייה ברורה, המחוברת לטיפול בפנייה.','Add a clear contact path connected to an enquiry workflow.'],
 title:['כותרת בחיפוש','Search title','נוכחות בחיפוש','Search presence','לא נמצאה כותרת עמוד בקוד שנבדק.','No page title was found in the checked HTML.','לבנות תצוגת חיפוש שמסבירה מה העסק מציע.','Build a search presentation explaining the business offer.'],
 description:['תיאור בחיפוש','Search description','נוכחות בחיפוש','Search presence','לא נמצא תיאור מטא בקוד שנבדק.','No meta description was found in the checked HTML.','לנסח תיאור ממוקד המחבר בין החיפוש להצעה של העסק.','Connect the search intent to the business offer with a focused description.'],
 viewport:['הגדרת מסך למובייל','Mobile viewport configuration','חוויית מובייל','Mobile experience','לא נמצאה הגדרת viewport בקוד שנבדק. זו אינה בדיקת תצוגה בטלפון.','No viewport setting was found in the checked HTML. This is not a rendered phone-layout test.','לבדוק ולשפר את מסלול הפנייה בטלפון.','Review and improve the enquiry journey on a phone.'],
 https:['חיבור HTTPS','HTTPS connection','נגישות השירות','Service access','הכתובת הסופית אינה משתמשת ב־HTTPS.','The final address does not use HTTPS.','להפעיל חיבור מאובטח ולבדוק שהפנייה מגיעה לצוות.','Enable a secure connection and verify enquiries reach the team.'],
 forms:['תוויות שדות בטופס','Form-field labels','השלמת פניות','Enquiry completion','נמצאו שדות ללא תווית מזוהה בקוד. שליחת הטופס לא נבדקה.','Fields without detected labels were found. Form submission was not tested.','לשפר את הטופס ולבדוק השלמת פנייה ונגישות עם משתמשים.','Improve the form and test enquiry completion and accessibility with users.']
};
function analyse(report,lang='he'){
 const en=lang==='en',facts=(report?.checks||[]).map(c=>({id:'html:'+c.id,code:c.id,source:'website-html',url:report.url,checkedAt:report.checkedAt,pass:c.pass===true,scope:'page-html',label:signals[c.id]?.[en?1:0]||labels[c.id]?.[en?1:0]||c.id}));
 const opportunities=[];
 for(const code of ['contact','https','viewport','forms','title','description']){
  const f=facts.find(f=>f.code===code&&!f.pass),s=signals[code];if(!f)continue;
  if(opportunities.some(o=>o.capability===s[en?3:2]))continue;
  opportunities.push({id:code,factIds:[f.id],capability:s[en?3:2],observation:s[en?5:4],nextStep:s[en?7:6],benefit:en?'A clearer route from interest to enquiry; impact needs measurement.':'מסלול ברור יותר מהתעניינות לפנייה; את ההשפעה יש למדוד בעסק.'});if(opportunities.length===3)break;
 }
 return {facts,opportunities,domains:domains.map(([id,he,enName])=>({id,label:en?enName:he,level:null,state:'unknown',reason:en?'Cannot establish internal capability from a public page.':'לא ניתן לקבוע יכולת פנימית מתוך עמוד ציבורי.'})),coverage:{mobileRendering:false,formSubmission:false,internalOperations:false,revenue:false},method:'observed-html-rules-v1'};
}
function createCapabilityCheck({store,checkWebsite,places,now=Date.now}){
 const pending=new Map();
 async function run(input,emit=()=>{},cancelled=()=>false){
  const lang=input.lang==='en'?'en':'he',business=textField(input,'business',180,2),session=textField(input,'session',64,64);
  if(!/^[a-f0-9]{64}$/.test(session))throw new HttpError(422,'session');
  if(pending.has(session))throw new HttpError(409,'check_in_progress');
  const job=(async()=>{
   const sources={website:{state:'pending'},places:{state:places?.status().enabled?'available':'disabled'},performance:{state:'disabled'},analysis:{state:'rules',provider:'disabled'}};
   emit({type:'sources',sources});
   let url,isURL=/^(https?:\/\/|www\.)|^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(business),placeId=null;
   if(isURL)url=publicURL(business.startsWith('http')?business:'https://'+business).href;
   else if(places?.status().enabled){
    if(!input.placeId){const matches=await places.search({business,lang});return {state:'selection_required',matches:matches.matches,sources};}
    // Resolve candidates again: callers cannot use this endpoint as an unrestricted place-ID proxy.
    const matches=await places.search({business,lang});if(!matches.matches.some(p=>p.placeId===input.placeId))throw new HttpError(422,'place_selection');
    const place=await places.details({placeId:input.placeId,lang});placeId=place.placeId;url=place.website;sources.places={state:'complete',attribution:place.attribution};emit({type:'place',place});
   }
   if(!url)return {state:'website_required',sources,reason:placeId?'no_website_in_profile':'places_disabled'};
   const website=await checkWebsite(url);sources.website={state:'complete'};emit({type:'website',website});
   if(cancelled())throw new HttpError(499,'cancelled');
   const analysis=analyse(website,lang);emit({type:'analysis',analysis});
   const token=crypto.randomBytes(32).toString('hex'),at=new Date(now()).toISOString();
   const capabilityCheck={business,lang,checkedAt:at,sources,website,analysis,...(placeId?{placeId}:{})};
   const change={business,lang,capabilityCheck,xray:null,reportHash:hash(token),reportExpires:now()+7*86400_000,nextAction:lang==='en'?'Prepare a capability map from verified sources':'להכין מפת יכולות ממקורות מאומתים'};
   const event={at,type:'capability-check',detail:website.url};
   await withIdentity(store,session,async()=>{
    const existing=(await store.list()).find(l=>l.experienceHash===hash(session));
    if(cancelled())throw new HttpError(499,'cancelled');
    if(existing)await store.appendEvent(existing.id,event,{...change,reports:archiveReports(existing,now())});
    else await store.add({...change,name:'',email:'',phone:'',source:'experience',experienceHash:hash(session),timeline:[event],notification:{state:'disabled'},whatsappNotification:{state:'disabled'}});
   });
   return {state:'complete',session,reportUrl:'/report/'+token,check:capabilityCheck};
  })();pending.set(session,job);try{return await job;}finally{pending.delete(session);}
 }
 async function handle(req,res){
  const input=await readBody(req,2048);let started=false;
  const emit=value=>{if(res.destroyed)return;if(!started){res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});started=true;}res.write(JSON.stringify(value)+'\n');};
  try{const result=await run(input,emit,()=>res.destroyed);emit({type:'result',...result});}catch(error){if(!started)throw error;emit({type:'error',code:error instanceof HttpError?error.code:'check_unavailable'});}finally{if(started&&!res.destroyed)res.end();}
 }
 return {run,handle};
}
function reportHTML(r,assets={}){
 const en=r.lang==='en',t=(he,eng)=>en?eng:he;
 return `<!doctype html><html lang="${en?'en':'he'}" dir="${en?'ltr':'rtl'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(r.business)} · Keystone</title><link rel="stylesheet" href="${assets['final.css']||'/assets/final.css'}"><link rel="stylesheet" href="${assets['capability.css']||'/assets/capability.css'}"></head><body>${header(r.lang)}<main id="main" class="report-main"><p class="eyebrow">${t('בדיקת יכולות · דו״ח פרטי','Capability check · private report')}</p><h1 dir="auto">${e(r.website.title||r.business)}</h1><p>${t('צילום מצב של הנוכחות הציבורית','A snapshot of the public presence')} · <time>${e(new Intl.DateTimeFormat(en?'en-GB':'he-IL',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jerusalem'}).format(new Date(r.checkedAt)))}</time></p><a href="${e(r.website.url)}" dir="ltr" rel="noreferrer">${e(r.website.url)}</a><section><h2>${t('הזדמנויות להמשך','Next opportunities')}</h2>${r.analysis.opportunities.length?r.analysis.opportunities.map((o,i)=>`<article><span class="eyebrow">${e(o.capability)}</span><h3>${e(o.nextStep)}</h3><p>${e(o.observation)}</p><p>${e(o.benefit)}</p><a href="#${e(o.factIds[0])}">${t('לממצא שנבדק','View the observed evidence')} ↗</a></article>`).join(''):`<p>${t('לא זוהה בסיס מספיק להצעת שלוש הזדמנויות מתוך הבדיקה הזאת. מיפוי מעמיק יותר דורש מידע מהעסק.','This check did not provide enough evidence for three opportunities. A deeper map needs business information.')}</p>`}</section><section><h2>${t('מה ניתן לקבוע','What can be established')}</h2><div class="domains">${r.analysis.domains.map(d=>`<article><h3>${e(d.label)}</h3><strong>${t('לא ניתן לקבוע מבחוץ','Not established externally')}</strong><p>${e(d.reason)}</p></article>`).join('')}</div></section><section><h2>${t('הממצאים והמקורות','Findings and sources')}</h2><p>${t('הבדיקה קוראת HTML. היא אינה מפעילה טפסים, מרנדרת מסך טלפון או בודקת את התפעול הפנימי.','This check reads HTML. It does not submit forms, render a phone viewport or inspect internal operations.')}</p><ul class="facts">${r.analysis.facts.map(f=>`<li id="${e(f.id)}"><strong>${e(f.label)}</strong><span>${f.pass?t('בדיקת הקוד עברה במדגם','Code check passed in the sample'):t('לא אומת בבדיקה','Not verified by this check')}</span><a href="${e(f.url)}" rel="noreferrer">${t('עמוד המקור','Source page')}</a></li>`).join('')}</ul></section><section class="next"><h2>${t('מה העסק שלכם יוכל לעשות הלאה?','What could your business do next?')}</h2><p>${t('קיסטון מחברת בין הממצאים למפת יכולות ותוכנית צמיחה.','Keystone connects findings to a capability map and growth plan.')}</p><a class="primary" href="${en?'/en/contact/':'/contact/'}">${t('קבלו את התוכנית המלאה','Request the full plan')} ↗</a><p class="small">${t('הקישור הפרטי תקף לשבעה ימים. שתפו אותו רק עם מי שצריך לקבל גישה.','This private link expires in seven days. Share it only with intended readers.')}</p></section></main>${footer(r.lang)}</body></html>`;
}
module.exports={createCapabilityCheck,analyse,reportHTML};
