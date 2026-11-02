# Keystone website (keystone.org.il)

Hebrew-first company website with a full English version. Node.js, zero dependencies.

## Run locally

```bash
node server.js
```

Then open http://localhost:3000. Health check: `/healthz`.

## Edit content

All copy (both languages, legal pages) lives in `tools/build.py`. After editing, regenerate the pages:

```bash
python tools/build.py
```

## Deploy (cPanel, Node.js app)

- Application root: this folder. Startup file: `server.js`. Start command: `npm start`.
- The server listens on `PORT` (set by the host) and needs no `npm install`.
- Point the domain keystone.org.il at the app and enable HTTPS (AutoSSL).

### Environment variables (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Port to listen on |
| `NOTIFY_TO` | shahar@keystone.org.il,or@keystone.org.il | Who gets an email for each inquiry |
| `NOTIFY_FROM` | website@keystone.org.il | Sender address of those emails |
| `SENDMAIL_PATH` | /usr/sbin/sendmail | Mail program on the server |
| `DATA_DIR` | ./data | Where inquiries are stored (outside `public/`) |
| `RETENTION_DAYS` | 730 | Inquiries older than this are deleted automatically |

Inquiries are always saved to `data/inquiries.jsonl` (permissions 600). Email is best effort: if the server has no sendmail, inquiries are still stored.

## What is covered

- **Security:** strict Content Security Policy (no inline code, no third-party scripts or fonts), HSTS, frame blocking, nosniff, referrer and permissions policies, same-origin check and rate limit on the form, honeypot, 16 KB body limit, path-traversal and dotfile protection, request timeouts.
- **Privacy (Protection of Privacy Law incl. Amendment 13):** notice at the point of collection, privacy policy, no cookies or trackers, 24-month automatic deletion, rights of access, correction and deletion.
- **Anti-spam (Communications Law s.30A):** the form never subscribes anyone to marketing.
- **Accessibility (IS 5568 AA / WCAG):** semantic structure, keyboard navigation, skip link, visible focus, high contrast, labelled fields with announced errors, reduced-motion support, correct lang/dir, accessibility statement with a named coordinator.
- **Fonts:** Cormorant Garamond (SIL OFL) and Hadasim CLM (GPL with font exception, license files in `public/assets/fonts/`).
