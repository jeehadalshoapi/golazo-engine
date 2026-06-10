# 📐 Project Planning — Golazo Engine (Card Rendering Service)

## Overview
Golazo Engine's rendering service turns structured Arabic football news into
branded PNG cards. It is a **stateless microservice**: input JSON in, PNG out.
It sits inside the larger Golazo content-automation pipeline orchestrated by n8n.

**Goal:** Given `{ template, data }`, return a polished 1080×1080 Golazo-branded
PNG that is ready to post to social media.
**Target Users:** The n8n workflow (machine-to-machine). No human UI.

---

## Architecture

### System Overview
This service is **stage 3** of the Golazo Engine pipeline. The full pipeline:

```
[RSS feeds] ──> [n8n: keyword Code filter] ──> [DeepSeek API: classify + write]
                                                        │
                                          JSON { template, data }
                                                        ▼
                                   ┌──────────────────────────────────┐
                                   │   THIS SERVICE (Golazo Engine)    │
                                   │  POST /render                     │
                                   │  buildSvg(template,data) → SVG    │
                                   │  resvg-js → PNG (1080×1080)       │
                                   └──────────────────────────────────┘
                                                        │ image/png
                                                        ▼
                                         [n8n: Telegram sendPhoto]
                                                        │ (human approval — later)
                                                        ▼
                                              [Buffer API: publish] (later)
```

The service itself is internally simple:

```
HTTP POST /render { template, data }
        │
        ▼
  buildSvg(template, data)            (src/templates.js)
        │  - frame(d)         → decorative brand frame (resvg-safe, verbatim)
        │  - TEMPLATES[t].content(d)  → template body using native <text>
        ▼
   full SVG string
        │
        ▼
  svgToPng(svg)                       (src/render.js)
        │  - new Resvg(svg, { font: { fontDirs:['./fonts'], loadSystemFonts:false }})
        │  - .render().asPng()
        ▼
   PNG buffer  → res.send (image/png)
```

### Key Decisions
| Decision | Choice | Reason |
|----------|--------|--------|
| Renderer | `@resvg/resvg-js` | Light, fast, no browser; cheap on Railway. Chosen over Puppeteer/Satori/Bannerbear. |
| Text rendering | Native SVG `<text>` + manual wrap | resvg does NOT support `<foreignObject>`; native text renders Arabic correctly when Cairo TTF is loaded. |
| Server | Express 4 | Minimal, well-known, easy on Railway. |
| Module system | CommonJS | Simplicity; matches resvg-js examples. |
| Fonts source | google/fonts TTF (committed) | resvg needs real font files; TTF most reliable (woff2 unreliable). |
| Persistence | None (stateless) | This service only renders. Dedup/history is a later Engine phase. |
| Output | 1080×1080 PNG | Instagram square; one size for all news cards. |
| Hosting | Railway | Already hosts n8n + Postgres; consolidates cost (~$5–6/mo total). |

---

## Folder Structure

```
golazo-engine/
├── fonts/
│   ├── Cairo.ttf                     # variable Arabic font (required for Arabic)
│   ├── Anton-Regular.ttf             # Latin display / big numbers
│   ├── BarlowCondensed-Bold.ttf      # hashtag chip
│   └── BarlowCondensed-SemiBold.ttf
├── src/
│   ├── templates.js                  # text helpers + frame + 4 templates + buildSvg
│   └── render.js                     # resvg wrapper (svgToPng)
├── server.js                         # Express app: /health, /render
├── test_cards.js                     # local visual test (renders sample PNGs to /tmp)
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

---

## Environments

### Development
- Local server: `http://localhost:3000` (or any `PORT`)
- Test: `node test_cards.js` then open the generated PNGs
- No DB, no external calls needed to run locally

### Production (Railway)
- Deploy from GitHub repo (new repo, separate from the mobile app repo)
- Build: `npm install` (auto), Start: `npm start`
- `PORT` injected by Railway; service exposes a public domain
- Optional env: `RENDER_TOKEN` (shared secret for the `/render` endpoint)

---

## Key Features Breakdown

### Feature: Card rendering endpoint
- **Description:** `POST /render` accepts `{ template, data }`, returns PNG.
- **Files involved:** `server.js`, `src/templates.js`, `src/render.js`
- **Dependencies:** express, @resvg/resvg-js, fonts in `fonts/`

### Feature: News templates (4)
- **Description:** `breaking`, `confirmed`, `rumors`, `quote` — the news category.
- **Files involved:** `src/templates.js` (TEMPLATES registry)
- **Dependencies:** shared `frame()` + `arBox/arBlock` text helpers

### Feature: Health check
- **Description:** `GET /health` returns `{ ok, templates }` for n8n/Railway probes.
- **Files involved:** `server.js`

---

## Milestones

| Phase | Features | Est. Time |
|-------|----------|-----------|
| Phase 1 — Setup | npm init, deps, fonts download, folder structure | 30 min |
| Phase 2 — Renderer core | text helpers (wrap), frame port, render.js | 2–3 h |
| Phase 3 — Templates | breaking, confirmed, rumors, quote | 2 h |
| Phase 4 — Server | Express endpoints, error handling, local test | 1 h |
| Phase 5 — Deploy | GitHub repo, Railway service, smoke test | 45 min |
| Phase 6 — n8n wire-up | DeepSeek JSON prompt, HTTP node, Telegram sendPhoto | 1–2 h |

> **Scope note:** This doc covers the NEWS category only (4 templates). The DATA
> category (fixtures/results/top10 from api-football) and HYBRID category
> (statshock/comparison) are separate, later milestones — do NOT build them now.
