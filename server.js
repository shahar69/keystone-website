'use strict';
/*
 * Keystone website server.
 * Zero dependencies: Node's own http, fs, zlib and crypto only.
 * Serves the static site from ./public, handles the contact form at POST /api/contact,
 * stores inquiries outside the web root and deletes them after the retention period.
 */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const INQUIRIES = path.join(DATA_DIR, 'inquiries.jsonl');
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 730; // 24 months, as stated in the privacy policy
const NOTIFY_TO = process.env.NOTIFY_TO || 'shahar@keystone.org.il,or@keystone.org.il';
const NOTIFY_FROM = process.env.NOTIFY_FROM || 'website@keystone.org.il';
const SENDMAIL = process.env.SENDMAIL_PATH || '/usr/sbin/sendmail';
const MAX_BODY = 16 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/* ---------- static files ---------- */

const cache = new Map(); // path -> { body, gz, etag, type, mtime }

async function loadFile(filePath) {
  const st = await fsp.stat(filePath);
  if (!st.isFile()) return null;
  const hit = cache.get(filePath);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const body = await fsp.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const entry = {
    body,
    gz: COMPRESSIBLE.has(ext) ? zlib.gzipSync(body, { level: 9 }) : null,
    etag: '"' + crypto.createHash('sha1').update(body).digest('base64url') + '"',
    type: TYPES[ext] || 'application/octet-stream',
    ext,
    mtime: st.mtimeMs,
  };
  cache.set(filePath, entry);
  return entry;
}

function resolvePath(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0')) return null;
  const candidates = [];
  if (p.endsWith('/')) candidates.push(p + 'index.html');
  else if (!path.extname(p)) candidates.push(p + '.html', p + '/index.html');
  else candidates.push(p);
  return candidates
    .map((c) => path.normalize(path.join(PUBLIC_DIR, c)))
    .filter((full) => full.startsWith(PUBLIC_DIR + path.sep));
}

async function serveStatic(req, res, urlPath) {
  const candidates = resolvePath(urlPath);
  if (!candidates) return sendError(res, 400, urlPath);
  for (const full of candidates) {
    let entry;
    try { entry = await loadFile(full); } catch { entry = null; }
    if (!entry) continue;
    const headers = { 'Content-Type': entry.type, ETag: entry.etag, Vary: 'Accept-Encoding' };
    headers['Cache-Control'] = entry.ext === '.html'
      ? 'no-cache'
      : (urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    const useGz = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const body = useGz ? entry.gz : entry.body;
    if (useGz) headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  return sendError(res, 404, urlPath);
}

async function sendError(res, status, urlPath = '/') {
  const page = String(urlPath).startsWith('/en') ? 'en/404.html' : '404.html';
  try {
    const entry = await loadFile(path.join(PUBLIC_DIR, page));
    res.writeHead(status, { 'Content-Type': entry.type, 'Cache-Control': 'no-store' });
    res.end(entry.body);
  } catch {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(status));
  }
}

/* ---------- contact form ---------- */

const hits = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (list.every((t) => now - t > 10 * 60 * 1000)) hits.delete(ip);
}, 60 * 1000).unref();

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

function sameOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = req.headers.origin || req.headers.referer;
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const oneLine = (v) => v.replace(/[\r\n]+/g, ' ');
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

function validate(input) {
  const data = {
    name: oneLine(clean(input.name, 120)),
    business: oneLine(clean(input.business, 160)),
    email: oneLine(clean(input.email, 200)),
    phone: oneLine(clean(input.phone, 40)),
    message: clean(input.message, 4000),
    consent: input.consent === true || input.consent === 'yes' || input.consent === 'on',
    lang: input.lang === 'en' ? 'en' : 'he',
  };
  const errors = {};
  if (data.name.length < 2) errors.name = 'required';
  if (!EMAIL_RE.test(data.email)) errors.email = 'invalid';
  if (data.phone && !/^[0-9+()\-\s.]{7,40}$/.test(data.phone)) errors.phone = 'invalid';
  if (data.message.length < 10) errors.message = 'too_short';
  if (!data.consent) errors.consent = 'required';
  return { data, errors };
}

async function storeInquiry(record) {
  await fsp.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fsp.appendFile(INQUIRIES, JSON.stringify(record) + '\n', { mode: 0o600 });
}

