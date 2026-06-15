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

## 4. api-football endpoints used

| Need | Endpoint |
|------|----------|
| Standings / top-5 | `GET /standings?league={id}&season={S}` |
| Today's fixtures | `GET /fixtures?date={YYYY-MM-DD}&league={id}&season={S}` (loop leagues) or `&date=` + filter |
| Live/finished status | `GET /fixtures?id={fixtureId}` (status `FT`/`AET`/`PEN` = finished) |
| Match statistics | `GET /fixtures/statistics?fixture={fixtureId}` |
| Player ratings | `GET /fixtures/players?fixture={fixtureId}` (`player.rating`) |
| Events (goals/cards) | `GET /fixtures/events?fixture={fixtureId}` |
| Lineups (optional) | `GET /fixtures/lineups?fixture={fixtureId}` |

> **Logos:** api-football returns logo **URLs**, but `@resvg/resvg-js` does **not** fetch
> remote images — `crest()` only embeds `data:` URIs. So for `prematch`/`result`, n8n must
> **download each logo and base64-encode it** (HTTP Request node → "Move Binary Data"/Code node
> → `data:image/png;base64,...`) before putting it in `homeLogo`/`awayLogo`. If you skip this,
> the card still renders fine with the dashed-shield placeholder.

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
  list: rows.map(f => `${f.home} | ${f.away} | ${league.key} | ${time}`).join('\n')  // ≤12 rows
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
  homeLogo: dataUri||'', awayLogo: dataUri||'',   // base64 data: URI or empty
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
  list: rows.map(f => `${f.home} | ${f.away} | ${f.hs} - ${f.as} | ${league.key}`).join('\n')  // ≤10
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

- World Cup national-team logos (flags) — same data:-URI rule as club crests.
- `lineup` template (not built) if you want pre-match XI cards.
- Logo base64 caching (one fetch/team/day) to avoid re-downloading crests.
- Per-league season rollover automation for the `season` param.
