# MATCH pipeline — n8n build guide (PREVIEW phase)

Step-by-step n8n build for every MATCH workflow, in the **same n8n dashboard** as the roundup.
**Preview phase:** each workflow ends at a **Telegram album/photo** — no Buffer, no approval.
Design rationale + filter rules live in `MATCH-pipeline.md`; this file is the click-by-click build.

## Placeholders (fill these in)
- **A** = golazo-server URL → `https://golazo-server-production.up.railway.app`
- **B** = render service URL → `https://<your-golazo-engine>.up.railway.app`
- **C** = Telegram bot token (same bot as the roundup)
- **D** = Telegram chat id (same chat as the roundup preview)
- **E** = `RENDER_TOKEN` (only if set on the render service)

n8n gotcha (recurring): in expression (`fx`) fields type `{{ … }}` **without** a leading `=`.

---

## Shared league config (used by the Code nodes)
```js
const LEAGUES = { 307:'روشن', 39:'البريميرليغ', 140:'الليغا', 135:'السيري آ', 78:'البوندسليغا', 61:'الليغ 1', 2:'دوري الأبطال', 1:'كأس العالم' };
const NAME    = { 307:'دوري روشن السعودي', 39:'الدوري الإنجليزي', 140:'الدوري الإسباني', 135:'الدوري الإيطالي', 78:'الدوري الألماني', 61:'الدوري الفرنسي', 2:'دوري أبطال أوروبا', 1:'كأس العالم' };
const DOMESTIC = new Set([307,39,140,135,78,61]);   // leagues (top-5 filter applies); cups (2,1) post all
```

## Shared TAIL ① — "render carousel + preview" (most workflows)
Append after any node that outputs `{ items: [ {template,data}, … ] }`.
- **HTTP Request "render-roundup"** — POST `B/render-roundup`, Send Body ON, Body **Using JSON** = `{{ $json }}`, header `x-golazo-token`=`E` (if used). → returns `{ urls }`.
- **Code "Build album"** (Run Once for All Items):
  ```js
  const urls = $json.urls || [];
  if (!urls.length) return [];
  return [{ json: { chat_id: 'D', media: urls.slice(0,10).map((u,i)=>({
    type:'photo', media:u, ...(i===0?{caption:'CAPTION'}:{}) })) } }];
  ```
- **HTTP Request "sendMediaGroup"** — POST `https://api.telegram.org/botC/sendMediaGroup`, Body **Using JSON** = `{{ $json }}`.

## Shared TAIL ② — "single photo preview" (pre-match singles, optional)
- **HTTP "render-url"** — POST `B/render-url`, Body Using JSON = `{{ $json }}` → `{ url }`.
- **HTTP "sendPhoto"** — POST `https://api.telegram.org/botC/sendPhoto`, Body Using JSON = `{{ {chat_id:'D', photo:$json.url, caption:'…'} }}`.

---

## Workflow 1 — Today's Fixtures ✅ (built)
`Schedule 0 8 * * * → GET A/fixtures/today → Code(build) → TAIL ①`. Code node:
```js
const LEAGUES = { 307:'روشن',39:'البريميرليغ',140:'الليغا',135:'السيري آ',78:'البوندسليغا',61:'الليغ 1',2:'دوري الأبطال',1:'كأس العالم' };
const NAME    = { 307:'دوري روشن السعودي',39:'الدوري الإنجليزي',140:'الدوري الإسباني',135:'الدوري الإيطالي',78:'الدوري الألماني',61:'الدوري الفرنسي',2:'دوري أبطال أوروبا',1:'كأس العالم' };
const fixtures = $json.response || [];
const dateLabel = new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Riyadh'});
const byLeague = {};
for (const f of fixtures) {
  const lid=f.league.id; if(!LEAGUES[lid]) continue;
  const time=new Date(f.fixture.date).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Riyadh'});
  (byLeague[lid] ??= []).push(`${f.teams.home.name} | ${f.teams.away.name} | ${LEAGUES[lid]} | ${time} | ${f.teams.home.logo} | ${f.teams.away.logo}`);
}
const items=Object.entries(byLeague).filter(([,r])=>r.length).map(([lid,rows])=>({template:'fixtures',data:{date:dateLabel,comp:NAME[lid],list:rows.slice(0,12).join('\n')}}));
if(!items.length) return [];
return [{ json:{ items } }];
```

---

