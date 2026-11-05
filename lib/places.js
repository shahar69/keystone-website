'use strict';
const {HttpError}=require('./security');
function createPlaces({env={},ledger,review=false,fetchImpl=fetch,timeoutMs=10000,now=Date.now}){
 const limit=Number(env.PLACES_DAILY_REQUEST_LIMIT);
 const enabled=()=>!review&&env.INTEGRATIONS_ENABLED==='1'&&env.PLACES_ENABLED==='1'&&env.PLACES_PROVIDER_QUOTA_CONFIRMED==='yes'&&env.PLACES_ATTRIBUTION_APPROVED==='yes'&&!!env.GOOGLE_PLACES_API_KEY&&Number.isInteger(limit)&&limit>=1&&limit<=1000&&!!ledger;
 let queue=Promise.resolve();const serial=fn=>{const p=queue.catch(()=>{}).then(fn);queue=p.catch(()=>{});return p;};
 const safeURL=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 async function call(route,fields,body){
  if(!enabled())throw new HttpError(503,'places_disabled');
  await serial(async()=>{const day=new Date(now()).toISOString().slice(0,10),rows=await ledger.list();if(rows.filter(r=>r.day===day).length>=limit)throw new HttpError(429,'places_daily_limit');await ledger.add({day,operation:body?'search':'details'});});
  let response;try{response=await fetchImpl('https://places.googleapis.com/v1/'+route,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json','X-Goog-Api-Key':env.GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':fields},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new HttpError(503,'places_unavailable');}
  if(!response.ok)throw new HttpError(503,'places_unavailable');
  try{return await response.json();}catch{throw new HttpError(503,'places_payload');}
 }
 async function search({business,lang='he'}){
  if(typeof business!=='string'||business.trim().length<2||business.length>180)throw new HttpError(422,'business');
  const data=await call('places:searchText','places.id,places.displayName,places.formattedAddress,places.googleMapsUri',{textQuery:business,languageCode:lang==='en'?'en':'he',regionCode:'IL',pageSize:5});
  if(data.places!==undefined&&!Array.isArray(data.places))throw new HttpError(503,'places_payload');
  return {matches:(data.places||[]).slice(0,5).filter(p=>/^[A-Za-z0-9_-]{5,300}$/.test(p?.id||'')&&typeof p.displayName?.text==='string').map(p=>({placeId:p.id,name:p.displayName.text.slice(0,200),address:typeof p.formattedAddress==='string'?p.formattedAddress.slice(0,300):null,mapUrl:safeURL(p.googleMapsUri)})),attribution:'Google Maps'};
 }
 async function details({placeId,lang='he'}){
  if(!/^[A-Za-z0-9_-]{5,300}$/.test(placeId||''))throw new HttpError(422,'place_id');
  const data=await call('places/'+encodeURIComponent(placeId)+'?'+new URLSearchParams({languageCode:lang==='en'?'en':'he',regionCode:'IL'}),'id,displayName,formattedAddress,websiteUri,googleMapsUri,rating,userRatingCount,regularOpeningHours,photos,attributions');
  if(data.id!==placeId||typeof data.displayName?.text!=='string')throw new HttpError(503,'places_payload');
  return {placeId,name:data.displayName.text.slice(0,200),address:typeof data.formattedAddress==='string'?data.formattedAddress:null,website:safeURL(data.websiteUri),mapUrl:safeURL(data.googleMapsUri),rating:typeof data.rating==='number'&&data.rating>=1&&data.rating<=5?data.rating:null,reviews:Number.isInteger(data.userRatingCount)&&data.userRatingCount>=0?data.userRatingCount:null,hours:Array.isArray(data.regularOpeningHours?.weekdayDescriptions)?data.regularOpeningHours.weekdayDescriptions.filter(x=>typeof x==='string').slice(0,7):null,photoCount:Array.isArray(data.photos)?data.photos.length:null,unansweredReviews:null,localRank:null,attribution:'Google Maps',attributions:Array.isArray(data.attributions)?data.attributions.map(a=>({name:typeof a.provider==='string'?a.provider:typeof a.providerDisplayName==='string'?a.providerDisplayName:'',url:safeURL(a.providerUri)})):[],checkedAt:new Date(now()).toISOString()};
 }
 return {status:()=>({enabled:enabled(),mode:review?'mock':enabled()?'live':'disabled'}),search,details};
}
module.exports={createPlaces};
