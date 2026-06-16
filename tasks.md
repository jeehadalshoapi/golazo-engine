# ✅ Tasks — Golazo Engine

> **Legend:** `[ ]` = TODO · `[x]` = Done · `[~]` = In Progress
> Strategy source of truth: `golazo_posting_strategy.md`. Technical design: `design.md`.
> Build log + every problem/fix: `PROJECT-SUMMARY.md`.
> **Most of the system lives in n8n (not this repo).** The live n8n architecture is
> described below + in `PROJECT-SUMMARY.md` — read it to understand the whole pipeline.

---

## Current state (2026-06-15): the strategy's core is LIVE

`5★` news posts instantly as a single; `3–4★` accumulates and posts as a nightly
roundup carousel; `<3` is dropped. All to Facebook + Instagram + X via Buffer.

### Live n8n architecture (two workflows)

**Workflow 1 — main pipeline (hourly-ish, schedule every 59 min):**
```
Schedule → 4×RSS (BBC + others) → Merge(Append) → keyword filter (Code)
  → Remove Duplicates (guid/link) → Limit(10)
  → DeepSeek HTTP (Arabic JSON: template, key, importance 1–5, hashtags, data)
  → Filter "تجاهل" → parse Code (allowlist + carries importance/hashtags/key)
  → Filter (importance >= 3) → Remove Duplicates (semantic key)
  → IF (importance == 5):
       ├─ true (5★) → render /render-url → BuildSingleBuffer (Code) → Buffer create_post ×3  [+ optional Telegram preview]
       └─ false (3–4★) → Postgres INSERT roundup_news (ON CONFLICT key DO NOTHING)
```

**Roundup workflow — daily 9 PM Asia/Riyadh (one self-contained workflow):**
```
Schedule(21:00) → Postgres SELECT top-5 unpublished (incl. hashtags)
  → BuildPayload (Code: cover + items + ids + aggregated hashtags)
  → /render-roundup HTTP → {urls}
  → build album (Code) → Telegram sendMediaGroup (preview)
  → Telegram "Send and Wait for Response" (Approval)
  → IF approved → BuildBuffer (Code) → Buffer create_post ×3 → Postgres mark published
```

> The single-post approval (old Workflow 2 trigger) was **removed** — singles publish
> directly. Roundup approval uses inline **Send-and-Wait** (no separate trigger, no
> `roundup_batches` table — both abandoned for simplicity).

---

## ✅ DONE

### Original build (renderer + deploy + base n8n)
- [x] Renderer: native-SVG Arabic text, manual wrap, ported frame; 4 NEWS templates.
- [x] `server.js`: `/health`, `/render` (binary), `/render-url` + `/img/:id` (hosted), `/render-roundup`.
- [x] Deployed to Railway (public repo `golazo-engine`); fonts + `golazo-logo.png` committed.
- [x] Design upgrades: logo, auto-shrink fonts, empty-field omission, vertical centering.
- [x] Hardening: `RENDER_TOKEN`; two-layer dedup.

### Part 1 — Smart filtering
- [x] DeepSeek emits `importance` (1–5) + `hashtags` + `key`; rejects routine results, keeps major.
- [x] Mandatory `player`/`club` on `confirmed` (else fall back to `breaking`).
- [x] Parse carries importance/hashtags; n8n Filter keeps `importance >= 3`.

### Part 2 — Daily roundup carousel
- [x] Postgres `roundup_news` table; `IF==5` routes 3–4★ → INSERT (ON CONFLICT key).
- [x] `cover` template + `POST /render-roundup` (cover + item cards → hosted URLs).
- [x] Roundup workflow: SELECT → render → album → Send-and-Wait → Buffer carousel → mark published.
- [x] Buffer carousel: FB/IG all slides, **X capped to 4 images**; per-service `metadata.type`.

### Part 3 — Strategy integration (partial)
- [x] Singles (5★) → **direct publish** (no approval) + optional Telegram preview.
- [x] **Hashtags in caption** per platform (X ~2, FB ~3, IG ~12; `#Golazo` always).
      *(Buffer MCP has NO first-comment support, so caption — not first comment.)*

---

## 🔜 REMAINING (all optional / operational — core is feature-complete)

