# ✅ Tasks — Golazo Engine (Card Rendering Service)

> **Legend:** `[ ]` = TODO · `[x]` = Done · `[~]` = In Progress · `[!]` = Blocked
> Work top to bottom. Do not start a phase until the previous one runs.

---

## Phase 1 — Project Setup

- [ ] 1.1 `npm init -y`, set `"type": "commonjs"`, `"main": "server.js"`, add `"start": "node server.js"`.
- [ ] 1.2 Install runtime deps: `npm i express @resvg/resvg-js`.
- [ ] 1.3 Create folder structure: `src/`, `fonts/`.
- [ ] 1.4 Download fonts (TTF) into `fonts/` from google/fonts raw:
  - Cairo: `ofl/cairo/Cairo[slnt,wght].ttf` → save as `Cairo.ttf`
  - Anton: `ofl/anton/Anton-Regular.ttf`
  - Barlow Condensed: `ofl/barlowcondensed/BarlowCondensed-Bold.ttf` and `-SemiBold.ttf`
- [ ] 1.5 Verify each downloaded file is real TrueType (`file fonts/*.ttf`), not an HTML error page.
- [ ] 1.6 Create `.gitignore` (ignore `node_modules/`, `*.log`, `.env`; DO commit `fonts/`).

## Phase 2 — Renderer Core

- [ ] 2.1 In `src/templates.js`, add constants: `C` (colors), `W=1080`, `H=1080`, `esc()`.
- [ ] 2.2 Implement text-measurement + wrap helpers: `charW`, `strW`, `wrapLines` (see `design.md`).
- [ ] 2.3 Implement `arText(x,y,w,h,text,weight,size,color,opts)` rendering native `<text>`+`<tspan>` with RTL, manual wrap, and vertical centering. (see `design.md` for the math)
- [ ] 2.4 Define `arBox` (vertically centered) and `arBlock` (top-aligned) as thin wrappers over `arText`. Keep these exact names so ported template bodies need no edits.
- [ ] 2.5 Port `mulberry32` + `buildTexture` (seeded background) **verbatim** from `golazo_studio.html`.
- [ ] 2.6 Port `diagBars`, `topSlot`, `frame` **verbatim** (all resvg-safe; native shapes/text only).
- [ ] 2.7 In `src/render.js`, implement `svgToPng(svg)` using `Resvg` with `font.fontDirs=['<abs path to fonts>']`, `loadSystemFonts:false`, `defaultFontFamily:'Cairo'`, `background:'white'`. Return `.render().asPng()`.

## Phase 3 — News Templates

- [ ] 3.1 Add `TEMPLATES.breaking` — fields: `time, headline, details, source`. (body in `design.md`)
- [ ] 3.2 Add `TEMPLATES.confirmed` — fields: `player, club, contract, fee, until, source`.
- [ ] 3.3 Add `TEMPLATES.rumors` — fields: `player, fromClub, toClub, details, status, source`.
- [ ] 3.4 Add `TEMPLATES.quote` — fields: `quote, author, role`.
- [ ] 3.5 Implement `buildSvg(template, data)`: validate template exists, merge defaults `{hashtag:'#GOLAZO', tlogo:''}`, wrap `<defs>` paper filter + `frame(d)` + `TEMPLATES[t].content(d)`.
- [ ] 3.6 `module.exports = { buildSvg, TEMPLATES, C, W, H }`.

## Phase 4 — Server & Local Test

- [ ] 4.1 `server.js`: Express, `express.json({limit:'256kb'})`.
- [ ] 4.2 `GET /health` → `{ ok:true, templates: Object.keys(TEMPLATES) }`.
- [ ] 4.3 `POST /render`: validate `template`; on bad template return 400 with `available`; build SVG, render PNG, send with `Content-Type: image/png`.
- [ ] 4.4 Optional auth: if `process.env.RENDER_TOKEN` set, require header `x-golazo-token` to match; else 401.
- [ ] 4.5 try/catch around render; on failure return 500 `{ error, detail }` and `console.error`.
- [ ] 4.6 Listen on `process.env.PORT || 3000`.
- [ ] 4.7 `test_cards.js`: render one sample per template to `/tmp/card_*.png`; open each and visually confirm: Arabic shaped + RTL correct, no missing text, decorations present.

## Phase 5 — Deployment (Railway)

- [ ] 5.1 Create a NEW GitHub repo (e.g. `golazo-engine`), separate from the app repo.
- [ ] 5.2 Confirm NO secrets in repo (this service needs none). Push all files INCLUDING `fonts/`.
- [ ] 5.3 Railway → New → Deploy from GitHub repo → select the repo.
- [ ] 5.4 Confirm Railway runs `npm install` then `npm start`; wait for Active.
- [ ] 5.5 Settings → Networking → enable Public Domain. Save the URL.
- [ ] 5.6 Smoke test: open `https://<domain>/health` → must list the 4 templates.
- [ ] 5.7 (Optional) set `RENDER_TOKEN` env var in Railway for endpoint protection.

## Phase 6 — n8n Integration

- [ ] 6.1 Update DeepSeek system prompt to output STRUCTURED JSON: choose `template` ∈ {breaking,confirmed,rumors,quote} and fill that template's `data` fields. (full prompt in `design.md`)
- [ ] 6.2 Add an n8n Code/Set node to parse DeepSeek's JSON content into `{template, data}` (handle the "تجاهل" reject case — skip those items).
- [ ] 6.3 Add HTTP Request node → `POST https://<railway-domain>/render`, body `{template, data}`, response format **File/Binary** (so PNG comes back as binary). Add `x-golazo-token` header if token enabled.
- [ ] 6.4 Change Telegram node from `Send Text` to `Send Photo`, binary property = the PNG from the HTTP node. Caption = the headline/quote text.
- [ ] 6.5 End-to-end test: run workflow → a real Golazo PNG card arrives in Telegram.
- [ ] 6.6 Lower `Limit` back to ~10 for normal runs.

---

## Out of scope (later milestones — do NOT build now)
- [ ] DATA templates (fixtures, results, top10) sourced from api-football — separate workflow.
- [ ] HYBRID templates (statshock, comparison, seasons) — semi-manual.
- [ ] Buffer publishing + human approval gate.
- [ ] PostgreSQL dedup + post history.
