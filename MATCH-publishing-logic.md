# MATCH pipeline — publishing logic (the full problem)

This defines **what** the MATCH pipeline must publish and **when**, so nothing is
posted twice and each competition is handled by its real format. It complements
`MATCH-pipeline.md` (design) and `MATCH-pipeline-build.md` (n8n build). The renderer
fixes referenced here are DONE; the stage/round dedup logic is the remaining build.

---

## 1. Competition formats are config-driven (no per-competition workflows)

Competitions differ in **structure**, not in workflow. One shared registry classifies
each comp; every workflow routes off it. Adding a league/cup = **one entry**.

```js
// the single registry (target: a Postgres `competitions` table, one row each)
{ id, name, season, kind:'league'|'cup', structure:'table'|'groups', gate:'top5'|'all', knockout:bool, active:bool }
```

| Competition | structure | knockout | gate | Notes |
|---|---|---|---|---|
| Roshn + Top-5 European | `table` | no | `top5` | league table only; per-match cards gated by top-5 |
| Champions League | `table` | yes | `all` | **league phase = a single table**, then knockout |
| World Cup | `groups` | yes | `all` | group stage, then knockout |

**Routing rule (all workflows read this):**
- `structure:'table'` → **`standing`** card (domestic leagues **and** UCL league phase)
- `structure:'groups'` → **`group`** cards (World Cup)
- `knockout:true` → **`knockout`** / **`bracket`** cards, but only for the **current** round
- `gate:'top5'` → per-match filter; `gate:'all'` → every match

> UCL "table then knockout" is just `structure:'table' + knockout:true`. Its league phase
> renders as a `standing` card (in the standings workflow), **not** a `group` card.

---

## 2. Stage & round progression — publish each stage/round ONCE

The core new rule: **only publish the CURRENT active stage/round; never re-publish a
completed one.** When we reach the quarter-finals we must NOT re-post the Round of 16
(already published); during the group/league stage we must NOT try to post knockouts
(they don't exist yet).

### 2.1 Detect the current phase/round
From the competition's fixtures (`league.round` per fixture):
- **Current round** = the round of the earliest not-started fixture (fallback: the
  latest round that has fixtures). api-football also exposes a current-round endpoint
  (`fixtures/rounds?current=true`) — expose it via golazo-server if we prefer that.
- **Phase** = `league`/`group` if the current round is the league/group phase, else
  `knockout` (round name matches Final / Semi-finals / Quarter-finals / Round of 16 / Round of 32).

### 2.2 Tables (standing / group)
- Posted **while their phase is the current phase** (on the normal schedule, e.g. weekly).
- **Stop** posting the table once the competition moves to knockout.
- No per-post dedup needed (they re-post by schedule to show the live table) — the gate
  is simply "current phase is league/group".

### 2.3 Knockout rounds (`knockout` card)
- Post **each round once**, when it becomes active (drawn / fixtures exist).
- R16 → QF → SF → Final, each published a single time; never re-emit a completed round.
- Dedup key: `(comp_id, season, round)`.

### 2.4 Bracket (`bracket` card)
- Re-published once **per newly-completed round** (the evolving tree), not every run.
- Dedup key: `(comp_id, season, 'bracket:' + currentRound)`.

### 2.5 Dedup mechanism (Postgres)
```sql
CREATE TABLE IF NOT EXISTS posted_stages (
  comp_id   BIGINT NOT NULL,
  season    INT    NOT NULL,
  stage     TEXT   NOT NULL,           -- 'Quarter-finals', 'bracket:Quarter-finals', ...
  posted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (comp_id, season, stage)
);
```
Gate (same pattern as match dedup): before posting a round/bracket,
`INSERT ... ON CONFLICT DO NOTHING RETURNING` — a returned row means "new → publish";
0 rows means "already published → skip".

---

## 3. Match-level publishing — once per match

- **Pre-match:** one single photo per match, ~1h before kickoff, exactly once.
- **Post-match:** one carousel (result + matchstats + ratings) per finished match, once.
- Dedup key: `(fixture_id, kind)` in `posted_matches` (kind = `prematch` | `postmatch`),
  via the same INSERT-RETURNING gate. Poll every 15 min; window selects matches due soon
  (pre) or just finished (post).

```sql
CREATE TABLE IF NOT EXISTS posted_matches (
  fixture_id BIGINT NOT NULL,
  kind       TEXT   NOT NULL,
  posted_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (fixture_id, kind)
);
```

---

## 4. Renderer / card fixes — DONE (this repo)

- MATCH DAY / FULL TIME heading: adaptive sizing, layered connected background.
- Today's results + knockout **score order** flipped for RTL (number under its team).
- **Team crests**: standing/group (beside name), knockout/bracket (with team), matchstats
  (beside name), fixtures/results (per-row badges).
- **League/cup crest** beside the competition name (`compTitle`) across cards.
- **World Cup logo**: api-football returns a placeholder → real WC crest hosted at the
  engine `/asset/worldcup.png`; n8n overrides via `COMP_LOGO[1]` (ideally moved to
  golazo-server so the app benefits too).
- **Standings**: top-10 + gap + bottom-3, green/red rank chips.
- **Ratings**: two columns (team each, logo+name header), top-7 + worst-3, band colors.
- **Result**: removed duplicate team name above the events column.
- **Fixtures/results**: per-row **league crest** instead of the league name; date-only header.
- **Group**: cup logo only (no pill/name), smaller group box.

---

## 5. Captions, hashtags, data layer

- Every post gets a caption with small hashtags: single-match → `#home #away #comp #Golazo`;
  list/table → `#comp #كرة_القدم #Golazo`. (Team names currently English; optional Arabic
  team mapping later.)
- All data from **golazo-server** (caching proxy). n8n never calls api-football directly.
- Competition-logo overrides and the `competitions` registry are best owned by
  golazo-server (single source for app + pipeline).

---

## 6. Status

- **Done:** renderer (all cards + fixes), preview workflows WF1–WF6 wired (logos, captions).
- **Remaining (go-live):**
  1. `competitions` registry (table) + structure-based routing; move UCL league phase to
     the standings workflow, World Cup-only in the groups workflow.
  2. Stage/round dedup (`posted_stages`) so each round/bracket publishes once.
  3. Match dedup (`posted_matches`) + pre-match ~1h timing + post-match on full-time.
  4. Swap preview (Telegram) tails → Buffer + Telegram approval where required.
  5. Schedules per strategy; rotate tokens before public.
