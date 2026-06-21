/**
 * svg-helpers.js — shared SVG engine for every Golazo card.
 *
 * CRITICAL: @resvg/resvg-js does NOT render <foreignObject>. Every Arabic text
 * block is therefore a native <text> element produced by arText/arBox/arBlock,
 * with MANUAL word wrapping (resvg does not auto-wrap native text).
 *
 * The decorative frame functions (mulberry32, buildTexture, diagBars, topSlot,
 * frame) are ported VERBATIM from golazo_studio.html — they already use only
 * native SVG shapes/text, so they are resvg-safe.
 */

const fs = require('fs');
const path = require('path');
const { logoUri } = require('./logos');

/* ===== brand constants ===== */
const C = { navy: '#0D3D07', yellow: '#7DDB5B', red: '#E63946', paper: '#FFFFFF' };
const W = 1080, H = 1080;
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// True when a field carries a real value — used to omit empty elements so a card
// never shows a dangling label (e.g. "المصدر: " with nothing after it).
const has = v => v != null && String(v).trim() !== '';

/* ===== brand logo =====
 * resvg does NOT fetch remote/relative <image> hrefs — it only renders images
 * embedded as base64 data URIs. So load the committed PNG once at startup and
 * embed it. The logo is a ~3:1 "GOLAZO!" wordmark used in the top slot. */
let LOGO_URI = '';
try {
  LOGO_URI = 'data:image/png;base64,' +
    fs.readFileSync(path.join(__dirname, '..', 'golazo-logo.png')).toString('base64');
} catch (e) {
  console.error('golazo-logo.png not loaded (falling back to drawn wordmark):', e.message);
}

/* ===== text measurement + wrap (replaces foreignObject auto-wrap) ===== */

// Estimate a glyph's horizontal advance as a fraction of font size.
// resvg exposes no measure API; these ratios are tuned against Cairo/resvg.
function charW(ch, size) {
  if (ch === ' ') return size * 0.26;
  if (/[0-9.,:%\-]/.test(ch)) return size * 0.50;
  if (/[A-Za-z]/.test(ch)) return size * 0.52;
  return size * 0.50; // arabic & default
}

// Total estimated width of a string at a given font size.
function strW(s, size) {
  let w = 0;
  for (const ch of String(s)) w += charW(ch, size);
  return w;
}

// Anton is a condensed all-caps display face with very different metrics from
// Cairo, so the headings (blockTitle) need their own estimator to size the boxes
// to the actual word width. Ratios are advance/font-size, tuned for Anton caps.
function antonW(s, size) {
  let w = 0;
  for (const ch of String(s).toUpperCase()) {
    let f;
    if (ch === ' ') f = 0.30;
    else if ('IJ'.includes(ch)) f = 0.26;
    else if ('MW'.includes(ch)) f = 0.70;
    else if ('TLFEZ'.includes(ch)) f = 0.48;
    else if (/[0-9]/.test(ch)) f = 0.54;
    else f = 0.56; // most caps (A,C,D,H,U,Y,…)
    w += size * f;
  }
  return w;
}

