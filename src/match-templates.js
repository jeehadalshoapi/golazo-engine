/**
 * match-templates.js — the MATCH pipeline cards (api-football → render → Buffer).
 * Native-SVG ports of the Studio bodies (the Studio versions use <foreignObject>,
 * which resvg drops — so the text layer here is rewritten as native <text>).
 *
 * Two competition kinds:
 *   - Leagues  → `standing` table; per-match cards gated by a top-5 filter.
 *   - Cups (UCL / World Cup) → `group` tables + `knockout` pairings; ALL matches
 *     posted (every cup match is important). See MATCH-pipeline.md.
 */
const { C, W, esc, has, arBox, arBlock, arText, strW, blockTitle, crest, rowLogo, compTitle, cells, listRows, tableRows } = require('./svg-helpers');

module.exports = {
  // League table (already ordered top→down; rank is derived from row order).
  // rows: one team per line — "team | played | GD | pts | logo?". Shows the TOP 10
  // and (after a dashed gap) the BOTTOM 3; rank chips are green for the top 3 and
  // red for the bottom 3. Small leagues (≤13 teams) just show everyone.
  standing: {
    name: 'ترتيب الدوري',
    fields: ['comp', 'compLogo', 'rows'],
    content: d => {
      const all = listRows(d.rows, 30);
      const total = all.length, TOPN = 10, BOT = 3;
      let shown = all, ranks = all.map((_, i) => i + 1), splitAfter = 0;
      if (total > TOPN + BOT) {
        const tops = all.slice(0, TOPN), bots = all.slice(total - BOT);
        shown = tops.concat(bots);
        ranks = tops.map((_, i) => i + 1).concat(bots.map((_, k) => total - BOT + 1 + k));
        splitAfter = TOPN;
      }
      return `
    <rect x="350" y="158" width="380" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(350, 158, 380, 72, 'ترتيب الدوري', 900, 34, C.yellow)}
    ${compTitle(540, 278, d.comp, d.compLogo, 40, C.navy)}
    ${tableRows(shown, 350, 930, { headerY: 335, ranks, splitAfter, promo: 3, releg: 3, totalTeams: total })}`;
    }
  },

  // Group-stage table (UCL / World Cup). Same table, group-labelled, top-2 tinted.
  // rows: "team | played | GD | pts" (≤6). One card per group → carousel.
  group: {
    name: 'دور المجموعات',
    fields: ['comp', 'compLogo', 'group', 'rows'],
    content: d => `
    ${has(d.compLogo) ? rowLogo(540, 178, d.compLogo, 44) : arBox(80, 152, 920, 52, d.comp || 'دور المجموعات', 800, 32, C.navy)}
    <rect x="380" y="236" width="320" height="60" rx="12" fill="${C.yellow}"/>
    ${arBox(380, 236, 320, 60, d.group || 'المجموعة', 900, 38, C.navy)}
    ${tableRows(listRows(d.rows, 6), 420, 930, { headerY: 405, maxGap: 84, maxFs: 34, fsMul: 0.40, highlight: 2 })}`
  },

  // Knockout draw / bracket — pairings for one round. ALL cup matches matter.
  // list: "home | away | score? | homeLogo? | awayLogo?" per line (score optional →
  // shows "ضد"). Teams show as their CREST (logo); falls back to the name if no logo.
  knockout: {
    name: 'الأدوار الإقصائية',
    fields: ['comp', 'compLogo', 'round', 'list'],
    content: d => {
      const rows = listRows(d.list, 8);
      const top = 360, bottom = 930, gap = Math.min(104, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(22, Math.min(34, Math.floor(gap * 0.32)));
      const lr = Math.min(48, Math.round(gap * 0.38));
      let body = '';
      rows.forEach((r, i) => {
        const c = cells(r);
        const home = c[0] || '', away = c[1] || '', score = c[2] || '', homeLogo = c[3] || '', awayLogo = c[4] || '';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.34).toFixed(1);
        body += `<rect x="120" y="${(y + 6).toFixed(0)}" width="840" height="${(gap - 12).toFixed(0)}" rx="12" fill="${C.navy}" opacity="0.05"/>`;
        // bracket tick on the right edge of each pairing
        body += `<path d="M970 ${(y + 14).toFixed(0)} h14 V ${(y + gap - 14).toFixed(0)} h-14" fill="none" stroke="${C.navy}" stroke-width="3" opacity="0.5"/>`;
        const mid = has(score) ? score : 'ضد';
        const sw = Math.max(96, strW(mid, fs) + 34);
        body += `<rect x="${(540 - sw / 2).toFixed(0)}" y="${(cy - gap * 0.22).toFixed(0)}" width="${sw.toFixed(0)}" height="${(gap * 0.44).toFixed(0)}" rx="8" fill="${C.yellow}"/>`;
        body += `<text x="540" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}">${esc(mid)}</text>`;
        // home on the right, away on the left (RTL) — crest if available, else name
        body += has(homeLogo) ? rowLogo(735, cy, homeLogo, lr) : arBox(560, cy - gap / 2, 350, gap, home, 800, fs, C.navy);
        body += has(awayLogo) ? rowLogo(345, cy, awayLogo, lr) : arBox(170, cy - gap / 2, 350, gap, away, 800, fs, C.navy);
      });
      return `
    <rect x="330" y="150" width="420" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(330, 150, 420, 72, 'الأدوار الإقصائية', 900, 32, C.yellow)}
    ${compTitle(540, 261, [d.comp, d.round].filter(has).join('   ·   '), d.compLogo, 34, C.navy)}
    ${body}`;
    }
  },

  // Full knockout bracket TREE in one image (two-sided: rounds converge to the
  // center final). data.rounds = ordered first→last (last = final), each
  // { title, matches:[{home,away,hs?,as?}] }; matches in bracket order (top→bottom,
  // first half feeds the left side). Optional data.champion. Adapts to bracket size
  // (UCL R16 = 16 teams is comfy; World Cup R32 = 32 is dense — feed it from R16 if so).
  bracket: {
    name: 'شجرة الأدوار الإقصائية',
    fields: ['comp', 'compLogo', 'rounds', 'champion'],
    content: d => {
      const rounds = Array.isArray(d.rounds)
        ? d.rounds.filter(r => r && Array.isArray(r.matches) && r.matches.length)
        : [];
      const header = `
    <rect x="340" y="150" width="400" height="64" rx="32" fill="${C.navy}"/>
    ${arBox(340, 150, 400, 64, 'الأدوار الإقصائية', 900, 32, C.yellow)}
    ${compTitle(540, 243, d.comp, d.compLogo, 34, C.navy)}`;
      if (!rounds.length) return header + arBox(80, 430, 920, 160, 'لا توجد مباريات', 700, 40, '#7a8a74');

      const R = rounds.length;                  // last round = final (center column)
      const M = 44, topY = 300, botY = 944;
      const totalCols = 2 * (R - 1) + 1;
      const colW = (W - 2 * M) / totalCols;
      const colCx = k => M + colW * (k + 0.5);

      // split each non-final round into left / right halves (first half → left)
      const L = [], Rt = [];
      for (let j = 0; j < R - 1; j++) {
        const ms = rounds[j].matches;
        const half = Math.ceil(ms.length / 2);
        L[j] = ms.slice(0, half).map(m => ({ m }));
        Rt[j] = ms.slice(half).map(m => ({ m }));
      }
      // y centers: round 0 evenly spaced, later rounds = midpoint of their two feeders
      const space = arr => {
        const n = arr.length || 1, gap = (botY - topY) / n;
        arr.forEach((o, i) => { o.cy = topY + gap * (i + 0.5); });
        return gap;
      };
      const gap0 = Math.max(space(L[0] || []), space(Rt[0] || []));
      for (let j = 1; j < R - 1; j++) {
        [L, Rt].forEach(side => {
          (side[j] || []).forEach((o, i) => {
            const a = side[j - 1][2 * i], b = side[j - 1][2 * i + 1];
            o.cy = (a && b) ? (a.cy + b.cy) / 2 : (a || b || { cy: (topY + botY) / 2 }).cy;
          });
        });
      }
      const finalM = rounds[R - 1].matches[0];
      const lLast = (L[R - 2] || [])[0], rLast = (Rt[R - 2] || [])[0];
      const finalCy = (lLast && rLast) ? (lLast.cy + rLast.cy) / 2 : (topY + botY) / 2;

      const boxH = Math.max(28, Math.min(72, gap0 * 0.66));
      const bw = colW - 14;
      const fs = Math.max(10, Math.min(17, Math.floor(boxH * 0.26)));
      const line = (x1, y1, x2, y2) =>
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.navy}" stroke-width="1.4" opacity="0.4"/>`;

      let body = '';
      const drawBox = (cx, cy, m) => {
        const x = cx - bw / 2, y = cy - boxH / 2, rh = boxH / 2;
        // winner (advancing team) gets a yellow row tint so the path is traceable
        const hn = parseFloat(m.hs), an = parseFloat(m.as);
        const hWin = !isNaN(hn) && !isNaN(an) && hn > an, aWin = !isNaN(hn) && !isNaN(an) && an > hn;
        body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${boxH.toFixed(1)}" rx="6" fill="#ffffff" stroke="${C.navy}" stroke-width="1.4"/>`;
        if (hWin) body += `<rect x="${(x + 1.5).toFixed(1)}" y="${(y + 1.5).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${(rh - 1.5).toFixed(1)}" rx="5" fill="${C.yellow}" opacity="0.45"/>`;
        if (aWin) body += `<rect x="${(x + 1.5).toFixed(1)}" y="${(y + rh).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${(rh - 1.5).toFixed(1)}" rx="5" fill="${C.yellow}" opacity="0.45"/>`;
        body += `<line x1="${x.toFixed(1)}" y1="${(y + rh).toFixed(1)}" x2="${(x + bw).toFixed(1)}" y2="${(y + rh).toFixed(1)}" stroke="${C.navy}" stroke-width="0.8" opacity="0.25"/>`;
        // CREST-ONLY: logo (left) + score (right). Short name only if a logo is missing.
        const lr2 = Math.max(8, Math.min(Math.round(rh * 0.42), Math.round(bw * 0.2)));
        const sfs = Math.max(11, Math.min(22, Math.floor(rh * 0.52)));
        const row = (cyRow, logo, name, score, win) => {
          let s = '';
          if (has(logo)) s += rowLogo(x + 8 + lr2, cyRow, logo, lr2);
          else s += arText(x + 8, cyRow - rh / 2, bw * 0.6, rh, (name || '').slice(0, 12), win ? 900 : 700, Math.min(fs, 13), C.navy, { align: 'left', valign: 'center', minSize: 9, lh: 1.0 });
          if (has(score)) s += `<text x="${(x + bw - 8).toFixed(1)}" y="${(cyRow + sfs * 0.34).toFixed(1)}" text-anchor="end" font-family="Anton" font-size="${sfs}" fill="${win ? C.navy : '#3a5a33'}">${esc(score)}</text>`;
          return s;
        };
        body += row(y + rh / 2, m.homeLogo, m.home, m.hs, hWin);
        body += row(y + rh + rh / 2, m.awayLogo, m.away, m.as, aWin);
      };
      // connector elbow: two children in column jChild → one parent in next column toward center
      const connect = (children, parents, jChild, side) => {
        const childCol = side === 'L' ? jChild : totalCols - 1 - jChild;
        const parentCol = side === 'L' ? jChild + 1 : totalCols - 1 - (jChild + 1);
        const dir = side === 'L' ? 1 : -1;
        const childEdge = colCx(childCol) + dir * bw / 2;
        const parentEdge = colCx(parentCol) - dir * bw / 2;
        const midX = (childEdge + parentEdge) / 2;
        parents.forEach((p, i) => {
          const a = children[2 * i], b = children[2 * i + 1];
          if (a) body += line(childEdge, a.cy, midX, a.cy);
          if (b) body += line(childEdge, b.cy, midX, b.cy);
          if (a && b) body += line(midX, a.cy, midX, b.cy);
          body += line(midX, p.cy, parentEdge, p.cy);
        });
      };

      // connectors first (boxes drawn on top)
      for (let j = 0; j < R - 2; j++) { connect(L[j], L[j + 1], j, 'L'); connect(Rt[j], Rt[j + 1], j, 'R'); }
      // semifinal → final (center)
      if (R >= 2) {
        const cxC = colCx(R - 1);
        if (lLast) { const e = colCx(R - 2) + bw / 2, pe = cxC - bw / 2, mx = (e + pe) / 2;
          body += line(e, lLast.cy, mx, lLast.cy) + line(mx, lLast.cy, mx, finalCy) + line(mx, finalCy, pe, finalCy); }
        if (rLast) { const e = colCx(totalCols - R) - bw / 2, pe = cxC + bw / 2, mx = (e + pe) / 2;
          body += line(e, rLast.cy, mx, rLast.cy) + line(mx, rLast.cy, mx, finalCy) + line(mx, finalCy, pe, finalCy); }
      }
      // round labels
      let labels = '';
      for (let j = 0; j < R - 1; j++) {
        const t = esc(rounds[j].title || '');
        labels += `<text x="${colCx(j).toFixed(1)}" y="288" text-anchor="middle" font-family="Cairo" font-weight="800" font-size="15" fill="#3a5a33">${t}</text>`;
        labels += `<text x="${colCx(totalCols - 1 - j).toFixed(1)}" y="288" text-anchor="middle" font-family="Cairo" font-weight="800" font-size="15" fill="#3a5a33">${t}</text>`;
      }
      labels += `<text x="${colCx(R - 1).toFixed(1)}" y="288" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="16" fill="${C.navy}">${esc(rounds[R - 1].title || 'النهائي')}</text>`;
      // boxes
      for (let j = 0; j < R - 1; j++) {
        (L[j] || []).forEach(o => drawBox(colCx(j), o.cy, o.m));
        (Rt[j] || []).forEach(o => drawBox(colCx(totalCols - 1 - j), o.cy, o.m));
      }
      drawBox(colCx(R - 1), finalCy, finalM);
      // champion ribbon under the final
      let champ = '';
      if (has(d.champion)) {
        const cx = colCx(R - 1), y = finalCy + boxH / 2 + 12;
        champ = `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="36" rx="8" fill="${C.yellow}"/>` +
          arBox(cx - bw / 2, y, bw, 36, d.champion, 900, fs + 2, C.navy);
      }
      return header + labels + body + champ;
    }
  },

  // Pre-match poster. comp/round + the two teams + kickoff. Logos via data: URI only.
  prematch: {
    name: 'قبل المباراة',
    fields: ['comp', 'compLogo', 'round', 'home', 'away', 'homeLogo', 'awayLogo', 'date', 'time', 'stadium'],
    content: d => `
    ${blockTitle('MATCH', 'DAY')}
    ${has(d.compLogo) ? rowLogo(540, 345, d.compLogo, 44) : arBox(80, 322, 920, 46, d.comp, 800, 34, C.navy)}
    ${arBox(80, 392, 920, 40, d.round, 800, 30, '#13350c')}
    ${crest(245, 560, d.homeLogo)}
    ${crest(865, 560, d.awayLogo)}
    <rect x="360" y="478" width="360" height="170" rx="8" fill="${C.yellow}"/>
    <text x="540" y="612" text-anchor="middle" font-family="Anton" font-size="140" fill="${C.navy}">VS</text>
    <rect x="200" y="690" width="680" height="74" rx="6" fill="${C.yellow}"/>
    ${arBox(210, 690, 300, 74, d.home, 900, 40, C.navy)}
    <rect x="505" y="698" width="70" height="58" fill="${C.navy}"/>
    <text x="540" y="739" text-anchor="middle" font-family="Anton" font-size="32" fill="${C.yellow}">VS</text>
    ${arBox(570, 690, 300, 74, d.away, 900, 40, C.navy)}
    <text x="540" y="838" text-anchor="middle" font-family="Anton" font-size="56" fill="${C.navy}">${esc(d.date)}</text>
    ${arBox(80, 852, 920, 44, [d.time, d.stadium].filter(has).join('   ·   '), 700, 32, '#13350c')}
    ${arBox(80, 902, 920, 40, 'من سيفوز؟ شاركنا توقّعك', 800, 28, C.navy)}`
  },

  // Full-time result. score + per-team event lines (goal/card — one per line).
  result: {
    name: 'نتيجة المباراة',
    fields: ['comp', 'compLogo', 'round', 'home', 'away', 'homeLogo', 'awayLogo', 'hs', 'as', 'homeEvents', 'awayEvents'],
    content: d => {
      const hE = listRows(d.homeEvents, 8), aE = listRows(d.awayEvents, 8);
      const n = Math.max(hE.length, aE.length, 1);
      let fs = Math.floor(150 / (n * 1.45)); fs = Math.max(14, Math.min(28, fs));
      // team name is already shown in the score bar above — events list only here
      const col = (x, arr) =>
        `<line x1="${x + 60}" y1="800" x2="${x + 360}" y2="800" stroke="${C.yellow}" stroke-width="3"/>` +
        arBlock(x, 812, 420, 160, arr.join('\n'), 600, fs, '#13350c');
      return `
    ${blockTitle('FULL', 'TIME')}
    ${has(d.compLogo) ? rowLogo(540, 345, d.compLogo, 44) : arBox(80, 322, 920, 46, d.comp, 800, 34, C.navy)}
    ${arBox(80, 392, 920, 40, d.round, 800, 30, '#13350c')}
    ${crest(245, 560, d.homeLogo)}
    ${crest(865, 560, d.awayLogo)}
    <rect x="360" y="478" width="360" height="170" rx="8" fill="${C.yellow}"/>
    <rect x="535" y="493" width="10" height="140" fill="${C.navy}"/>
    <text x="455" y="612" text-anchor="middle" font-family="Anton" font-size="150" fill="${C.navy}">${esc(d.hs)}</text>
    <text x="625" y="612" text-anchor="middle" font-family="Anton" font-size="150" fill="${C.navy}">${esc(d.as)}</text>
    <rect x="200" y="690" width="680" height="74" rx="6" fill="${C.yellow}"/>
    ${arBox(210, 690, 300, 74, d.home, 900, 40, C.navy)}
    <rect x="505" y="698" width="70" height="58" fill="${C.navy}"/>
    <text x="540" y="737" text-anchor="middle" font-family="Anton" font-size="30" fill="${C.yellow}">FT</text>
    ${arBox(570, 690, 300, 74, d.away, 900, 40, C.navy)}
    ${col(80, hE)}
    ${col(580, aE)}`;
    }
  },

  // Match statistics with comparison bars. stats: "label | home | away" per line.
  matchstats: {
    name: 'تحليل إحصائي',
    fields: ['home', 'homeLogo', 'away', 'awayLogo', 'score', 'stats'],
    content: d => {
      const rows = listRows(d.stats, 7);
      const startY = 372, rowH = Math.min(104, (930 - startY) / Math.max(rows.length, 1));
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r); const label = p[0] || '', hv = p[1] || '', av = p[2] || '';
        const hN = parseFloat(String(hv).replace(/[^0-9.]/g, '')) || 0, aN = parseFloat(String(av).replace(/[^0-9.]/g, '')) || 0, tot = (hN + aN) || 1;
        const barX = 140, barW = 800, hW = Math.max(4, Math.round(barW * hN / tot));
        const y = startY + i * rowH;
        body += `<text x="150" y="${y.toFixed(0)}" font-family="Cairo" font-weight="800" font-size="34" fill="${C.navy}">${esc(hv)}</text>`;
        body += `<text x="930" y="${y.toFixed(0)}" text-anchor="end" font-family="Cairo" font-weight="800" font-size="34" fill="${C.navy}">${esc(av)}</text>`;
        body += arBox(390, y - 34, 300, 40, label, 800, 26, '#13350c');
        const by = (y + 16).toFixed(0);
        body += `<rect x="${barX}" y="${by}" width="${barW}" height="16" rx="8" fill="#e6ece4"/>`;
        body += `<rect x="${barX}" y="${by}" width="${hW}" height="16" rx="8" fill="${C.navy}"/>`;
        body += `<rect x="${barX + hW}" y="${by}" width="${barW - hW}" height="16" rx="8" fill="${C.yellow}"/>`;
      });
      return `
    <rect x="350" y="158" width="380" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(350, 158, 380, 72, 'إحصائيات المباراة', 900, 34, C.yellow)}
    ${compTitle(260, 280, d.home, d.homeLogo, 38, C.navy, { maxW: 340, weight: 900 })}
    ${arBox(440, 250, 200, 60, d.score, 900, 46, C.navy)}
    ${compTitle(820, 280, d.away, d.awayLogo, 38, C.navy, { maxW: 340, weight: 900 })}
    ${rows.length ? body : arBox(80, 372, 920, 460, 'الإحصائيات غير متوفرة', 700, 38, '#7a8a74')}
    <rect x="335" y="905" width="22" height="22" fill="${C.navy}"/>${arBox(360, 899, 150, 34, d.home, 700, 24, C.navy)}
    <rect x="560" y="905" width="22" height="22" fill="${C.yellow}"/>${arBox(585, 899, 150, 34, d.away, 700, 24, C.navy)}`;
    }
  },

  // Player ratings — two columns, one team each (logo + name header, players below).
  // home / away: "name | rating" per line. Chip color by rating band.
  ratings: {
    name: 'تقييمات اللاعبين',
    fields: ['homeTeam', 'homeLogo', 'home', 'awayTeam', 'awayLogo', 'away'],
    content: d => {
      // one column of players: names right-aligned at xName, rating chip at xChip
      const sideCol = (xName, xChip, list) => {
        // sort by rating; if more than 10 players show the TOP 7 + WORST 3 (dashed gap)
        let rows = listRows(list, 30).map(r => { const p = cells(r); return { name: p[0] || '', rt: p[1] || '', rv: parseFloat(p[1]) || 0 }; });
        rows.sort((a, b) => b.rv - a.rv);
        let splitAfter = 0;
        if (rows.length > 10) { rows = rows.slice(0, 7).concat(rows.slice(-3)); splitAfter = 7; }
        const top = 332, bottom = 905, sepExtra = splitAfter ? 0.7 : 0;
        const gap = Math.min(60, (bottom - top) / Math.max(rows.length + sepExtra, 1));
        const fs = Math.max(18, Math.min(34, Math.floor(gap * 0.58)));
        const cw = 84;
        let b = '';
        rows.forEach((o, i) => {
          const bg = o.rv >= 7.5 ? C.navy : o.rv >= 6.5 ? C.yellow : C.red;
          const fg = (o.rv >= 6.5 && o.rv < 7.5) ? C.navy : '#fff';
          const extra = (splitAfter && i >= splitAfter) ? sepExtra * gap : 0;
          const y = top + i * gap + extra, cy = y + gap / 2, tb = (cy + fs * 0.35).toFixed(1);
          if (splitAfter && i === splitAfter) {
            const sy = (y - sepExtra * gap / 2).toFixed(0);
            b += `<line x1="${xChip}" y1="${sy}" x2="${xName}" y2="${sy}" stroke="${C.navy}" stroke-width="2" stroke-dasharray="6 7" opacity="0.45"/>`;
          }
          b += `<text x="${xName}" y="${tb}" text-anchor="end" direction="rtl" font-family="Cairo" font-weight="800" font-size="${fs}" fill="${C.navy}">${esc(o.name)}</text>`;
          b += `<rect x="${xChip}" y="${(cy - gap * 0.32).toFixed(0)}" width="${cw}" height="${(gap * 0.62).toFixed(0)}" rx="8" fill="${bg}"/>`;
          b += `<text x="${xChip + cw / 2}" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${fg}">${esc(o.rt)}</text>`;
          if (i < rows.length - 1 && i !== splitAfter - 1) b += `<line x1="${xChip}" y1="${(y + gap).toFixed(0)}" x2="${xName}" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.2" opacity="0.4"/>`;
        });
        return b || arBox(xChip, 420, xName - xChip, 300, 'غير متوفرة', 700, 26, '#7a8a74');
      };
      return `
    <rect x="360" y="150" width="360" height="64" rx="32" fill="${C.navy}"/>
    ${arBox(360, 150, 360, 64, 'تقييمات اللاعبين', 900, 32, C.yellow)}
    ${compTitle(300, 256, d.homeTeam, d.homeLogo, 36, C.navy, { maxW: 430 })}
    ${compTitle(780, 256, d.awayTeam, d.awayLogo, 36, C.navy, { maxW: 430 })}
    <line x1="540" y1="300" x2="540" y2="905" stroke="${C.navy}" stroke-width="2" opacity="0.22"/>
    ${sideCol(510, 90, d.home)}
    ${sideCol(990, 570, d.away)}`;
    }
  },

  // Today's fixtures list. list: "home | away | league | time | homeLogo? | awayLogo? | leagueLogo?".
  // Each row shows its league CREST (right); falls back to the league name if no logo.
  fixtures: {
    name: 'مباريات اليوم',
    fields: ['date', 'list'],
    content: d => {
      const rows = listRows(d.list, 12);
      const top = 330, bottom = 930, gap = Math.min(60, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(20, Math.min(28, Math.floor(gap * 0.5)));
      const lr = Math.min(18, Math.floor(gap * 0.34)); // logo radius
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r);
        const home = p[0] || '', away = p[1] || '', league = p[2] || '', time = p[3] || '', homeLogo = p[4] || '', awayLogo = p[5] || '', leagueLogo = p[6] || '';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.34).toFixed(1);
        body += `<text x="95" y="${tb}" font-family="Anton" font-size="${fs + 2}" fill="${C.navy}">${esc(time)}</text>`;
        body += rowLogo(752, cy, homeLogo, lr);                    // home badge (right, toward league)
        body += arBox(560, cy - gap / 2, 170, gap, home, 800, fs, C.navy);
        body += `<text x="540" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}" opacity="0.5">×</text>`;
        body += arBox(350, cy - gap / 2, 170, gap, away, 800, fs, C.navy);
        body += rowLogo(328, cy, awayLogo, lr);                    // away badge (left, toward time)
        if (has(leagueLogo)) body += rowLogo(963, cy, leagueLogo, lr);   // league crest (far right)
        else if (league) body += `<text x="985" y="${tb}" text-anchor="end" font-family="Cairo" font-weight="700" font-size="${fs - 6}" fill="#3a5a33">${esc(league)}</text>`;
        if (i < rows.length - 1) body += `<line x1="95" y1="${(y + gap).toFixed(0)}" x2="985" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.2" opacity="0.55"/>`;
      });
      return `
    <rect x="370" y="158" width="340" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(370, 158, 340, 72, 'مباريات اليوم', 900, 36, C.yellow)}
    ${arBox(80, 248, 920, 44, d.date, 700, 30, '#13350c')}
    ${body}`;
    }
  },

  // Today's results list. list: "home | away | score | note | homeLogo? | awayLogo? | leagueLogo?".
  // Each row shows its league CREST (right); falls back to the note/league name if no logo.
  results: {
    name: 'نتائج اليوم',
    fields: ['date', 'list'],
    content: d => {
      const rows = listRows(d.list, 10);
      const top = 330, bottom = 930, gap = Math.min(64, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(20, Math.min(28, Math.floor(gap * 0.46)));
      const lr = Math.min(18, Math.floor(gap * 0.32)); // logo radius
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r);
        const home = p[0] || '', away = p[1] || '', score = p[2] || '', note = p[3] || '', homeLogo = p[4] || '', awayLogo = p[5] || '', leagueLogo = p[6] || '';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.34).toFixed(1);
        // Free-plan: score may be missing (not played / data gap) → show a dash, no chip.
        // Score arrives "home - away", but the row is RTL (home on the right, away
        // on the left), so flip the halves to put each number under its own team.
        let mid = '—';
        if (has(score)) {
          const sp = String(score).split(/\s*[-–:]\s*/);
          mid = sp.length === 2 ? `${sp[1].trim()} - ${sp[0].trim()}` : String(score).trim();
        }
        if (has(score)) {
          const sw = Math.max(70, strW(mid, fs) + 28);
          body += `<rect x="${(540 - sw / 2).toFixed(0)}" y="${(cy - gap * 0.30).toFixed(0)}" width="${sw.toFixed(0)}" height="${(gap * 0.6).toFixed(0)}" rx="7" fill="${C.yellow}"/>`;
        }
        body += `<text x="540" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}">${esc(mid)}</text>`;
        body += rowLogo(792, cy, homeLogo, lr);                    // home badge (right)
        body += arBox(575, cy - gap / 2, 190, gap, home, 800, fs, C.navy);
        body += arBox(315, cy - gap / 2, 190, gap, away, 800, fs, C.navy);
        body += rowLogo(288, cy, awayLogo, lr);                    // away badge (left)
        if (has(leagueLogo)) body += rowLogo(963, cy, leagueLogo, lr);   // league crest (far right)
        else if (note) body += `<text x="985" y="${tb}" text-anchor="end" font-family="Cairo" font-weight="700" font-size="${fs - 6}" fill="#3a5a33">${esc(note)}</text>`;
        if (i < rows.length - 1) body += `<line x1="95" y1="${(y + gap).toFixed(0)}" x2="985" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.2" opacity="0.55"/>`;
      });
      return `
    <rect x="330" y="158" width="420" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(330, 158, 420, 72, 'نتائج اليوم', 900, 34, C.yellow)}
    ${arBox(80, 248, 920, 44, d.date, 700, 30, '#13350c')}
    ${body}`;
    }
  },
};
