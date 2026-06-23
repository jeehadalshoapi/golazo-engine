# n8n build spec — rebuild from zero

Single source of truth for rebuilding the Golazo n8n automation. Renderer is
deployed; this is the n8n side. Build the shared pieces first (§0), then each
workflow. **Node names must match exactly** — expressions depend on them.

---

## 0. Shared infrastructure & patterns

### 0.1 Constants
- **Engine** (renderer): `https://golazo-engine-production.up.railway.app` — header `x-golazo-token: <RENDER_TOKEN>`
- **Server** (data): `https://golazo-server-production.up.railway.app`
- **Buffer channels:** FB `6a27a1ef8f1d11f9b2683988` · IG `6a27a2308f1d11f9b2683a57` · X `6a27a90e8f1d11f9b2684d70`
- **Seasons:** European + Saudi = `2025`; World Cup = `2026`
- **Leagues:** `{ 307:'دوري روشن السعودي', 39:'الدوري الإنجليزي', 140:'الدوري الإسباني', 135:'الدوري الإيطالي', 78:'الدوري الألماني', 61:'الدوري الفرنسي', 2:'دوري أبطال أوروبا', 1:'كأس العالم' }`
- **Domestic (top-5 gated):** `[307,39,140,135,78,61]` · **Cups (post all):** `2, 1`
- **WC logo override:** `COMP_LOGO = { 1: '<engine>/asset/worldcup.png' }`

### 0.2 Postgres tables (create once)
```sql
CREATE TABLE IF NOT EXISTS posted_matches ( fixture_id BIGINT, kind TEXT, posted_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (fixture_id, kind) );
CREATE TABLE IF NOT EXISTS posted_stages  ( comp_id BIGINT, season INT, stage TEXT, posted_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (comp_id, season, stage) );
CREATE TABLE IF NOT EXISTS posted_content ( key TEXT PRIMARY KEY, hash TEXT NOT NULL, posted_at TIMESTAMPTZ DEFAULT now() );
-- posted_matches: pre/post-match · posted_stages: knockout/bracket · posted_content: refresh cards (hash)
```

### 0.3 Dedup pattern (CRITICAL — gate + IF)
n8n's Postgres "Execute Query" emits `{ success:true }` on `ON CONFLICT DO NOTHING` (0 rows), so the gate **never drops by itself**. Always pair it with an `IF`:

- **Gate** (Postgres → Execute Query) → returns the key column only when the row is **new**.
- **IF** `is new?` → condition: *(returned column)* **is not empty** → **true** continues, **false** unwired.

| Dedup type | gate `RETURNING` | IF condition |
|---|---|---|
| matches (pre/post) | `fixture_id` | `{{ $json.fixture_id }}` is not empty |
| stages (knockout/bracket) | `stage` | `{{ $json.stage }}` is not empty |
| content (refresh cards) | `key` | `{{ $json.key }}` is not empty |

### 0.4 Tail — Telegram review + Buffer publish
After `render-roundup` (returns `{ urls }`), fan out to both:

**`render-roundup`** (HTTP): POST `<engine>/render-roundup`, JSON body `{{ JSON.stringify({ items: <ITEMS_REF> }) }}` (per-workflow `ITEMS_REF`), header token, Response Format = **JSON**. (Auto-appends the brand outro; pass `brand:false` for singles.)

**`Build album`** (Code, Telegram review):
```js
const urls = $json.urls || [];
if (!urls.length) return [];
const grab = (n, f) => { try { return $(n).item.json[f]; } catch (e) { return undefined; } };
const pick = (f) => grab('Loop Over Items', f) || grab('Build fixtures',f)||grab('Build results',f)||grab('Build standings',f)||grab('Build prematch',f)||grab('Build groups',f)||grab('Build knockout',f)||grab('Build bracket',f)||grab('Build match carousel',f);
const base = pick('base') || 'Golazo';
const tags = pick('hashtags') || [];
const tagLine = ['Golazo', ...tags].map(t => '#' + String(t).trim().replace(/\s+/g,'_')).filter(t => t.length > 1).slice(0, 6).join(' ');
const out = [];
for (let i = 0; i < urls.length; i += 10) { const c = urls.slice(i, i+10);
  out.push({ json: { chat_id: YOUR_CHAT_ID, media: c.map((u,j)=>({ type:'photo', media:u, ...(i===0&&j===0?{caption:`${base}\n${tagLine}`}:{}) })) } }); }
return out;
```
**`send media group`** (HTTP): POST `https://api.telegram.org/bot<TOKEN>/sendMediaGroup`, JSON body `{{ $json }}`.

