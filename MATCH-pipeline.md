# MATCH pipeline — design spec (api-football → render → Buffer)

This is the **build spec** for the MATCH side of Golazo. The renderer half (the cards) is
**already built** in `src/templates.js` and live on Railway. This doc describes the **n8n
workflows** that feed it — n8n runs in the cloud (not this repo), so this is the step-by-step
you wire up there, mirroring how the NEWS pipeline is documented in `PROJECT-SUMMARY.md`.

The NEWS pipeline (RSS → DeepSeek → render → Buffer) is unchanged and runs in parallel.

---

## 1. What we publish (and when)

| # | Post | Schedule (Riyadh) | Template(s) | Format | Approval |
|---|------|-------------------|-------------|--------|----------|
| 1 | **Today's fixtures** | ~08:00 daily | `fixtures` (1 card/league) + `standing` (optional) | carousel | none |
| 2 | **Pre-match** | ~3h before kickoff, per match | `prematch` | single | none |
| 3 | **Post-match carousel** | at full-time, per match | `result` → `matchstats` → `ratings` | carousel | inline Telegram |
| 4 | **Today's results** | ~23:30 daily | `results` (1 card/league) | carousel | inline Telegram |
| 5 | **Cup structure** | group/draw day | `group` (1/group) or `knockout` (1/round) | carousel | none |

**Two kinds of competition, two filtering rules:**
- **Leagues** (Roshn + Top-5 European): posts 2–3 are **per match** and are the volume risk →
  gated by the **top-5 filter** (§3). Posts 1/4 cover all our-league matches that day.
- **Cups** (UCL, World Cup): **every match is important → post ALL of them, no top-5 gate.**
  Their structure is shown with `group` (group stage) and `knockout` (the draw/bracket per
  round) instead of a single league table. Pre/post cards (`prematch`/`result`/`matchstats`/
  `ratings`) work identically for cup matches.

> Carousels go to FB/IG with all slides; **X is capped to 4 images** (same rule the roundup
> already uses). Order the post-match carousel `result, matchstats, ratings` so the 3 best
> slides survive the X cap.

> **⚠️ Current phase = PREVIEW ONLY (no publishing, no approval).** While building/testing,
> **every MATCH workflow ends at a Telegram album preview** (`sendMediaGroup`) — there is **no
> Buffer node and no Send-and-Wait approval** yet. The "Format / Approval" columns above describe
> the *eventual* wiring; ignore them for now. When the cards look right, swap the preview node for
> the roundup's Buffer tail (and re-add approval where the table says "inline Telegram").

---

## 1.5 Data layer — n8n reads via `golazo-server` (the same proxy the app uses)

The api-football data is served by **`golazo-server`** (Project B): an Express **caching proxy**
that fetches api-football, caches each response in **Redis** with per-endpoint TTLs, and returns
the **api-football response body verbatim**. The mobile app reads from it; **n8n reads the exact
same endpoints.** That is the single source of truth — app and workflow always see the identical
(cached) snapshot.

- **n8n never calls api-football and never touches Redis directly** — it makes plain HTTP GETs to
  `golazo-server`, exactly like the app. (Source: `golazo-server/src/routes/*`, `README.md`.)
- **Free-tier safe:** `golazo-server` caches every response, so n8n's reads mostly return
  `X-Cache: HIT` and cost **zero** upstream quota. Only `golazo-server` ever spends the api-football
  100 req/day budget — and only the app/server should hold the API key.
- **No sync workflow, no cross-project DB connection.** Just point n8n at `golazo-server`'s public URL.

**Topology (two Railway projects):**
- **Project A** — n8n + the `roundup_news` Postgres. The MATCH workflows live in this **same n8n
  dashboard** as the roundup workflow.
- **Project B** — **`golazo-server`** (the caching proxy) + **Redis** (its cache, with volume).
  The server fetches api-football on a cron and serves cached JSON. There is **no Postgres** here.

**Base URL:** `https://golazo-server-production.up.railway.app` (Project B → `golazo-server` →
Settings → Networking shows the exact domain; confirm with `GET /health` → `{ ok:true, redis:'connected' }`).
No auth token today (per-IP rate-limit 120/min) — fine for n8n's low volume. n8n uses a plain
**HTTP Request** node (no DB credential needed for reads).

**Response shape:** every endpoint returns the api-football envelope verbatim
`{ results, paging, response: [ ... ] }` → every Code/Set node reads **`$json.response`**.

