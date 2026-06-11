/**
 * server.js — HTTP layer for the Golazo Engine card renderer.
 *
 *   GET  /health      -> { ok:true, templates:[...] }
 *   POST /render      -> { template, data } -> image/png  (binary; used by Telegram)
 *   POST /render-url  -> { template, data } -> { id, url } (hosts the PNG, returns a
 *                        public URL; used when a downstream service like Buffer needs
 *                        a URL instead of binary)
 *   GET  /img/:id     -> image/png  (serves a hosted render; id is unguessable)
 *
 * Optional auth: if RENDER_TOKEN is set, /render and /render-url require header
 * x-golazo-token to equal it, else 401. /img/:id is public (the id is the secret)
 * so external fetchers (Buffer, Telegram) can read it without the token.
 *
 * NOTE: /render-url keeps a short-lived in-memory image cache, so the service is no
 * longer fully stateless. The cache is per-instance and cleared on redeploy — fine
 * because a hosted image only needs to live from render until the consumer (Buffer)
 * ingests it (minutes–hours). For durable hosting, swap IMG_STORE for object storage.
 */
const crypto = require('crypto');
const express = require('express');
const { buildSvg, TEMPLATES } = require('./src/templates');
const { svgToPng } = require('./src/render');

const app = express();
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 3000;
const RENDER_TOKEN = process.env.RENDER_TOKEN;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL; // optional override, e.g. https://golazo-engine-production.up.railway.app
const IMG_TTL_MS = Number(process.env.IMG_TTL_MS) || 6 * 60 * 60 * 1000; // 6h default

/* ===== in-memory hosted-image cache for /render-url ===== */
const IMG_STORE = new Map(); // id -> { png:Buffer, exp:number }
function sweep() {
  const now = Date.now();
  for (const [id, v] of IMG_STORE) if (v.exp <= now) IMG_STORE.delete(id);
}
setInterval(sweep, 30 * 60 * 1000).unref(); // periodic cleanup, don't keep process alive

function tokenOk(req) {
  return !RENDER_TOKEN || req.get('x-golazo-token') === RENDER_TOKEN;
}
// Validate + render to a PNG buffer. Returns { png } or { error, status, body }.
function renderToPng(body) {
  const { template, data } = body || {};
  if (!template || !TEMPLATES[template]) {
    return { error: true, status: 400, body: { error: 'invalid template', available: Object.keys(TEMPLATES) } };
  }
  return { png: svgToPng(buildSvg(template, data)) };
}
function baseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.headers.host}`;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, templates: Object.keys(TEMPLATES), hosted: IMG_STORE.size });
});

// Binary PNG — used by the Telegram "Send Photo" (binary) path.
app.post('/render', (req, res) => {
  try {
    if (!tokenOk(req)) return res.status(401).json({ error: 'unauthorized' });
    const r = renderToPng(req.body);
    if (r.error) return res.status(r.status).json(r.body);
    res.set('Content-Type', 'image/png');
    return res.send(r.png);
  } catch (err) {
    console.error('render error:', err);
    return res.status(500).json({ error: 'render failed', detail: String((err && err.message) || err) });
  }
});

// Hosted PNG — renders, stores, returns a public URL (for Buffer / URL-based consumers).
app.post('/render-url', (req, res) => {
  try {
    if (!tokenOk(req)) return res.status(401).json({ error: 'unauthorized' });
    const r = renderToPng(req.body);
    if (r.error) return res.status(r.status).json(r.body);
    sweep();
    const id = crypto.randomBytes(16).toString('hex');
    IMG_STORE.set(id, { png: r.png, exp: Date.now() + IMG_TTL_MS });
    const url = `${baseUrl(req)}/img/${id}.png`;
    return res.json({ id, url, expiresInMs: IMG_TTL_MS });
  } catch (err) {
    console.error('render-url error:', err);
    return res.status(500).json({ error: 'render failed', detail: String((err && err.message) || err) });
  }
});

// Serve a hosted render. Accepts /img/<id> or /img/<id>.png. Public (id is the secret).
app.get('/img/:id', (req, res) => {
  const id = String(req.params.id).replace(/\.png$/i, '');
  const entry = IMG_STORE.get(id);
  if (!entry || entry.exp <= Date.now()) {
    if (entry) IMG_STORE.delete(id);
    return res.status(404).json({ error: 'not found or expired' });
  }
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=86400');
  return res.send(entry.png);
});

app.listen(PORT, () => {
  console.log(`Golazo Engine listening on :${PORT}  templates=[${Object.keys(TEMPLATES).join(', ')}]`);
});
