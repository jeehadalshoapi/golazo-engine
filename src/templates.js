/**
 * templates.js — SVG generation for Golazo news cards.
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

// Big two-tone block heading (e.g. MATCH / DAY). Verbatim native SVG from Studio.
function blockTitle(t1, t2) {
  return `
  <rect x="545" y="150" width="320" height="14" fill="${C.navy}"/>
  <rect x="230" y="232" width="320" height="82" fill="${C.yellow}"/>
  <rect x="545" y="160" width="320" height="150" fill="${C.navy}"/>
  <text x="245" y="300" font-family="Anton" font-size="150" fill="${C.navy}">${esc(t1)}</text>
  <text x="705" y="300" text-anchor="middle" font-family="Anton" font-size="150" fill="${C.yellow}">${esc(t2)}</text>`;
}

// Team crest centered at (cx,cy). resvg renders ONLY base64 data: images — it will
// NOT fetch http(s) logo URLs — so n8n must pass logos as data: URIs; anything else
// falls back to the dashed-shield placeholder. (Same constraint as the brand logo.)
function crest(cx, cy, logo) {
  if (logo && String(logo).trim().startsWith('data:'))
    return `<image href="${esc(logo)}" x="${cx - 72}" y="${cy - 72}" width="144" height="144" preserveAspectRatio="xMidYMid meet"/>`;
  return `<g><path d="M${cx},${cy - 74} L${cx + 64},${cy - 50} L${cx + 64},${cy + 16} Q${cx + 64},${cy + 58} ${cx},${cy + 82} Q${cx - 64},${cy + 58} ${cx - 64},${cy + 16} L${cx - 64},${cy - 50} Z" fill="none" stroke="${C.navy}" stroke-width="4" stroke-dasharray="8 8"/><text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="Cairo" font-weight="800" font-size="24" fill="${C.navy}">شعار</text></g>`;
}

/* ===== news templates (4) — bodies from design.md, verified Studio layout ===== */
const TEMPLATES = {
  breaking: {
    name: 'خبر عاجل',
    fields: ['time', 'headline', 'details', 'source'],
    content: d => `
    ${d.roundup ? '' : `
    <rect x="380" y="160" width="320" height="74" rx="10" fill="${C.red}"/>
    <circle cx="430" cy="197" r="8" fill="#fff"/>
    <text x="555" y="210" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="40" fill="#fff">خبر عاجل</text>
    ${has(d.time) ? `<text x="1000" y="210" text-anchor="end" font-family="Cairo" font-weight="700" font-size="28" fill="${C.navy}">${esc(d.time)}</text>` : ''}`}
    ${vstack(258, 950, [
      { h: 300, render: y => arBox(90, y, 900, 300, d.headline, 900, 74, C.navy) },
      has(d.details) ? { h: 250, gap: 10, render: y =>
        `<line x1="150" y1="${(y + 18).toFixed(0)}" x2="930" y2="${(y + 18).toFixed(0)}" stroke="${C.yellow}" stroke-width="5"/>` +
        arBox(120, y + 30, 840, 220, d.details, 600, 40, '#13350c') } : null,
      has(d.source) ? { h: 46, gap: 24, render: y =>
        `<text x="540" y="${(y + 32).toFixed(0)}" text-anchor="middle" font-family="Cairo" font-weight="700" font-size="30" fill="${C.navy}">المصدر: ${esc(d.source)}</text>` } : null,
    ])}`
  },
  confirmed: {
    name: 'انتقال رسمي',
    fields: ['player', 'club', 'contract', 'fee', 'until', 'source'],
    content: d => {
      const rows = [];
      if (has(d.contract)) rows.push('المدة:  ' + d.contract);
      if (has(d.fee)) rows.push('القيمة:  ' + d.fee);
      if (has(d.until)) rows.push('نهاية العقد:  ' + d.until);
      const info = rows.join('\n');
      return `
    <rect x="400" y="162" width="280" height="72" rx="36" fill="${C.navy}"/>
    <path d="M615 198 l12 12 l22 -26" stroke="${C.yellow}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="525" y="212" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="40" fill="${C.yellow}">رسمياً</text>
    ${vstack(255, 950, [
      { h: 120, render: y => arBox(80, y, 920, 120, d.player, 900, 70, C.navy) },
      has(d.club) ? { h: 150, gap: 10, render: y =>
        arBox(80, y, 920, 46, 'انتقال إلى', 700, 32, '#13350c') +
        `<rect x="260" y="${(y + 64).toFixed(0)}" width="560" height="86" rx="8" fill="${C.yellow}"/>` +
        arBox(260, y + 64, 560, 86, d.club, 900, 46, C.navy) } : null,
      has(info) ? { h: 250, gap: 16, render: y => arBox(140, y, 800, 250, info, 700, 40, '#13350c') } : null,
      has(d.source) ? { h: 50, gap: 10, render: y => arBox(80, y, 920, 50, 'المصدر: ' + d.source, 700, 30, C.navy) } : null,
    ])}`;
    }
  },
  rumors: {
    name: 'شائعات/تقارير',
    fields: ['player', 'fromClub', 'toClub', 'details', 'status', 'source'],
    content: d => {
      const move = has(d.fromClub) && has(d.toClub) ? (d.fromClub + '   ←   ' + d.toClub)
        : has(d.fromClub) ? d.fromClub
        : has(d.toClub) ? d.toClub : '';
      return `
    <rect x="390" y="162" width="300" height="72" rx="36" fill="none" stroke="${C.navy}" stroke-width="4" stroke-dasharray="11 8"/>
    ${arBox(390, 162, 300, 72, 'تقارير وشائعات', 900, 36, C.navy)}
    ${vstack(250, 950, [
      { h: 120, render: y => arBox(80, y, 920, 120, d.player, 900, 66, C.navy) },
      has(move) ? { h: 60, gap: 8, render: y => arBox(80, y, 920, 60, move, 800, 40, '#13350c') } : null,
      has(d.details) ? { h: 235, gap: 18, render: y =>
        `<line x1="180" y1="${y.toFixed(0)}" x2="900" y2="${y.toFixed(0)}" stroke="${C.yellow}" stroke-width="4"/>` +
        arBox(130, y + 22, 820, 210, d.details, 600, 38, '#13350c') } : null,
      has(d.status) ? { h: 72, gap: 18, render: y =>
        `<rect x="300" y="${y.toFixed(0)}" width="480" height="72" rx="36" fill="${C.yellow}"/>` +
        arBox(300, y, 480, 72, 'الموقف: ' + d.status, 800, 34, C.navy) } : null,
      has(d.source) ? { h: 50, gap: 14, render: y => arBox(80, y, 920, 50, 'المصدر: ' + d.source, 700, 30, C.navy) } : null,
    ])}`;
    }
  },
  quote: {
    name: 'تصريح',
    fields: ['quote', 'author', 'role'],
    content: d => `
    <rect x="400" y="160" width="280" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(400, 160, 280, 72, 'تصريح', 900, 40, C.yellow)}
    <text x="540" y="332" text-anchor="middle" font-family="Anton" font-size="130" fill="${C.yellow}">&#8221;</text>
    ${vstack(352, 885, [
      { h: 320, render: y => arBox(110, y, 860, 320, d.quote, 800, 54, C.navy) },
      (has(d.author) || has(d.role)) ? { h: 16 + (has(d.author) ? 70 : 0) + (has(d.role) ? 50 : 0), gap: 16, render: y =>
        `<line x1="300" y1="${y.toFixed(0)}" x2="780" y2="${y.toFixed(0)}" stroke="${C.yellow}" stroke-width="5"/>` +
        (has(d.author) ? arBox(80, y + 16, 920, 70, '— ' + d.author, 900, 52, C.navy) : '') +
        (has(d.role) ? arBox(80, y + 16 + (has(d.author) ? 70 : 0), 920, 50, d.role, 700, 34, '#13350c') : '') } : null,
    ])}`
  },

  /* ===== MATCH templates (api-football pipeline) — native ports of the Studio bodies ===== */

  // League table (already ordered top→down; rank is derived from row order).
  // rows: one team per line — "team | played | GD | pts".
  standing: {
    name: 'ترتيب الدوري',
    fields: ['comp', 'rows'],
    content: d => {
      const rows = listRows(d.rows, 8);
      const top = 350, bottom = 930;
      const gap = Math.min(72, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(22, Math.min(32, Math.floor(gap * 0.42)));
      const X = { rank: 960, team: 905, played: 470, gd: 320, pts: 165 };
      const hLabel = (x, t, anchor) => `<text x="${x}" y="335" text-anchor="${anchor}" font-family="Cairo" font-weight="800" font-size="22" fill="#3a5a33">${t}</text>`;
      const header = hLabel(X.rank, '#', 'end') + hLabel(X.team, 'الفريق', 'end') +
        hLabel(X.played, 'لعب', 'middle') + hLabel(X.gd, '+/-', 'middle') + hLabel(X.pts, 'نقاط', 'middle');
      let body = '';
      rows.forEach((r, i) => {
        const c = cells(r);
        const pos = i + 1, team = c[0] || '', played = c[1] || '', gd = c[2] || '', pts = c[3] || '';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.35).toFixed(1);
        if (i % 2 === 0) body += `<rect x="100" y="${y.toFixed(0)}" width="880" height="${gap.toFixed(0)}" rx="8" fill="${C.navy}" opacity="0.05"/>`;
        body += `<text x="${X.rank}" y="${tb}" text-anchor="end" font-family="Anton" font-size="${fs + 2}" fill="${C.navy}">${esc(pos)}</text>`;
        body += `<text x="${X.team}" y="${tb}" text-anchor="end" direction="rtl" font-family="Cairo" font-weight="800" font-size="${fs}" fill="${C.navy}">${esc(team)}</text>`;
        body += `<text x="${X.played}" y="${tb}" text-anchor="middle" font-family="Cairo" font-weight="700" font-size="${fs}" fill="#13350c">${esc(played)}</text>`;
        body += `<text x="${X.gd}" y="${tb}" text-anchor="middle" font-family="Cairo" font-weight="700" font-size="${fs}" fill="#13350c">${esc(gd)}</text>`;
        body += `<rect x="${X.pts - 42}" y="${(cy - gap * 0.3).toFixed(0)}" width="84" height="${(gap * 0.6).toFixed(0)}" rx="8" fill="${C.yellow}"/>`;
        body += `<text x="${X.pts}" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}">${esc(pts)}</text>`;
      });
      return `
    <rect x="350" y="158" width="380" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(350, 158, 380, 72, 'ترتيب الدوري', 900, 34, C.yellow)}
    ${arBox(80, 250, 920, 56, d.comp, 800, 40, C.navy)}
    ${header}
    ${body}`;
    }
  },

  // Pre-match poster. comp/round + the two teams + kickoff. Logos via data: URI only.
  prematch: {
    name: 'قبل المباراة',
    fields: ['comp', 'round', 'home', 'away', 'homeLogo', 'awayLogo', 'date', 'time', 'stadium'],
    content: d => `
    ${blockTitle('MATCH', 'DAY')}
    <text x="540" y="376" text-anchor="middle" font-family="Anton" font-size="62" fill="${C.navy}">${esc(d.comp)}</text>
    ${arBox(80, 392, 920, 40, d.round, 800, 30, '#13350c')}
    ${crest(245, 560, d.homeLogo)}
    ${crest(865, 560, d.awayLogo)}
    <rect x="360" y="478" width="360" height="170" rx="8" fill="${C.yellow}"/>
    <text x="540" y="612" text-anchor="middle" font-family="Anton" font-size="140" fill="${C.navy}">VS</text>
    <rect x="200" y="690" width="680" height="74" rx="6" fill="${C.yellow}"/>
    ${arBox(210, 690, 300, 74, d.home, 900, 40, C.navy)}
    <rect x="505" y="698" width="70" height="58" fill="${C.navy}"/>
    <text x="540" y="739" text-anchor="middle" font-family="Anton" font-size="32" fill="${C.yellow}">VS</text>
    ${arBox(570, 690, 300, 74, d.away, 900, 40, C.navy)}
    <text x="540" y="838" text-anchor="middle" font-family="Anton" font-size="56" fill="${C.navy}">${esc(d.date)}</text>
    ${arBox(80, 852, 920, 44, [d.time, d.stadium].filter(has).join('   ·   '), 700, 32, '#13350c')}
    ${arBox(80, 902, 920, 40, 'من سيفوز؟ شاركنا توقّعك', 800, 28, C.navy)}`
  },

  // Full-time result. score + per-team event lines (goal/card — one per line).
  result: {
    name: 'نتيجة المباراة',
    fields: ['comp', 'round', 'home', 'away', 'homeLogo', 'awayLogo', 'hs', 'as', 'homeEvents', 'awayEvents'],
    content: d => {
      const hE = listRows(d.homeEvents, 8), aE = listRows(d.awayEvents, 8);
      const n = Math.max(hE.length, aE.length, 1);
      let fs = Math.floor(150 / (n * 1.45)); fs = Math.max(14, Math.min(28, fs));
      const col = (x, name, arr) =>
        arBox(x, 778, 420, 40, name, 900, 28, C.navy) +
        `<line x1="${x + 60}" y1="824" x2="${x + 360}" y2="824" stroke="${C.yellow}" stroke-width="3"/>` +
        arBlock(x, 834, 420, 138, arr.join('\n'), 600, fs, '#13350c');
      return `
    ${blockTitle('FULL', 'TIME')}
    <text x="540" y="376" text-anchor="middle" font-family="Anton" font-size="62" fill="${C.navy}">${esc(d.comp)}</text>
    ${arBox(80, 392, 920, 40, d.round, 800, 30, '#13350c')}
    ${crest(245, 560, d.homeLogo)}
    ${crest(865, 560, d.awayLogo)}
    <rect x="360" y="478" width="360" height="170" rx="8" fill="${C.yellow}"/>
    <rect x="535" y="493" width="10" height="140" fill="${C.navy}"/>
    <text x="455" y="612" text-anchor="middle" font-family="Anton" font-size="150" fill="${C.navy}">${esc(d.hs)}</text>
    <text x="625" y="612" text-anchor="middle" font-family="Anton" font-size="150" fill="${C.navy}">${esc(d.as)}</text>
    <rect x="200" y="690" width="680" height="74" rx="6" fill="${C.yellow}"/>
    ${arBox(210, 690, 300, 74, d.home, 900, 40, C.navy)}
    <rect x="505" y="698" width="70" height="58" fill="${C.navy}"/>
    <text x="540" y="737" text-anchor="middle" font-family="Anton" font-size="30" fill="${C.yellow}">FT</text>
    ${arBox(570, 690, 300, 74, d.away, 900, 40, C.navy)}
    ${col(80, d.home, hE)}
    ${col(580, d.away, aE)}`;
    }
  },

  // Match statistics with comparison bars. stats: "label | home | away" per line.
  matchstats: {
    name: 'تحليل إحصائي',
    fields: ['home', 'away', 'score', 'stats'],
    content: d => {
      const rows = listRows(d.stats, 7);
      const startY = 372, rowH = Math.min(104, (930 - startY) / Math.max(rows.length, 1));
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r); const label = p[0] || '', hv = p[1] || '', av = p[2] || '';
        const hN = parseFloat(String(hv).replace(/[^0-9.]/g, '')) || 0, aN = parseFloat(String(av).replace(/[^0-9.]/g, '')) || 0, tot = (hN + aN) || 1;
        const barX = 140, barW = 800, hW = Math.max(4, Math.round(barW * hN / tot));
        const y = startY + i * rowH;
        body += `<text x="150" y="${y.toFixed(0)}" font-family="Cairo" font-weight="800" font-size="34" fill="${C.navy}">${esc(hv)}</text>`;
        body += `<text x="930" y="${y.toFixed(0)}" text-anchor="end" font-family="Cairo" font-weight="800" font-size="34" fill="${C.navy}">${esc(av)}</text>`;
        body += arBox(390, y - 34, 300, 40, label, 800, 26, '#13350c');
        const by = (y + 16).toFixed(0);
        body += `<rect x="${barX}" y="${by}" width="${barW}" height="16" rx="8" fill="#e6ece4"/>`;
        body += `<rect x="${barX}" y="${by}" width="${hW}" height="16" rx="8" fill="${C.navy}"/>`;
        body += `<rect x="${barX + hW}" y="${by}" width="${barW - hW}" height="16" rx="8" fill="${C.yellow}"/>`;
      });
      return `
    <rect x="350" y="158" width="380" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(350, 158, 380, 72, 'إحصائيات المباراة', 900, 34, C.yellow)}
    ${arBox(80, 250, 360, 60, d.home, 900, 40, C.navy)}
    ${arBox(440, 250, 200, 60, d.score, 900, 46, C.navy)}
    ${arBox(640, 250, 360, 60, d.away, 900, 40, C.navy)}
    ${body}
    <rect x="335" y="905" width="22" height="22" fill="${C.navy}"/>${arBox(360, 899, 150, 34, d.home, 700, 24, C.navy)}
    <rect x="560" y="905" width="22" height="22" fill="${C.yellow}"/>${arBox(585, 899, 150, 34, d.away, 700, 24, C.navy)}`;
    }
  },

  // Player ratings. list: "name | rating" per line. Chip color by rating band.
  ratings: {
    name: 'تقييمات اللاعبين',
    fields: ['team', 'list'],
    content: d => {
      const rows = listRows(d.list, 11);
      const top = 320, gap = Math.min(56, (905 - top) / Math.max(rows.length, 1));
      const fs = Math.max(22, Math.min(32, Math.floor(gap * 0.55)));
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r); const name = p[0] || '', rt = p[1] || '', rv = parseFloat(rt) || 0;
        const bg = rv >= 7.5 ? C.navy : rv >= 6.5 ? C.yellow : C.red;
        const fg = (rv >= 6.5 && rv < 7.5) ? C.navy : '#fff';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.35).toFixed(1);
        const cw = 96, cx0 = 130;
        body += `<text x="930" y="${tb}" text-anchor="end" direction="rtl" font-family="Cairo" font-weight="800" font-size="${fs}" fill="${C.navy}">${esc(name)}</text>`;
        body += `<rect x="${cx0}" y="${(cy - gap * 0.32).toFixed(0)}" width="${cw}" height="${(gap * 0.64).toFixed(0)}" rx="8" fill="${bg}"/>`;
        body += `<text x="${cx0 + cw / 2}" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${fg}">${esc(rt)}</text>`;
        if (i < rows.length - 1) body += `<line x1="150" y1="${(y + gap).toFixed(0)}" x2="930" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.5" opacity="0.5"/>`;
      });
      return `
    <rect x="360" y="150" width="360" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(360, 150, 360, 72, 'تقييمات اللاعبين', 900, 34, C.yellow)}
    ${arBox(80, 232, 920, 46, d.team, 700, 30, '#13350c')}
    ${body}`;
    }
  },

  // Today's fixtures list. list: "home | away | league | time" per line.
  fixtures: {
    name: 'مباريات اليوم',
    fields: ['date', 'comp', 'list'],
    content: d => {
      const rows = listRows(d.list, 12);
      const top = 330, bottom = 930, gap = Math.min(60, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(20, Math.min(28, Math.floor(gap * 0.5)));
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r); const home = p[0] || '', away = p[1] || '', league = p[2] || '', time = p[3] || '';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.34).toFixed(1);
        body += `<text x="95" y="${tb}" font-family="Anton" font-size="${fs + 2}" fill="${C.navy}">${esc(time)}</text>`;
        body += arBox(555, cy - gap / 2, 270, gap, home, 800, fs, C.navy);
        body += `<text x="540" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}" opacity="0.5">×</text>`;
        body += arBox(255, cy - gap / 2, 270, gap, away, 800, fs, C.navy);
        if (league) body += `<text x="985" y="${tb}" text-anchor="end" font-family="Cairo" font-weight="700" font-size="${fs - 6}" fill="#3a5a33">${esc(league)}</text>`;
        if (i < rows.length - 1) body += `<line x1="95" y1="${(y + gap).toFixed(0)}" x2="985" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.2" opacity="0.55"/>`;
      });
      return `
    <rect x="370" y="158" width="340" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(370, 158, 340, 72, 'مباريات اليوم', 900, 36, C.yellow)}
    ${arBox(80, 248, 920, 44, [d.comp, d.date].filter(has).join('   ·   '), 700, 30, '#13350c')}
    ${body}`;
    }
  },

  // Today's results list. list: "home | away | score | note" per line.
  results: {
    name: 'نتائج اليوم',
    fields: ['date', 'comp', 'list'],
    content: d => {
      const rows = listRows(d.list, 10);
      const top = 330, bottom = 930, gap = Math.min(64, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(20, Math.min(28, Math.floor(gap * 0.46)));
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r); const home = p[0] || '', away = p[1] || '', score = p[2] || '', note = p[3] || '';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.34).toFixed(1);
        const sw = Math.max(70, strW(score, fs) + 28);
        body += `<rect x="${(540 - sw / 2).toFixed(0)}" y="${(cy - gap * 0.30).toFixed(0)}" width="${sw.toFixed(0)}" height="${(gap * 0.6).toFixed(0)}" rx="7" fill="${C.yellow}"/>`;
        body += `<text x="540" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}">${esc(score)}</text>`;
        body += arBox(560, cy - gap / 2, 280, gap, home, 800, fs, C.navy);
        body += arBox(240, cy - gap / 2, 280, gap, away, 800, fs, C.navy);
        if (note) body += `<text x="985" y="${tb}" text-anchor="end" font-family="Cairo" font-weight="700" font-size="${fs - 6}" fill="#3a5a33">${esc(note)}</text>`;
        if (i < rows.length - 1) body += `<line x1="95" y1="${(y + gap).toFixed(0)}" x2="985" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.2" opacity="0.55"/>`;
      });
      return `
    <rect x="330" y="158" width="420" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(330, 158, 420, 72, 'نتائج اليوم', 900, 34, C.yellow)}
    ${arBox(80, 248, 920, 44, [d.comp, d.date].filter(has).join('   ·   '), 700, 30, '#13350c')}
    ${body}`;
    }
  },
  // Roundup cover slide (adapted from the studio `brand` template). Not a DeepSeek
  // output — built by the roundup workflow as the first slide of the daily carousel.
  cover: {
    name: 'غلاف الملخص',
    fields: ['title'],
    content: d => `
    ${vstack(280, 830, [
      { h: 180, render: y => arBox(90, y, 900, 180, d.title || 'أبرز أخبار اليوم', 900, 86, C.navy) },
      { h: 6, gap: 26, render: y => `<rect x="360" y="${y.toFixed(0)}" width="360" height="6" fill="${C.yellow}"/>` },
      { h: 52, gap: 44, render: y => arBox(90, y, 900, 52, 'اسحب للمزيد ←', 800, 34, '#13350c') },
    ])}`
  }
};

/* ===== assembly ===== */
function buildSvg(template, data) {
  const tpl = TEMPLATES[template];
  if (!tpl) throw new Error('Unknown template: ' + template);
  const d = Object.assign({ hashtag: '#GOLAZO', tlogo: '' }, data || {});
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0"/></filter></defs>
  ${frame(d)}
  ${tpl.content(d)}
  </svg>`;
}

module.exports = { buildSvg, TEMPLATES, C, W, H };
