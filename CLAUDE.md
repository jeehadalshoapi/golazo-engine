# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: BUILT, DEPLOYED & LIVE

The service is implemented (`package.json`, `src/`, `server.js`, `fonts/` all present),
deployed on **Railway** (public repo `golazo-engine`), and wired into a working **n8n**
pipeline that publishes to **Buffer (Facebook/Instagram/X)**. At launch both `5★` singles and the
nightly roundup publish **directly** (no approval gate); Telegram is kept as a **review copy** only.
See `PROJECT-SUMMARY.md` for the full build log + every problem/fix.

**Status (2026-06-23): NEWS core LIVE; MATCH pipeline BUILT — in LAUNCH stage (paid api-football plan active).**
NEWS: `5★` posts instantly as a single; `3–4★` accumulates in Postgres → nightly **roundup
carousel** (9 PM Riyadh); `<3` dropped. All to FB/IG/X via Buffer.

**MATCH pipeline (api-football):** the **renderer is fully built** — **10 templates** (incl. the
`bracket` tree) + server-side logo embedding + graceful degradation, all in this repo. **All n8n
workflows are built** (fixtures, results, standings, pre-match, post-match, group, knockout,
bracket). The launch tail = render → **Telegram review copy + Buffer publish** (per-platform
hashtags + a brand outro slide). Data comes from **`golazo-server`** (a caching proxy; n8n reads
its HTTP endpoints, never api-football directly).
**Dedup** is Postgres-based — `posted_matches` (pre/post-match), `posted_stages` (knockout/bracket
rounds), `posted_content` (hash, for the refresh cards). ⚠️ n8n's Postgres node emits
`{ success:true }` on `ON CONFLICT DO NOTHING` (0 rows), so **every dedup gate MUST be followed by an
`IF` (returned column is-not-empty)** — the gate alone never drops. Remaining: finish wiring the IFs,
set schedules + activate, rotate tokens, move the WC-logo override into golazo-server.

**Most of the system lives in n8n, not this repo.** Rebuild blueprint: `N8N-BUILD-SPEC.md`.
Publishing logic (formats, stage/round dedup): `MATCH-publishing-logic.md`. Current handoff /
open issues: `LAUNCH-STATUS.md`. Live n8n architecture + every problem/fix: `PROJECT-SUMMARY.md`.

## What this builds

**Golazo Engine** — a stateless Node + Express microservice that turns structured Arabic
football news (`{ template, data }` JSON) into a branded **1080×1080 PNG card** and returns
it. It is **stage 3** of an n8n pipeline: `RSS → DeepSeek (classify+write) → THIS SERVICE → Telegram`.
No DB, no UI, no auth required (one optional shared-secret token). Renders with
`@resvg/resvg-js` (pure SVG→PNG, **no headless browser** — keep it light for Railway).

## THE critical constraint (read before touching any SVG)

`@resvg/resvg-js` does **NOT** render `<foreignObject>` — it silently drops it, so all
Arabic text would vanish. `golazo_studio.html` (the visual source of truth) builds every
Arabic text block with `<foreignObject>`+HTML `<div>`. You **must not** copy those verbatim.

- Every text run is a **native SVG `<text>`** element, routed through `arText`/`arBox`/`arBlock`.
- Native `<text>` does not auto-wrap, so wrapping is **manual** via `wrapLines` (char-advance
  estimation tuned for Cairo at ≈0.5×font-size — see `design.md §2`, keep those magic numbers).
- Arabic `<text>` MUST set `direction="rtl"` and `font-family="Cairo"`, and every user string
  passes through `esc()` first.
- The decorative/frame functions (`mulberry32`, `buildTexture`, `diagBars`, `topSlot`, `frame`)
  are already native-SVG-only — **port them verbatim** from `golazo_studio.html`. Only the
  text layer (`arBox`/`arBlock`) gets rewritten. Keep the `arBox`/`arBlock`
  `(x,y,w,h,text,weight,size,color)` signature identical so template bodies copy in unchanged.

## Architecture (once built)

```
POST /render { template, data }
   → buildSvg(template, data)        src/templates.js
       frame(d)            decorative brand frame (verbatim from Studio)
       TEMPLATES[t].content(d)       template body, native <text>
   → svgToPng(svg)                   src/render.js  (Resvg → PNG buffer)
   → res.send(image/png)
```

