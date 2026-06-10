# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: spec-only, not yet built

This directory currently holds **specifications, not an implementation**. There is no
`package.json`, `src/`, `server.js`, or `fonts/` yet. The five `*.md` files plus
`golazo_studio.html` are the inputs for building the service from scratch. When asked to
build, follow the file-creation order and phases below — do not assume code already exists.

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

- **`src/templates.js`** — brand constants (`C`, `W=1080`, `H=1080`, `esc`), text helpers
  (`charW`/`strW`/`wrapLines`/`arText`/`arBox`/`arBlock`), ported frame functions, the
  `TEMPLATES` registry, and `buildSvg`. Exports `{ buildSvg, TEMPLATES, C, W, H }`. If it
  passes ~400 lines, split into `src/svg-helpers.js` + `src/news-templates.js`, keeping
  `buildSvg` as the single entry.
- **`src/render.js`** — only the resvg wrapper. Fonts referenced by **absolute path**
  (`path.join(__dirname, '..', 'fonts')`), `loadSystemFonts: false`, `defaultFontFamily: 'Cairo'`.
- **`server.js`** — HTTP only (routing, validation, error mapping). `express.json({limit:'256kb'})`.

### Scope: NEWS category only

Build exactly **four** templates — `breaking`, `confirmed`, `rumors`, `quote` (exact field
lists and verified SVG bodies in `design.md §4` — use them verbatim, never invent field names).
DATA templates (fixtures/results/top10), HYBRID templates, Buffer publishing, and PostgreSQL
dedup are **later milestones — do not build them now**.

## API

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/health` | — | `{ ok:true, templates:[...] }` |
| POST | `/render` | `{ template, data }` | `image/png` binary |

Errors use shape `{ error, detail }`. Unknown template → 400 with `available:[...]`.
If env `RENDER_TOKEN` is set, `/render` requires header `x-golazo-token` to match, else 401.

## Commands

```bash
npm install            # express + @resvg/resvg-js
npm start              # node server.js — listens on PORT (default 3000)
node test_cards.js     # renders one sample PNG per template to /tmp/card_*.png — open and eyeball

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

## Source-of-truth docs (read in this order when building)

`agent.md` (role + the foreignObject rule) → `planning.md` (architecture/decisions) →
`rules.md` (hard rules) → `design.md` (exact algorithms + template bodies + n8n spec) →
`tasks.md` (phased checklist — mark `[x]` as you go). `golazo_studio.html` is the **visual
source of truth** for frame/layout. `HOWTO-CLAUDE-CODE.md` is the human operator's guide.

## Security note

`golazo-auto-API-key.txt` in this directory contains **live secrets** (a DeepSeek API key and
a Telegram bot token). This service needs no secrets of its own. Per the project rules the
deployed repo must be public and contain **zero secrets** — never commit this file (or its
contents) to the Golazo Engine repo; secrets belong only in Railway env vars. The service's
only optional secret is `RENDER_TOKEN`.
