/**
 * server.js — HTTP layer for the Golazo Engine card renderer.
 *
 *   GET  /health  -> { ok:true, templates:[...] }
 *   POST /render  -> { template, data } -> image/png
 *
 * Optional auth: if RENDER_TOKEN is set, /render requires header
 * x-golazo-token to equal it, otherwise responds 401. If unset, /render is open.
 */
const express = require('express');
const { buildSvg, TEMPLATES } = require('./src/templates');
const { svgToPng } = require('./src/render');

const app = express();
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 3000;
const RENDER_TOKEN = process.env.RENDER_TOKEN;

app.get('/health', (req, res) => {
  res.json({ ok: true, templates: Object.keys(TEMPLATES) });
});

app.post('/render', (req, res) => {
  try {
    if (RENDER_TOKEN && req.get('x-golazo-token') !== RENDER_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { template, data } = req.body || {};
    if (!template || !TEMPLATES[template]) {
      return res.status(400).json({ error: 'invalid template', available: Object.keys(TEMPLATES) });
    }
    const svg = buildSvg(template, data);
    const png = svgToPng(svg);
    res.set('Content-Type', 'image/png');
    return res.send(png);
  } catch (err) {
    console.error('render error:', err);
    return res.status(500).json({ error: 'render failed', detail: String(err && err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Golazo Engine listening on :${PORT}  templates=[${Object.keys(TEMPLATES).join(', ')}]`);
});