## Workflow 2 — Today's Results  (twin of #1)
`Schedule 30 23 * * * (Asia/Riyadh) → GET A/fixtures/today → Code(build) → TAIL ①` (caption `نتائج اليوم ⚽`).
Code node — keep only **finished** matches, include the score:
```js
const LEAGUES = { 307:'روشن',39:'البريميرليغ',140:'الليغا',135:'السيري آ',78:'البوندسليغا',61:'الليغ 1',2:'دوري الأبطال',1:'كأس العالم' };
const NAME    = { 307:'دوري روشن السعودي',39:'الدوري الإنجليزي',140:'الدوري الإسباني',135:'الدوري الإيطالي',78:'الدوري الألماني',61:'الدوري الفرنسي',2:'دوري أبطال أوروبا',1:'كأس العالم' };
const FINISHED = new Set(['FT','AET','PEN']);
const fixtures = $json.response || [];
const dateLabel = new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Riyadh'});
const byLeague = {};
for (const f of fixtures) {
  const lid=f.league.id; if(!LEAGUES[lid]) continue;
  if(!FINISHED.has(f.fixture.status.short)) continue;       // played matches only
  const score=`${f.goals.home} - ${f.goals.away}`;
  (byLeague[lid] ??= []).push(`${f.teams.home.name} | ${f.teams.away.name} | ${score} | ${LEAGUES[lid]} | ${f.teams.home.logo} | ${f.teams.away.logo}`);
}
const items=Object.entries(byLeague).filter(([,r])=>r.length).map(([lid,rows])=>({template:'results',data:{date:dateLabel,comp:NAME[lid],list:rows.slice(0,10).join('\n')}}));
if(!items.length) return [];
return [{ json:{ items } }];
```

---

## Workflow 3 — League Standings  (per-league loop)
`Schedule → Code "Leagues" → HTTP /standings per league → Code "Build standing" → Code "Assemble" → TAIL ①` (caption `ترتيب الدوريات 📊`).

- **Code "Leagues"** (Run Once for All Items) — one item per DOMESTIC league:
  ```js
  const NAME={307:'دوري روشن السعودي',39:'الدوري الإنجليزي',140:'الدوري الإسباني',135:'الدوري الإيطالي',78:'الدوري الألماني',61:'الدوري الفرنسي'};
  const SEASON=2025;
  return Object.keys(NAME).map(id=>({json:{id:Number(id),name:NAME[id],season:SEASON}}));
  ```
- **HTTP "standings"** (runs per item) — GET `A/standings/{{ $json.id }}?season={{ $json.season }}`; Settings → **Include Other Input Fields** ON.
- **Code "Build standing"** (Run Once for **Each** Item):
  ```js
  const L=$('Leagues').item.json;
  const data=$json.response||[];
  const table=(((data[0]||{}).league||{}).standings||[])[0]||[];
  if(!table.length) return [];
  const rows=table.slice(0,8).map(t=>`${t.team.name} | ${t.all.played} | ${t.goalsDiff>=0?'+':''}${t.goalsDiff} | ${t.points}`);
  return [{ json:{ template:'standing', data:{ comp:L.name, rows:rows.join('\n') } } }];
  ```
- **Code "Assemble"** (Run Once for All Items):
  ```js
  const items=$input.all().map(i=>i.json);
  if(!items.length) return [];
  return [{ json:{ items } }];
  ```

---

## Workflow 4 — Pre-match  (top-5 filter)
Builds the TOP5 set from standings, then posts a pre-match card for each qualifying match today.
`Schedule 0 9 * * * → Code "Domestic" → HTTP /standings per league → Code "Collect TOP5" → HTTP /fixtures/today → Code "Build prematch" → TAIL ①` (caption `مباريات اليوم — قبل الانطلاق ⚽`).

- **Code "Domestic"** — one item per domestic league (same as WF3 "Leagues").
- **HTTP "standings"** — GET `A/standings/{{ $json.id }}?season={{ $json.season }}` (Include Other Input Fields ON).
- **Code "Collect TOP5"** (Run Once for All Items) — union of each table's top 5 team ids:
  ```js
  const ids=[];
  for(const it of $input.all()){
    const table=((((it.json.response||[])[0]||{}).league||{}).standings||[])[0]||[];
    for(const t of table.slice(0,5)) ids.push(t.team.id);
  }
  return [{ json:{ top5: ids } }];
  ```
