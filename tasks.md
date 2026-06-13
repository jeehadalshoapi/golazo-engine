# ✅ Tasks — Golazo Engine

> **Legend:** `[ ]` = TODO · `[x]` = Done · `[~]` = In Progress · `[!]` = Blocked
> Strategy source of truth: `golazo_posting_strategy.md`. Technical design: `design.md`.

---

## ✅ DONE — original build & operations (Phases 1–6 + upgrades)

- [x] Renderer core: native-SVG Arabic text, manual wrap, ported decorative frame.
- [x] Four NEWS templates: `breaking`, `confirmed`, `rumors`, `quote`.
- [x] `server.js`: `/health`, `/render` (binary), `/render-url` + `/img/:id` (hosted URL).
- [x] Fonts committed; deployed to Railway (public repo `golazo-engine`).
- [x] n8n pipeline: RSS → keyword filter → Limit → DeepSeek (JSON) → parse/allowlist → render → Telegram.
- [x] Design upgrades: brand logo (base64), auto-shrink fonts, empty-field omission, vertical centering.
- [x] Hardening: `RENDER_TOKEN`; dedup (link/guid + DeepSeek semantic `key`).
- [x] Buffer publishing via MCP (`mcp.buffer.com/mcp`) with Telegram approval gate → FB/IG/Twitter.

---

## ✅ Part 1 — Smart Filtering (small, independent — BUILD FIRST)

> No Postgres, no new endpoints. DeepSeek prompt + parse + one filter node.

- [ ] 1.1 DeepSeek prompt: add `importance` (1–5) and `hashtags` (array) to the JSON output. Keep `template`, `key`, `data`.
- [ ] 1.2 DeepSeek rule: reject **routine** match results → `تجاهل`; allow **major** ones (finals, Clásico, derbies, title-deciders) through as news.
- [ ] 1.3 Parse Code node: carry `importance` (number) and `hashtags` (array) through alongside `template`/`data`/`key`.
- [ ] 1.4 n8n **Filter** node after parse: keep only `importance >= 3` (drops 1–2★).
- [ ] 1.5 (Optional) tighten the keyword pre-filter before DeepSeek to cut multi-source noise / API cost.
- [ ] 1.6 Hashtag application (render/post time): static `#Golazo` + league tag added programmatically; per-platform counts — X 1–2, IG 8–12 (first comment), FB 1–2.

---

## ⏳ Part 2 — Daily Roundup Carousel (large; needs state)

> Routing: `5★` → immediate single (current flow) · `3–4★` → accumulate → 9 PM Riyadh roundup.

### 2a — State store (Postgres on Railway)
- [ ] 2a.1 Create table(s): qualifying news (text fields, `template`, `importance`, `key`, `hashtags`, `created_at`, `published` flag) + dedup log.
- [ ] 2a.2 n8n: each run, INSERT `3–4★` items (skip if `key` already present — dedup).

### 2b — Service: multi-card rendering
- [ ] 2b.1 Add a **`cover`** template (adapt studio `brand`): "أبرز أخبار اليوم" + date + count. Port to native `<text>` (`arBox`).
- [ ] 2b.2 Add `POST /render-roundup` (or extend `/render-url`): input `{ cover, items:[{template,data}] }` → renders cover + each item → returns **array of hosted image URLs**.
- [ ] 2b.3 Reuse the 4 news templates as-is for item slides (no new item templates needed).

### 2c — Assemble at 9 PM (separate scheduled n8n workflow)
- [ ] 2c.1 Schedule trigger 21:00 Asia/Riyadh.
- [ ] 2c.2 SELECT top 5 unpublished `3–4★` by importance/recency → build `{cover, items}` → call `/render-roundup`.
- [ ] 2c.3 Mark selected rows `published`.

### 2d — Publish (Buffer multi-asset)
- [ ] 2d.1 Buffer `create_post` with `assets` array: IG/FB = cover + 5 (6 images); **X = cover + top 3 (4 images, X cap)**.
- [ ] 2d.2 Per-platform `metadata.type`: IG `{type:'post',shouldShareToFeed:true}`, FB `{type:'post'}`.

### 2e — Telegram approval as album
- [ ] 2e.1 Send a **media group / album** (sendMediaGroup) of the roundup images for review.
- [ ] 2e.2 Approve → multi-asset Buffer post; reject → discard.

---

## 🔌 Part 3 — Strategy integration (folded into Part 2)

- [ ] 3.1 Timing: roundup `customScheduled` 21:00 Riyadh; `5★` `shareNow`.
- [ ] 3.2 Caps: hard 6/day/platform; **30-min anti-burst gap** between any two posts; `5★` not counted toward cap.
- [ ] 3.3 Links in **first comment** (not caption) — confirm Buffer MCP first-comment field; IG hashtags also in first comment.

---

## 🕓 Deferred (later phase)
- [ ] Match pipeline: Pre-Match (1h before), Post-Match (on final whistle), stat cards — from api-football, timing relative to fixtures, independent of `importance`.
- [ ] Extra platforms: TikTok (Photo Mode) after IG/FB/X are stable.
- [ ] Optional Google Sheet mirror of the Postgres store for human review.
