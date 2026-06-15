/**
 * logos.js — server-side team/competition logo embedding for resvg.
 *
 * resvg renders ONLY embedded base64 images (it never fetches remote <image>
 * hrefs). api-football gives logo URLs, so before rendering we fetch each URL
 * once, base64-encode it, and cache it in-memory keyed by URL. Templates then
 * call logoUri(url) synchronously to get the data: URI (or '' if unavailable).
 *
 * Flow (server.js): await resolveLogos(collectLogoUrls(data)) → svgToPng(buildSvg(...)).
 */
const https = require('https');
const http = require('http');

const cache = new Map(); // url -> dataUri  ('' marks a known-failed fetch, so we don't retry it every render)

const IMG_RE = /https?:\/\/[^\s"'|\\]+\.(?:png|jpe?g|svg)/gi;

// Pull every image URL out of a payload (fields OR inside the pipe/newline list
// strings the table/list cards use). Template-agnostic.
function collectLogoUrls(data) {
  const matches = JSON.stringify(data == null ? '' : data).match(IMG_RE);
  return matches ? [...new Set(matches)] : [];
}

function fetchBuffer(url) {
  return new Promise((resolve) => {
    let settled = false;
    const done = v => { if (!settled) { settled = true; resolve(v); } };
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 5000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return fetchBuffer(new URL(res.headers.location, url).toString()).then(done);
        }
        if (res.statusCode !== 200) { res.resume(); return done(null); }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => done(Buffer.concat(chunks)));
        res.on('error', () => done(null));
      });
      req.on('error', () => done(null));
      req.on('timeout', () => { req.destroy(); done(null); });
    } catch { done(null); }
  });
}

function mimeFor(url) {
  return /\.svg(\?|$)/i.test(url) ? 'image/svg+xml'
    : /\.jpe?g(\?|$)/i.test(url) ? 'image/jpeg'
    : 'image/png';
}

// Fetch+cache any URLs not already cached. Failures cache as '' (rendered as
// a placeholder, never retried for the life of the process).
async function resolveLogos(urls) {
  await Promise.all((urls || []).map(async (url) => {
    if (cache.has(url)) return;
    const buf = await fetchBuffer(url);
    cache.set(url, buf ? `data:${mimeFor(url)};base64,${buf.toString('base64')}` : '');
  }));
}

// Synchronous lookup used inside templates. Passes through data: URIs untouched.
function logoUri(url) {
  if (!url) return '';
  const s = String(url);
  if (s.startsWith('data:')) return s;
  return cache.get(s) || '';
}

module.exports = { collectLogoUrls, resolveLogos, logoUri };
