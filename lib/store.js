'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
function createStore(directory, {retentionDays = 730} = {}) {
  const file = path.join(directory, 'leads.jsonl'); let queue = Promise.resolve();
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  async function read() {
    let raw;
    try { raw = await fs.readFile(file, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return raw.split('\n').filter(Boolean).map((line, i) => {
      try { const value = JSON.parse(line); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
      catch { throw Error(`Invalid lead storage at row ${i + 1}`); }
    });
  }
  async function replace(rows) {
    const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    const handle = await fs.open(temp, 'wx', 0o600);
    try { await handle.writeFile(rows.map(x => JSON.stringify(x)).join('\n') + (rows.length ? '\n' : '')); await handle.sync(); }
    catch (e) { await handle.close(); await fs.unlink(temp).catch(() => {}); throw e; }
    await handle.close();
    try { await fs.rename(temp, file); } catch (e) { await fs.unlink(temp).catch(() => {}); throw e; }
  }
  const prune = () => serial(async () => {
    const rows = await read(), threshold = Date.now() - retentionDays * 86400_000;
    let changed=false;const transcriptThreshold=Date.now()-7*86400_000;
    const kept = rows.filter(x => !Number.isFinite(Date.parse(x.receivedAt)) || Date.parse(x.receivedAt) >= threshold).map(row=>{if(row.source!=='experience'||!Array.isArray(row.timeline))return row;const timeline=row.timeline.filter(e=>!['reply','transcript','voice-client-user','voice-client-agent'].includes(e.type)||Date.parse(e.at)>=transcriptThreshold);if(timeline.length===row.timeline.length)return row;changed=true;return {...row,timeline};});
    if (changed||kept.length !== rows.length) await replace(kept);
    return rows.length - kept.length;
  });
  return {
    init: async () => {
      await fs.mkdir(directory, {recursive: true, mode: 0o700});
      await prune();
    },
    prune,
    list: () => serial(read),
    add: lead => serial(async () => {
      const rows = await read(); // Corruption fails closed, never silently empties the inbox.
      const row = {id: crypto.randomUUID(), receivedAt: new Date().toISOString(), status: 'new', notes: '', followUp: '', ...lead};
      await replace([...rows, row]);
      return row;
    }),
    update: (id, change) => serial(async () => {
      const rows = await read(), i = rows.findIndex(x => x.id === id); if (i === -1) return null;
      rows[i] = {...rows[i], ...change, updatedAt: new Date().toISOString()}; await replace(rows); return rows[i];
    }),
    appendEvent: (id, event, change={}) => serial(async () => {
      const rows=await read(),i=rows.findIndex(x=>x.id===id);if(i===-1)return null;
      rows[i]={...rows[i],...change,timeline:[...(rows[i].timeline||[]),event].slice(-100),updatedAt:new Date().toISOString()};await replace(rows);return rows[i];
    }),
    idle: () => queue,
  };
}
module.exports = {createStore};