- **HTTP "fixtures/today"** — GET `A/fixtures/today`.
- **Code "Build prematch"** (Run Once for All Items):
  ```js
  const NAME={307:'دوري روشن السعودي',39:'الدوري الإنجليزي',140:'الدوري الإسباني',135:'الدوري الإيطالي',78:'الدوري الألماني',61:'الدوري الفرنسي',2:'دوري أبطال أوروبا',1:'كأس العالم'};
  const DOMESTIC=new Set([307,39,140,135,78,61]);
  const top5=new Set($('Collect TOP5').first().json.top5 || []);
  const fixtures=$json.response||[];
  const items=[];
  for(const f of fixtures){
    const lid=f.league.id; if(!NAME[lid]) continue;
    const keep = DOMESTIC.has(lid) ? (top5.has(f.teams.home.id)||top5.has(f.teams.away.id)) : true; // cups: all
    if(!keep) continue;
    const date=new Date(f.fixture.date).toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Riyadh'});
    const time=new Date(f.fixture.date).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Riyadh'});
    items.push({ template:'prematch', data:{
      comp:NAME[lid], round:f.league.round||'', home:f.teams.home.name, away:f.teams.away.name,
      homeLogo:f.teams.home.logo, awayLogo:f.teams.away.logo, date, time,
      stadium:(f.fixture.venue && f.fixture.venue.name) || ''
    }});
  }
  if(!items.length) return [];
  return [{ json:{ items } }];
  ```
> Preview shortcut: this posts all of today's qualifying matches as one carousel. The eventual
> version fires per match ~3h before kickoff as a **single** (TAIL ②) — add a time check on
> `f.fixture.date` and a `posted_matches` dedup then.

---

## Workflow 5 — Post-match carousel  (per finished match)
One carousel per finished qualifying match: `result` (+ `matchstats`, `ratings` when the data exists).
`Schedule evening → HTTP /fixtures/today → Code "Pick finished" → Loop Over Items → [HTTP events (+stats,+players)] → Code "Build match carousel" → TAIL ①`.

- **HTTP "fixtures/today"** — GET `A/fixtures/today`.
- **Code "Pick finished"** (Run Once for All Items) — finished + our-league + (top5 or cup); one item per match:
  ```js
  const NAME={307:'دوري روشن السعودي',39:'الدوري الإنجليزي',140:'الدوري الإسباني',135:'الدوري الإيطالي',78:'الدوري الألماني',61:'الدوري الفرنسي',2:'دوري أبطال أوروبا',1:'كأس العالم'};
  const FINISHED=new Set(['FT','AET','PEN']);
  const fixtures=$json.response||[];
  return fixtures.filter(f=>NAME[f.league.id] && FINISHED.has(f.fixture.status.short)).map(f=>({ json:{
    fixtureId:f.fixture.id, comp:NAME[f.league.id], round:f.league.round||'',
    home:f.teams.home.name, away:f.teams.away.name,
    homeId:f.teams.home.id, awayId:f.teams.away.id,
    homeLogo:f.teams.home.logo, awayLogo:f.teams.away.logo,
    hs:String(f.goals.home), as:String(f.goals.away)
  }}));
  ```
- **Loop Over Items** (Split In Batches, batch size 1) → inside the loop:
  - **HTTP "events"** — GET `A/fixtures/{{ $json.fixtureId }}/events` (Include Other Input Fields ON).
  - *(Pro plan)* **HTTP "statistics"** — GET `A/fixtures/{{ $json.fixtureId }}/statistics`.
  - *(Pro plan)* **HTTP "players"** — GET `A/fixtures/{{ $json.fixtureId }}/players`.
  - **Code "Build match carousel"** (Run Once for Each Item) — `result` always; the others only if data:
    ```js
    const m=$('Pick finished').item.json;                 // match context
    const events=$json.response||[];                      // from HTTP "events"
    const lines=(teamId)=>events
      .filter(e=>e.team.id===teamId && (e.type==='Goal' || (e.type==='Card'&&e.detail==='Red Card')))
      .map(e=>{ const t=e.time.elapsed+(e.time.extra?'+'+e.time.extra:'');
        return e.type==='Goal' ? `${e.player.name} ${t}` : `بطاقة حمراء: ${e.player.name} ${t}`; });

    const items=[{ template:'result', data:{
      comp:m.comp, round:m.round, home:m.home, away:m.away, hs:m.hs, as:m.as,
      homeLogo:m.homeLogo, awayLogo:m.awayLogo,
      homeEvents:lines(m.homeId).join('\n'), awayEvents:lines(m.awayId).join('\n')
    }}];

    // --- Pro plan: uncomment once /statistics + /players return data ---
    // const STAT_AR={'Ball Possession':'الاستحواذ %','Total Shots':'التسديدات','Shots on Goal':'على المرمى','Corner Kicks':'الركنيات','Fouls':'الأخطاء','expected_goals':'xG'};
    // const stats=$('statistics').item.json.response||[];
    // if(stats.length===2){
    //   const get=(side,type)=>{const s=(stats[side].statistics||[]).find(x=>x.type===type);return s? (s.value??''):'';};
    //   const rows=Object.entries(STAT_AR).map(([t,ar])=>`${ar} | ${get(0,t)} | ${get(1,t)}`).filter(r=>!r.endsWith('|  | '));
    //   if(rows.length) items.push({template:'matchstats',data:{home:m.home,away:m.away,score:`${m.hs} - ${m.as}`,stats:rows.join('\n')}});
    // }
    // const pteams=$('players').item.json.response||[];
    // const players=[];
    // for(const t of pteams) for(const p of (t.players||[])){const r=p.statistics?.[0]?.games?.rating; if(r) players.push(`${p.player.name} | ${r}`);}
    // players.sort((a,b)=>parseFloat(b.split('|')[1])-parseFloat(a.split('|')[1]));
    // if(players.length) items.push({template:'ratings',data:{team:`${m.home} أمام ${m.away} — تقييمات الأداء`,list:players.slice(0,11).join('\n')}});

    return [{ json:{ items } }];
    ```
  - **TAIL ①** inside the loop (one album per match), caption `${m.home} ضد ${m.away} — انتهت المباراة`.
