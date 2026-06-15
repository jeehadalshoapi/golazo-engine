# Golazo Engine — Build Summary & Troubleshooting Log

A running record of what was built, the problems hit along the way, and how each was solved.
Kept secret-free on purpose (this repo is public — tokens/keys/account IDs live only in
Railway env vars and n8n credentials).

---

## 1. What this is

**Golazo Engine** turns structured Arabic football news into branded **1080×1080 PNG cards**
and publishes them to social media — fully automated, with a human approval step.

End-to-end pipeline (n8n orchestrates everything). As of 2026-06-15 it routes by
**importance**: `5★` posts instantly as a single; `3–4★` accumulates for a nightly
roundup carousel; `<3` is dropped.

```
WORKFLOW 1 — main pipeline (schedule every 59 min)
  4×RSS (BBC + others) → Merge(Append) → keyword filter (Code)
  → Remove Duplicates (guid/link) → Limit(10)
  → DeepSeek HTTP (Arabic JSON: template, key, importance 1–5, hashtags, data)
  → Filter "تجاهل" → Parse Code (allowlist; carries importance/hashtags/key)
  → Filter (importance ≥ 3) → Remove Duplicates (semantic key)
  → IF (importance == 5):
       ├─ true (5★)  → /render-url → BuildSingleBuffer → Buffer create_post ×3   (direct, no approval)
       └─ false (3–4★) → Postgres INSERT roundup_news (ON CONFLICT key DO NOTHING)

ROUNDUP WORKFLOW — daily 21:00 Asia/Riyadh (self-contained)
  Schedule → Postgres SELECT top-5 unpublished (incl. hashtags)
  → BuildPayload (cover + items + ids + aggregated hashtags)
  → /render-roundup → {urls} → Telegram sendMediaGroup (album preview)
  → Telegram "Send and Wait for Response" (Approval)   ← inline approval, no separate trigger
  → IF approved → BuildBuffer → Buffer create_post ×3 (FB/IG all slides, X first 4) → mark published

Both publish via mcp.buffer.com/mcp (create_post) → Facebook + Instagram + X.
```

## 2. The service (this repo)

A stateless Node + Express + `@resvg/resvg-js` microservice. **No headless browser.**

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness; lists the 4 templates |
| `POST /render` | `{template,data}` → **PNG binary** (Telegram path) |
| `POST /render-url` | `{template,data}` → `{id,url}`, hosting the PNG in a 6h in-memory cache (Buffer path) |
| `GET /img/:id.png` | Serves a hosted render (public; the id is the secret) |

- Templates (NEWS category only): `breaking`, `confirmed`, `rumors`, `quote`.
- Optional auth: if `RENDER_TOKEN` is set, `/render` & `/render-url` require header `x-golazo-token`. `/img` stays public so Buffer/Telegram can fetch it.
- Deployed on Railway, same project as n8n + Postgres. Auto-deploys on `git push`.

Key files: [src/templates.js](src/templates.js) (SVG generation), [src/render.js](src/render.js)
(resvg wrapper), [server.js](server.js) (HTTP), [golazo_studio.html](golazo_studio.html)
(visual design playground).

---

## 3. Milestones completed

1. **Renderer core** — native-SVG Arabic text, manual word-wrap, ported decorative frame.
2. **4 news templates** + `/health` + `/render`.
3. **Deploy** to Railway from a public GitHub repo (fonts committed).
4. **n8n wiring** — DeepSeek JSON output, parse/allowlist, Telegram Send Photo.
5. **Design upgrades** — brand logo, auto-shrink fonts, empty-field omission, vertical centering.
6. **Hardening** — `RENDER_TOKEN`, dedup strategy.
7. **Image hosting** — `/render-url` + `/img` for URL-based consumers.
8. **Buffer publishing** — via Buffer's MCP server to FB/IG/X.
9. **Part 1 — smart filtering** — DeepSeek `importance` (1–5) + `hashtags`; drop `<3`; routine
   results rejected, major kept; mandatory player/club on transfers.