**`Build Buffer`** (Code, publish):
```js
const urls = $json.urls || [];
if (!urls.length) return [];
const grab = (n, f) => { try { return $(n).item.json[f]; } catch (e) { return undefined; } };
const pick = (f) => grab('Loop Over Items', f) || grab('Build fixtures',f)||grab('Build results',f)||grab('Build standings',f)||grab('Build prematch',f)||grab('Build groups',f)||grab('Build knockout',f)||grab('Build bracket',f)||grab('Build match carousel',f);
const base = pick('base') || 'Golazo';
const tags = pick('hashtags') || [];
const tagStr = (max) => ['Golazo', ...tags].map(t => '#' + String(t).trim().replace(/\s+/g,'_')).filter(t => t.length > 1).slice(0, max).join(' ');
const channels = [
  { channelId:'6a27a1ef8f1d11f9b2683988', meta:{ facebook:{ type:'post' } },                         max:10, tagMax:3  },
  { channelId:'6a27a2308f1d11f9b2683a57', meta:{ instagram:{ type:'post', shouldShareToFeed:true } }, max:10, tagMax:12 },
  { channelId:'6a27a90e8f1d11f9b2684d70', meta:null,                                                  max:4,  tagMax:2  },
];
return channels.map(c => {
  const tl = tagStr(c.tagMax);
  const caption = tl ? `${base}\n\n${tl}` : base;
  const assets = urls.slice(0, c.max).map(u => ({ image:{ url:u, metadata:{ altText: base } } }));
  const args = { channelId: c.channelId, text: caption, mode: 'shareNow', schedulingType: 'automatic', assets };
  if (c.meta) args.metadata = c.meta;
  return { json: { body: { jsonrpc:'2.0', id:1, method:'tools/call', params:{ name:'create_post', arguments: args } } } };
});
```
**`Buffer MCP`** (HTTP): Buffer MCP endpoint, header `Accept: application/json, text/event-stream`, JSON body `{{ JSON.stringify($json.body) }}`.

> Every `Build …` node outputs `{ items, base, hashtags }` (the tail reads base/hashtags). The finalized Build-node codes are in the chat history / `MATCH-pipeline-build.md`.

---

## 1. Workflows (9)

Legend: **R** = refresh (content dedup) · **M** = match dedup · **S** = stage dedup.

### N1 — News 5★ single
Existing RSS→DeepSeek pipeline; `importance==5` branch. Sequence:
`… → Filter importance==5 → Loop Over Items(1) → render single (/render, File→data) → [send photo (binary)] + [BuildSingleBuffer → Buffer MCP] → loop`
- sendPhoto: Binary File ON, field `data`; caption from `$('Loop Over Items').item.json.data.*`.
- Fix DeepSeek prompt (accuracy) before launch.

### N2 — News 3–4★ roundup
`Schedule 21:00 → Postgres SELECT top-5 unpublished → BuildPayload → render-roundup → Build album → sendMediaGroup` **+** `Build Buffer → Buffer MCP` → mark published.
- **No approval node** (deleted) — Telegram is preview only.

### WF1 — Today fixtures  ·  **R**  ·  cron `0 8 * * *`
`Schedule → GET /fixtures/today → Build fixtures → Dedup gate(content,key='fixtures') → IF key → render-roundup → tail`

### WF2 — Today results  ·  **R**  ·  cron `30 23 * * *`
`Schedule → GET /fixtures/today → Build results → Dedup gate(key='results') → IF key → render-roundup → tail`

### WF3 — Standings  ·  **R**  ·  cron `0 9 * * 1`
`Schedule → Leagues(domestic+UCL) → GET /standings/:id?season → Build standings → Dedup gate(key='standings') → IF key → render-roundup → tail`

### WF4 — Pre-match  ·  **M**  ·  cron `*/15 * * * *` (or `0 * * * *` for 59-min)
`Schedule → Domestic leagues → GET /standings → Collect TOP5 → GET /fixtures/today → Build prematch(window ≤60min, NS) → Loop(1) → Dedup gate(posted_matches,'prematch') → IF fixture_id → render-roundup(brand:false) → tail → loop`

### WF5 — Post-match  ·  **M**  ·  cron `*/15 * * * *`
`Schedule → GET /fixtures/today → Pick finished → Loop(1) → Dedup gate(posted_matches,'postmatch') → IF fixture_id → events → statistics → players → Build match carousel → render-roundup → tail → loop`

### WF6a — Group stage  ·  **S** (per round)  ·  cron `0 * * * *`
`Schedule → Cups(WC) → Loop(1) → GET /standings/:id?season → Build groups(emit per matchday when complete; stage='group:<round>') → Dedup gate(posted_stages) → IF stage → render-roundup → tail → loop`
> Change from "daily" to **post once per completed matchday** (dedup by group round).

### WF6b — Knockout  ·  **S** (per round)  ·  cron `0 * * * *`
`Schedule → Cups → GET /fixtures/league/:id?season → Build knockout(per completed round; stage=<round>) → Loop(1) → Dedup gate(posted_stages) → IF stage → render-roundup → tail → loop`

### WF6c — Bracket  ·  **S** (per completed round)  ·  cron `0 * * * *`
`Schedule → Cups → GET /fixtures/league/:id?season → Build bracket(stage='bracket:<lastDoneRound>') → Loop(1) → Dedup gate(posted_stages) → IF stage → render-roundup → tail → loop`

---

## 2. Per-workflow `ITEMS_REF` for render-roundup
| Workflow | render-roundup body items |
|---|---|
| WF1/2/3 (no loop) | `$('Build fixtures' / 'Build results' / 'Build standings').first().json.items` |
| WF4/5/6a/6b/6c (loop) | `$('Loop Over Items').item.json.items` |

## 3. Known fixes baked in
- Dedup = **gate + IF** (the `{success:true}` issue).
- `render-roundup` Response Format = **JSON**; appends brand outro (singles use `brand:false`).
- `Build Buffer`/`Build album` read `base`/`hashtags` via `grab()` incl. the loop node.
- Times: kickoff in **en-US** (AM/PM) — *(pending: league-local vs viewer-local decision for WF1/2)*.
- WC logo override `COMP_LOGO[1]`.

## 4. Open design items (decide during rebuild)
- WF1/WF2 timezone display (league-local kickoff vs viewer-local).
- WF6a/6b/6c: confirm "post once per completed round" logic + the exact `stage` keys.
- 5★ DeepSeek prompt accuracy.
- Before public: rotate tokens; move WC override into golazo-server.