// Greedy word wrap that respects explicit '\n' paragraph breaks.
function wrapLines(text, maxW, size) {
  const paras = String(text == null ? '' : text).split('\n');
  const out = [];
  for (const para of paras) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      // keep adding while it fits; never drop the first word of a line
      if (strW(trial, size) <= maxW || !line) line = trial;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Native multi-line RTL text element.
 * @param {object} opts - align: 'center'|'right'|'left'; valign: 'center'|'top'; lh: line-height multiple.
 * valign 'center' vertically centers the wrapped block inside box height h; 'top' flows from the top.
 * The 0.80*size first-baseline offset and lh are tuned to match the Studio look — keep these numbers.
 */
function arText(x, y, w, h, text, weight, size, color, opts = {}) {
  const align = opts.align || 'center';
  const valign = opts.valign || 'center';
  const lhMul = opts.lh || 1.4;
  const minSize = opts.minSize || 16;
  // Flexible sizing: start at the requested size and shrink (1px steps) until
  // the wrapped block fits the box both vertically (h) and horizontally (w).
  // Short text never shrinks (it already fits on the first try).
  let size2 = size;
  let lines = wrapLines(text, w - 8, size2);
  while (size2 > minSize) {
    lines = wrapLines(text, w - 8, size2);
    const blockH = (lines.length || 1) * lhMul * size2;
    let widest = 0;
    for (const ln of lines) { const lw = strW(ln, size2); if (lw > widest) widest = lw; }
    if (blockH <= h && widest <= w - 8) break;
    size2 -= 1;
  }
  size = size2;
  const lh = lhMul * size;
  const n = lines.length || 1;
  const totalH = n * lh;
  let anchor, ax;
  if (align === 'center') { anchor = 'middle'; ax = x + w / 2; }
  else if (align === 'right') { anchor = 'end'; ax = x + w; }
  else { anchor = 'start'; ax = x; }
  const firstBaseline = (valign === 'center')
    ? y + h / 2 - totalH / 2 + size * 0.80
    : y + size * 0.90;
  let tspans = '';
  lines.forEach((ln, i) => {
    const ly = (firstBaseline + i * lh).toFixed(1);
    tspans += `<tspan x="${ax.toFixed(1)}" y="${ly}">${esc(ln)}</tspan>`;
  });
  return `<text text-anchor="${anchor}" direction="rtl" font-family="Cairo" font-weight="${weight}" font-size="${size}" fill="${color}">${tspans}</text>`;
}

// Drop-in replacements for the Studio's foreignObject helpers, same signature
// (x,y,w,h,text,weight,size,color) so ported template bodies work unchanged.
const arBox = (x, y, w, h, t, weight, size, color) =>
  arText(x, y, w, h, t, weight, size, color, { valign: 'center', align: 'center', lh: 1.35 });
const arBlock = (x, y, w, h, t, weight, size, color, align) =>
  arText(x, y, w, h, t, weight, size, color, { valign: 'top', align: align || 'center', lh: 1.4 });

/* ===== shared seeded texture (ported verbatim from golazo_studio.html) ===== */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
let TEX=null;
function buildTexture(){
  if(TEX) return TEX;
  const rng=mulberry32(20260605), rnd=(a,b)=>a+rng()*(b-a), pick=a=>a[Math.floor(rng()*a.length)];
  const cols=[C.yellow,C.yellow,C.yellow,C.navy]; let s='';
  for(let i=0;i<72;i++){
    const x=rnd(20,W-20).toFixed(0), y=rnd(20,H-20).toFixed(0), col=pick(cols), op=rnd(0.107,0.449).toFixed(3), rot=rnd(0,90).toFixed(0), sz=rnd(10,48), sw=(sz*0.10).toFixed(1), h=(sz/2).toFixed(1);
    const ty=pick(['plus','x','circle','tri','dot','dot']);
    if(ty==='plus') s+=`<g transform="translate(${x},${y}) rotate(${rot})" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"><path d="M0 ${-h} V ${h} M ${-h} 0 H ${h}"/></g>`;
    else if(ty==='x') s+=`<g transform="translate(${x},${y}) rotate(${rot})" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"><path d="M${-h} ${-h} L ${h} ${h} M ${h} ${-h} L ${-h} ${h}"/></g>`;
    else if(ty==='circle') s+=`<circle cx="${x}" cy="${y}" r="${h}" fill="none" stroke="${col}" stroke-width="${sw}" opacity="${op}"/>`;
    else if(ty==='tri') s+=`<g transform="translate(${x},${y}) rotate(${rot})" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round" opacity="${op}"><path d="M0 ${-h} L ${h} ${h} L ${-h} ${h} Z"/></g>`;
    else s+=`<circle cx="${x}" cy="${y}" r="${(sz*0.16).toFixed(1)}" fill="${col}" opacity="${op}"/>`;
  }
  for(let i=0;i<11;i++){
    const x=rnd(70,W-70).toFixed(0), y=rnd(90,H-50).toFixed(0), op=rnd(0.054,0.161).toFixed(3), rot=rnd(-28,28).toFixed(0), fs=rnd(28,84).toFixed(0);
    s+=`<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.yellow}" opacity="${op}">GOLAZO!</text>`;
  }
  TEX=s; return TEX;
}
function diagBars(tx,ty,rot,bars){let s=`<g transform="translate(${tx},${ty}) rotate(${rot})">`,off=0;bars.forEach(b=>{s+=`<rect x="0" y="${off}" width="${b.len}" height="${b.th}" fill="${b.c}" transform="skewX(-20)"/>`;off+=b.th+14;});return s+'</g>';}

/* ===== shared frame (decorative + top + footer) — ported verbatim ===== */
function topSlot(d){
  // News pipeline leaves d.tlogo empty: resvg does not fetch remote <image>.
  if(d.tlogo && d.tlogo.trim()) return `<image href="${esc(d.tlogo)}" x="492" y="26" width="96" height="96" preserveAspectRatio="xMidYMid meet"/>`;
  // Brand logo (embedded base64). ~3:1 wordmark, centered at the top.
  if(LOGO_URI) return `<image href="${LOGO_URI}" x="405" y="24" width="270" height="90" preserveAspectRatio="xMidYMid meet"/>`;
  // Fallback: drawn wordmark (only if the PNG failed to load).
  return `<g transform="translate(540,70)">
    <circle cx="-92" cy="0" r="16" fill="none" stroke="${C.navy}" stroke-width="3"/><line x1="-110" y1="0" x2="-74" y2="0" stroke="${C.navy}" stroke-width="3"/>
    <text x="-58" y="13" font-family="Anton" font-size="40" fill="${C.navy}">GOLAZO</text>
  </g>`;
}
function frame(d){
  return `
  <rect width="${W}" height="${H}" fill="${C.paper}"/>
  <rect width="${W}" height="${H}" filter="url(#paper)"/>
  ${buildTexture()}
  <g opacity="0.05"><path d="M780,360 L900,420 L900,560 Q900,650 780,700 Q660,650 660,560 L660,420 Z" fill="none" stroke="${C.navy}" stroke-width="10"/></g>
  <g transform="translate(120,1055) rotate(-90)"><text x="0" y="0" font-family="Anton" font-size="240" fill="${C.yellow}" opacity="0.28" letter-spacing="2">GOLAZO!</text></g>
  <g transform="translate(1050,760) rotate(-90)"><text x="0" y="0" font-family="Anton" font-weight="800" font-size="44" fill="${C.navy}" letter-spacing="6">GOLAZO!</text></g>
  ${diagBars(-6,46,45,[{len:160,th:24,c:C.navy},{len:120,th:24,c:C.yellow},{len:82,th:24,c:C.navy}])}
  ${diagBars(1086,46,135,[{len:160,th:24,c:C.yellow},{len:120,th:24,c:C.navy},{len:82,th:24,c:C.yellow}])}
  ${diagBars(1086,1034,-135,[{len:150,th:22,c:C.navy},{len:112,th:22,c:C.yellow},{len:76,th:22,c:C.navy}])}
  ${diagBars(-6,1034,-45,[{len:120,th:20,c:C.yellow},{len:86,th:20,c:C.navy}])}
  <g transform="translate(1010,980) rotate(-135)" opacity="0.9"><rect x="0" y="0" width="240" height="6" fill="${C.navy}" transform="skewX(-20)"/><rect x="0" y="20" width="200" height="6" fill="${C.yellow}" transform="skewX(-20)"/></g>
  <g transform="translate(58,1052) rotate(-90)"><rect x="0" y="-30" width="330" height="60" fill="${C.navy}" transform="skewX(-12)"/><text x="165" y="10" text-anchor="middle" font-family="Barlow Condensed" font-weight="900" font-style="italic" font-size="40" fill="${C.yellow}" transform="skewX(-12)" letter-spacing="1">${esc(d.hashtag)}</text></g>
  ${topSlot(d)}
  <line x1="360" y1="978" x2="720" y2="978" stroke="${C.yellow}" stroke-width="4"/>
  <text x="540" y="1016" text-anchor="middle" font-family="Cairo" font-weight="800" font-size="28" fill="${C.navy}">الكرة بالأرقام  ·  @golazo.arabia</text>`;
}

/* Vertically center a list of body blocks within the band [top, bottom].
 * Each block = { h, gap?, render(y) }; null/false entries are skipped. When
 * fields are missing the remaining blocks recenter instead of leaving a hole. */
function vstack(top, bottom, blocks) {
  const present = blocks.filter(Boolean);
  if (!present.length) return '';
  const totalH = present.reduce((s, b, i) => s + b.h + (i ? (b.gap || 0) : 0), 0);
  let y = top + Math.max(0, ((bottom - top) - totalH) / 2);
  let out = '';
  present.forEach((b, i) => { if (i) y += (b.gap || 0); out += b.render(y); y += b.h; });
  return out;
}

/* ===== match-card helpers (ported from golazo_studio.html, resvg-native) ===== */

// Split a "a | b | c" line into trimmed cells, and a multiline list into
// trimmed non-empty rows (capped). Used by the table/list match templates.
const cells = s => String(s == null ? '' : s).split('|').map(x => x.trim());
const listRows = (s, cap) => String(s == null ? '' : s).split('\n').map(x => x.trim()).filter(Boolean).slice(0, cap);

// Big two-tone block heading (e.g. MATCH / DAY, FULL / TIME). Restores the Studio
// layered look — a light-green band under the BOTTOM HALF of t1 (top half sits on
// plain paper) joined with no gap to a full-height dark-green block behind t2 —
// but the two backgrounds are now sized to each word (via antonW) and centered as
// a unit, so longer words like "MATCH" no longer overflow and drop a letter.
function blockTitle(t1, t2) {
  const S = 122;                     // display size; backgrounds adapt to the words
  const padX = 24;
  const bw1 = antonW(t1, S) + padX * 2;   // light-green band width (fits t1)
  const bw2 = antonW(t2, S) + padX * 2;   // dark-green block width (fits t2)
  const x1 = 540 - (bw1 + bw2) / 2;       // center the connected pair on the card
  const x2 = x1 + bw1;                     // dark block starts where the band ends → no gap
  const yTop = 168;                        // top of the full-height dark (t2) block
  const navyH = Math.round(S * 1.0);
  const by = yTop + S * 0.93;              // shared text baseline
  const bandTop = by - S * 0.45;           // band covers only the bottom ~half of t1
  const bandH = Math.round(S * 0.55);
  const tb = by.toFixed(1);
  return `
  <rect x="${x2.toFixed(1)}" y="${(yTop - 14).toFixed(0)}" width="${bw2.toFixed(1)}" height="12" fill="${C.navy}"/>
  <rect x="${x1.toFixed(1)}" y="${bandTop.toFixed(1)}" width="${bw1.toFixed(1)}" height="${bandH}" fill="${C.yellow}"/>
  <rect x="${x2.toFixed(1)}" y="${yTop}" width="${bw2.toFixed(1)}" height="${navyH}" fill="${C.navy}"/>
  <text x="${(x1 + bw1 / 2).toFixed(1)}" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${S}" fill="${C.navy}">${esc(t1)}</text>
  <text x="${(x2 + bw2 / 2).toFixed(1)}" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${S}" fill="${C.yellow}">${esc(t2)}</text>`;
}

// Team crest centered at (cx,cy). The logo is embedded by the server (logos.js)
// before render — logoUri() returns the cached data: URI (or '' if unavailable),
// in which case we draw the dashed-shield placeholder.
function crest(cx, cy, logo) {
  const u = logoUri(logo);
  if (u) return `<image href="${esc(u)}" x="${cx - 72}" y="${cy - 72}" width="144" height="144" preserveAspectRatio="xMidYMid meet"/>`;
  return `<g><path d="M${cx},${cy - 74} L${cx + 64},${cy - 50} L${cx + 64},${cy + 16} Q${cx + 64},${cy + 58} ${cx},${cy + 82} Q${cx - 64},${cy + 58} ${cx - 64},${cy + 16} L${cx - 64},${cy - 50} Z" fill="none" stroke="${C.navy}" stroke-width="4" stroke-dasharray="8 8"/><text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="Cairo" font-weight="800" font-size="24" fill="${C.navy}">شعار</text></g>`;
}

// Small inline team badge for list rows (fixtures/results), centered at (cx,cy),
// radius r. Returns '' when the logo isn't available — the row just omits it
// (cleaner than a broken/empty box).
function rowLogo(cx, cy, logo, r = 16) {
  const u = logoUri(logo);
  if (!u) return '';
  return `<image href="${esc(u)}" x="${(cx - r).toFixed(1)}" y="${(cy - r).toFixed(1)}" width="${(2 * r).toFixed(0)}" height="${(2 * r).toFixed(0)}" preserveAspectRatio="xMidYMid meet"/>`;
}

// A standings/group table column layout shared by `standing` and `group`.
// rows = array of "team | played | GD | pts | logo?" strings; rank is the row order.
// The optional 5th cell is the team's api-football logo URL → a small crest is
// drawn just left of the rank (server embeds it; missing → omitted, no gap jump).
// headerY = baseline of the header labels; opts.highlight = #rows to tint yellow
// (top-N qualify, for group stage). Returns the header + body SVG.
function tableRows(rows, top, bottom, opts = {}) {
  const gap = Math.min(opts.maxGap || 72, (bottom - top) / Math.max(rows.length, 1));
  const fs = Math.max(22, Math.min(opts.maxFs || 32, Math.floor(gap * (opts.fsMul || 0.42))));
  const lr = Math.min(18, Math.round(fs * 0.62));          // crest radius
  const X = { rank: 968, logo: 924, team: 900, played: 470, gd: 320, pts: 165 };
  const hLabel = (x, t, a) => `<text x="${x}" y="${opts.headerY}" text-anchor="${a}" font-family="Cairo" font-weight="800" font-size="22" fill="#3a5a33">${t}</text>`;
  let body = hLabel(X.rank, '#', 'end') + hLabel(X.team, 'الفريق', 'end') +
    hLabel(X.played, 'لعب', 'middle') + hLabel(X.gd, '+/-', 'middle') + hLabel(X.pts, 'نقاط', 'middle');
  rows.forEach((r, i) => {
    const c = cells(r);
    const pos = i + 1, team = c[0] || '', played = c[1] || '', gd = c[2] || '', pts = c[3] || '', logo = c[4] || '';
    const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.35).toFixed(1);
    if (opts.highlight && i < opts.highlight) body += `<rect x="100" y="${y.toFixed(0)}" width="880" height="${gap.toFixed(0)}" rx="8" fill="${C.yellow}" opacity="0.20"/>`;
    else if (i % 2 === 0) body += `<rect x="100" y="${y.toFixed(0)}" width="880" height="${gap.toFixed(0)}" rx="8" fill="${C.navy}" opacity="0.05"/>`;
    body += `<text x="${X.rank}" y="${tb}" text-anchor="end" font-family="Anton" font-size="${fs + 2}" fill="${C.navy}">${esc(pos)}</text>`;
    body += rowLogo(X.logo, cy, logo, lr);
    body += `<text x="${X.team}" y="${tb}" text-anchor="end" direction="rtl" font-family="Cairo" font-weight="800" font-size="${fs}" fill="${C.navy}">${esc(team)}</text>`;
    body += `<text x="${X.played}" y="${tb}" text-anchor="middle" font-family="Cairo" font-weight="700" font-size="${fs}" fill="#13350c">${esc(played)}</text>`;
    body += `<text x="${X.gd}" y="${tb}" text-anchor="middle" font-family="Cairo" font-weight="700" font-size="${fs}" fill="#13350c">${esc(gd)}</text>`;
    body += `<rect x="${X.pts - 42}" y="${(cy - gap * 0.3).toFixed(0)}" width="84" height="${(gap * 0.6).toFixed(0)}" rx="8" fill="${C.yellow}"/>`;
    body += `<text x="${X.pts}" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}">${esc(pts)}</text>`;
  });
  return body;
}

module.exports = {
  C, W, H, esc, has,
  charW, strW, wrapLines, arText, arBox, arBlock, vstack,
  frame, blockTitle, crest, rowLogo, cells, listRows, tableRows,
};
