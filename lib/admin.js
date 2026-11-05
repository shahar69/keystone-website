'use strict';
const crypto = require('node:crypto');
const {proposalForm,parseProposal,createProposalPDF}=require('./proposal');
const {HttpError,escape:e,safeEqual,createLimiter,readBody,textField,cookie} = require('./security');
const STATUSES = {new:'חדשה',contacted:'נוצר קשר',meeting:'פגישה',proposal:'הצעה',won:'נסגרה',lost:'לא התקדם'};
const SOURCES = {booking:'פגישה ביומן',contact:'טופס קשר',assessment:'אבחון',meeting:'בקשת פגישה','card-shahar':'כרטיס שחר','card-or':'כרטיס אור'};
const SERVICES = {automation:'אוטומציה לעסקים','business-systems':'מערכות ואינטגרציות',websites:'בניית אתרים','website-review':'בדיקת אתר',ai:'עוזרי AI',commerce:'חנויות','lead-management':'טיפול בפניות','local-presence':'נוכחות מקומית',retention:'קשר חוזר','ongoing-care':'טיפול שוטף','accessibility-care':'נגישות','digital-cards':'כרטיסים דיגיטליים'};
const CONTACT = {email:'מייל',phone:'טלפון',whatsapp:'WhatsApp'};
const MAIL_STATES = {pending:'ממתינה לשליחה',sent:'התקבלה בשרת הדואר (מסירה לא אושרה)',failed:'השליחה נכשלה — לבדוק הגדרות',disabled:'שליחת דוא״ל אינה מוגדרת'};
const dateTime = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : value;
const assessmentSummary = a => `<details><summary>אבחון עצמי · ${e(a.score)}/100</summary><p>מדד חיכוך לפי דיווח עצמי; ציון גבוה מצביע על יותר קושי.</p><ul>${(a.areas||[]).map(x=>`<li><strong>${e(x.label)} · ${e(x.score)}/100</strong><p>${e(x.recommendation)}</p></li>`).join('')}</ul></details>`;
const experienceContext=l=>`${l.nextAction?`<p><strong>הצעד הבא:</strong> ${e(l.nextAction)}</p>`:''}${l.xray?`<details><summary>צילום העסק · ${e(l.xray.business)} · ${l.xray.mode==='mock'?'נתוני המחשה':'בדיקת אתר'}</summary><ul>${l.xray.findings.map(f=>`<li><strong>${e(f.title)}</strong><p>${e(f.detail)}</p></li>`).join('')}</ul></details>`:''}${l.timeline?.length?`<details open><summary>ציר הפנייה · ${l.timeline.length} אירועים</summary><ol>${l.timeline.map(item=>`<li><time>${e(dateTime(item.at))}</time> · <strong>${e({voice:'פתיחת שיחה','voice-live':'נפתח session ספק קול','voice-client-user':'תמליל לקוח מהדפדפן — לא אומת אצל הספק','voice-client-agent':'תמליל נציג מהדפדפן — לא אומת אצל הספק','voice-ended':'סיום שיחה',reply:'הודעת הפונה',transcript:'תמליל מדומה',scan:'בדיקת עסק',contact:'פרטי קשר',booking:'בקשת מועד מדומה',whatsapp:'לחיצה ל־WhatsApp'}[item.type]||item.type)}</strong><p>${e(item.detail)}</p></li>`).join('')}</ol></details>`:''}`;

