# Launch status — handoff (resume here)

Snapshot of the launch-stage work so we can pick up fresh. Companion to
`MATCH-publishing-logic.md` (the full spec). Renderer is deployed on Railway; most
work now is in **n8n**.

## ✅ Done

### Renderer (this repo, deployed)
- 10 match templates + 4 news + roundup `cover` + **`brand`** outro.
- Photo polish: **English numerals** everywhere; bigger league/team crests;
  **MATCH DAY / FULL TIME show the competition logo only** (no name); two-column
  **ratings** (top-7 + worst-3, band colors); **standings** top-10 + bottom-3 with
  green/red rank chips; **knockout** two legs (ذهاب/إياب); **bracket** tree (leg
  aggregation, backward ordering from the final, champion, upper-feeder-on-top);
  competition logo beside the name; `result` duplicate team name removed; cover
  swipe-arrow removed; brand-voice tagline.
- **World Cup logo** hosted at `/asset/worldcup.png` (api-football returns a
  placeholder for league id 1); n8n overrides via `COMP_LOGO[1]`.
- `/render-roundup` auto-appends the **brand outro** slide (pass `brand:false` to skip).

### n8n — all 8 match workflows built (launch tail)
Each: `render-roundup → (Build album → Telegram sendMediaGroup) + (Build Buffer → Buffer MCP)`.
- Telegram = **review copy**, Buffer = **publish** (per-platform hashtags: FB 3 / IG 12 / X 2; `#Golazo` always; brand outro slide).
- Build nodes output `{ items, base, hashtags }`; captions built in the tail.
- Competition logo override map `COMP_LOGO = { 1: '<engine>/asset/worldcup.png' }` in each Build node.
- **UCL league phase routed to WF3 Standings** (`structure:'table'`); World Cup = WF6a Groups.

### Dedup (Postgres tables created: `posted_content`, `posted_matches`, `posted_stages`)
- **Refresh cards** (WF1 fixtures, WF2 results, WF3 standings, WF6a groups): content-hash gate (`posted_content`) → posts only when content changed (handles international breaks).
- **Once-only**: WF5 post-match + WF4 pre-match → `posted_matches`; WF6b knockout + WF6c bracket → `posted_stages`.
- WF4 pre-match = poll every 15 min + post a single ~1h before kickoff.
- WF6b knockout = one post per round when complete (ذهاب/إياب); WF6c bracket = re-post once per completed round.

## 🔧 Open issues to fix tomorrow

1. **WF5 post-match re-posts every 15 min** (under 15h observation now).
   - `Dedup gate2` SQL is correct (INSERT … ON CONFLICT (fixture_id,kind) DO NOTHING RETURNING).
   - Suspects: `fixture_id` resolving **NULL** (→ changed VALUES to `{{ $json.fixtureId }}`), or **missing PRIMARY KEY** on `posted_matches`.
   - TODO: verify `SELECT indexname … pg_indexes WHERE tablename='posted_matches'` and that rows have real ids; add `ALTER TABLE posted_matches ADD PRIMARY KEY (fixture_id, kind)` if missing.
   - **Delete `mark published2`** in WF5 — it's the roundup's `UPDATE roundup_news … $1` query, wrong here; the gate already records the match.

2. **News 5★ single — Telegram sendPhoto caption** ("can't determine which item").
   - Cause: data is gone after `render single` (binary), and 3 items make `$('parse code').item` ambiguous.
   - Fix: wrap publish in **Loop Over Items (batch 1)**; caption references the loop node:
     `{{ $('Loop Over Items').item.json.data.headline || … }}`; sendPhoto **Binary File ON**, field `data`.
   - Also: any node using `$('BuildSingleBuffer').item` → change to `$json` (Buffer MCP body = `{{ JSON.stringify($json.body) }}`).

3. **n8n recurring gotchas** (caused most of our errors):
   - Node names must match expression refs exactly (`Build standings`, `Loop Over Items` vs `Loop Over Items2`, etc.).
   - After a Postgres gate, `$json` is replaced → read items from the loop node (`$('Loop Over Items').item.json.items`), not `$json`.
   - Dedup gates: `ON CONFLICT` needs the unique key to exist, and `fixture_id` must be non-NULL.

## 🔜 Remaining to launch
- Confirm all dedup works after the 15h test (esp. WF5).
- Fix the news 5★ Telegram caption (loop).
- **Schedules:** refresh workflows can be Active now; activate once-only workflows after dedup confirmed.
- **Before public:** rotate tokens (Telegram / DeepSeek / Buffer / `RENDER_TOKEN`); move the WC logo override into **golazo-server** (so the app benefits and n8n drops the `COMP_LOGO` maps).
- Optional: `competitions` registry table (single source for league/cup config).

## Key facts
- Engine: `https://golazo-engine-production.up.railway.app` (token header `x-golazo-token`).
- Data: `https://golazo-server-production.up.railway.app` (fixtures/standings/etc.).
- Buffer channels: FB `6a27a1ef8f1d11f9b2683988`, IG `6a27a2308f1d11f9b2683a57`, X `6a27a90e8f1d11f9b2684d70`.
- Seasons: European + Saudi = 2025; World Cup = 2026.
- Preview tool: `node gallery.js` → open `gallery.html`.
