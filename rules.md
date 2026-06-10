# 📏 Code Rules — Golazo Engine (Card Rendering Service)

> These rules apply to ALL code in this project. Follow them without exception.

---

## Module & Language Rules
- **CommonJS only**: `const x = require(...)` and `module.exports = ...`. Do NOT use
  `import`/`export`. (`package.json` has `"type": "commonjs"`.)
- Plain JavaScript (no TypeScript build step) to keep the service deploy-simple.
  Still write clearly typed JSDoc comments on exported functions where helpful.
- Node 18+ runtime.

## THE foreignObject RULE (most important)
- **Never emit `<foreignObject>` in any SVG that will be rendered by resvg.**
  resvg silently drops it → blank text. Every text run is a native `<text>` element.
- All Arabic text goes through `arText`/`arBox`/`arBlock` (native `<text>`), never raw HTML.
- When porting any function from `golazo_studio.html`, if it contains `<foreignObject>`,
  you MUST rewrite that part as native `<text>`. The decorative functions (`frame`,
  `buildTexture`, `diagBars`, `topSlot`, `blockTitle`, `crest`) contain none — port verbatim.

## Arabic / RTL Rules
- Native `<text>` for Arabic MUST set `direction="rtl"` and `font-family="Cairo"`.
- Always run user text through `esc()` before placing in SVG (escape `& < >`).
- Numbers and Latin (scores, years) use `font-family="Anton"` or `Barlow Condensed`.
- Do not rely on automatic line wrapping — always pre-wrap via `wrapLines`.

## Naming Conventions
| Item | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `render.js`, `templates.js` |
| Functions | camelCase | `buildSvg()`, `svgToPng()` |
| Constants | UPPER or short caps | `W`, `H`, `C`, `FONT_DIR` |
| Template keys | lowercase | `breaking`, `confirmed` |
| ENV variables | UPPER_SNAKE | `RENDER_TOKEN`, `PORT` |

## File Structure Rules
- Keep `templates.js` focused on SVG generation; keep `render.js` focused on raster.
- `server.js` holds only HTTP concerns (routing, validation, error mapping).
- If `templates.js` grows past ~400 lines, split helpers into `src/svg-helpers.js`
  and templates into `src/news-templates.js` — but keep `buildSvg` as the single entry.

## Fonts Rules
- Fonts live in `fonts/` and ARE committed to git (required at runtime).
- Use **TTF** files only (resvg + woff2 is unreliable). Verify with `file fonts/*.ttf`.
- `render.js` must reference the fonts dir by **absolute path** built with
  `path.join(__dirname, '..', 'fonts')` so it works regardless of CWD on Railway.
- `loadSystemFonts: false` (deterministic output; don't depend on the host).

## Environment Variables
- `PORT` — provided by Railway; default to `3000` locally.
- `RENDER_TOKEN` — optional shared secret. If set, `/render` requires header
  `x-golazo-token` to equal it; otherwise respond 401. If unset, endpoint is open.
- Never hardcode any secret. No `.env` is committed.

## Error Handling
- Every request handler wrapped in try/catch.
- Consistent JSON error shape: `{ "error": "<short>", "detail": "<message>" }`.
- Invalid/unknown template → HTTP 400 with `{ error, available: [...] }`.
- Render failure → HTTP 500, log with `console.error('render error:', err)`.
- Never leak stack traces to the client beyond a short `detail` string.

## API Rules
- `GET /health` → `{ ok: true, templates: [...] }`.
- `POST /render` → body `{ template: string, data: object }` → `image/png` binary.
- Limit JSON body to `256kb` (`express.json({ limit: '256kb' })`).
- Always set `Content-Type: image/png` on success.

## Git Rules
- Commit format: `type(scope): message` (`feat`, `fix`, `refactor`, `docs`, `chore`).
- `.gitignore` MUST include `node_modules/`, `*.log`, `.env`.
- `.gitignore` MUST NOT exclude `fonts/` — fonts are required and must be pushed.
- This repo contains NO API keys. If you ever add one, it goes to Railway env vars,
  never to the repo (the GitHub repo is public).

## resvg Rules
- One `Resvg` instance per request is fine (cheap). Do not cache rendered PNGs.
- Output fixed at the SVG's intrinsic 1080×1080; do not upscale unless asked.
- If a template references a remote `<image>` (logos), know resvg will NOT fetch
  remote URLs by default — the news templates avoid this (topSlot defaults to drawn
  text). Do not introduce remote images in the news templates.
