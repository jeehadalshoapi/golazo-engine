# Golazo Engine — Build Summary & Troubleshooting Log

A running record of what was built, the problems hit along the way, and how each was solved.
Kept secret-free on purpose (this repo is public — tokens/keys/account IDs live only in
Railway env vars and n8n credentials).

---

## 1. What this is

**Golazo Engine** turns structured Arabic football news into branded **1080×1080 PNG cards**
and publishes them to social media — fully automated, with a human approval step.

End-to-end pipeline (n8n orchestrates everything):

```
Schedule (every 59 min)
  → RSS read (BBC + optionally Guardian / Sky / ESPN)
  → Merge (Append)                         [when multiple sources]
  → Keyword filter (Code)
  → Remove Duplicates (link/guid)          [dedup layer 1]
  → Limit (10)
  → DeepSeek HTTP (classify + write Arabic, output JSON)
  → Filter (drop "تجاهل")
  → Parse Code (strict allowlist of the 4 templates)
  → Remove Duplicates (semantic key)       [dedup layer 2, multi-source]
  → HTTP POST /render-url  ──► Golazo Engine (Railway) returns a hosted image URL
  → Telegram "Send Photo" by URL + ✅/❌ inline buttons   (approval gate)
        │  (button tap is async →)
        ▼
  Workflow 2: Telegram Trigger (callback_query)
        → Code (build per-channel Buffer request)
        → HTTP POST mcp.buffer.com/mcp  (create_post → Facebook / Instagram / Twitter)
        → Telegram "Answer Query" (confirmation toast)
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
8. **Buffer publishing** — via Buffer's MCP server, with a Telegram approval gate, to FB/IG/Twitter.

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

### Plan/limits findings

- **Buffer Free "10 posts" is a queue-depth limit, not a daily cap.** With `shareNow` (publish
  immediately) it effectively doesn't constrain daily volume. Real limits: 3 channels max (at cap),
  Instagram direct-publish eligibility, and audience cadence — not the number 10.

---

## 5. Status & remaining

- ✅ Renderer, deploy, n8n classify/render/approve, image hosting, Buffer FB/IG/Twitter publish.
- 🔜 Operational: rotate the secrets in `golazo-auto-API-key.txt` before going public (they're
  gitignored, never committed, but exist in plaintext locally).
- 🔭 Later milestones (out of scope so far): DATA templates (fixtures/results/top10 from
  api-football), HYBRID templates, Postgres-backed dedup history cleanup, scaling past 3 channels.
