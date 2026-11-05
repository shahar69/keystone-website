'use strict';
const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const ipaddr = require('ipaddr.js');
const {HttpError} = require('./security');

// This fetcher deliberately has no cookies, proxy support or browser execution.
const fail = code => new HttpError(422, code);
function publicAddress(address) {
  try {
    const ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv4') return ip.range() === 'unicast';
    return ip.range() === 'unicast' && ip.match(ipaddr.parse('2000::'), 3);
  } catch { return false; }
}
function publicURL(value) {
  let u;
  try { u = new URL(value); } catch { throw fail('audit_invalid_url'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || u.search ||
      net.isIP(u.hostname.replace(/^\[|\]$/g,'')) || !u.hostname.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(u.hostname) ||
      u.hostname.endsWith('.') || u.href.length > 600) throw fail('audit_invalid_url');
  u.hash = '';
  return u;
}
async function bounded(promise, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw fail('audit_timeout');
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(fail('audit_timeout')), remaining); })]); }
  finally { clearTimeout(timer); }
}
async function resolvePublic(hostname, deadline, lookup = dns.lookup) {
  let addresses;
  try { addresses = await bounded(lookup(hostname, {all:true, verbatim:true}), deadline); }
  catch (error) { if(error instanceof HttpError) throw error; throw fail('audit_unreachable'); }
  // Reject mixed public/private DNS answers, then pin the selected public address.
  if (!addresses.length || addresses.some(x => !publicAddress(x.address))) throw fail('audit_blocked_address');
  return addresses.find(x => x.family === 4) || addresses[0];
}
async function fetchPublic(target, {deadline, method='GET', redirects=0, lookup=dns.lookup} = {}) {
  const u = publicURL(target);
  const address = await resolvePublic(u.hostname, deadline, lookup);
  const response = await new Promise((resolve, reject) => {
    const transport = u.protocol === 'https:' ? https : http;
    let finished = false, timer;
    const finish = (err, result) => { if(finished)return; finished=true; clearTimeout(timer); err ? reject(err) : resolve(result); };
    const req = transport.request(u, {
      method, agent:false, maxHeaderSize:16384, rejectUnauthorized:true,
      headers:{'User-Agent':'KeystoneWebsiteCheck/1.0 (+https://keystone.org.il)',Accept:'text/html,application/xhtml+xml','Accept-Encoding':'identity'},
      // Original URL supplies Host and TLS SNI. The connection cannot re-resolve DNS.
      lookup: (_hostname, options, callback) => options.all ? callback(null,[address]) : callback(null,address.address,address.family)
    }, res => {
      const status = res.statusCode;
      if (method === 'HEAD' || [301,302,303,307,308].includes(status)) {
        finish(null,{status,headers:res.headers,html:''}); res.destroy(); return;
      }
      if (status < 200 || status >= 300) { res.destroy(); finish(fail('audit_unreachable')); return; }
      if (!/^text\/html\b|^application\/xhtml\+xml\b/i.test(res.headers['content-type'] || '') ||
          !['','identity'].includes(res.headers['content-encoding'] || '')) {
        res.destroy(); finish(fail('audit_not_html')); return;
      }
      const chunks = []; let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; if(bytes > 1024*1024){res.destroy();finish(fail('audit_too_large'));}else chunks.push(chunk); });
      res.on('end', () => finish(null,{status,headers:res.headers,html:Buffer.concat(chunks).toString('utf8')}));
      res.on('error', () => finish(fail('audit_unreachable')));
      res.on('aborted', () => finish(fail('audit_unreachable')));
    });
    req.on('error', () => finish(fail('audit_unreachable')));
    timer = setTimeout(() => { finish(fail('audit_timeout')); req.destroy(); }, Math.max(1, deadline-Date.now()));
    req.end();
  });
  if ([301,302,303,307,308].includes(response.status)) {
    if (redirects >= 3 || !response.headers.location) throw fail('audit_redirect');
    let next; try { next = new URL(response.headers.location, u); } catch { throw fail('audit_redirect'); }
    if (u.protocol === 'https:' && next.protocol !== 'https:') throw fail('audit_redirect');
    return fetchPublic(next.href,{deadline,method,redirects:redirects+1,lookup});
  }
  return {...response, url:u.href};
}
async function inspectHTML(html, pageURL) {
  const {Parser} = await import('htmlparser2');
  const data = {title:'',description:'',viewport:false,lang:'',dir:'',h1:0,images:0,missingAlt:0,contact:false,privacy:false,accessibility:false,og:false,schema:false,links:[]};
  data.forms=0;data.fields=0;data.unlabelledFields=0;const labels=new Set(),ids=new Set(),fields=[];
  let inTitle=false,titleSeen=false,svgDepth=0, inScript=false, json='', anchor=null,labelDepth=0;
  const parser = new Parser({
    onopentag(name, a) {
      if(a.id)ids.add(a.id);
      if(name==='html'){data.lang=a.lang||'';data.dir=a.dir||'';}
      if(name==='svg')svgDepth++;
      if(name==='title'&&!svgDepth&&!titleSeen){inTitle=true;titleSeen=true;}
      if(name==='h1')data.h1++;
      if(name==='form')data.forms++;
      if(name==='label'){labelDepth++;if(a.for)labels.add(a.for);}
      if(['input','textarea','select'].includes(name)&&!['hidden','submit','button','reset','image'].includes((a.type||'').toLowerCase())){fields.push({id:a.id,named:labelDepth>0||!!a['aria-label']?.trim(),refs:(a['aria-labelledby']||'').trim().split(/\s+/).filter(Boolean)});}
      if(name==='img'){data.images++;if(!Object.hasOwn(a,'alt'))data.missingAlt++;}
      if(name==='meta'){
        const key=(a.name||a.property||'').toLowerCase();
        if(key==='description')data.description=(a.content||'').slice(0,600);
        if(key==='viewport'&&/width\s*=\s*device-width/.test(a.content||''))data.viewport=true;
        if(key==='og:title'&&a.content)data.og=true;
      }
      if(name==='script'&&(a.type||'').toLowerCase()==='application/ld+json'){inScript=true;json='';}
      if(name==='a'&&a.href){
        anchor={href:a.href,text:''};
        if(/^(tel:|mailto:)|wa\.me\/|api\.whatsapp\.com/i.test(a.href))data.contact=true;
        try {const u=new URL(a.href,pageURL);if(u.origin===new URL(pageURL).origin&&!u.search&&!u.hash&&!/logout|signout|delete|remove|cart|checkout|admin|unsubscribe|action|token/i.test(u.pathname)&&!data.links.includes(u.href)&&data.links.length<30)data.links.push(u.href);}catch{}
      }
    },
    ontext(text){if(inTitle)data.title+=text.slice(0,250);if(inScript&&json.length<100000)json+=text;if(anchor&&anchor.text.length<300)anchor.text+=text;},
    onclosetag(name){
      if(name==='label')labelDepth=Math.max(0,labelDepth-1);
      if(name==='title')inTitle=false;
      if(name==='svg')svgDepth=Math.max(0,svgDepth-1);
      if(name==='script'&&inScript){inScript=false;try{const parsed=JSON.parse(json);if(parsed&&typeof parsed==='object'&&(parsed['@context']||Array.isArray(parsed)))data.schema=true;}catch{}}
      if(name==='a'&&anchor){const v=anchor.href+' '+anchor.text;if(/privacy|פרטיות/i.test(v))data.privacy=true;if(/accessibility|נגישות/i.test(v))data.accessibility=true;anchor=null;}
    }
  },{decodeEntities:true});
  parser.end(html);data.fields=fields.length;data.unlabelledFields=fields.filter(f=>!f.named&&!labels.has(f.id)&&!(f.refs.length&&f.refs.every(id=>ids.has(id)))).length; data.title=data.title.trim().slice(0,250); data.description=data.description.trim();return data;
}
function checksFor(d, url) {
  return [
    ['https', url.startsWith('https:'), 'high'],
    ['title', !!d.title, 'high'], ['description', !!d.description, 'medium'],
    ['viewport', d.viewport, 'high'], ['heading', d.h1===1, 'medium'],
    ['language', !!d.lang && (!/^(he|ar)\b/i.test(d.lang)||d.dir==='rtl'), 'medium'],
    ['alt', d.missingAlt===0, 'medium'], ['contact', d.contact, 'high'],
    ['privacy', d.privacy, 'medium'], ['accessibility', d.accessibility, 'medium'],
    ['sharing', d.og, 'low'], ['schema', d.schema, 'low'],...(d.fields?[['forms',d.unlabelledFields===0,'high']]:[])
  ].map(([id,pass,priority])=>({id,pass,priority}));
}
function createWebsiteChecker({fetcher=fetchPublic, now=Date.now}={}) {
  const cache=new Map();let active=0;
  return async value => {
    const url=publicURL(value).href, cached=cache.get(url);
    if(cached&&cached.expires>now())return {...cached.result,cached:true};
    if(active>=2)throw new HttpError(429,'audit_busy');
    active++;
    try {
      const started=Date.now(),deadline=started+10000;
      const response=await fetcher(url,{deadline});
      const fetchMs=Date.now()-started;
      const data=await inspectHTML(response.html,response.url);
      const checks=checksFor(data,response.url);
      const links=[];
      // A small non-executing sample; HEAD results are never called a crawl.
      for(const link of data.links.filter(x=>x!==response.url).slice(0,3)){
        if(Date.now()>deadline-1000)break;
        try{const r=await fetcher(link,{deadline:Math.min(deadline,Date.now()+1500),method:'HEAD'});links.push({url:link,status:r.status,state:[404,410].includes(r.status)?'broken':r.status>=200&&r.status<300?'reachable':'unknown'});}catch{links.push({url:link,state:'unknown'});}
      }
      const result={url:response.url,checkedAt:new Date().toISOString(),cached:false,fetchMs,title:data.title,checks,passed:checks.filter(x=>x.pass).length,total:checks.length,images:data.images,missingAlt:data.missingAlt,h1:data.h1,forms:{count:data.forms,fields:data.fields,unlabelled:data.unlabelledFields,submissionTested:false},links};
      if(cache.size>=100){const oldest=cache.keys().next().value;clearTimeout(cache.get(oldest).timer);cache.delete(oldest);}
      clearTimeout(cache.get(url)?.timer);
      const timer=setTimeout(()=>cache.delete(url),10*60_000);timer.unref();
      cache.set(url,{expires:now()+10*60_000,result,timer});return result;
    } finally {active--;}
  };
}
module.exports={publicAddress,publicURL,resolvePublic,fetchPublic,inspectHTML,checksFor,createWebsiteChecker};
