'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {promisify} = require('node:util');
const {HttpError,escape,ipOf,createLimiter,readBody,textField,sameOrigin} = require('./lib/security');
const {createStore} = require('./lib/store');
const {createStats,EVENTS} = require('./lib/stats');
const {createMailer,createNotifier} = require('./lib/mail');
const {createAdmin} = require('./lib/admin');
const {createWhatsAppNotifier} = require('./lib/whatsapp');
const {assess} = require('./lib/assessment');
const {createWebsiteChecker} = require('./lib/website-check');
const {createAssistant} = require('./lib/assistant');
const {createBooking} = require('./lib/booking');
const {createExperience} = require('./lib/experience');
const {createCapabilityCheck}=require('./lib/capability-check');
const {checkPage}=require('./lib/check-page');
const {createVoice} = require('./lib/voice');
const {createPlaces} = require('./lib/places');
const {createPagespeed} = require('./lib/pagespeed');
const {createReportDelivery} = require('./lib/report-delivery');
const gzip=promisify(zlib.gzip);
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff','.vcf':'text/vcard; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
const SOURCES=new Set(['contact','assessment','meeting','card-shahar','card-or']);
const SERVICES=new Set(['','automation','business-systems','websites','website-review','commerce','ai','lead-management','local-presence','retention','ongoing-care','accessibility-care','digital-cards']);
const EMAIL=/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
function phoneValue(value){if(!value)return '';if(!/^\+?[\d() .-]{7,25}$/.test(value))throw new HttpError(422,'invalid_phone');let n=value.replace(/\D/g,'');if(n.startsWith('00'))n=n.slice(2);if(n.startsWith('0')&&n.length>=9&&n.length<=10)n='972'+n.slice(1);if(!/^[1-9]\d{7,14}$/.test(n))throw new HttpError(422,'invalid_phone');return '+'+n;}
async function createApplication(options={}){
  const requestedEnv=options.env||process.env;
  const reviewMock=requestedEnv.APP_ENV==='review'&&requestedEnv.REVIEW_LIVE_APPROVED!=='yes';
  // Defence in depth: direct legacy routes and background mail obey the same review hold.
  const env=reviewMock?{...requestedEnv,INTEGRATIONS_ENABLED:'0',SMTP_HOST:'',SMTP_USER:'',SMTP_PASS:'',SENDMAIL_PATH:'disabled'}:requestedEnv;
  const publicDir=path.resolve(options.publicDir||path.join(__dirname,'public'));
  const dataDir=path.resolve(options.dataDir||env.DATA_DIR||path.join(__dirname,'data'));
  if(dataDir===publicDir||dataDir.startsWith(publicDir+path.sep))throw new Error('DATA_DIR must be outside public');
  const manifest=JSON.parse(await fs.readFile(path.join(publicDir,'build-manifest.json'),'utf8'));
  const pages=new Map(manifest.pages.map(p=>[p.path,p]));
  const production=env.APP_ENV==='production';
  const siteOrigin=env.SITE_ORIGIN?new URL(env.SITE_ORIGIN).origin:'';
  if(production&&(!siteOrigin||!siteOrigin.startsWith('https://')))throw new Error('Production requires an HTTPS SITE_ORIGIN');
  if(production&&!path.isAbsolute(env.DATA_DIR||''))throw new Error('Production requires an absolute persistent DATA_DIR');
  const store=options.store||createStore(dataDir);await store.init();
  const stats=options.stats||createStats(dataDir);await stats.init();
  const whatsappLedger=createStore(path.join(dataDir,'whatsapp-usage'),{retentionDays:2});await whatsappLedger.init();
  const mailer=!reviewMock&&options.mailer?options.mailer:createMailer(env),notifier=createNotifier(store,mailer,{experienceStartAt:env.MAIL_V4_START_AT}),waNotifier=createWhatsAppNotifier(store,env,options.whatsappFetch,{review:reviewMock,usageLedger:whatsappLedger});
  const admin=createAdmin({password:env.ADMIN_PASSWORD||'',store,stats,assets:manifest.assets});
  if(production&&!admin.enabled)throw new Error('Production requires ADMIN_PASSWORD of at least 16 characters');
  const leadLimit=createLimiter({limit:8}),eventLimit=createLimiter({limit:100});
  const auditLimit=createLimiter({limit:8}),checkWebsite=options.checkWebsite||createWebsiteChecker();
  const placesLedger=createStore(path.join(dataDir,'places-usage'),{retentionDays:2});await placesLedger.init();
  const places=createPlaces({env,ledger:placesLedger,review:reviewMock,fetchImpl:options.placesFetch});
  const capability=createCapabilityCheck({store,checkWebsite,places});
  const performanceJobs=createStore(path.join(dataDir,'performance-jobs'),{retentionDays:7});await performanceJobs.init();
  const performance=createPagespeed({env,jobs:performanceJobs,store,review:reviewMock,fetchImpl:options.performanceFetch});
  const reportQueue=createStore(path.join(dataDir,'report-delivery'),{retentionDays:7});await reportQueue.init();
  const delivery=createReportDelivery({env,queue:reportQueue,store,mailer,whatsapp:{enabled:waNotifier.reportEnabled,report:waNotifier.report},review:reviewMock});
  const experienceLimit=createLimiter({limit:35});
  const ledger=createStore(path.join(dataDir,'assistant'),{retentionDays:7});await ledger.init();
  const voiceLedger=createStore(path.join(dataDir,'voice-sessions'),{retentionDays:7});await voiceLedger.init();
  const voice=createVoice({env,store,ledger:voiceLedger,review:reviewMock,fetchImpl:options.voiceFetch});
  const voiceLimit=createLimiter({limit:3});
  const assistant=createAssistant({env,ledger,fetchImpl:options.providerFetch});
  const booking=createBooking({env,store,fetchImpl:options.providerFetch});
  const experience=createExperience({store,checkWebsite,assets:manifest.assets,review:reviewMock,places,performance,delivery,assistant,booking,notifyOwners:()=>waNotifier.drain()});
  const assistantLimit=createLimiter({limit:20}),calendarLimit=createLimiter({limit:30}),bookingLimit=createLimiter({limit:5});
  const reports=new Map();
  const cache=new Map();let cacheBytes=0;const cacheLimit=24*1024*1024;
  const proxyIPs=new Set((env.PROXY_IPS||'127.0.0.1,::1,::ffff:127.0.0.1').split(',').map(x=>x.trim()));
  const trusted=req=>env.TRUST_PROXY==='1'&&proxyIPs.has(req.socket.remoteAddress);
  const errorPage=(code,status)=>`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="stylesheet" href="${manifest.assets['site.css']}"><title>Keystone — ${status}</title><main class="container page-intro"><span class="eyebrow">KEYSTONE / ${status}</span><h1>לא ניתן להשלים את הפעולה.</h1><p>הפנייה לא נשמרה. בדקו את הפרטים ונסו שוב, או פנו ישירות.</p><p lang="en" dir="ltr">The request could not be completed. Please check your details or contact us directly.</p><p><a href="mailto:shahar@keystone.org.il">shahar@keystone.org.il</a> · <a href="tel:+972505640429" dir="ltr">050-564-0429</a></p><a class="button" href="/contact/">חזרה ליצירת קשר</a><p class="micro">${escape(code)}</p></main></html>`;
  const server=http.createServer({maxHeaderSize:16384},async(req,res)=>{
    const requestId=crypto.randomBytes(6).toString('hex');
    const send=(status,body='',type='text/plain; charset=utf-8')=>{if(res.headersSent||res.destroyed)return;res.statusCode=status;res.setHeader('Content-Type',type);const bytes=Buffer.isBuffer(body)?body:Buffer.from(String(body));res.setHeader('Content-Length',bytes.length);res.end(req.method==='HEAD'?undefined:bytes);};
    const json=(status,body)=>send(status,JSON.stringify(body),'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy',`camera=(), microphone=${voice.status().enabled?'(self)':'()'}, geolocation=(), payment=(), accelerometer=(), gyroscope=()`);res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'${voice.status().enabled?" 'wasm-unsafe-eval'":''}; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'${voice.status().enabled?' https://api.elevenlabs.io wss://api.elevenlabs.io https://*.elevenlabs.io wss://*.elevenlabs.io https://*.livekit.cloud wss://*.livekit.cloud':''}; media-src 'self'${voice.status().enabled?' blob:':''}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);res.setHeader('X-Request-Id',requestId);
    if(!production)res.setHeader('X-Robots-Tag','noindex, nofollow');
    try{
      const raw=(req.url||'/').split('?')[0];
      if((req.url||'').length>4096)throw new HttpError(414,'url_too_long');
      if(/\\|%5c|%00|\x00/i.test(raw))throw new HttpError(400,'invalid_path');
      let pathname;try{pathname=decodeURIComponent(raw);}catch{throw new HttpError(400,'invalid_path');}
      if(!pathname.startsWith('/')||pathname.split('/').some(x=>x.startsWith('.')||x.includes(':'))||pathname.includes('%'))throw new HttpError(404,'not_found');
      const host=String(req.headers.host||'');
      if(!/^[A-Za-z0-9.[\]:-]{1,255}$/.test(host))throw new HttpError(400,'invalid_host');
      const proxy=trusted(req);const secure=!!req.socket.encrypted||(proxy&&req.headers['x-forwarded-proto']==='https');
      const origin=siteOrigin||`http://${host}`;
      const originHost=new URL(origin).host;
      if(siteOrigin&&host!==originHost){
        if(production&&host==='www.'+originHost&&['GET','HEAD'].includes(req.method)){res.setHeader('Location',siteOrigin+req.url);return send(308,'');}
        throw new HttpError(400,'invalid_host');
      }
      if(!siteOrigin&&!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))throw new HttpError(400,'invalid_host');
      if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
      if(production&&!secure){res.setHeader('Location',origin+req.url);return send(308,'');}
      const ip=ipOf(req,proxy);
      if(pathname.startsWith('/call/')){
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'method');if(!experienceLimit(ip))throw new HttpError(429,'rate_limited');
        const permission=waNotifier.readCall(pathname.split('/')[2]);if(!permission)throw new HttpError(404,'not_found');const lead=(await store.list()).find(l=>l.id===permission.id);if(!lead?.consentAt||!lead.phone&&!lead.email)throw new HttpError(404,'not_found');
        return send(200,`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>חוזרים לפנייה · קיסטון</title><link rel="stylesheet" href="/assets/v4-report.css"><main class="subpage"><p class="eyebrow">KEYSTONE / קשר עם הפונה</p><h1>${escape(lead.name||lead.business||'פנייה חדשה')}</h1><p class="lede">${escape(lead.nextAction||'לחזור לפונה')}</p>${lead.preferredContact?`<p>ערוץ מועדף: ${escape({phone:'טלפון',email:'מייל',whatsapp:'WhatsApp'}[lead.preferredContact]||lead.preferredContact)}</p>`:''}${lead.phone?`<a class="primary" dir="ltr" href="tel:${escape(lead.phone)}">${escape(lead.phone)} · חיוג</a>`:''}${lead.email?`<p><a href="mailto:${escape(lead.email)}">${escape(lead.email)}</a></p>`:''}<p><a href="/admin#lead-${escape(lead.id)}">לכל הפנייה בניהול</a></p></main></html>`,'text/html; charset=utf-8');
      }
      if(pathname.startsWith('/report-delivery/cancel/')||pathname==='/api/report-delivery/cancel'){
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');
        if(!experienceLimit(ip))throw new HttpError(429,'rate_limited');
        if(pathname==='/api/report-delivery/cancel'){
          if(req.method!=='POST')throw new HttpError(405,'method');if(!sameOrigin(req,origin))throw new HttpError(403,'origin_rejected');
          const body=await readBody(req,512),result=await delivery.cancel(textField(body,'token',64,64));
          return send(200,result.state==='in_flight'||result.state==='already_accepted'?'בקשת הביטול נשמרה. הודעה שכבר התקבלה אצל הספק אינה ניתנת למשיכה.':'שליחת הדו״ח בוטלה.','text/plain; charset=utf-8');
        }
        if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'method');const token=pathname.split('/')[3];if(!await delivery.findCancel(token))throw new HttpError(404,'not_found');
        return send(200,`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ביטול שליחת דו״ח · קיסטון</title><link rel="stylesheet" href="/assets/v4-report.css"><main class="subpage"><h1>לבטל את שליחת הדו״ח?</h1><form method="post" action="/api/report-delivery/cancel"><input type="hidden" name="token" value="${escape(token)}"><button class="primary">כן, לבטל</button></form><p>הודעה שכבר נמסרה לספק אינה ניתנת למשיכה.</p></main></html>`,'text/html; charset=utf-8');
      }
      if(pathname==='/api/voice/session'){
        res.setHeader('Cache-Control','no-store');
        if(req.method!=='POST')throw new HttpError(405,'method');
        if(!sameOrigin(req,origin))throw new HttpError(403,'origin_rejected');
        if(!voiceLimit(ip))throw new HttpError(429,'rate_limited');
        return json(200,{ok:true,...await voice.session(await readBody(req,2048))});
      }
      if(['/check/','/en/check/'].includes(pathname)){
        if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'method');
        res.setHeader('Cache-Control','no-cache');return send(200,checkPage(pathname.startsWith('/en/')?'en':'he',manifest.assets),'text/html; charset=utf-8');
      }
      if(pathname==='/api/capability-check'){
        if(req.method!=='POST')throw new HttpError(405,'method');
        if(!sameOrigin(req,origin))throw new HttpError(403,'origin_rejected');
        if(!auditLimit(ip))throw new HttpError(429,'rate_limited');
        res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');
        return await capability.handle(req,res);
      }
      if(pathname==='/api/experience'||pathname.startsWith('/report/')){
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');
        if(pathname==='/api/experience'&&!sameOrigin(req,origin))throw new HttpError(403,'origin_rejected');
        if(!experienceLimit(ip))throw new HttpError(429,'rate_limited');
        return await experience.handle(req,{pathname,json,send,scanAllowed:()=>auditLimit(ip),bookingAllowed:()=>bookingLimit(ip),assistantAllowed:()=>assistantLimit(ip),slotsAllowed:()=>calendarLimit(ip)});
      }
      if(pathname==='/api/integrations'&&req.method==='GET'){
        res.setHeader('Cache-Control','no-store');return json(200,{assistant:assistant.status(),booking:booking.status(),voice:voice.status(),places:places.status(),performance:performance.status(),delivery:delivery.status(),whatsapp:waNotifier.status()});
      }
      if(['/api/assistant','/api/booking/slots','/api/booking'].includes(pathname)){
        res.setHeader('Cache-Control','no-store');
        if(req.method!=='POST')throw new HttpError(405,'method_not_allowed');
        if(!sameOrigin(req,origin))throw new HttpError(403,'origin_rejected');
        if(!(pathname==='/api/assistant'?assistantLimit:calendarLimit)(ip))throw new HttpError(429,'rate_limited');
        const body=await readBody(req,4096);
        if(pathname==='/api/assistant')return json(200,{ok:true,...await assistant.reply(body)});
        if(pathname==='/api/booking/slots')return json(200,{ok:true,slots:await booking.slots(textField(body,'date',10,10))});
        if(!bookingLimit(ip))throw new HttpError(429,'rate_limited');
        return json(201,{ok:true,...await booking.book(body)});
      }
      if(pathname==='/api/website-check'){
        res.setHeader('Cache-Control','no-store');
        if(req.method!=='POST')throw new HttpError(405,'method_not_allowed');
        if(!sameOrigin(req,origin))throw new HttpError(403,'origin_rejected');
        if(!auditLimit(ip)){res.setHeader('Retry-After','900');throw new HttpError(429,'rate_limited');}
        const body=await readBody(req,1024);
        const report=await checkWebsite(textField(body,'url',600,4));
        for(const [key,item] of reports)if(item.until<Date.now())reports.delete(key);
        if(reports.size>=200)reports.delete(reports.keys().next().value);
        const token=crypto.randomBytes(32).toString('hex');reports.set(token,{report,until:Date.now()+30*60000});
        return json(200,{ok:true,report,reportToken:token});
      }
      if(['/api/health','/healthz'].includes(pathname)&&['GET','HEAD'].includes(req.method)){res.setHeader('Cache-Control','no-store');return json(200,{ok:true,version:2});}
      if(pathname.startsWith('/admin')){
        // Loopback review is allowed; the Secure cookie is still always used. Production must be HTTPS.
        if(!secure&&production)throw new HttpError(403,'https_required');
        return await admin.handle(req,res,{pathname:pathname==='/admin/'?'/admin':pathname,origin,ip,send,sameOrigin:sameOrigin(req,origin)});
      }
      if(pathname==='/api/events'){
        res.setHeader('Cache-Control','no-store');if(req.method!=='POST')throw new HttpError(405,'method_not_allowed');if(!sameOrigin(req,origin))throw new HttpError(403,'origin_rejected');if(!eventLimit(ip))throw new HttpError(429,'rate_limited');const body=await readBody(req,1024);if(typeof body.event!=='string'||!EVENTS.has(body.event))throw new HttpError(422,'invalid_event');stats.event(body.event,req);return send(204,'');
      }
      if(pathname==='/api/leads'||pathname==='/api/contact'){
        res.setHeader('Cache-Control','no-store');
        if(req.method!=='POST')throw new HttpError(405,'method_not_allowed');
        if(!sameOrigin(req,origin))throw new HttpError(403,'origin_rejected');
        if(!leadLimit(ip)){res.setHeader('Retry-After','900');throw new HttpError(429,'rate_limited');}
        const body=await readBody(req);
        if(textField(body,'website',200)){return json(200,{ok:true});}
        const language=textField(body,'language',2)||'he';if(!['he','en'].includes(language))throw new HttpError(422,'invalid_language');
        const source=textField(body,'source',30)||'contact';if(!SOURCES.has(source))throw new HttpError(422,'invalid_source');
        const name=textField(body,'name',100,2),email=textField(body,'email',180,3),business=textField(body,'business',140),phone=phoneValue(textField(body,'phone',25)),message=textField(body,'message',3000,source==='assessment'?0:10);
        if(!EMAIL.test(email)||email.split('@')[0].startsWith('.')||email.split('@')[0].endsWith('.')||email.includes('..'))throw new HttpError(422,'invalid_email');
        if(body.privacy!=='yes')throw new HttpError(422,'privacy_required');
        const service=textField(body,'service',30);if(!SERVICES.has(service))throw new HttpError(422,'invalid_service');
        const preferredContact=textField(body,'preferredContact',12)||'email';if(!['email','phone','whatsapp'].includes(preferredContact))throw new HttpError(422,'invalid_contact');if(preferredContact!=='email'&&!phone)throw new HttpError(422,'invalid_phone');
        const page=textField(body,'page',160)||'/';if(!pages.has(page))throw new HttpError(422,'invalid_page');
        let assessment=null;if(source==='assessment'){let answers;try{answers=JSON.parse(textField(body,'answers',128,1));assessment=assess(answers,language);}catch{throw new HttpError(422,'invalid_answers');}}
        let preferredTime='';if(source==='meeting'){
          const date=textField(body,'preferredDate',10),window=textField(body,'preferredWindow',11);const now=new Date();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const max=new Date(Date.now()+91*86400000).toISOString().slice(0,10);
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<today||date>max||!['09:00-11:00','11:00-14:00','14:00-17:00'].includes(window))throw new HttpError(422,'invalid_meeting');preferredTime=date+' '+window+' Asia/Jerusalem (pending confirmation)';
        }
        const emailCopy=source==='assessment'&&body.emailCopy==='yes';
        let websiteReport=null,conversation=null;
        const reportToken=textField(body,'reportToken',64),conversationToken=textField(body,'conversationToken',64);
        if(reportToken){const item=reports.get(reportToken);if(!item||item.until<Date.now())throw new HttpError(410,'report_expired');websiteReport=item.report;}
        if(conversationToken)conversation=await assistant.transcript(conversationToken);
        const row=await store.add({name,email,business,phone,message,language,source,page,service,preferredContact,preferredTime,assessment,websiteReport,conversation,emailCopy,marketing:body.marketing==='yes',privacyVersion:'2026-11-03',notifications:{owners:{state:mailer.enabled?'pending':'disabled',attempts:0},...(emailCopy?{copy:{state:mailer.enabled?'pending':'disabled',attempts:0}}:{})}});
        if(source==='meeting')stats.event('meeting',req);
        void notifier.drain().catch(()=>console.error(JSON.stringify({event:'notification_error',requestId})));
        void waNotifier.drain().catch(()=>console.error(JSON.stringify({event:'wa_notification_error',requestId})));
        if(String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')&&!String(req.headers.accept).includes('application/json')){res.setHeader('Location',language==='en'?'/en/thanks/':'/thanks/');return send(303,'');}
        return json(201,{ok:true,id:row.id});
      }
      if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'method_not_allowed');
      if(pathname.startsWith('/api/'))throw new HttpError(404,'not_found');
      if(!production&&pathname==='/robots.txt')return send(200,'User-agent: *\nDisallow: /\n');
      if(!pathname.endsWith('/')&&pages.has(pathname+'/')){res.setHeader('Location',pathname+'/' +(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):''));return send(308,'');}
      const page=pages.get(pathname);
      // Only public tools may appear inside the site's own dialog. Admin and API
      // responses keep DENY; no external origin can frame any part of the site.
      if(page&&['tools','assistant','booking','calculator','assessment'].includes(page.route)){
        res.setHeader('X-Frame-Options','SAMEORIGIN');
        res.setHeader('Content-Security-Policy',res.getHeader('Content-Security-Policy').replace("frame-ancestors 'none'","frame-ancestors 'self'"));
      }
      let relative=page?pathname+'index.html':pathname;
      if(!page&&!MIME[path.extname(relative).toLowerCase()])throw new HttpError(404,'not_found');
      if(!page&&path.extname(relative)==='.html')throw new HttpError(404,'not_found');
      const file=path.resolve(publicDir,'.'+relative);
      if(!file.startsWith(publicDir+path.sep))throw new HttpError(404,'not_found');
      let real,stat;try{real=await fs.realpath(file);if(!real.startsWith(publicDir+path.sep))throw new Error();stat=await fs.stat(real);if(!stat.isFile())throw new Error();}catch{res.statusCode=404;const html=await fs.readFile(path.join(publicDir,'404.html'));return send(404,html,'text/html; charset=utf-8');}
      let item=cache.get(real);if(!item||item.mtime!==stat.mtimeMs){const bytes=await fs.readFile(real);const compressed=bytes.length>1024&&/\.(html|js|css|svg|xml|txt)$/.test(real)?await gzip(bytes,{level:6}):null;item={mtime:stat.mtimeMs,bytes,gzip:compressed,etag:'"'+crypto.createHash('sha256').update(bytes).digest('base64url').slice(0,22)+'"'};if(cacheBytes+bytes.length+(compressed?.length||0)>cacheLimit){cache.clear();cacheBytes=0;}cache.set(real,item);cacheBytes+=bytes.length+(compressed?.length||0);}
      const immutable=/\/assets\/build\/.+-[A-Z0-9]+\.(css|js)$/.test(pathname);
      res.setHeader('Cache-Control',immutable?'public, max-age=31536000, immutable':page?'public, max-age=0, must-revalidate':'public, max-age=3600');res.setHeader('ETag',item.etag);res.setHeader('Vary','Accept-Encoding');
      if(page){const hashes=[...item.bytes.toString().matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');res.setHeader('Content-Security-Policy',res.getHeader('Content-Security-Policy').replace("script-src 'self'",`script-src 'self' ${hashes}`));}
      if(req.headers['if-none-match']===item.etag)return send(304,'');
      if(page&&req.method==='GET'&&!['thanks'].includes(page.route))stats.view(pathname,req);
      if(pathname.endsWith('.vcf'))res.setHeader('Content-Disposition',`attachment; filename="keystone-${path.basename(pathname)}"`);
      const accept=String(req.headers['accept-encoding']||'').split(',').map(x=>x.trim());const useGzip=item.gzip&&accept.some(x=>/^gzip(?:;\s*q=(?:1(?:\.0*)?|0?\.[1-9]\d*))?$/.test(x));if(useGzip)res.setHeader('Content-Encoding','gzip');return send(200,useGzip?item.gzip:item.bytes,MIME[path.extname(real).toLowerCase()]);
    }catch(error){
      const status=error instanceof HttpError?error.status:503,code=error instanceof HttpError?error.code:'unavailable';
      if(status>=500)console.error(JSON.stringify({event:'request_failed',requestId,code:error.code||error.name||'ERROR'}));
      res.setHeader('Cache-Control','no-store');
      if(req.url?.startsWith('/api/'))return json(status,{ok:false,error:code});
      if(status===404){try{return send(404,await fs.readFile(path.join(publicDir,'404.html')),'text/html; charset=utf-8');}catch{}}
      return send(status,errorPage(code,status),'text/html; charset=utf-8');
    }
  });
  server.requestTimeout=20000;server.headersTimeout=15000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;
  const intervals=[];
  if(options.timers!==false){intervals.push(setInterval(()=>performance.drain().catch(()=>{}),60000));void performance.drain().catch(()=>{});intervals.push(setInterval(()=>delivery.drain().catch(()=>{}),60000));void delivery.drain().catch(()=>{});intervals.push(setInterval(()=>waNotifier.drain().catch(()=>{}),60000));void waNotifier.drain().catch(()=>{}); }
  if(options.timers!==false){intervals.push(setInterval(()=>stats.flush().catch(()=>console.error('{"event":"stats_flush_failed"}')),30000));intervals.push(setInterval(()=>notifier.drain().catch(()=>console.error('{"event":"notification_error"}')),60000));if(store.prune)intervals.push(setInterval(()=>store.prune().catch(()=>console.error('{"event":"retention_failed"}')),3600_000));intervals.push(setInterval(()=>Promise.all([ledger.prune(),voiceLedger.prune(),placesLedger.prune(),reportQueue.prune(),whatsappLedger.prune(),performanceJobs.prune()]).catch(()=>console.error('{"event":"assistant_retention_failed"}')),3600_000));intervals.forEach(x=>x.unref());void notifier.drain().catch(()=>{});}
  return {server,store,stats,mailer,admin,manifest,async close(){intervals.forEach(clearInterval);await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await performance.close();await delivery.close();await notifier.close();await waNotifier.close();await store.idle();await ledger.idle();await voiceLedger.idle();await placesLedger.idle();await performanceJobs.idle();await reportQueue.idle();await whatsappLedger.idle();await stats.flush();}};
}
if(require.main===module){
  try{process.loadEnvFile?.(path.join(__dirname,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
  createApplication().then(app=>{const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';app.server.listen(port,host,()=>console.log(`Keystone v2 ready at http://${host}:${port} — ${process.env.APP_ENV==='production'?'production':'private review; indexing blocked'}`));let closing=false;const close=()=>{if(closing)return;closing=true;const timeout=setTimeout(()=>process.exit(1),20000);timeout.unref();app.close().then(()=>process.exit(0),()=>process.exit(1));};process.on('SIGINT',close);process.on('SIGTERM',close);}).catch(error=>{console.error('Startup failed:',error.message);process.exitCode=1;});
}
module.exports={createApplication,phoneValue};
