# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: BUILT, DEPLOYED & LIVE

The service is implemented (`package.json`, `src/`, `server.js`, `fonts/` all present),
deployed on **Railway** (public repo `golazo-engine`), and wired into a working **n8n**
pipeline that publishes to **Buffer (Facebook/Instagram/X)**. `5★` singles publish
**directly** (no approval); the nightly roundup is gated by an **inline Telegram approval**
("Send and Wait for Response"). See `PROJECT-SUMMARY.md` for the full build log + every problem/fix.

**Status (2026-06-15): the strategy's core is LIVE.** `5★` news posts instantly as a single;
`3–4★` accumulates in Postgres and posts as a nightly **roundup carousel** (cover + top-5,
9 PM Riyadh, inline Telegram approval); `<3` is dropped. All to FB/IG/X via Buffer, with
per-platform hashtags in the caption. **Part 1** (importance+hashtags+filter) and **Part 2**
(roundup) are DONE; **Part 3** is partial (singles direct-publish + hashtags done; optional
caps + schedule activation + secret rotation remain). The MATCH pipeline (api-football) and
TikTok stay deferred. **Most of the system lives in n8n, not this repo** — the live n8n
architecture, build log, and every problem/fix are in `PROJECT-SUMMARY.md`; the phased
status + remaining work are in `tasks.md`. Read both to understand the whole pipeline.

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

- **`src/templates.js`** — brand constants (`C`, `W=1080`, `H=1080`, `esc`, `has`), text helpers
  (`charW`/`strW`/`wrapLines`/`arText`/`arBox`/`arBlock`), the `vstack` body-layout helper,
  ported frame functions, the `TEMPLATES` registry, and `buildSvg`. Two behaviors to know before
  editing a template body: `arText` **auto-shrinks** the font (1px steps, down to `minSize`) until
  the wrapped block fits its box, and `vstack(top, bottom, blocks)` vertically centers a list of
  body blocks — pass each optional block as `has(field) ? {...} : null` so missing fields recenter
  the rest instead of leaving a hole or a dangling label. The MATCH templates add helpers
  `blockTitle` (two-tone heading), `crest` (team logo / dashed placeholder), and `cells`/`listRows`
  (split the pipe+newline list strings the table/list cards take). Exports `{ buildSvg, TEMPLATES, C, W, H }`.
  This file now **exceeds the ~400-line guideline** (11 templates) — splitting into
  `src/svg-helpers.js` + `src/news-templates.js` + `src/match-templates.js` (keeping `buildSvg`
  as the single entry) is the recommended next refactor.
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

The **MATCH pipeline** templates are now **built in the renderer** (not deferred): `standing`,
`prematch`, `result`, `matchstats`, `ratings`, `fixtures`, `results` — all native-SVG ports of the
Studio bodies (the Studio versions use `<foreignObject>` and must NOT be copied verbatim). Their
**n8n orchestration is specced but not built** — see `MATCH-pipeline.md` (api-football endpoints,
schedules, the top-5 filter, payload mapping). The HYBRID/DATA studio templates and TikTok remain
**deferred — do not build them now**.

**Team logos:** `crest()` (used by `prematch`/`result`) only embeds base64 `data:` URIs — resvg
will NOT fetch http(s) logo URLs (same constraint as the brand logo). n8n must download + base64
the api-football logo before passing `homeLogo`/`awayLogo`, else the dashed-shield placeholder shows.

## API (all in `server.js`)

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/health` | — | `{ ok, templates:[...], hosted }` |
| POST | `/render` | `{ template, data }` | `image/png` binary (Telegram path) |
| POST | `/render-url` | `{ template, data }` | `{ id, url }` — hosts the PNG in a 6h in-memory cache (Buffer needs a URL, not binary) |
| GET | `/img/:id.png` | — | `image/png` (serves a hosted render; **public** — the id is the secret) |
| POST | `/render-roundup` | `{ cover?, items:[{template,data}] }` | `{ count, urls }` — renders `cover` (prepended) + each card, returns the ordered hosted-URL list (daily carousel). Empty list → 400; >12 items → 400 |

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

**To understand current state first:** `PROJECT-SUMMARY.md` (live pipeline diagram + build log +
every problem/fix) and `tasks.md` (what's done / what's remaining + the live n8n architecture).
**Strategy/decisions:** `golazo_posting_strategy.md` (the locked posting strategy — importance
routing, 9 PM roundup, caps). **MATCH pipeline:** `MATCH-pipeline.md` (api-football → render →
Buffer build spec — leagues, top-5 filter, schedules, per-template payload mapping).

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
