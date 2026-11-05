'use strict';
const crypto = require('node:crypto');
const net = require('node:net');
class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeEqual(a, b) {
  const hash = value => crypto.createHash('sha256').update(String(value)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}
function ipOf(req, trustProxy) {
  const direct = req.socket.remoteAddress || 'unknown';
  if (!trustProxy) return direct;
  const last = String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
  return net.isIP(last) ? last : direct;
}
function createLimiter({limit = 8, windowMs = 15 * 60_000, maxKeys = 5000} = {}) {
  const buckets = new Map(), salt = crypto.randomBytes(32);
  return (key, now = Date.now()) => {
    const hash = crypto.createHmac('sha256', salt).update(String(key)).digest('hex');
    let item = buckets.get(hash);
    if (!item || item.until <= now) {
      if (buckets.size >= maxKeys) {
        for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
        if (buckets.size >= maxKeys) return false;
      }
      item = {n: 0, until: now + windowMs}; buckets.set(hash, item);
    }
    return ++item.n <= limit;
  };
}
async function readBody(req, max = 24_576) {
  if (Number(req.headers['content-length']) > max) { req.resume(); throw new HttpError(413, 'too_large'); }
  const chunks = [];
  await new Promise((resolve, reject) => {
    let bytes = 0, settled = false;
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    req.on('error', fail);
    req.on('aborted', () => fail(new HttpError(400, 'aborted')));
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > max) { chunks.length = 0; fail(new HttpError(413, 'too_large')); }
      else if (!settled) chunks.push(chunk);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(); } });
  });
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const raw = Buffer.concat(chunks).toString('utf8'); let data;
  try {
    if (type === 'application/json') data = JSON.parse(raw);
    else if (type === 'application/x-www-form-urlencoded') {
      data = Object.create(null);
      for (const [key, value] of new URLSearchParams(raw)) {
        if (Object.hasOwn(data, key)) throw Error('duplicate'); data[key] = value;
      }
    } else throw new HttpError(415, 'content_type');
  } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'invalid_body'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'invalid_body');
  return data;
}
function textField(data, name, max, min = 0) {
  const value = data[name] ?? '';
  if (typeof value !== 'string') throw new HttpError(422, name);
  const clean = value.replace(/\r\n/g, '\n').trim();
  if (clean.length < min || clean.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(clean)) throw new HttpError(422, name);
  return clean;
}
function sameOrigin(req, origin) {
  if (!req.headers.origin) return false;
  try { return new URL(req.headers.origin).origin === origin && !['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']); }
  catch { return false; }
}
function cookie(req, key) {
  return String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(key + '='))?.slice(key.length + 1) || '';
}
module.exports = {HttpError, escape, safeEqual, ipOf, createLimiter, readBody, textField, sameOrigin, cookie};
