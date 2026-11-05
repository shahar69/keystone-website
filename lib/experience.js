'use strict';
const crypto=require('node:crypto');
const {HttpError,readBody,textField,escape:e}=require('./security');
const {createProviders}=require('./providers');
const {withIdentity}=require('./identity-lock');
const {reportHTML}=require('./capability-check');
const {archiveReports,findReport}=require('./report-history');
function normalizePhone(value){if(!value)return '';if(!/^\+?[\d ()-]{7,25}$/.test(value))throw new HttpError(422,'contact');let digits=value.replace(/\D/g,'');if(digits.startsWith('00'))digits=digits.slice(2);if(digits.startsWith('0')&&digits.length>=9&&digits.length<=10)digits='972'+digits.slice(1);if(!/^[1-9]\d{7,14}$/.test(digits))throw new HttpError(422,'contact');return '+'+digits;}
function createExperience({store,checkWebsite,review=false,assets={},places,performance,delivery,assistant,booking,notifyOwners}){
  const provider=createProviders({mode:review?'mock':'live',adapters:{...(assistant?.status().enabled?{voice:async({lang})=>({transcript:lang==='en'?'Hello, how can Keystone help your business?':'שלום, איך קיסטון יכולה לעזור לעסק שלכם?'}),reply:async input=>{const r=await assistant.reply({message:input.message,language:input.lang,consent:'yes',token:input.assistantToken});return {transcript:r.answer,assistantToken:r.token};}}:{}),...(booking?.status().enabled?{slots:async input=>({slots:await booking.slots(input.date)}),booking:async input=>booking.book(input.body,{leadId:input.leadId})}:{}),...(delivery?{delivery:input=>delivery.enqueue(input)}:{}),...(places?{'place-search':input=>places.search(input),'place-details':input=>places.details(input)}:{})}});
  const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
  const mutate=(key,fn)=>withIdentity(store,key,fn);
  async function handle(req,{pathname,json,send,scanAllowed=()=>true,bookingAllowed=()=>true,assistantAllowed=()=>true,slotsAllowed=()=>true}){
    if(pathname.startsWith('/report/')){
      if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'method');
      const token=pathname.split('/')[2];if(!/^[a-f0-9]{64}$/.test(token||''))throw new HttpError(404,'not_found');
      const owner=(await store.list()).find(l=>findReport(l,hash(token)));
      const snapshot=owner&&findReport(owner,hash(token));
      const lead=snapshot?{...owner,...snapshot}:null;
      if(lead?.capabilityCheck)return send(200,reportHTML(lead.capabilityCheck,assets),'text/html; charset=utf-8');
      if(!lead?.xray)throw new HttpError(404,'not_found');
      const r=lead.xray, en=r.lang==='en';
      let google='';if(r.placeId&&places?.status().enabled){try{const d=await places.details({placeId:r.placeId,lang:r.lang});google=`<section><img width="130" src="/assets/img/google-maps-attribution.png" alt="Google Maps"><h2>${e(d.name)}</h2><p>${e(d.rating??'—')} · ${e(d.reviews??'—')} ${en?'reviews':'ביקורות'}</p><p>${e(d.hours?.join(' · ')|| (en?'Hours unknown':'שעות לא ידועות'))}</p><p>${en?'Photos in the profile':'תמונות בפרופיל'}: ${e(d.photoCount??'—')}</p>${d.mapUrl?`<a href="${e(d.mapUrl)}" rel="noreferrer">${en?'View on Google Maps':'לפרופיל ב־Google Maps'}</a>`:''}${d.attributions.map(a=>`<p>${a.url?`<a href="${e(a.url)}" rel="noreferrer">${e(a.name||a.url)}</a>`:e(a.name)}</p>`).join('')}</section>`;}catch{google=`<p>${en?'Current Google data is unavailable.':'נתוני Google עדכניים אינם זמינים כעת.'}</p>`;}}
      const perf=r.performanceJob&&performance?await performance.forLead(lead.id,r.performanceJob):null;
      const metric=v=>typeof v==='number'?e(Math.round(v))+' ms':(en?'Unavailable':'לא זמין');
      const perfHtml=!perf?'':`<section><h2>${en?'Mobile performance':'ביצועים במובייל'}</h2>${perf.state==='complete'?`<p>${en?'Mobile lab measurement':'מדידת מעבדה במובייל'} · LCP ${metric(perf.lab.lcpMs)} · TBT ${metric(perf.lab.tbtMs)}</p><p>${en?'Field INP, p75 over 28 days':'INP בשטח, אחוזון 75 לאורך 28 יום'}: ${metric(perf.field?.inpP75Ms)} ${perf.field?e(perf.field.scope):''}</p><small>Google PageSpeed Insights · ${e(perf.measuredAt)}</small>`:`<p>${['pending','running'].includes(perf.state)?(en?'Measurement in progress. Reload this report shortly.':'המדידה בתהליך. אפשר לרענן את הדו״ח בעוד רגע.'):(en?'Measurement unavailable. No score was inferred.':'המדידה אינה זמינה. לא הוסק ציון לאתר.')}</p>`}</section>`;
      return send(200,`<!doctype html><html lang="${en?'en':'he'}" dir="${en?'ltr':'rtl'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Keystone · ${en?'Private report':'דו״ח פרטי'}</title><link rel="stylesheet" href="/assets/v4-report.css"></head><body><main class="subpage"><a href="${en?'/en/':'/'}">KEYSTONE</a><h1>${e(r.business)}</h1><small>${en?'Private report · link expires in 7 days':'דו״ח פרטי · הקישור תקף לשבעה ימים'}</small>${r.mode==='mock'?`<p>${en?'Sample business data':'נתוני עסק להמחשה'}</p>`:''}${google}${perfHtml}<ul>${r.findings.map(f=>`<li><h2>${e(f.title)}</h2><p>${e(f.detail)}</p></li>`).join('')}</ul><a href="${en?'/en/contact/':'/contact/'}">${en?'Plan the next move with Keystone':'מתכננים את הצעד הבא עם קיסטון'}</a></main></body></html>`,'text/html; charset=utf-8');
    }
    if(req.method!=='POST')throw new HttpError(405,'method');
    const body=await readBody(req,8192),operation=textField(body,'operation',24,1),lang=body.lang==='en'?'en':'he';
    if(!['voice','reply','slots','booking','scan','contact','whatsapp','voice-transcript','voice-ended','place-select'].includes(operation))throw new HttpError(422,'operation');
    if(operation==='reply'&&!assistantAllowed())throw new HttpError(429,'rate_limited');if(operation==='slots'&&!slotsAllowed())throw new HttpError(429,'rate_limited');if(operation==='booking'&&!bookingAllowed())throw new HttpError(429,'rate_limited');if(operation==='reply'&&!review&&body.consent!==true)throw new HttpError(422,'assistant_consent_required');
    const rawToken=body.session||crypto.randomBytes(32).toString('hex');if(!/^[a-f0-9]{64}$/.test(rawToken))throw new HttpError(422,'session');
    return mutate(rawToken,async()=>{
      let lead=(await store.list()).find(l=>l.experienceHash===hash(rawToken));
      const append=async(type,detail,change={})=>{
        const timeline=[...(lead?.timeline||[]),{at:new Date().toISOString(),type,detail}].slice(-100);
        if(lead)lead=store.appendEvent?await store.appendEvent(lead.id,timeline.at(-1),change):await store.update(lead.id,{...change,timeline});
        else lead=await store.add({name:'',email:'',phone:'',business:'',message:'',source:'experience',experienceHash:hash(rawToken),lang,timeline,...change,notification:{state:'disabled'},whatsappNotification:{state:'disabled'}});
      };
      if(operation==='voice-transcript'||operation==='voice-ended'){
        if(!lead?.voice?.conversationId)throw new HttpError(403,'voice_session');
        if(operation==='voice-ended'){await append('voice-ended','Browser session ended',{voice:{...lead.voice,state:'ended'}});return json(200,{ok:true,session:rawToken});}
        if(!['user','agent'].includes(body.role))throw new HttpError(422,'role');
        await append('voice-client-'+body.role,textField(body,'message',2000,1));return json(200,{ok:true,session:rawToken});
      }
      if(operation==='scan'||operation==='place-select'){
        if(!scanAllowed())throw new HttpError(429,'rate_limited');
        const business=operation==='place-select'?lead?.business||'':textField(body,'business',180,2),isURL=/^(https?:\/\/|www\.)|^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(business);
        let report=null,placeDetails=null,selectedId=null;
        if(operation==='place-select'){
          selectedId=textField(body,'placeId',300,5);if(!lead?.placeCandidates?.includes(selectedId))throw new HttpError(422,'place_selection');
          placeDetails=await provider.perform('place-details',{placeId:selectedId,lang});
          if(!placeDetails.available)throw new HttpError(503,'places_disabled');
          if(placeDetails.website){try{report=await checkWebsite(placeDetails.website);}catch{/* A failed website check must not fabricate a result or hide the selected profile. */}}
        }else if(!isURL&&places?.status().enabled){
          const results=await provider.perform('place-search',{business,lang});
          await append('place-search',business,{business,placeCandidates:results.matches.map(p=>p.placeId)});
          return json(200,{ok:true,session:rawToken,mode:'live',matches:results.matches,attribution:results.attribution});
        }else if(isURL) report=await checkWebsite(business.startsWith('http')?business:'https://'+business);
        else if(!review)throw new HttpError(503,'places_not_configured');
        const businessData=placeDetails||await provider.perform('places',{lang}),en=lang==='en';
        const details={contact:['לא זוהה קישור טלפון, מייל או WhatsApp בקוד העמוד. לקוח עלול לעצור לפני הפנייה.','No phone, email or WhatsApp link was detected in the page HTML. A customer may stop before contacting you.'],https:['הכתובת שנבדקה אינה משתמשת בחיבור HTTPS.','The checked address does not use HTTPS.'],viewport:['לא זוהתה הגדרת מסך למובייל. נדרשת בדיקה על טלפון.','No mobile viewport was detected. Check the page on a phone.'],title:['לא נמצאה כותרת עמוד ברורה להצגה בחיפוש.','A usable page title was not found.'],description:['לא נמצא תיאור מטא שמסביר את העמוד בחיפוש.','A search description was not found.'],forms:['זוהו שדות ללא תווית; צריך לבדוק אם אפשר להשלים פנייה.','Unlabelled fields were found; check whether an enquiry can be completed.'],alt:['יש תמונות ללא תיאור חלופי.','Some images have no alternative text.'],accessibility:['לא זוהה קישור למידע נגישות. זהו סימן לבדיקה, לא קביעה משפטית.','No accessibility information link was detected. This is a check to follow up, not a legal determination.'],privacy:['לא זוהה קישור לפרטיות בקוד העמוד.','No privacy link was detected in the page HTML.']};
        const names={https:['חיבור מאובטח','Secure connection'],title:['כותרת בחיפוש','Search title'],description:['תיאור בחיפוש','Search description'],viewport:['התאמה למסך','Mobile viewport'],heading:['כותרת ראשית','Main heading'],language:['שפה','Language'],alt:['תיאורי תמונות','Image descriptions'],contact:['דרך לפנייה','Contact path'],privacy:['קישור לפרטיות','Privacy link'],accessibility:['מידע נגישות','Accessibility information'],sharing:['תצוגת שיתוף','Sharing preview'],schema:['מידע מובנה','Structured data'],forms:['שדות טופס','Form labels']};
        const findings=report?report.checks.filter(c=>!c.pass).sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-({high:0,medium:1,low:2}[b.priority]))).slice(0,3).map(c=>({title:names[c.id]?.[en?1:0]||c.id,priority:c.priority,detail:details[c.id]?.[en?1:0]||(en?'A page-level signal needs a manual check.':'סימן בקוד העמוד דורש בדיקה ידנית.')})):[];
        if(!report&&!selectedId)findings.push({title:en?'The path from search to enquiry':'הדרך מחיפוש לפנייה',detail:en?'Example: 4.3 stars, 38 reviews. Connect Places for your business data.':'דוגמה: 4.3 כוכבים, 38 ביקורות. נתוני העסק שלכם יופיעו לאחר חיבור Places.'});
        findings.push({title:en?'What still needs checking':'מה עדיין צריך לבדוק',detail:en?'Mobile speed, local position and owner replies require additional measurements or owner access.':'מהירות במובייל, מיקום מקומי ומענה לביקורות דורשים מדידה נוספת או גישה של בעל העסק.'});
        const token=crypto.randomBytes(32).toString('hex'),xray={business,lang,mode:selectedId?'places':report?'website':'mock',...(selectedId?{placeId:selectedId,checkedAt:new Date().toISOString()}:{}),findings,website:report,places:!selectedId&&!report?businessData:null};
        await append('scan',business,{business,xray,capabilityCheck:null,reports:archiveReports(lead),websiteReport:report,reportHash:hash(token),reportExpires:Date.now()+7*86400_000,nextAction:en?'Review scan and prepare a concept':'לבדוק דו״ח ולהכין קונספט'});
        if(report&&body.performanceConsent===true&&performance?.status().enabled){try{const job=await performance.enqueue({leadId:lead.id,url:report.url,consent:true});xray.performanceJob=job.jobId;await append('performance-consent','Visitor requested mobile measurement by Google PageSpeed Insights',{xray});void performance.drain().catch(()=>{});}catch{await append('performance-unavailable','Mobile measurement quota or service unavailable');}}
        return json(200,{ok:true,session:rawToken,xray:{...xray,...(selectedId?{places:placeDetails}:{})},reportUrl:'/report/'+token});
      }
      if(operation==='contact'){
        const contact=textField(body,'contact',180,5);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)&&!/^\+?[\d ()-]{7,25}$/.test(contact))throw new HttpError(422,'contact');
        if(body.consent!==true)throw new HttpError(422,'consent');
        const enquiry=body.enquiry===true;
        const requestHash=enquiry?hash(JSON.stringify({contact,name:textField(body,'name',100,1),business:textField(body,'business',180,1),message:textField(body,'message',2000),lang})):null;
        if(enquiry&&lead?.consentAt){
          if(lead.contactRequestHash===requestHash)return json(200,{ok:true,session:rawToken,duplicate:true,delivery:{state:'not_requested',delivered:false}});
          throw new HttpError(409,'enquiry_closed');
        }
        const isEmail=contact.includes('@'),email=isEmail?contact:enquiry?'':lead?.email||'',phone=normalizePhone(isEmail?(enquiry?'':textField(body,'phone',25)||lead?.phone||''):contact);
        await append('contact',isEmail?'email':'whatsapp',{email,phone,...(enquiry?{contactRequestHash:requestHash}:{}),name:textField(body,'name',100)||lead?.name||'',business:textField(body,'business',180)||lead?.business||'',message:textField(body,'message',2000)||lead?.message||'',marketing:Object.hasOwn(body,'marketing')?body.marketing===true:lead?.marketing||false,preferredContact:['email','phone','whatsapp'].includes(body.preferredContact)?body.preferredContact:isEmail?'email':'phone',service:textField(body,'service',60)||lead?.service||'',consentAt:new Date().toISOString(),nextAction:'לחזור לפנייה ולמסור דו״ח'});
        void notifyOwners?.().catch(()=>{});const reportToken=textField(body,'reportToken',64);const result=reportToken||review?await provider.perform('delivery',{lead,reportToken,recipient:isEmail?contact:phone,channel:isEmail?'email':'whatsapp',lang}):{mode:provider.mode,state:'not_requested',delivered:false};if(result.state==='pending')void delivery?.drain().catch(()=>{});return json(200,{ok:true,session:rawToken,delivery:result});
      }
      if(operation==='whatsapp'){await append('whatsapp','לחיצה לפתיחת WhatsApp — אינה הוכחת משלוח');return json(200,{ok:true,session:rawToken});}
      let bookingBody;
      if(operation==='booking'&&!review){if(body.consent!==true)throw new HttpError(422,'booking_consent');bookingBody={name:textField(body,'name',100,2),email:textField(body,'email',180,3),start:textField(body,'start',40,10),key:textField(body,'key',64,20),privacy:'yes',language:lang};await append('booking-request',bookingBody.start,{consentAt:new Date().toISOString(),nextAction:'לבדוק אישור פגישה'});}
      else if(operation==='booking'){
        const slot=textField(body,'slot',5,5);if(!['10:00','12:30','16:00'].includes(slot))throw new HttpError(422,'slot');
        await append('booking',slot,{nextAction:'לאשר מועד עם הפונה'});
      } else if(operation==='voice'||operation==='reply'){
        const message=operation==='reply'?textField(body,'message',600,1):'';
        await append(operation,message||(review?'התחלת שיחה בהמחשה':'בקשה לשיחה קולית'),{nextAction:'לחזור לשיחת היכרות'});
      }
      const response=await provider.perform(operation,{lang,message:operation==='reply'?body.message:undefined,assistantToken:textField(body,'assistantToken',64),date:textField(body,'date',10),body:bookingBody,leadId:lead?.id});
      if(response.transcript)await append('transcript',response.transcript);if(operation==='booking'&&response.available)void notifyOwners?.().catch(()=>{});
      return json(200,{ok:true,session:rawToken,...response});
    });
  }
  return {handle};
}
module.exports={createExperience};