function csvCell(value) { const text = String(value ?? ''); return '"'+(/^[\s]*[=+\-@\t\r]/.test(text) ? "'"+text : text).replace(/"/g,'""')+'"'; }
function exportCSV(leads) {
  const columns = ['id','receivedAt','status','source','name','business','email','phone','service','preferredTime','message','followUp','notes','assessment'];
  return '\uFEFF'+[columns.map(csvCell).join(','),...leads.map(row=>columns.map(key=>csvCell(key==='assessment'?JSON.stringify(row[key] || ''):row[key])).join(','))].join('\r\n');
}
const CHECK_NAMES={https:'חיבור מאובטח',title:'כותרת העמוד',description:'תיאור בחיפוש',viewport:'התאמה למסך',heading:'כותרת ראשית',language:'שפה וכיווניות',alt:'טקסט חלופי',contact:'דרך יצירת קשר',privacy:'קישור לפרטיות',accessibility:'קישור לנגישות',sharing:'תצוגת שיתוף',schema:'מידע מובנה',forms:'תוויות לשדות'};
function linkedContext(l){const r=l.capabilityCheck?.website||l.websiteReport;return `${l.capabilityCheck?`<details class="lead-context"><summary>מפת יכולות · ${e(l.capabilityCheck.business)}</summary><p>רמות פנימיות לא נקבעו מתוך האתר הציבורי.</p>${l.capabilityCheck.analysis.opportunities.map(o=>`<h4>${e(o.capability)}</h4><p>${e(o.observation)}</p><p>${e(o.nextStep)}</p>`).join('')}</details>`:''}${r?`<details class="lead-context"><summary>דוח אתר · ${e(r.url)}</summary><p>${e(r.passed)} מתוך ${e(r.total)} סימנים טכניים נמצאו · ${e(dateTime(r.checkedAt))}</p><p>בדיקה מוגבלת של קוד העמוד, ללא הפעלת טפסים. אינה ציון איכות, בדיקת אבטחה או אישור נגישות.</p><ul>${r.checks.map(c=>`<li>${c.pass?'✓ נמצא':'לטיפול'} · ${e(CHECK_NAMES[c.id]||c.id)}${!c.pass?' · '+e({high:'עדיפות גבוהה',medium:'עדיפות בינונית',low:'שיפור משלים'}[c.priority]):''}</li>`).join('')}</ul><p>צעד הבא: לבדוק ידנית במובייל את הפנייה והמסירה, ולבחור תיקון אחד בעל השפעה גבוהה.</p></details>`:''}${l.conversation?`<details class="lead-context"><summary>שיחה עם העוזר · מצורפת לפי בקשת הפונה</summary>${l.conversation.messages.map(m=>`<p><strong>${m.role==='user'?'הפונה':'העוזר'}</strong> ${e(m.content)}</p>`).join('')}</details>`:''}${l.booking?`<p>מצב ביומן: ${e({accepted:'אושרה',pending_confirmation:'ממתינה לאישור',pending:'בטיפול',needs_review:'נדרש בירור אצל ספק היומן'}[l.booking.state]||l.booking.state)} · ${e(dateTime(l.booking.start))}</p>`:''}`;}
function createAdmin({password='',store,stats,assets={}}) {
  const enabled = password.length>=16, sessions = new Map(), limiter = createLimiter({limit:6});
  const salt = crypto.randomBytes(32), derived = crypto.scryptSync(password,salt,64);
  const asset = key=>assets[key] || '/assets/'+key;
  const shell = (title,body)=>`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(title)} · קיסטון</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${asset('site.css')}"><link rel="stylesheet" href="${asset('admin.css')}"><script type="module" src="${asset('admin.js')}"></script></head><body><a class="skip" href="#main">דילוג לתוכן</a><header class="admin-head wrap"><a class="brand" href="/">KEYSTONE</a><span>תיבת הפניות הפרטית</span></header><main id="main" class="admin-main wrap" tabindex="-1">${body}</main></body></html>`;
  const login = error=>shell('כניסה',`<section class="login-panel"><p class="eyebrow">PRIVATE / KEYSTONE</p><h1>כניסה לבעלי האתר</h1><p>הכניסה והפעולות זמינות בחיבור מאובטח. התיבה אינה ציבורית.</p>${error?'<p role="alert">הכניסה לא הצליחה. בדקו את הסיסמה או נסו מאוחר יותר.</p>':''}<form method="post" action="/admin/login"><label for="password">סיסמת ניהול</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button class="btn" type="submit">כניסה</button></form></section>`);
  function sessionFor(req) {
    const token = cookie(req,'ks_session'); if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const key = crypto.createHash('sha256').update(token).digest('hex'), session = sessions.get(key);
    if (session && session.expires>Date.now()) return {...session,key}; sessions.delete(key); return null;
  }
  async function handle(req,res,context) {
    if (!enabled) throw new HttpError(404,'not_found');
    const {pathname,origin,ip,send} = context;
    // Native same-origin POSTs need their Origin; external destinations receive no referrer.
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Robots-Tag','noindex, nofollow'); res.setHeader('Referrer-Policy','same-origin');
    if (pathname==='/admin/login') {
      if (req.method!=='POST') throw new HttpError(405,'method');
      if (!context.sameOrigin) throw new HttpError(403,'origin');
      if (!limiter(ip)) { res.setHeader('Retry-After','900'); return send(429,login(true),'text/html; charset=utf-8'); }
      const data = await readBody(req,2048), supplied = textField(data,'password',256);
      const match = crypto.timingSafeEqual(crypto.scryptSync(supplied,salt,64),derived);
      if (!match) return send(401,login(true),'text/html; charset=utf-8');
      for (const [key,value] of sessions) if (value.expires<=Date.now()) sessions.delete(key);
      if (sessions.size>=100) throw new HttpError(503,'busy');
      const token = crypto.randomBytes(32).toString('hex'), key = crypto.createHash('sha256').update(token).digest('hex');
      sessions.set(key,{csrf:crypto.randomBytes(24).toString('hex'),expires:Date.now()+12*3600_000});
      res.setHeader('Set-Cookie',`ks_session=${token}; Path=/admin; Max-Age=43200; HttpOnly; Secure; SameSite=Strict`);
      res.setHeader('Location','/admin'); return send(303,'');
    }
    const session = sessionFor(req);
    if (!session) {
      if (pathname==='/admin' && ['GET','HEAD'].includes(req.method)) return send(200,login(false),'text/html; charset=utf-8');
      throw new HttpError(401,'login_required');
    }
    if (req.method==='POST') {
      if (!context.sameOrigin) throw new HttpError(403,'origin');
      const data = await readBody(req,8192);
      if (!safeEqual(textField(data,'csrf',64),session.csrf)) throw new HttpError(403,'csrf');
      if (pathname==='/admin/logout') {
        sessions.delete(session.key); res.setHeader('Set-Cookie','ks_session=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict');
        res.setHeader('Location','/admin'); return send(303,'');
      }
      if (pathname==='/admin/update') {
        const id = textField(data,'id',64,1), status = textField(data,'status',20);
        if (!Object.hasOwn(STATUSES,status)) throw new HttpError(422,'status');
        const notes = textField(data,'notes',2000), followUp = textField(data,'followUp',10);
        if (followUp && (!/^\d{4}-\d{2}-\d{2}$/.test(followUp) || !Number.isFinite(Date.parse(followUp)) || new Date(followUp).toISOString().slice(0,10)!==followUp)) throw new HttpError(422,'followUp');
        const lead=(await store.list()).find(l=>l.id===id);if(!lead)throw new HttpError(404,'lead');
        const nextAction=Object.hasOwn(data,'nextAction')?textField(data,'nextAction',300):lead.nextAction||'';
        const change={status,notes,followUp,nextAction},event={at:new Date().toISOString(),type:'founder-update',detail:`${STATUSES[status]} · ${followUp||''} · ${nextAction}`};if(!(store.appendEvent?await store.appendEvent(id,event,change):await store.update(id,{...change,timeline:[...(lead.timeline||[]),event].slice(-100)})))throw new HttpError(404,'lead');
        res.setHeader('Location','/admin#lead-'+encodeURIComponent(id)); return send(303,'');
      }
      if(pathname==='/admin/proposal'){
        const lead=(await store.list()).find(l=>l.id===textField(data,'id',64,1));if(!lead)throw new HttpError(404,'lead');
        const proposal=parseProposal(data,lead),pdf=await createProposalPDF(proposal);
        await store.update(lead.id,{proposals:[...(lead.proposals||[]).slice(-19),proposal],timeline:[...(lead.timeline||[]),{at:new Date().toISOString(),type:'proposal',detail:`${proposal.approved?'הצעה לבחינה':'טיוטה פנימית'} · ${proposal.title} · PDF נוצר, לא נשלח`}].slice(-100)});
        res.setHeader('Content-Disposition',`attachment; filename="keystone-proposal-${proposal.id.slice(0,8)}.pdf"`);return send(200,pdf,'application/pdf');
      }
      throw new HttpError(404,'not_found');
    }
    if (!['GET','HEAD'].includes(req.method)) throw new HttpError(405,'method');
    const leads = (await store.list()).reverse();
    if (pathname==='/admin/export.csv') { res.setHeader('Content-Disposition','attachment; filename="keystone-leads.csv"'); return send(200,exportCSV(leads),'text/csv; charset=utf-8'); }
    if (pathname!=='/admin') throw new HttpError(404,'not_found');
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const counts = Object.fromEntries(Object.keys(STATUSES).map(s=>[s,leads.filter(l=>(l.status||'new')===s).length]));
    const aggregate = stats.summary();
    const rows = leads.slice(0,500).map(l=>`<article class="lead" id="lead-${e(l.id)}" data-status="${e(l.status||'new')}" data-source="${e(l.source||'contact')}"><header><div><h2>${e(l.name||l.business||'פנייה ללא פרטי קשר')}</h2><p>${e(l.business)} · ${e(SOURCES[l.source]||l.source||'טופס קשר')}</p></div><span class="badge">${e(STATUSES[l.status]||STATUSES.new)}</span></header><p class="meta">${e(dateTime(l.receivedAt))}${l.followUp?` · מעקב: ${e(l.followUp)}${l.followUp<=today && !['won','lost'].includes(l.status)?' · הגיע מועד המעקב':''}`:''}</p><div class="actions">${l.email?`<a href="mailto:${e(l.email)}">${e(l.email)}</a>`:''}${l.phone?`<a href="tel:${e(l.phone)}" dir="ltr">${e(l.phone)}</a><a href="https://wa.me/${e(l.phone.replace(/\D/g,''))}" rel="noreferrer">WhatsApp</a>`:''}</div><p class="lead-message">${e(l.message)}</p>${l.service?`<p>שירות: ${e(SERVICES[l.service]||l.service)}</p>`:''}${l.preferredTime?`<p>מועד מבוקש (לא אושר): ${e(l.preferredTime)}</p>`:''}${l.preferredContact?`<p>דרך קשר מועדפת: ${e(CONTACT[l.preferredContact]||l.preferredContact)}</p>`:''}${l.assessment?assessmentSummary(l.assessment):''}${linkedContext(l)}${experienceContext(l)}${l.whatsapp?`<p>התראת WhatsApp לבעלים: ${Object.values(l.whatsapp).map(x=>e({accepted:"התקבלה אצל Meta; מסירה לא אושרה",rejected:"נדחתה אצל הספק",needs_review:"מצב לא ודאי — נדרש בירור ללא שליחה חוזרת"}[x.state]||x.state)).join(" · ")}</p>`:""}${proposalForm(l,session.csrf)}<p class="meta">הודעה לבעלים: ${e(MAIL_STATES[l.notifications?.owners?.state]||(l.source==='experience'?MAIL_STATES.disabled:l.source==='booking'?'מנוהלת דרך ספק היומן':MAIL_STATES.pending))} · עותק למבקש: ${e(l.emailCopy?(MAIL_STATES[l.notifications?.copy?.state]||MAIL_STATES.pending):'לא התבקש')}</p><form method="post" action="/admin/update" class="lead-update"><input type="hidden" name="csrf" value="${e(session.csrf)}"><input type="hidden" name="id" value="${e(l.id)}"><label>סטטוס<select name="status">${Object.entries(STATUSES).map(([k,v])=>`<option value="${k}" ${(l.status||'new')===k?'selected':''}>${v}</option>`).join('')}</select></label><label>תאריך מעקב<input type="date" name="followUp" value="${e(l.followUp)}"></label><label class="wide">הצעד הבא<input name="nextAction" maxlength="300" value="${e(l.nextAction||'')}"></label><label class="wide">הערות פנימיות<textarea name="notes" maxlength="2000" rows="2">${e(l.notes)}</textarea></label><button type="submit" class="btn btn-small">שמירת עדכון</button></form></article>`).join('');
    const pipelineBoard=`<details class="pipeline-detail"><summary>תצוגת התקדמות</summary><div class="pipeline-board">${Object.entries(STATUSES).map(([key,label])=>`<section><h2>${e(label)}</h2>${leads.filter(l=>(l.status||'new')===key).slice(0,50).map(l=>`<a href="#lead-${e(l.id)}"><strong>${e(l.name||l.business||'פנייה חדשה')}</strong><small>${e(l.nextAction||l.followUp||'לבחור צעד הבא')}</small></a>`).join('')||'<small>אין פניות בשלב הזה</small>'}</section>`).join('')}</div></details>`;
    const statsTable = (title,values)=>`<section><h3>${title}</h3><ul class="stats-list">${Object.entries(values).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,n])=>`<li><bdi>${e(k)}</bdi><strong>${n}</strong></li>`).join('')||'<li>עדיין אין נתונים</li>'}</ul></section>`;
    return send(200,shell('פניות',`<div class="admin-toolbar"><div><p class="eyebrow">PRIVATE / OPERATIONS</p><h1>כל פנייה. צעד הבא.</h1></div><div class="actions"><a class="btn btn-outline" href="/admin/export.csv">ייצוא CSV</a><form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${e(session.csrf)}"><button class="btn btn-outline" type="submit">יציאה</button></form></div></div><p>פניות נשמרות כאן גם אם מייל לא נמסר. תזכורות מופיעות בתיבה לפי תאריך; אין שירות תזכורות חיצוני.</p><div class="pipeline">${Object.entries(STATUSES).map(([key,label])=>`<div><strong>${counts[key]}</strong><span>${label}</span></div>`).join('')}</div>${pipelineBoard}<div class="admin-filters"><label>סינון לפי סטטוס<select id="status-filter"><option value="all">הכול</option>${Object.entries(STATUSES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>חיפוש בתיבה המוצגת<input id="lead-search" type="search" autocomplete="off"></label></div><p id="filter-status" role="status"></p><div id="leads">${rows||'<p class="empty">עדיין אין פניות. פנייה חדשה תופיע כאן עם המקור ופרטי החזרה.</p>'}</div><p>מוצגות עד 500 הפניות האחרונות; הייצוא כולל את כל הפניות שבתקופת השמירה.</p><details class="aggregate"><summary>מדידה מצרפית · עד 30 ימי פעילות אחרונים</summary><p>צפיות ואירועים, לא מבקרים ייחודיים. ללא כתובות IP, פרטי טופס או מזהה משתמש. ספירת לחיצה אינה הוכחה שנוצר קשר.</p><div class="stats-grid">${statsTable('עמודים',aggregate.views)}${statsTable('לחיצות',aggregate.events)}${statsTable('אתרים מפנים (דומיין בלבד)',aggregate.refs)}</div></details>`),'text/html; charset=utf-8');
  }
  return {enabled,handle};
}
module.exports = {createAdmin,exportCSV,STATUSES};