10. **Part 2 — daily roundup carousel** — Postgres accumulation, `cover` template +
    `/render-roundup`, inline Send-and-Wait approval, multi-asset Buffer carousel (X capped to 4).
11. **Part 3 (partial)** — singles direct-publish (no approval); hashtags in the caption per platform.

---

## 4. Problems faced & how we solved them

### Rendering

- **`<foreignObject>` renders blank.** resvg silently drops `foreignObject`, so all Arabic
  text vanished. **Fix:** every text run is a native `<text>` element via `arText`/`arBox`/
  `arBlock`, with **manual** word-wrap (`wrapLines`) since native text doesn't auto-wrap.

- **Arabic came out as tofu (□□□) when testing.** Not a render bug — the **Windows shell
  mangled the Arabic** in `curl -d`. **Fix:** send the JSON from a UTF-8 file
  (`--data-binary @file`). n8n sends proper UTF-8, so the live pipeline was never affected.

- **Long headlines/details overflowed their boxes.** **Fix:** `arText` now shrinks font-size
  1px at a time (down to a 16px floor) until the wrapped block fits; short text stays full size.

- **Cards with empty fields showed dangling labels** (e.g. `المصدر:` with nothing after).
  **Fix:** a `has()` guard — every optional element renders only when its field has a value.

- **Sparse cards floated at the top** instead of being balanced. **Fix:** `vstack()` vertically
  centers whichever body blocks are present within a band.

- **Brand logo wouldn't render.** resvg can't fetch remote/relative images. **Fix:** embed the
  PNG as a base64 data URI (service reads it at startup; studio uses a generated `golazo-logo.js`).

- **`.gitignore` excluded the logo** (`*.png` rule). **Fix:** replaced the blanket rule with
  `out/` + `/tmp/`, and a note that `golazo-logo.png` and `fonts/` must stay committed.

### n8n / DeepSeek

- **DeepSeek emitted invalid template names** (`"templates"`, Latin-`t` `"tجاهل"`). **Fix:** the
  parse Code node is a **strict allowlist** (`breaking|confirmed|rumors|quote`); anything else dropped.

- **HTTP node sent an empty body → 400 "invalid template".** Two causes over time:
  "Send Body" was off; and **"Using Fields Below" flattened the nested `data` object to the string
  `[object Object]`**. **Fix:** **Using JSON** with `={{ $json }}`.

- **The `=` expression gotcha (hit repeatedly).** In n8n **expression (`fx`) mode**, the field
  already supplies the leading `=`. Typing `={{ … }}` yourself makes `==…`, which leaks a literal
  `=` into the value. It broke:
  - the Telegram **Photo URL** → `=https://…` → *"Unsupported URL protocol"*,
  - the Buffer **JSON body** → `=[object Object]`,
  - the post **caption** → text starting with `=`.
  **Rule:** in `fx` fields type `{{ … }}` (no `=`); in plain fields the leading `=` is fine.

- **Dedup — same articles re-posted every hour** (single source returns the same feed items).
  **Fix:** a **Remove Duplicates** node ("Remove Items Processed in Previous Executions") keyed on
  `guid/link`, placed **before** Limit (so Limit grabs *new* items) and before DeepSeek (saves API cost).

- **Cross-source dedup** (same story from BBC + Guardian + Sky has different links *and* wording).
  **Fix:** DeepSeek also outputs a canonical English `key` (entities, alphabetized); a second
  Remove Duplicates node keys on it so the same story from different sources collapses to one.

### Buffer publishing

- **Buffer's classic REST API is dead for new tokens** — `"OIDC tokens are not accepted for direct
  API access"`. **Fix:** use Buffer's **MCP server** (`mcp.buffer.com/mcp`), which is plain
  JSON-RPC over HTTP — so a normal n8n HTTP Request node calls it deterministically (no AI agent).

- **406 "Client must accept both application/json and text/event-stream".** Buffer MCP requires
  that exact `Accept` header (and replies as SSE `data: {json}`). A **typo in the header name**
  (`aproved` instead of `Accept`) meant n8n sent its default Accept. **Fix:** header `Accept` =
  `application/json, text/event-stream`.