> Free plan: you'll usually get just the `result` card — that's expected. The matchstats/ratings
> block is pre-written; uncomment it when Pro makes those endpoints return data.

---

## Workflow 6 — Cup structure (group + knockout)
Run on draw/matchday for the cups (UCL=2, World Cup=1).

### 6a — Group stage
`Schedule → Code "Cups" → HTTP /standings per cup → Code "Build groups" → TAIL ①`.
- **Code "Cups"**: `return [{json:{id:2,name:'دوري أبطال أوروبا',season:2025}},{json:{id:1,name:'كأس العالم',season:2026}}];`
- **HTTP "standings"** — GET `A/standings/{{ $json.id }}?season={{ $json.season }}` (Include Other Input Fields ON).
- **Code "Build groups"** (Run Once for **Each** Item) — one `group` card per group:
  ```js
  const L=$('Cups').item.json;
  const groups=((($json.response||[])[0]||{}).league||{}).standings||[];   // array of groups
  const out=[];
  for(const g of groups){
    if(!g.length) continue;
    const label=(g[0].group||'').replace(/^.*Group/i,'المجموعة').trim() || 'المجموعة';
    const rows=g.slice(0,6).map(t=>`${t.team.name} | ${t.all.played} | ${t.goalsDiff>=0?'+':''}${t.goalsDiff} | ${t.points}`);
    out.push({ template:'group', data:{ comp:L.name, group:label, rows:rows.join('\n') } });
  }
  return out.map(json=>({ json }));   // many group cards (carousel)
  ```
  *(Assemble into `{items}` with the WF3 "Assemble" node, then TAIL ①.)*

### 6b — Knockout bracket
`Schedule → Code "Cups" → HTTP /fixtures/league/:id → Code "Build knockout" → TAIL ①`.
- **HTTP "fixtures"** — GET `A/fixtures/league/{{ $json.id }}?season={{ $json.season }}` (Include Other Input Fields ON).
- **Code "Build knockout"** (Run Once for **Each** Item) — group fixtures by round, card per knockout round:
  ```js
  const L=$('Cups').item.json;
  const fixtures=$json.response||[];
  const KO=f=>/(Final|Semi|Quarter|Round of|16|8)/i.test(f.league.round||'');
  const byRound={};
  for(const f of fixtures.filter(KO)){
    (byRound[f.league.round] ??= []).push(
      `${f.teams.home.name} | ${f.teams.away.name}` +
      (f.goals.home!=null ? ` | ${f.goals.home} - ${f.goals.away}` : '')
    );
  }
  const AR={'Final':'النهائي','Semi-finals':'نصف النهائي','Quarter-finals':'ربع النهائي','Round of 16':'دور الـ16'};
  return Object.entries(byRound).map(([round,pairs])=>({ json:{
    template:'knockout', data:{ comp:L.name, round:AR[round]||round, list:pairs.slice(0,8).join('\n') }
  }}));
  ```
  *(Assemble → TAIL ①.)*

---

## Notes
- **Logos:** pass the plain api-football URL (`f.teams.*.logo`); the render service fetches + embeds.
  Fixtures/results rows take `… | homeLogo | awayLogo`; prematch/result take `homeLogo`/`awayLogo`.
- **Season** rolls over yearly — bump the `SEASON`/`season` constants (Saudi+European = 2025; World Cup = 2026).
- **`round` strings** from api-football are English (e.g. "Regular Season - 24"); translate in the Code
  node if you want Arabic, or leave as-is for now.
- **Standings/group logos:** not shown yet (5-column table is tight). Ask if you want a logo column added.
- **Go-live:** when a workflow's cards look right, replace TAIL ① with the roundup's Buffer tail
  (and re-add the Send-and-Wait approval where `MATCH-pipeline.md §1` marks "inline Telegram").
