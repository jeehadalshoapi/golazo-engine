# 🎨 Technical Design — Golazo Engine (Card Rendering Service)

This is the authoritative spec. `golazo_studio.html` is the visual source of truth
for the decorative frame and template layouts; this doc tells you exactly how to
port it to a resvg-safe service.

---

## 1. Canvas & Brand Constants

```js
const C = { navy: '#0D3D07', yellow: '#7DDB5B', red: '#E63946', paper: '#FFFFFF' };
const W = 1080, H = 1080;
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
```

Fonts (family names as referenced in SVG `font-family`):
- `Cairo` — Arabic body text (weights 600–900). File: `fonts/Cairo.ttf` (variable).
- `Anton` — Latin display, big numbers. File: `fonts/Anton-Regular.ttf`.
- `Barlow Condensed` — the rotated hashtag chip. Files: Bold + SemiBold.

---

## 2. Text Rendering — replacing foreignObject (CORE ALGORITHM)

The Studio uses `arBox`/`arBlock` built on `<foreignObject>`. resvg can't render
those. Reimplement them with native `<text>` + manual wrapping.

### 2.1 Width estimation
resvg gives no easy measure API, so estimate glyph advance as a fraction of font size.
Tuned against Cairo/resvg (≈0.49–0.5 per Arabic char):

```js
function charW(ch, size) {
  if (ch === ' ') return size * 0.26;
  if (/[0-9.,:%\-]/.test(ch)) return size * 0.50;
  if (/[A-Za-z]/.test(ch)) return size * 0.52;
  return size * 0.50; // arabic & default
}
function strW(s, size) {
  let w = 0;
  for (const ch of String(s)) w += charW(ch, size);
  return w;
}
```

### 2.2 Word wrap (respects explicit `\n`)
```js
function wrapLines(text, maxW, size) {
  const paras = String(text == null ? '' : text).split('\n');
  const out = [];
  for (const para of paras) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (strW(trial, size) <= maxW || !line) line = trial;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}
```

### 2.3 Native multi-line text element
`valign:'center'` vertically centers the block in the box `h`; `'top'` flows from top.
`align` controls horizontal anchor (`center`→middle, `right`→end, `left`→start).
The `0.80*size` first-baseline offset and `lh` (line-height × size) are tuned to match
the Studio look. Keep these numbers.

```js
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
  let firstBaseline = (valign === 'center')
    ? y + h / 2 - totalH / 2 + size * 0.80
    : y + size * 0.90;
  let tspans = '';
  lines.forEach((ln, i) => {
    const ly = (firstBaseline + i * lh).toFixed(1);
    tspans += `<tspan x="${ax.toFixed(1)}" y="${ly}">${esc(ln)}</tspan>`;
  });
  return `<text text-anchor="${anchor}" direction="rtl" font-family="Cairo" font-weight="${weight}" font-size="${size}" fill="${color}">${tspans}</text>`;
}

const arBox = (x, y, w, h, t, weight, size, color) =>
  arText(x, y, w, h, t, weight, size, color, { valign: 'center', align: 'center', lh: 1.35 });
const arBlock = (x, y, w, h, t, weight, size, color, align) =>
  arText(x, y, w, h, t, weight, size, color, { valign: 'top', align: align || 'center', lh: 1.4 });
```

> Keeping the names `arBox`/`arBlock` with the same `(x,y,w,h,text,weight,size,color)`
> signature means the template bodies copied from Studio work unchanged.

---

## 3. Shared Frame (port verbatim from golazo_studio.html)

These are already native-SVG-only and resvg-safe. Copy them exactly:
- `mulberry32(a)` and `buildTexture()` — seeded scatter of plus/x/circle/tri/dot +
  faint "GOLAZO!" words. Uses a module-level cache `let TEX = null`.
- `diagBars(tx,ty,rot,bars)` — skewed corner bars.
- `topSlot(d)` — if `d.tlogo` is set, an `<image>`; else a drawn "GOLAZO" wordmark.
  **For the news pipeline, leave `tlogo` empty** (no remote image fetch in resvg).
