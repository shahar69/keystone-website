'use strict';
const nodemailer = require('nodemailer');
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
function createMailer(env = process.env,{transport:injectedTransport}={}) {
  const recipients = (env.MAIL_TO || 'shahar@keystone.org.il,or@keystone.org.il').split(',').map(x=>x.trim());
  const from = env.MAIL_FROM || 'website@keystone.org.il';
  if (!ADDRESS.test(from) || !recipients.length || recipients.some(x=>!ADDRESS.test(x))) throw Error('Invalid mail configuration');
  let transport=injectedTransport;
  if (env.SMTP_HOST) {
    const port = Number(env.SMTP_PORT || 465);
    if (![465,587].includes(port) || !env.SMTP_USER || !env.SMTP_PASS || /[\r\n\s/]/.test(env.SMTP_HOST)) throw Error('SMTP requires host, credentials and TLS port 465 or 587');
    transport = nodemailer.createTransport({host:env.SMTP_HOST,port,secure:port===465,requireTLS:true,
      auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},
      connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
  } else if (env.SENDMAIL_PATH && env.SENDMAIL_PATH !== 'disabled') {
    transport = nodemailer.createTransport({sendmail:true,path:env.SENDMAIL_PATH,newline:'unix',args:['-i','-t'],disableFileAccess:true,disableUrlAccess:true});
  }
  const send = async message => {
    if (!transport) return {state:'disabled'};
    try {
      const result = await transport.sendMail({from,...message});
      if (result.rejected?.length) return {state:'failed',code:'RECIPIENT_REJECTED'};
      return {state:'sent',sentAt:new Date().toISOString()};
    }
    catch (e) { return {state:'failed',code:/^[A-Z0-9_]{1,32}$/.test(e.code || '') ? e.code : 'MAIL_FAILED'}; }
  };
  return {
    enabled:!!transport,
    async report(job){
      if(!transport)return {state:'disabled'};
      try{const result=await transport.sendMail({from,to:job.recipient,messageId:`<report-${job.idempotencyKey}@keystone.org.il>`,subject:job.language==='en'?'Your private Keystone report':'הדו״ח הפרטי שלכם · קיסטון',text:job.language==='en'?`Here is the private report you requested:\n${job.url}\n\nThe link expires after seven days. This is a one-time service message, not a marketing subscription.\nCancel this requested delivery: ${job.cancelUrl}`:`הנה הדו״ח הפרטי שביקשתם:\n${job.url}\n\nהקישור תקף לשבעה ימים. זו הודעת שירות חד־פעמית, ללא צירוף לרשימת תפוצה.\nלביטול השליחה המבוקשת: ${job.cancelUrl}`});return result.rejected?.length?{state:'rejected',code:'RECIPIENT_REJECTED'}:{state:'sent'};
      }catch(error){const code=/^[A-Z0-9_]{1,32}$/.test(error.code||'')?error.code:'SMTP_ERROR';return {state:error.responseCode>=500?'rejected':error.responseCode>=400||['ECONNREFUSED','EDNS'].includes(error.code)||(error.code==='ETIMEDOUT'&&error.command==='CONN')?'retryable':'unknown',code};}
    },
    owners: lead => send({to:recipients,replyTo:lead.email || undefined,subject:`Keystone · ${lead.source} · פנייה חדשה`,
      text:[`מקור: ${lead.source}`,`מספר פנייה: ${lead.id}`,`שם: ${lead.name}`,`עסק: ${lead.business || '—'}`,`מייל: ${lead.email || '—'}`,`טלפון: ${lead.phone || '—'}`,
        `שפה: ${lead.language}`,`שירות: ${lead.service || '—'}`,`מועד מועדף (טעון אישור): ${lead.preferredTime || '—'}`,`דרך קשר מועדפת: ${lead.preferredContact || '—'}`,
        `עמוד: ${lead.page || '/'}`,`הודעה:\n${lead.message || ''}`,lead.assessment ? `אבחון עצמי (אומדן בלבד):\n${JSON.stringify(lead.assessment,null,2)}`:''].filter(Boolean).join('\n\n')}),
    copy: lead => send({to:lead.email,subject:lead.language==='en'?'Your Keystone self-assessment':'האבחון העצמי שלכם · קיסטון',
      text:lead.language==='en' ? `Hello ${lead.name},\n\nYour self-reported improvement opportunity score: ${lead.assessment?.score}/100.\n${(lead.assessment?.areas || []).map(x=>`${x.label}: ${x.score}/100\n${x.recommendation}`).join('\n\n')}\n\nThis is a directional self-assessment, not measured savings, a security audit or a quote. A member of Keystone will review your request.\nhttps://keystone.org.il/en/contact/\n\nYou requested this one-time copy. You are not automatically added to a mailing list.`
      : `שלום ${lead.name},\n\nציון פוטנציאל השיפור לפי התשובות שלכם: ${lead.assessment?.score}/100.\n${(lead.assessment?.areas || []).map(x=>`${x.label}: ${x.score}/100\n${x.recommendation}`).join('\n\n')}\n\nזהו כיוון לבדיקה לפי דיווח עצמי, ולא חיסכון מדוד, בדיקת אבטחה או הצעת מחיר. איש צוות קיסטון יבדוק את הפנייה.\nhttps://keystone.org.il/contact/\n\nביקשתם עותק חד־פעמי. אין צירוף אוטומטי לרשימת תפוצה.`}),
    close:()=>transport?.close(),
  };
}
function createNotifier(store,mailer,{experienceStartAt}={}) {
  let running = null, stopped = false;
  async function run() {
    try {
      const leads = await store.list();
      for (const lead of leads) {
        if(lead.source==='experience'&&(!lead.email&&!lead.phone||!Number.isFinite(Date.parse(experienceStartAt||''))||!Number.isFinite(Date.parse(lead.consentAt||lead.receivedAt))||Date.parse(lead.consentAt||lead.receivedAt)<Date.parse(experienceStartAt)))continue;
        const state = {...lead.notifications};
        for (const kind of ['owners','copy']) {
          if (kind==='copy' && !(lead.emailCopy && lead.email && lead.assessment)) continue;
          const old = state[kind] || {state:'pending',attempts:0};
          if (old.state==='sent' || old.attempts>=5 || (old.nextAt && Date.parse(old.nextAt)>Date.now())) continue;
          const result = await mailer[kind](lead);
          state[kind] = {...result,attempts:(old.attempts || 0)+1,nextAt:new Date(Date.now()+Math.min(3600_000,60_000*2**(old.attempts || 0))).toISOString()};
          await store.update(lead.id,{notifications:state});
        }
      }
    } finally { running = null; }
  }
  function drain() {
    if (stopped || !mailer.enabled) return Promise.resolve();
    if (running) return running;
    running = run(); return running;
  }
  return {drain,close:async()=>{stopped=true;await running;mailer.close?.();}};
}
module.exports = {createMailer,createNotifier};
