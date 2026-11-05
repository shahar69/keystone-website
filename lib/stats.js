'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const EVENTS = new Set(['whatsapp','phone','email','vcard','assessment_start','assessment_complete','calculator_share','meeting','guide']);
const BOT = /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|uptimerobot/i;
function createStats(directory) {
  const file = path.join(directory, 'stats.json'); let days = Object.create(null), dirty = false, queue = Promise.resolve();
  async function init() {
    try {
      const saved = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('Invalid aggregate statistics');
      days = Object.assign(Object.create(null), saved);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  function day() {
    const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if (!Object.hasOwn(days,date)) days[date] = {views:{}, refs:{}, events:{}}; return days[date];
  }
  function increment(object,key) { object[key] = Math.min(1e9,(Object.hasOwn(object,key) ? Number(object[key]) || 0 : 0)+1); dirty = true; }
  function view(page,req) {
    if (BOT.test(req.headers['user-agent'] || '')) return;
    const row = day(); increment(row.views,page);
    try {
      const host = new URL(req.headers.referer).hostname.toLowerCase();
      if (host !== 'keystone.org.il' && !host.endsWith('.keystone.org.il') && !['localhost','127.0.0.1','[::1]'].includes(host)) {
        if (Object.keys(row.refs).length < 100 && /^[a-z0-9.-]{1,253}$/.test(host)) increment(row.refs,host);
      }
    } catch { /* Never store referrer paths, queries, visitor IDs or IPs. */ }
  }
  function event(name,req) { if (EVENTS.has(name) && !BOT.test(req.headers['user-agent'] || '')) increment(day().events,name); }
  function flush() {
    queue = queue.catch(() => {}).then(async () => {
      if (!dirty) return;
      const cutoff = new Date(Date.now()-400*86400_000).toISOString().slice(0,10);
      for (const key of Object.keys(days)) if (key < cutoff) delete days[key];
      const snapshot = JSON.stringify(days); dirty = false;
      try { await fs.writeFile(file+'.tmp',snapshot,{mode:0o600}); await fs.rename(file+'.tmp',file); }
      catch (e) { dirty = true; throw e; }
    }); return queue;
  }
  function summary(count=30) {
    const selected = Object.keys(days).sort().slice(-count);
    const sum = {views:{},refs:{},events:{},days:selected.map(date => ({date,views:Object.values(days[date].views).reduce((a,b)=>a+Number(b),0)}))};
    for (const date of selected) for (const kind of ['views','refs','events']) for (const [key,n] of Object.entries(days[date][kind] || {})) {
      if (['__proto__','constructor','prototype'].includes(key)) continue;
      sum[kind][key] = (Object.hasOwn(sum[kind],key) ? sum[kind][key] : 0)+Number(n);
    }
    return sum;
  }
  return {init,view,event,flush,summary};
}
module.exports = {createStats,EVENTS};