- `frame(d)` — assembles paper bg + texture + decorative marks + corner bars +
  rotated hashtag chip (`d.hashtag`) + footer line "الكرة بالأرقام  ·  @golazo.arabic".

`buildSvg` wraps everything with the paper-noise filter:

```js
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
```

---

## 4. News Templates (the 4 to build) — exact bodies

Each template = `{ name, fields, content(d) }`. The `content` returns the inner SVG.
Coordinates are the verified Studio layout. Use these verbatim.

### 4.1 `breaking` — خبر عاجل
Fields: `time, headline, details, source`
```js
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
}
```

### 4.2 `confirmed` — انتقال رسمي
Fields: `player, club, contract, fee, until, source`
```js
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
    ${arBox(140, 600, 800, 250, 'المدة:  ' + (d.contract||'') + '\\n' + 'القيمة:  ' + (d.fee||'') + '\\n' + 'نهاية العقد:  ' + (d.until||''), 700, 40, '#13350c')}
    ${arBox(80, 892, 920, 50, 'المصدر: ' + (d.source||''), 700, 30, C.navy)}`
}
```

### 4.3 `rumors` — شائعات/تقارير
Fields: `player, fromClub, toClub, details, status, source`
```js
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
}
```

### 4.4 `quote` — تصريح
Fields: `quote, author, role`
```js
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
```

> Note on `\\n` inside `confirmed`: in the real file write a single backslash-n
> (`'\n'`) — it is doubled here only for markdown display.

---

## 5. Renderer (`src/render.js`)

```js
const { Resvg } = require('@resvg/resvg-js');
const path = require('path');
const FONT_DIR = path.join(__dirname, '..', 'fonts');

function svgToPng(svg) {
  const resvg = new Resvg(svg, {
    font: { fontDirs: [FONT_DIR], loadSystemFonts: false, defaultFontFamily: 'Cairo' },
    background: 'white',
  });
  return resvg.render().asPng();
}
module.exports = { svgToPng };
```

---

## 6. HTTP API

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| GET | `/health` | — | `{ ok:true, templates:[...] }` | ❌ |
| POST | `/render` | `{ template, data }` | `image/png` (binary) | optional `x-golazo-token` |

Error responses:
- 400 — `{ error:'invalid template', available:[...] }`
- 401 — `{ error:'unauthorized' }` (only if `RENDER_TOKEN` set and header mismatched)
- 500 — `{ error:'render failed', detail:'...' }`

Sample request:
```bash
curl -X POST https://<domain>/render \
  -H "Content-Type: application/json" \
  -d '{"template":"breaking","data":{"time":"الآن","headline":"...","details":"...","source":"..."}}' \
  --output card.png
```

---

## 7. n8n Integration Spec (Phase 6)

### 7.1 DeepSeek prompt v2 — classify + choose template + emit JSON
Replace the current text-output system prompt with a JSON-output one. Core rules:
- First decide accept/reject (same gate as now). If reject → output exactly `{"template":"تجاهل"}`.
- If accept → choose ONE `template` from `breaking | confirmed | rumors | quote` and
  fill ONLY that template's fields. Output **valid minified JSON, nothing else**.
- Field mapping the model must follow:
  - match result / generic news → `breaking` { time:"الآن", headline, details, source:"" }
  - confirmed transfer / manager appointment → `confirmed` { player, club, contract, fee, until, source }
  - unconfirmed rumor / report → `rumors` { player, fromClub, toClub, details, status, source }
  - official statement / press quote → `quote` { quote, author, role }
- Keep all existing Arabic style + neutrality + headline rules from the current prompt.
- Never invent numbers; leave a field as "" if unknown.

Output contract example:
```json
{"template":"breaking","data":{"time":"الآن","headline":"نيوكاسل يتغلب على وست هام","details":"فوز 3-1 على سانت جيمس بارك\nثنائية لأوسولا","source":""}}
```

### 7.2 n8n nodes after DeepSeek
1. **Code/Set node** — `JSON.parse(choices[0].message.content)`; if `template === 'تجاهل'`
   or parse fails → drop the item (return nothing). Else output `{ template, data }`.
2. **HTTP Request node** — `POST https://<railway-domain>/render`, JSON body
   `={{ { template: $json.template, data: $json.data } }}`, **Response → File/Binary**.
   Add header `x-golazo-token` if you enabled `RENDER_TOKEN`.