- **Facebook & Instagram silently failed; only Twitter posted.** MCP returns **HTTP 200 even on
  tool errors** (the error is inside `result.content` / `result.isError`), so n8n saw "success".
  The real error: *"X posts require a type (post, story, or reel)."* **Fix:** add a service-specific
  `metadata` to `create_post` — Facebook `{facebook:{type:'post'}}`, Instagram
  `{instagram:{type:'post',shouldShareToFeed:true}}`; Twitter needs none.

- **Buffer needs an image URL, not binary.** Telegram accepts binary, but Buffer needs a public
  URL. **Fix:** the `/render-url` + `/img/:id` endpoints host the PNG so Buffer can fetch it
  (verified: Buffer ingests the image at post-creation, well within the 6h cache TTL).

- **Telegram "Answer Query" failed.** It sat after the 3× Buffer node, so it tried to answer the
  same callback 3 times (only the first is allowed). **Fix:** enable **"Execute Once"** on the node.

### Part 1–3 (importance, roundup, approval)

- **DeepSeek left `player` empty on transfers.** Strict "don't invent" rules made it blank the
  field. **Fix:** one prompt rule — `player`/`club` mandatory on `confirmed` (else use `breaking`).

- **Roundup needs state across hourly runs.** A daily roundup must gather 3–4★ news all day then
  assemble at night. **Fix:** Postgres `roundup_news` table; `IF(importance==5)` routes 5★ →
  single, 3–4★ → INSERT (`ON CONFLICT key DO NOTHING` for dedup). Roundup workflow SELECTs at 9 PM.

- **Telegram media groups can't carry buttons; one bot allows only one Trigger.** The first
  approach (separate Telegram-Trigger workflow + a `roundup_batches` table + R1–R5 to look the
  batch back up) was fragile and hard to test (no data without a real tap). **Fix:** scrapped it
  for n8n's **"Send and Wait for Response"** (Approval) — inline approval in one workflow, no
  separate trigger, no batch table. URLs/ids stay in workflow context.

- **Singles didn't need approval.** **Fix:** 5★ publish **directly** to Buffer (BuildSingleBuffer
  → create_post) + an optional Telegram preview; the old single-approval trigger workflow retired.

- **Buffer MCP has no "first comment".** The strategy wanted hashtags/links in the first comment,
  but `create_post` exposes no comment field (only a raw GraphQL fallback). **Fix:** put hashtags
  **in the caption**, trimmed per platform (X ~2, FB ~3, IG ~12; `#Golazo` always).

- **The `=` gotcha kept recurring** in every new node (Postgres params, JSON bodies). Same rule:
  in `fx` fields type `{{ … }}`, never `={{ … }}`.

### Plan/limits findings

- **Buffer Free "10 posts" is a queue-depth limit, not a daily cap.** With `shareNow` (publish
  immediately) it effectively doesn't constrain daily volume. Real limits: 3 channels max (at cap),
  Instagram direct-publish eligibility, and audience cadence — not the number 10.

---

## 5. Status & remaining

**Core is feature-complete and live** (as of 2026-06-15): importance routing, 5★ instant singles,
3–4★ nightly roundup carousel, hashtags, dedup — all posting to FB/IG/X.

Remaining (all optional / operational — see `tasks.md`):
- 🔜 **Activate the schedules** (Workflow 1 + roundup) for unattended running — until then run via
  *Execute Workflow*. The Active toggle is top-right, appears after Save (not for Manual triggers).
- 🔑 **Rotate the secrets** in `golazo-auto-API-key.txt` before going public (DeepSeek/Telegram/Buffer
  tokens — gitignored, never committed, but plaintext locally + exposed in the build chat).
- ▶️ **Roundup auto-publish** — drop the Send-and-Wait node when you trust it.
- 🛡️ **(Optional) anti-spam** — 6/day/platform cap + 30-min anti-burst (low urgency; 5★ is rare).
- 🔭 **Deferred projects:** MATCH pipeline (pre/post-match + stat cards from api-football), TikTok,
  optional Google Sheet mirror.