function notify(record) {
  if (!fs.existsSync(SENDMAIL)) return;
  const subject = `New inquiry from keystone.org.il: ${record.name}`;
  const body = [
    `Name: ${record.name}`,
    `Business: ${record.business || '-'}`,
    `Email: ${record.email}`,
    `Phone: ${record.phone || '-'}`,
    `Language: ${record.lang}`,
    `Received: ${record.receivedAt}`,
    '',
    record.message,
  ].join('\n');
  const mail = [
    `From: Keystone website <${NOTIFY_FROM}>`,
    `To: ${NOTIFY_TO}`,
    `Reply-To: ${record.email}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64').replace(/.{76}/g, '$&\n'),
  ].join('\n');
  try {
    const p = spawn(SENDMAIL, ['-t', '-i'], { stdio: ['pipe', 'ignore', 'ignore'] });
    p.on('error', () => {});
    p.stdin.end(mail);
  } catch { /* storage already succeeded; mail is best effort */ }
}

async function pruneOld() {
  try {
    const text = await fsp.readFile(INQUIRIES, 'utf8');
    const cutoff = Date.now() - RETENTION_DAYS * 86400000;
    const keep = text.split('\n').filter((line) => {
      if (!line.trim()) return false;
      try { return Date.parse(JSON.parse(line).receivedAt) >= cutoff; } catch { return false; }
    });
    await fsp.writeFile(INQUIRIES, keep.length ? keep.join('\n') + '\n' : '', { mode: 0o600 });
  } catch { /* no file yet */ }
}

async function handleContact(req, res) {
  const wantsJson = String(req.headers.accept || '').includes('application/json');
  const reply = (status, payload, redirect) => {
    if (wantsJson) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(payload));
    }
    res.writeHead(303, { Location: redirect, 'Cache-Control': 'no-store' });
    return res.end();
  };
  if (!sameOrigin(req)) return reply(403, { ok: false, error: 'origin' }, '/#contact');
  if (rateLimited(clientIp(req))) return reply(429, { ok: false, error: 'rate' }, '/#contact');

  let raw;
  try { raw = await readBody(req); } catch { return reply(413, { ok: false, error: 'too_large' }, '/#contact'); }
  let input = {};
  const ctype = String(req.headers['content-type'] || '');
  try {
    if (ctype.includes('application/json')) input = JSON.parse(raw);
    else input = Object.fromEntries(new URLSearchParams(raw));
  } catch { return reply(400, { ok: false, error: 'format' }, '/#contact'); }

  const back = input.lang === 'en' ? '/en/' : '/';
  // Honeypot: real people never fill this hidden field. Answer as if it worked.
  if (clean(input.website, 200)) return reply(200, { ok: true }, back + 'thanks');

  const { data, errors } = validate(input);
  if (Object.keys(errors).length) return reply(422, { ok: false, error: 'invalid', fields: errors }, back + '#contact');

  const record = { id: crypto.randomUUID(), receivedAt: new Date().toISOString(), ...data };
  try {
    await storeInquiry(record);
  } catch {
    return reply(500, { ok: false, error: 'storage' }, back + '#contact');
  }
  notify(record);
  return reply(200, { ok: true }, back + 'thanks');
}

/* ---------- server ---------- */

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  if (process.env.DEBUG_REQUESTS === '1') {
    console.log(`${req.method} raw=${JSON.stringify(req.url)} host=${req.headers.host} xfh=${req.headers['x-forwarded-host'] || ''} xfp=${req.headers['x-forwarded-prefix'] || ''}`);
  }
  try {
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('ok');
    }
    if (url.pathname === '/api/contact') {
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
      return await handleContact(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    if (url.pathname.split('/').some((seg) => seg.startsWith('.') && seg !== '.well-known')) {
      return sendError(res, 404, url.pathname);
    }
    return await serveStatic(req, res, url.pathname);
  } catch {
    if (!res.headersSent) return sendError(res, 500, url.pathname);
    res.end();
  }
});

server.headersTimeout = 15000;
server.requestTimeout = 20000;
server.keepAliveTimeout = 5000;

pruneOld();
setInterval(pruneOld, 24 * 60 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Keystone website listening on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
