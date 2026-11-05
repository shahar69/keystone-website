'use strict';
const crypto=require('node:crypto');
const {HttpError,textField}=require('./security');
const localDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
function createBooking({env,store,fetchImpl=fetch}) {
  const eventTypeId=Number(env.CAL_EVENT_TYPE_ID);
  const enabled=env.INTEGRATIONS_ENABLED==='1'&&!!env.CAL_API_KEY&&Number.isSafeInteger(eventTypeId)&&eventTypeId>0;
  let queue=Promise.resolve();
  const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
  async function call(route,body){
    let response;try{response=await fetchImpl('https://api.cal.com/v2/'+route,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+env.CAL_API_KEY,'cal-api-version':body?'2026-02-25':'2024-09-04','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new HttpError(503,'calendar_unavailable');}
    if(!response.ok)throw new HttpError(response.status===409?409:503,response.status===409?'slot_taken':'calendar_unavailable');
    const data=await response.json();if(data.status!=='success')throw new HttpError(503,'calendar_unavailable');return data.data;
  }
  async function slots(date){
    if(!enabled)throw new HttpError(503,'calendar_offline');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||Date.parse(date)<Date.now()-86400000||Date.parse(date)>Date.now()+90*86400000)throw new HttpError(422,'invalid_date');
    const result=await call('slots?'+new URLSearchParams({eventTypeId,start:date,end:date,timeZone:'Asia/Jerusalem',format:'range'}));
    return Object.values(result).flat().filter(x=>typeof x?.start==='string'&&Number.isFinite(Date.parse(x.start))&&Date.parse(x.start)>Date.now()&&localDate(x.start)===date).slice(0,80).map(x=>({start:x.start}));
  }
  async function book(body,{leadId}={}){
    if(!enabled)throw new HttpError(503,'calendar_offline');
    if(body.privacy!=='yes')throw new HttpError(422,'privacy_required');
    const name=textField(body,'name',100,2),email=textField(body,'email',180,3),start=textField(body,'start',40,10),key=textField(body,'key',64,32),language=body.language==='en'?'en':'he';
    if(!/^[a-zA-Z0-9-]{32,64}$/.test(key)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Number.isFinite(Date.parse(start)))throw new HttpError(422,'invalid_booking');
    const signature=crypto.createHash('sha256').update(JSON.stringify({name,email,start})).digest('hex');
    const existing=await serial(async()=>{
      const old=(await store.list()).find(x=>x.bookingKey===key);
      if(old){if(old.bookingSignature!==signature||leadId&&old.id!==leadId)throw new HttpError(409,'booking_key_conflict');return {old};}
      const available=await slots(localDate(start));if(!available.some(x=>Date.parse(x.start)===Date.parse(start)))throw new HttpError(409,'slot_taken');
      if(leadId){const current=(await store.list()).find(l=>l.id===leadId);if(!current)throw new HttpError(404,'lead');if(current.booking)throw new HttpError(409,'booking_needs_review');const row=await store.update(leadId,{name,email,language,bookingKey:key,bookingSignature:signature,booking:{state:'pending',start},privacyVersion:'2026-11-04'});return {row};}
      const row=await store.add({source:'booking',name,email,language,message:'Calendar appointment request',page:language==='he'?'/contact/':'/en/contact/',bookingKey:key,bookingSignature:signature,booking:{state:'pending',start},privacyVersion:'2026-11-04'});return {row};
    });
    if(existing.old){const b=existing.old.booking;if(['accepted','pending_confirmation'].includes(b.state))return {state:b.state,start:b.start};throw new HttpError(409,'booking_needs_review');}
    const row=existing.row;
    try {
      const result=await call('bookings',{start:new Date(start).toISOString(),eventTypeId,attendee:{name,email,timeZone:'Asia/Jerusalem',language},metadata:{keystoneReference:row.id}});
      if(!result?.uid||!['accepted','pending'].includes(result.status))throw new HttpError(503,'booking_needs_review');
      const state=result.status==='accepted'?'accepted':'pending_confirmation';
      await store.update(row.id,{status:'meeting',booking:{state,start:result.start||start,providerUid:result.uid}});
      if(store.appendEvent)await store.appendEvent(row.id,{at:new Date().toISOString(),type:'calendar-'+state,detail:state==='accepted'?'הפגישה אושרה אצל ספק היומן':'ספק היומן ממתין לאישור המועד'});
      return {state,start:result.start||start};
    }catch(error){await store.update(row.id,{booking:{state:'needs_review',start}});throw error;}
  }
  return {status:()=>({enabled,timeZone:'Asia/Jerusalem'}),slots,book};
}
module.exports={createBooking};
