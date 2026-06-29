# CLAUDE.md — golazo-engine (the renderer)

Guidance for Claude Code (and future sessions) working in this repo.

> ⚠️ This folder is the **golazo-engine** repo (`jeehadalshoapi/golazo-engine`), despite the
> folder name being `automation`. It is **only the card renderer**. The publishing pipeline
> that *calls* this engine now lives in the **golazo-server** repo (`src/orchestrator/`,
> the "golazo-automation" Railway worker). The old **n8n** system has been retired and its
> docs removed — see golazo-server's `CLAUDE.md` for the pipeline.

## What this builds

**Golazo Engine** — a stateless Node + Express microservice that turns structured Arabic football
data (`{ template, data }` JSON) into a branded **1080×1080 PNG card** and returns it. Renders with
`@resvg/resvg-js` (pure SVG→PNG, **no headless browser** — light for Railway). Deployed on Railway;
the orchestrator calls it over HTTP.

## THE critical constraint (read before touching any SVG)

`@resvg/resvg-js` does **NOT** render `<foreignObject>` — it silently drops it, so all Arabic text
would vanish. `golazo_studio.html` (the visual source of truth) builds Arabic text with
`<foreignObject>`+HTML; you **must not** copy those verbatim.

- Every text run is a **native SVG `<text>`**, routed through `arText`/`arBox`/`arBlock`.
- Native `<text>` doesn't auto-wrap → wrapping is **manual** via `wrapLines` (char-advance
  estimation tuned for Cairo ≈0.5×font-size — keep those magic numbers; see `design.md §2`).
- Arabic `<text>` MUST set `direction="rtl"` + `font-family="Cairo"`; every user string passes `esc()`
  (which also converts Arabic-Indic digits → Western, so cards show English numerals).
- Decorative/frame functions (`mulberry32`, `buildTexture`, `diagBars`, `topSlot`, `frame`) are
  native-SVG-only — ported verbatim from `golazo_studio.html`.

## Architecture

```
POST /render { template, data }
  → buildSvg(template, data)        src/templates.js  (frame + TEMPLATES[t].content)
  → svgToPng(svg)                   src/render.js     (Resvg → PNG buffer)
  → image/png
```

- **`src/templates.js`** — merges NEWS + MATCH into `TEMPLATES`; defines `buildSvg`. Exports `{ buildSvg, TEMPLATES, C, W, H }`.
- **`src/svg-helpers.js`** — shared engine: brand constants (`C`, `W=1080`, `H=1080`), `esc`/`has`,
  text helpers (`charW`/`strW`/`wrapLines`/`arText`/`arBox`/`arBlock`), `vstack`, ported `frame`,
  and match helpers (`blockTitle`, `crest`, `rowLogo`, `compTitle`, `cells`/`listRows`, `tableRows`).
  `arText` auto-shrinks the font to fit its box; `vstack` vertically centers (pass missing fields as
  `null` so it recenters).
- **`src/news-templates.js`** — `breaking`/`confirmed`/`rumors`/`quote` + roundup `cover` + `brand` outro.
- **`src/match-templates.js`** — `standing`/`group`/`knockout`/`bracket`/`prematch`/`result`/
  `matchstats`/`ratings`/`fixtures`/`results` (native-SVG ports; the Studio versions use
  `<foreignObject>` and must NOT be copied verbatim).
- **`src/render.js`** — resvg wrapper. Fonts by absolute path (`fonts/`), `loadSystemFonts:false`,
  `defaultFontFamily:'Cairo'`.
- **`src/logos.js`** — resvg can't fetch remote images, so the server fetches each api-football logo
  URL once, base64-caches it in-memory; `server.js` calls `resolveLogos(collectLogoUrls(data))`
  before every render. Callers pass plain logo URLs.
- **`server.js`** — HTTP only (routing, validation). `express.json({limit:'256kb'})`.

### Notable template behaviors (current)
- **bracket** is crest-only (no names) with bigger centered crests; the **final** shows the two
  finalists flanking a centre champion (not one box). It expects `rounds` ordered first→last
  (last = the 1-match final); a partial bracket is shown as a `knockout` grid instead (the
  orchestrator decides which).
- **knockout** card: each row shows the **score** if played, else the **kickoff time + a date line**
  (list cell format `home | away | score? | homeLogo? | awayLogo? | date? | time?`).

## API (all in `server.js`)

| Method | Endpoint | Body | Response |
|---|---|---|---|
| GET | `/health` | — | `{ ok, templates:[...], hosted }` |
| POST | `/render` | `{ template, data }` | `image/png` binary |
| POST | `/render-url` | `{ template, data }` | `{ id, url }` (6h in-memory host) |
| GET | `/img/:id.png` | — | hosted PNG (public; id is the secret) |
| GET | `/asset/:file` | — | static brand assets (e.g. `/asset/worldcup.png`) |
| POST | `/render-roundup` | `{ cover?, items:[{template,data}], brand? }` | `{ count, urls }` — cover (prepended) + items + a `brand` outro (pass `brand:false` to skip) |

Errors: `{ error, detail }`. If `RENDER_TOKEN` is set, `/render*` require header `x-golazo-token`.
`/img/:id` and `/asset` are public so Buffer/Telegram can fetch them.

## Commands
```bash
npm install
npm start              # node server.js — listens on PORT (default 3000)
node test_cards.js     # render one sample PNG per template → ./out/card_*.png (eyeball)
node gallery.js        # render EVERY template into a self-contained gallery.html (gitignored)
```
There is no test framework — verification is **visual**.

## Conventions
- **CommonJS only** (`require`/`module.exports`), `"type":"commonjs"`, Node 18+. No TS, no ESM.
- Files kebab-case, functions camelCase, constants short-caps (`W`,`H`,`C`), template keys lowercase.
- Fonts (TTF only) live in `fonts/` and **must be committed**; `golazo-logo.png` too. Both are runtime-required.
- Commit format `type(scope): message`. Communicate with the developer (Gehad) in **Arabic**; code/comments in **English**.

## Source-of-truth docs (renderer internals)
- `design.md` — exact algorithms (wrap/arText) + template bodies. **Most useful.**
- `agent.md` — role + the foreignObject rule. `planning.md` — architecture/decisions. `rules.md` — hard rules.
- `golazo_studio.html` — visual source of truth for the frame/layout (uses foreignObject — reference only, don't copy text layer).

## Security
Repo is **public** → contains NO secrets. `golazo-auto-API-key.txt` (live secrets) and `out/`,
`memory/`, `gallery.html` are gitignored. The only optional secret is `RENDER_TOKEN` (Railway env).