### 1.5.1 Card → `golazo-server` endpoint map
| Card | Endpoint | Parse |
|---|---|---|
| `fixtures` (today) | `GET /fixtures/today` | **ALL** fixtures globally for today in ONE cached call → filter `response` by our league ids in a Code node (no per-league loop) |
| `results` (today) | `GET /fixtures/today` | same bucket; keep finished (`fixture.status.short` ∈ FT/AET/PEN) |
| `standing` | `GET /standings/:leagueId?season=` | `response[0].league.standings[0]` (rows) |
| `group` | `GET /standings/:leagueId?season=` | `response[0].league.standings` = array of groups (one card each) |
| `prematch` | `GET /fixtures/:id` | `response[0]` → teams / league / venue / date |
| `result` | `GET /fixtures/:id` + `GET /fixtures/:id/events` | score from `goals`; events grouped per `team.id` |
| `matchstats` | `GET /fixtures/:id/statistics` | `response[].statistics[]`; **may be empty on free plan** |
| `ratings` | `GET /fixtures/:id/players` | `response[].players[].statistics[0].games.rating`; **may be empty** |
| `knockout` | `GET /fixtures/league/:id?season=` | filter by `league.round` → pairings |

> State n8n still owns in **Project A**'s `roundup_news` Postgres: a small `posted_matches` table
> to dedup pre/post cards (so a fixture isn't posted twice). That's the only DB the MATCH workflows
> write — reads are all HTTP to `golazo-server`.

## 1.6 Free-plan degradation (until Pro)

On the **free plan** many fields are missing (statistics/players endpoints limited, some
seasons/leagues unavailable, results delayed). The pipeline must **never post a broken card**:

- **Renderer already degrades** — missing score → "—" (no chip); empty `matchstats`/`ratings` →
  a muted "غير متوفرة" note; missing logos → dashed-shield; missing optional fields → omitted.
- **Build carousel slides conditionally** — in the post-match workflow, add a slide **only if its
  core data exists**: always `result` (score is enough); add `matchstats` only if the stats array
  is non-empty; add `ratings` only if ≥1 player has a rating. On free plan a post-match carousel
  may legitimately be **just the `result` card** — that's fine.
- **Skip empty leagues/groups** — don't render a `fixtures`/`results`/`group` card with zero rows.

> When you move to **Pro** (in a few days): nothing in the renderer **or n8n** changes — `golazo-server`
> keeps serving the same shapes. The conditional checks above just start passing more often
> (stats/ratings appear), and you can widen `season`/league coverage in `golazo-server`. Keep the
> conditional-slide logic — it's also your safety net for the odd missing match.

---

## 2. Leagues config (api-football `league` IDs)

```
const LEAGUES = [
  { id: 307, key: 'روشن',          name: 'دوري روشن السعودي', domestic: true  },
  { id: 39,  key: 'البريميرليغ',   name: 'الدوري الإنجليزي',  domestic: true  },
  { id: 140, key: 'الليغا',        name: 'الدوري الإسباني',   domestic: true  },
  { id: 135, key: 'السيري آ',      name: 'الدوري الإيطالي',   domestic: true  },
  { id: 78,  key: 'البوندسليغا',   name: 'الدوري الألماني',   domestic: true  },
  { id: 61,  key: 'الليغ 1',       name: 'الدوري الفرنسي',    domestic: true  },
  { id: 2,   key: 'دوري الأبطال',  name: 'دوري أبطال أوروبا', domestic: false },
  { id: 1,   key: 'كأس العالم',    name: 'كأس العالم',        domestic: false },
];
```
> Verify each `id` against your api-football plan and the **current season** (`season` param) —
> IDs are stable but the active season rolls over. `domestic:false` competitions (UCL, World Cup)
> have no single league table → they skip the top-5 filter (post all matches) and use the
> `group`/`knockout` cards for structure (§3, §3.1).

---

## 3. The top-5 filter (volume control) — leagues only

> Decision (locked): for **league** fixtures, **post a match's pre/post cards if EITHER team is
> currently in the top 5 of its league.** This keeps "a big club vs anyone" while dropping
> mid/low-table-only fixtures. **Cup (UCL / World Cup) fixtures are NOT filtered — post all.**

**Build a daily `TOP5` set** (one node, runs before fixtures are processed):
1. For each `domestic:true` league, call `GET /standings?league={id}&season={S}`.
2. Take the first 5 `team.id`s of each league's table.
3. Union them into a `Set<teamId>` → `TOP5`. Also keep `STANDINGS[leagueId] = rows` for the
   `standing`/`results` cards (you already pulled them).

**Filter a fixture** `f` (home `f.teams.home.id`, away `f.teams.away.id`):
- **League fixture** (`domestic:true`) → keep if `TOP5.has(home) || TOP5.has(away)`.
- **Cup fixture** (UCL / World Cup, `domestic:false`) → **always keep** (no top-5 gate). Volume
  is naturally limited (cups have far fewer matches than 6 league seasons combined).

Everything below assumes a fixture passed this filter.

### 3.1 Cup structure cards (instead of a league table)
Cups have no single standings table, so represent their state with:
- **Group stage** → one `group` card per group (`GET /standings?league={id}&season={S}` returns
  the groups; the top 2 of each are auto-tinted on the card). Post as a carousel on matchday.
- **Knockout phase** → one `knockout` card per round (Round of 16 / QF / SF / Final). Build the
  pairings from `GET /fixtures?league={id}&season={S}&round={roundName}`. Post on draw day and
  again with results filled in.

---

## 4. api-football endpoints (reference — `golazo-server` proxies these; n8n calls §1.5.1 paths)

For reference only: these are the upstream api-football endpoints that `golazo-server` wraps. n8n
calls the **`golazo-server` paths** in §1.5.1, not these. Listed so you can trace each card's
fields back to the api-football source.

| Need | Endpoint |
|------|----------|
| Standings / top-5 | `GET /standings?league={id}&season={S}` |
| Today's fixtures | `GET /fixtures?date={YYYY-MM-DD}&league={id}&season={S}` (loop leagues) or `&date=` + filter |
| Live/finished status | `GET /fixtures?id={fixtureId}` (status `FT`/`AET`/`PEN` = finished) |
| Match statistics | `GET /fixtures/statistics?fixture={fixtureId}` |
| Player ratings | `GET /fixtures/players?fixture={fixtureId}` (`player.rating`) |
| Events (goals/cards) | `GET /fixtures/events?fixture={fixtureId}` |
| Lineups (optional) | `GET /fixtures/lineups?fixture={fixtureId}` |

> **Logos (handled by the render service — n8n just passes URLs):** api-football returns logo
> **URLs** and `@resvg/resvg-js` can't fetch remote images, **but the render service now fetches +
> embeds them itself** (`src/logos.js`, cached in-memory per URL — one fetch per team ever). So
> **n8n simply passes the api-football logo URL** (`f.teams.home.logo`, etc.) — no base64 step
> needed. Used by `prematch`/`result` (`crest`, big) and by `fixtures`/`results` rows (small badge,
> as extra `… | homeLogo | awayLogo` cells). A missing/unreachable logo → dashed-shield (crest) or
> omitted (rows). A `data:` URI still works too if you ever pre-embed one.

---

## 5. Template payloads (exact field → source mapping)

All cards are rendered through the existing service. The **list/table templates take pipe- and
newline-delimited strings** — build them in a Code node. Field names below are authoritative
(see `src/templates.js`); never invent new ones.

### 5.1 `fixtures` — today's matches (1 card per league)
```
{ template:'fixtures', data:{
  date: 'الجمعة 12 أغسطس 2026',
  comp: league.name,
  // home | away | league | time | homeLogo | awayLogo   (logos = api-football URLs, optional)
  list: rows.map(f => `${f.home} | ${f.away} | ${league.key} | ${time} | ${f.homeLogo} | ${f.awayLogo}`).join('\n')  // ≤12 rows
}}
```

### 5.2 `standing` — league table (optional cover/extra slide)
```
{ template:'standing', data:{
  comp: league.name,
  rows: top.map(t => `${t.team} | ${t.played} | ${signed(t.goalsDiff)} | ${t.points}`).join('\n') // ≤8, ordered
}}   // rank is auto from row order — do NOT include a position column
```

### 5.2b `group` — cup group-stage table (1 card per group)
```
{ template:'group', data:{
  comp: 'دوري أبطال أوروبا',
  group: 'المجموعة A',
  rows: top.map(t => `${t.team} | ${t.played} | ${signed(t.goalsDiff)} | ${t.points}`).join('\n') // ≤6, ordered; top-2 auto-tinted
}}
```

### 5.2c `knockout` — cup draw / bracket (1 card per round)
```
{ template:'knockout', data:{
  comp: 'دوري أبطال أوروبا',
  round: 'ربع النهائي',
  list: pairs.map(p => `${p.home} | ${p.away}${p.score ? ' | ' + p.score : ''}`).join('\n')   // ≤8; score optional → shows "ضد"
}}
```

### 5.3 `prematch` — per match
```
{ template:'prematch', data:{
  comp, round, home, away,
  homeLogo: f.teams.home.logo, awayLogo: f.teams.away.logo,   // plain api-football URL; service embeds it
  date, time, stadium
}}
```

### 5.4 `result` — full-time (carousel slide 1)
```
{ template:'result', data:{
  comp, round, home, away, hs, as,                 // hs/as = goals (strings)
  homeLogo, awayLogo,
  homeEvents: 'ميتروفيتش 23\nمالكوم 56',           // one event/line; from /events filtered by team
  awayEvents: 'رونالدو 90+2\nبطاقة حمراء: تيليس 70'
}}
```

### 5.5 `matchstats` — statistics (carousel slide 2)
```
{ template:'matchstats', data:{
  home, away, score: `${hs} - ${as}`,
  stats: 'الاستحواذ % | 58 | 42\nالتسديدات | 14 | 9\n...'   // label | home | away, ≤7 rows
}}   // map api-football statistic types → Arabic labels in a lookup table
```

### 5.6 `ratings` — player ratings (carousel slide 3)
```
{ template:'ratings', data:{
  team: `${home} أمام ${away} — تقييمات الأداء`,
  list: 'سالم الدوسري | 8.7\nميتروفيتش | 8.1\n...'          // name | rating, ≤11, sort desc, drop null ratings
}}
```

### 5.7 `results` — end-of-day results (1 card per league)
```
{ template:'results', data:{
  date, comp: league.name,
  // home | away | score | note | homeLogo | awayLogo
  list: rows.map(f => `${f.home} | ${f.away} | ${f.hs} - ${f.as} | ${league.key} | ${f.homeLogo} | ${f.awayLogo}`).join('\n')  // ≤10
}}
```

---

## 6. Rendering & publishing (reuse the existing nodes)

- **Singles** (`prematch`): `POST /render-url` → `{ url }` → Buffer `create_post` with that image.
- **Carousels** (`fixtures`+`standing`, post-match trio, `results`): `POST /render-roundup`
  with `{ items:[{template,data}, ...] }` → `{ urls }` → Buffer carousel. (No `cover` needed
  here; pass the cards directly as `items`. Max 12 items/call.)
- Send `x-golazo-token` header if `RENDER_TOKEN` is set on Railway.
- **Captions + hashtags**: same per-platform logic as NEWS (X ~2, FB ~3, IG ~12; `#Golazo`
  always). Add competition/derby tags (e.g. `#الهلال_النصر`, `#دوري_روشن`).

---

## 7. Approvals & caps

- **No approval:** `fixtures` (morning), `prematch` — low risk, time-sensitive.
- **Inline Telegram approval** (reuse the roundup "Send and Wait for Response" node): post-match
  carousel and end-of-day `results` — these are editorial summaries worth a glance before posting.
- **Caps / anti-burst:** keep the strategy's 6/day/platform + 30-min spacing. Pre-match posts
  can cluster on a heavy matchday — queue them through Buffer's schedule rather than posting all
  at once. Track posted `fixtureId`s (Postgres, like `roundup_news`) to avoid double-posting a
  match's pre/post cards.

---

## 8. Scheduling summary (n8n Cron triggers, Riyadh tz)

| Cron | Workflow |
|------|----------|
| `0 8 * * *` | Build TOP5/STANDINGS → today's `fixtures` carousel (+ optional `standing`) |
| `*/15 * * * *` (matchday window) | Poll fixtures: 3h-before → `prematch`; status→FT → post-match carousel |
| `30 23 * * *` | End-of-day `results` carousel (per league) → Telegram approval → Buffer |

> Simpler alternative to the 15-min poll: one node in the morning reads the day's kickoff times
> and schedules exact `prematch` / full-time check times via Buffer/Wait nodes.

---

## 9. Open items / revisit later

- World Cup national-team logos (flags) — pass the api-football URL like club crests.
- Logo cache is in-memory per process (cleared on redeploy, re-fetched on demand); fine at this
  scale. Move to disk/object storage only if cold-start fetch latency becomes an issue.
- `lineup` template (not built) if you want pre-match XI cards.
- Logo base64 caching (one fetch/team/day) to avoid re-downloading crests.
- Per-league season rollover automation for the `season` param.