- [ ] **Activate the schedules** — toggle Workflow 1 + the roundup workflow **Active** so they
      run unattended (the Active toggle appears top-right after Save; Manual-trigger workflows
      don't show it). Until then, run via **Execute Workflow**.
- [ ] **Rotate secrets before going public** — DeepSeek key, Telegram bot token, Buffer token
      are in `golazo-auto-API-key.txt` (gitignored) and were exposed in chat. `RENDER_TOKEN`
      lives in Railway env.
- [ ] **Roundup → auto-publish (production)** — delete the "Send and Wait" node and connect the
      IF/approve path straight to publish, when you trust it.
- [ ] **(Optional) anti-spam** — 6/day/platform cap + 30-min anti-burst gap. Low urgency (5★ rare).

---

## ⚽ MATCH pipeline (api-football) — renderer DONE; n8n previews PARTIALLY built
Data source = **golazo-server** (caching proxy; n8n reads its HTTP endpoints, never api-football).
Preview phase: each workflow ends at a **binary Telegram sendPhoto** (no Buffer/approval yet) —
the URL `sendMediaGroup` tail is flaky for logo-heavy cards (`WEBPAGE_CURL_FAILED`). Build steps
in **`MATCH-pipeline-build.md`**; design in **`MATCH-pipeline.md`**.

**Renderer (this repo) — DONE & verified:**
- [x] Templates: standing / group / knockout / prematch / result / matchstats / ratings / fixtures / results.
- [x] Server-side logo fetch+embed (`src/logos.js`); n8n just passes the URL.
- [x] Free-plan graceful degradation (missing score → "—"; empty stats/ratings → "غير متوفرة").

**n8n preview workflows (in the roundup dashboard):**
- [x] #1 **Fixtures** (today's matches) — working.
- [x] #2 **Results** (today's results) — working.
- [x] #4 **Pre-match** — built & working (binary preview tail).
- [x] #5 **Post-match** (`result` + events; matchstats/ratings ready for Pro) — built.
- [ ] #3 **Standings** — not built (empty until paid plan; see below).
- [ ] #6 **Cups** — `group` (paid) + `knockout` (buildable now) — not built.

**⛔ BLOCKED on paid api-football plan** (free tier lacks these — fix automatically when upgraded, no code change):
- [ ] **Standings** endpoint → empty → `top5` set is empty → **domestic-league matches are filtered out**
      of pre/post-match (only World Cup / UCL flow now, since cups post all). Optional fallback if wanted:
      `const keep = (DOMESTIC.has(lid) && top5.size) ? (…) : true;` (skip filter when no standings).
- [ ] **statistics / players** endpoints → `matchstats` + `ratings` slides (post-match is just `result` for now).
- [ ] `standing` / `group` cards (need standings data).

**Go-live (after previews look right):**
- [ ] Swap the binary-preview tail for the roundup's **Buffer** tail + re-add **Telegram approval**
      where `MATCH-pipeline.md §1` marks "inline Telegram".
- [ ] Pre-match real timing: per-match single ~3h before kickoff + `posted_matches` dedup (now: carousel of all today).
- [ ] (Optional) merge into **Morning/Evening** workflows; add logos to standings/group.

## 🕓 Deferred (separate later projects)
- [ ] `lineup` XI cards.
- [ ] TikTok (Photo Mode) after IG/FB/X are stable.
- [ ] Optional Google Sheet mirror of `roundup_news` for human review.

---

## Reference: Buffer (MCP) + DB facts
- Buffer **MCP** `https://mcp.buffer.com/mcp` (classic REST dead for OIDC tokens). JSON-RPC
  over HTTP; headers `Authorization: Bearer <token>` + `Accept: application/json, text/event-stream`.
- `create_post` needs per-service `metadata.type`: FB `{facebook:{type:'post'}}`,
  IG `{instagram:{type:'post',shouldShareToFeed:true}}`; X none. Multi-image = `assets[]`.
- MCP returns HTTP 200 even on tool error (error is inside `result.content`/`isError`).
- Postgres tables: `roundup_news` (key UNIQUE, template, data jsonb, importance, hashtags jsonb,
  headline, published). (`roundup_batches` is unused — safe to drop.)