- **`src/templates.js`** — thin entry point: merges `NEWS` + `MATCH` into the `TEMPLATES`
  registry and defines `buildSvg`. Exports `{ buildSvg, TEMPLATES, C, W, H }`. The actual code
  lives in three split files:
  - **`src/svg-helpers.js`** — the shared engine: brand constants (`C`, `W=1080`, `H=1080`,
    `esc`, `has`), text helpers (`charW`/`strW`/`wrapLines`/`arText`/`arBox`/`arBlock`), `vstack`,
    the ported `frame`, and the match helpers (`blockTitle`, `crest`, `rowLogo`, `compTitle`,
    `cells`/`listRows`, `tableRows`). `esc()` also converts Arabic-Indic digits → Western so every
    card shows English numerals. `compTitle` draws the competition logo beside its name; `tableRows`
    supports a top-N + bottom-M split with green/red rank chips. Two behaviors to know before editing
    a body: `arText` **auto-shrinks** the font
    (1px steps, down to `minSize`) until the wrapped block fits its box; `vstack(top, bottom, blocks)`
    vertically centers blocks — pass each optional one as `has(field) ? {...} : null` so missing
    fields recenter instead of leaving a hole. `tableRows` is the shared standings/group table body.
  - **`src/news-templates.js`** — `breaking`/`confirmed`/`rumors`/`quote` + the roundup `cover`.
  - **`src/match-templates.js`** — `standing`/`group`/`knockout`/`bracket`/`prematch`/`result`/
    `matchstats`/`ratings`/`fixtures`/`results` (10 templates; `bracket` = the two-sided knockout tree).
- **`src/render.js`** — only the resvg wrapper. Fonts referenced by **absolute path**
  (`path.join(__dirname, '..', 'fonts')`), `loadSystemFonts: false`, `defaultFontFamily: 'Cairo'`.
- **`server.js`** — HTTP only (routing, validation, error mapping). `express.json({limit:'256kb'})`.

### Scope: NEWS pipeline (4 cards + roundup) + MATCH pipeline (renderer built)

The four NEWS templates — `breaking`, `confirmed`, `rumors`, `quote` (exact field lists and
verified SVG bodies in `design.md §4`) — are built and live; reuse them verbatim, never invent
field names. The **daily roundup carousel** (Part 2, built) reuses these four as its item slides plus a
fifth `cover` template (in `TEMPLATES`, adapted from the studio `brand` template) — rendered via
`POST /render-roundup`. DeepSeek also emits `importance` (1–5) and `hashtags`. **Postgres** (on
Railway, table `roundup_news`) is the state store for accumulating roundup items + dedup.

The **MATCH pipeline** templates are **built in the renderer**: `standing`, `group`, `knockout`,
`bracket`, `prematch`, `result`, `matchstats`, `ratings`, `fixtures`, `results` — all native-SVG
ports of the Studio bodies (the Studio versions use `<foreignObject>` and must NOT be copied
verbatim). Two competition kinds: **leagues** (Roshn + Top-5 European, plus the UCL league phase)
use `standing` and gate per-match cards by a top-5 filter; **cups** (World Cup; UCL knockout) post
**all** matches and show structure via `group` (group stage) + `knockout`/`bracket`. Their **n8n
orchestration is BUILT (launch stage)** — the click-by-click rebuild blueprint is `N8N-BUILD-SPEC.md`,
and the when/what-to-publish rules are in `MATCH-publishing-logic.md` (`MATCH-pipeline.md` is the
older design). Data source: a separate Railway project runs **`golazo-server`** (an
Express+Redis **caching proxy** for api-football that feeds the WC-2026 mobile app and returns
api-football responses **verbatim**); **n8n reads the same `golazo-server` HTTP endpoints the app
uses** (single source of truth, free-tier-safe via Redis caching — n8n never calls api-football or
touches Redis). The **paid api-football plan is active**, so `standings`/`statistics`/`players`
now return data; cards still **degrade gracefully** for the odd gap (missing score → "—", empty
stats/ratings → "غير متوفرة", missing logos → placeholder) and carousels **skip empty slides**.
**api-football has no real World Cup logo** (league id 1 → placeholder), so the engine hosts one at
`/asset/worldcup.png` and n8n overrides via `COMP_LOGO[1]`. The HYBRID/DATA studio templates and
TikTok remain **deferred — do not build them now**.

**Team logos:** resvg can't fetch remote images, so the server embeds them — `src/logos.js`
fetches each api-football logo URL once, base64-caches it in-memory, and `server.js` calls
`resolveLogos(collectLogoUrls(data))` before every render (the handlers are async for this).
Templates look up the cached data: URI synchronously via `crest()` (big, `prematch`/`result`) and
`rowLogo()` (small badges in `fixtures`/`results` rows — passed as extra `… | homeLogo | awayLogo`
list cells). **n8n just passes the plain logo URL** — no base64 step. Missing/unreachable → dashed
shield (crest) or omitted (rows).

