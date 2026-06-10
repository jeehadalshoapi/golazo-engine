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

/* ===== brand constants ===== */
const C = { navy: '#0D3D07', yellow: '#7DDB5B', red: '#E63946', paper: '#FFFFFF' };
const W = 1080, H = 1080;
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
  const lh = (opts.lh || 1.4) * size;
  const lines = wrapLines(text, w - 8, size);
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
  <text x="540" y="1016" text-anchor="middle" font-family="Cairo" font-weight="800" font-size="28" fill="${C.navy}">الكرة بالأرقام  ·  @golazo.arabic</text>`;
}

/* ===== news templates (4) — bodies from design.md, verified Studio layout ===== */
const TEMPLATES = {
  breaking: {
    name: 'خبر عاجل',
    fields: ['time', 'headline', 'details', 'source'],
    content: d => `
    <rect x="380" y="160" width="320" height="74" rx="10" fill="${C.red}"/>
    <circle cx="430" cy="197" r="8" fill="#fff"/>
    <text x="555" y="210" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="40" fill="#fff">خبر عاجل</text>
    <text x="1000" y="210" text-anchor="end" font-family="Cairo" font-weight="700" font-size="28" fill="${C.navy}">${esc(d.time)}</text>
    ${arBlock(90, 280, 900, 300, d.headline, 900, 74, C.navy, 'center')}
    <line x1="150" y1="630" x2="930" y2="630" stroke="${C.yellow}" stroke-width="5"/>
    ${arBlock(120, 660, 840, 240, d.details, 600, 40, '#13350c', 'center')}
    <text x="540" y="930" text-anchor="middle" font-family="Cairo" font-weight="700" font-size="30" fill="${C.navy}">المصدر: ${esc(d.source)}</text>`
  },
  confirmed: {
    name: 'انتقال رسمي',
    fields: ['player', 'club', 'contract', 'fee', 'until', 'source'],
    content: d => `
    <rect x="400" y="162" width="280" height="72" rx="36" fill="${C.navy}"/>
    <path d="M615 198 l12 12 l22 -26" stroke="${C.yellow}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="525" y="212" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="40" fill="${C.yellow}">رسمياً</text>
    ${arBox(80, 270, 920, 120, d.player, 900, 70, C.navy)}
    ${arBox(80, 420, 920, 46, 'انتقال إلى', 700, 32, '#13350c')}
    <rect x="260" y="478" width="560" height="86" rx="8" fill="${C.yellow}"/>
    ${arBox(260, 478, 560, 86, d.club, 900, 46, C.navy)}
    ${arBox(140, 600, 800, 250, 'المدة:  ' + (d.contract||'') + '\n' + 'القيمة:  ' + (d.fee||'') + '\n' + 'نهاية العقد:  ' + (d.until||''), 700, 40, '#13350c')}
    ${arBox(80, 892, 920, 50, 'المصدر: ' + (d.source||''), 700, 30, C.navy)}`
  },
  rumors: {
    name: 'شائعات/تقارير',
    fields: ['player', 'fromClub', 'toClub', 'details', 'status', 'source'],
    content: d => `
    <rect x="390" y="162" width="300" height="72" rx="36" fill="none" stroke="${C.navy}" stroke-width="4" stroke-dasharray="11 8"/>
    ${arBox(390, 162, 300, 72, 'تقارير وشائعات', 900, 36, C.navy)}
    ${arBox(80, 270, 920, 120, d.player, 900, 66, C.navy)}
    ${arBox(80, 415, 920, 60, (d.fromClub||'') + '   ←   ' + (d.toClub||''), 800, 40, '#13350c')}
    <line x1="180" y1="500" x2="900" y2="500" stroke="${C.yellow}" stroke-width="4"/>
    ${arBox(130, 525, 820, 235, d.details, 600, 38, '#13350c')}
    <rect x="300" y="788" width="480" height="72" rx="36" fill="${C.yellow}"/>
    ${arBox(300, 788, 480, 72, 'الموقف: ' + (d.status||''), 800, 34, C.navy)}
    ${arBox(80, 892, 920, 50, 'المصدر: ' + (d.source||''), 700, 30, C.navy)}`
  },
  quote: {
    name: 'تصريح',
    fields: ['quote', 'author', 'role'],
    content: d => `
    <rect x="400" y="160" width="280" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(400, 160, 280, 72, 'تصريح', 900, 40, C.yellow)}
    <text x="540" y="332" text-anchor="middle" font-family="Anton" font-size="130" fill="${C.yellow}">&#8221;</text>
    ${arBox(110, 350, 860, 320, d.quote, 800, 54, C.navy)}
    <line x1="300" y1="708" x2="780" y2="708" stroke="${C.yellow}" stroke-width="5"/>
    ${arBox(80, 726, 920, 70, '— ' + (d.author||''), 900, 52, C.navy)}
    ${arBox(80, 802, 920, 50, d.role, 700, 34, '#13350c')}`
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