3. **Telegram node** — operation **Send Photo**, Binary Property = the HTTP node's
   binary output, Caption = `={{ $json.data.headline || $json.data.quote || 'Golazo' }}`.

### 7.3 Test
Run the workflow with `Limit=5`; confirm a branded PNG arrives in Telegram for the
accepted items and rejected ones are silently skipped. Then set `Limit=10`.

---

## 8. Security Considerations
- Repo is public → contains NO secrets. `RENDER_TOKEN` (if used) lives only in Railway env.
- `/render` validates `template` against a fixed allowlist (the TEMPLATES keys).
- Body size capped at 256kb.
- No remote resource loading inside SVG for the news templates (no SSRF surface).
- Stateless render core; the hosted-image cache (`/render-url`) is short-TTL in-memory only.

---

## 9. New-features design (importance, hashtags, roundup) — Parts 1–3

Strategy source of truth: `golazo_posting_strategy.md`. Plan/checklist: `tasks.md`.

### 9.1 DeepSeek output contract (Part 1)
The model now emits, in addition to `template`/`key`/`data`:
- `importance`: integer **1–5** (1 = trivial, 5 = major). Routing: `5` → immediate single;
  `3–4` → roundup; `<3` → drop (n8n Filter keeps `importance >= 3`).
- `hashtags`: **array** of Arabic/entity tags (no `#` needed; added at post time). Static
  `#Golazo` + league tag are appended programmatically. Per-platform counts: X 1–2, IG 8–12
  (in **first comment**, not caption), FB 1–2.
- **Match results:** routine results → `تجاهل`; major (finals, Clásico, derbies, title-deciders)
  → pass as news. The model judges; routine scorelines belong to the deferred match pipeline.

Reject still emits exactly `{"template":"تجاهل"}`. Parse Code carries `importance`+`hashtags`.

### 9.2 Daily roundup (Part 2)
- **State store: PostgreSQL on Railway** (source of truth). Holds qualifying `3–4★` news
  (`template`, `data`, `importance`, `key`, `hashtags`, `created_at`, `published`) + dedup log.
- **Accumulate:** each hourly run INSERTs `3–4★` items (skip if `key` exists).
- **Assemble (21:00 Asia/Riyadh):** SELECT top 5 unpublished by importance/recency.
- **Cover template (NEW):** add `cover` to `TEMPLATES` — adapt the studio `brand` template
  (GOLAZO wordmark + statement + tagline, already `arBox`-based) into "أبرز أخبار اليوم" +
  date + count. Native `<text>` only.
- **Item slides:** REUSE the existing four news templates verbatim (one card per news item).
- **Multi-card endpoint:** `POST /render-roundup` `{ cover, items:[{template,data}] }` →
  renders cover + each item via `buildSvg` → returns `{ urls:[...] }` (hosted via the
  `/img/:id` store). IG/FB use all 6; **X uses cover + top 3 only (4-image cap)**.

### 9.3 Publish + strategy (Parts 2d/3)
- Buffer `create_post` with an `assets` array (image URL per slide) + per-service
  `metadata.type` (IG `{type:'post',shouldShareToFeed:true}`, FB `{type:'post'}`).
- Telegram approval uses **sendMediaGroup** (album) for roundups; single photo for `5★`.
- Timing: roundup `customScheduled` 21:00; `5★` `shareNow`. Caps: hard 6/day/platform,
  30-min anti-burst gap, `5★` uncapped. Links + IG hashtags go in the **first comment**.

### 9.4 Studio template reuse map
- **Reuse as-is:** `breaking`/`confirmed`/`rumors`/`quote` → roundup item slides.
- **Adapt → port:** `brand` → the new `cover` template.
- **Reference only:** `carousel` (confirms slide/index pattern via `parseSlides`).
- **Deferred (match pipeline, heavy `foreignObject`, not ported):** `result`, `fixtures`,
  `prematch`, `matchstats`, `ratings`, `statshock`, `comparison`, `top10`, `seasons`, etc.