## API (all in `server.js`)

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/health` | — | `{ ok, templates:[...], hosted }` |
| POST | `/render` | `{ template, data }` | `image/png` binary (Telegram path) |
| POST | `/render-url` | `{ template, data }` | `{ id, url }` — hosts the PNG in a 6h in-memory cache (Buffer needs a URL, not binary) |
| GET | `/img/:id.png` | — | `image/png` (serves a hosted render; **public** — the id is the secret) |
| GET | `/asset/:file` | — | static brand/competition assets (e.g. `/asset/worldcup.png`); **public**, served from `assets/` |
| POST | `/render-roundup` | `{ cover?, items:[{template,data}], brand? }` | `{ count, urls }` — renders `cover` (prepended) + each card + a **`brand` outro** appended (pass `brand:false` to skip), returns the ordered hosted-URL list. Empty → 400; >20 items → 400 |

Errors use shape `{ error, detail }`. Unknown template → 400 with `available:[...]`.
If env `RENDER_TOKEN` is set, `/render`, `/render-url`, `/render-roundup` require header
`x-golazo-token` to match, else 401. `/img/:id` is intentionally open so Buffer/Telegram can fetch it.
The hosted-image cache means the service is **no longer fully stateless** (per-instance, cleared on redeploy).

## Commands

```bash
npm install            # express + @resvg/resvg-js
npm start              # node server.js — listens on PORT (default 3000)
node test_cards.js     # (or: npm run test:cards) renders one sample PNG per template to ./out/card_*.png — open and eyeball
node test_cards.js DIR # optional: write the samples to DIR instead of ./out
node gallery.js        # renders EVERY template (real engine + logos embedded) into a self-contained gallery.html — the fast visual review tool (gitignored)

# smoke test a running server
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"template":"breaking","data":{"time":"الآن","headline":"...","details":"...","source":""}}' \
  --output card.png
```

There is no test framework — verification is **visual**: render a `breaking` card and confirm
Arabic is shaped + RTL-correct, multi-line headline/details wrap and center, no text missing,
and the full frame (decorations + hashtag chip + footer `الكرة بالأرقام · @golazo.arabic`) is present.

## Conventions

- **CommonJS only** (`require`/`module.exports`); `package.json` has `"type":"commonjs"`. No ESM, no TypeScript. Node 18+.
- Files kebab-case, functions camelCase, constants short-caps (`W`,`H`,`C`,`FONT_DIR`), template keys lowercase, env vars UPPER_SNAKE.
- Fonts (TTF only — woff2 is unreliable with resvg) live in `fonts/` and **must be committed**; `.gitignore` must NOT exclude them.
- Commit format `type(scope): message` (`feat`/`fix`/`refactor`/`docs`/`chore`).
- Communicate with the developer (Gehad) in **Arabic**; all code, comments, and identifiers in **English**.

## Source-of-truth docs

**To understand current state first:** `LAUNCH-STATUS.md` (current handoff — done / open issues /
remaining), then `PROJECT-SUMMARY.md` (live pipeline diagram + build log + every problem/fix) and
`tasks.md` (phased status + live n8n architecture).
**Rebuilding the n8n side:** `N8N-BUILD-SPEC.md` (the consolidated, current blueprint for all
workflows — shared tail, the **dedup gate + IF** pattern, schedules) and `MATCH-publishing-logic.md`
(what/when to publish — competition formats, publish-each-stage/round-once dedup). These two
**supersede** the older `MATCH-pipeline.md` / `MATCH-pipeline-build.md` where they disagree.
**Strategy/decisions:** `golazo_posting_strategy.md` (importance routing, 9 PM roundup, caps).

**For the renderer internals:** `agent.md` (role + the foreignObject rule) → `planning.md`
(architecture/decisions) → `rules.md` (hard rules) → `design.md` (exact algorithms + template
bodies + n8n spec; **§9 = the new-features design, §9.3 = AS BUILT**). `golazo_studio.html` is the
**visual source of truth** for frame/layout. `HOWTO-CLAUDE-CODE.md` is the human operator's guide.

Note: `golazo-logo.js` is an auto-generated base64 data URI of the logo for the **Studio HTML only**;
the runtime service does **not** import it — `src/templates.js` reads `golazo-logo.png` directly. Don't
wire `golazo-logo.js` into the service.

## Security note

`golazo-auto-API-key.txt` in this directory contains **live secrets** (a DeepSeek API key and
a Telegram bot token); a **Buffer access token** also exists (used by the n8n Buffer node). This
service needs no secrets of its own. Per the project rules the deployed repo must be public and
contain **zero secrets** — never commit this file (or its contents); secrets belong only in
Railway env vars / n8n credentials. The service's only optional secret is `RENDER_TOKEN` (set in
Railway). **Pending before public launch:** rotate the DeepSeek / Telegram / Buffer tokens (they
were exposed in plaintext + the build chat). `golazo-auto-API-key.txt`, `out/`, and `memory/` are
gitignored; `fonts/` and `golazo-logo.png` are intentionally committed (required at runtime).
