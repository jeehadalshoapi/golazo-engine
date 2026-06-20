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
const { C, esc, has, arBox, arBlock, strW, blockTitle, crest, rowLogo, cells, listRows, tableRows } = require('./svg-helpers');

module.exports = {
  // League table (already ordered top→down; rank is derived from row order).
  // rows: one team per line — "team | played | GD | pts".
  standing: {
    name: 'ترتيب الدوري',
    fields: ['comp', 'rows'],
    content: d => `
    <rect x="350" y="158" width="380" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(350, 158, 380, 72, 'ترتيب الدوري', 900, 34, C.yellow)}
    ${arBox(80, 250, 920, 56, d.comp, 800, 40, C.navy)}
    ${tableRows(listRows(d.rows, 8), 350, 930, { headerY: 335 })}`
  },

  // Group-stage table (UCL / World Cup). Same table, group-labelled, top-2 tinted.
  // rows: "team | played | GD | pts" (≤6). One card per group → carousel.
  group: {
    name: 'دور المجموعات',
    fields: ['comp', 'group', 'rows'],
    content: d => `
    <rect x="350" y="150" width="380" height="62" rx="31" fill="${C.navy}"/>
    ${arBox(350, 150, 380, 62, d.comp || 'دور المجموعات', 800, 26, C.yellow)}
    <rect x="300" y="236" width="480" height="92" rx="12" fill="${C.yellow}"/>
    ${arBox(300, 236, 480, 92, d.group || 'المجموعة', 900, 50, C.navy)}
    ${tableRows(listRows(d.rows, 6), 420, 930, { headerY: 405, maxGap: 84, maxFs: 34, fsMul: 0.40, highlight: 2 })}`
  },

  // Knockout draw / bracket — pairings for one round. ALL cup matches matter.
  // list: "home | away | score?" per line (score optional → shows "ضد"). ≤8 pairs.
  knockout: {
    name: 'الأدوار الإقصائية',
    fields: ['comp', 'round', 'list'],
    content: d => {
      const rows = listRows(d.list, 8);
      const top = 360, bottom = 930, gap = Math.min(104, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(22, Math.min(34, Math.floor(gap * 0.32)));
      let body = '';
      rows.forEach((r, i) => {
        const c = cells(r); const home = c[0] || '', away = c[1] || '', score = c[2] || '';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.34).toFixed(1);
        body += `<rect x="120" y="${(y + 6).toFixed(0)}" width="840" height="${(gap - 12).toFixed(0)}" rx="12" fill="${C.navy}" opacity="0.05"/>`;
        // bracket tick on the right edge of each pairing
        body += `<path d="M970 ${(y + 14).toFixed(0)} h14 V ${(y + gap - 14).toFixed(0)} h-14" fill="none" stroke="${C.navy}" stroke-width="3" opacity="0.5"/>`;
        const mid = has(score) ? score : 'ضد';
        const sw = Math.max(96, strW(mid, fs) + 34);
        body += `<rect x="${(540 - sw / 2).toFixed(0)}" y="${(cy - gap * 0.22).toFixed(0)}" width="${sw.toFixed(0)}" height="${(gap * 0.44).toFixed(0)}" rx="8" fill="${C.yellow}"/>`;
        body += `<text x="540" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}">${esc(mid)}</text>`;
        body += arBox(560, cy - gap / 2, 350, gap, home, 800, fs, C.navy);
        body += arBox(170, cy - gap / 2, 350, gap, away, 800, fs, C.navy);
      });
      return `
    <rect x="330" y="150" width="420" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(330, 150, 420, 72, 'الأدوار الإقصائية', 900, 32, C.yellow)}
    ${arBox(80, 238, 920, 46, [d.comp, d.round].filter(has).join('   ·   '), 800, 34, C.navy)}
    ${body}`;
    }
  },

  // Pre-match poster. comp/round + the two teams + kickoff. Logos via data: URI only.
  prematch: {
    name: 'قبل المباراة',
    fields: ['comp', 'round', 'home', 'away', 'homeLogo', 'awayLogo', 'date', 'time', 'stadium'],
    content: d => `
    ${blockTitle('MATCH', 'DAY')}
    <text x="540" y="376" text-anchor="middle" font-family="Anton" font-size="62" fill="${C.navy}">${esc(d.comp)}</text>
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
    fields: ['comp', 'round', 'home', 'away', 'homeLogo', 'awayLogo', 'hs', 'as', 'homeEvents', 'awayEvents'],
    content: d => {
      const hE = listRows(d.homeEvents, 8), aE = listRows(d.awayEvents, 8);
      const n = Math.max(hE.length, aE.length, 1);
      let fs = Math.floor(150 / (n * 1.45)); fs = Math.max(14, Math.min(28, fs));
      const col = (x, name, arr) =>
        arBox(x, 778, 420, 40, name, 900, 28, C.navy) +
        `<line x1="${x + 60}" y1="824" x2="${x + 360}" y2="824" stroke="${C.yellow}" stroke-width="3"/>` +
        arBlock(x, 834, 420, 138, arr.join('\n'), 600, fs, '#13350c');
      return `
    ${blockTitle('FULL', 'TIME')}
    <text x="540" y="376" text-anchor="middle" font-family="Anton" font-size="62" fill="${C.navy}">${esc(d.comp)}</text>
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
    ${col(80, d.home, hE)}
    ${col(580, d.away, aE)}`;
    }
  },

  // Match statistics with comparison bars. stats: "label | home | away" per line.
  matchstats: {
    name: 'تحليل إحصائي',
    fields: ['home', 'away', 'score', 'stats'],
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
    ${arBox(80, 250, 360, 60, d.home, 900, 40, C.navy)}
    ${arBox(440, 250, 200, 60, d.score, 900, 46, C.navy)}
    ${arBox(640, 250, 360, 60, d.away, 900, 40, C.navy)}
    ${rows.length ? body : arBox(80, 372, 920, 460, 'الإحصائيات غير متوفرة', 700, 38, '#7a8a74')}
    <rect x="335" y="905" width="22" height="22" fill="${C.navy}"/>${arBox(360, 899, 150, 34, d.home, 700, 24, C.navy)}
    <rect x="560" y="905" width="22" height="22" fill="${C.yellow}"/>${arBox(585, 899, 150, 34, d.away, 700, 24, C.navy)}`;
    }
  },

  // Player ratings. list: "name | rating" per line. Chip color by rating band.
  ratings: {
    name: 'تقييمات اللاعبين',
    fields: ['team', 'list'],
    content: d => {
      const rows = listRows(d.list, 11);
      const top = 320, gap = Math.min(56, (905 - top) / Math.max(rows.length, 1));
      const fs = Math.max(22, Math.min(32, Math.floor(gap * 0.55)));
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r); const name = p[0] || '', rt = p[1] || '', rv = parseFloat(rt) || 0;
        const bg = rv >= 7.5 ? C.navy : rv >= 6.5 ? C.yellow : C.red;
        const fg = (rv >= 6.5 && rv < 7.5) ? C.navy : '#fff';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.35).toFixed(1);
        const cw = 96, cx0 = 130;
        body += `<text x="930" y="${tb}" text-anchor="end" direction="rtl" font-family="Cairo" font-weight="800" font-size="${fs}" fill="${C.navy}">${esc(name)}</text>`;
        body += `<rect x="${cx0}" y="${(cy - gap * 0.32).toFixed(0)}" width="${cw}" height="${(gap * 0.64).toFixed(0)}" rx="8" fill="${bg}"/>`;
        body += `<text x="${cx0 + cw / 2}" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${fg}">${esc(rt)}</text>`;
        if (i < rows.length - 1) body += `<line x1="150" y1="${(y + gap).toFixed(0)}" x2="930" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.5" opacity="0.5"/>`;
      });
      return `
    <rect x="360" y="150" width="360" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(360, 150, 360, 72, 'تقييمات اللاعبين', 900, 34, C.yellow)}
    ${arBox(80, 232, 920, 46, d.team, 700, 30, '#13350c')}
    ${rows.length ? body : arBox(80, 360, 920, 440, 'التقييمات غير متوفرة', 700, 38, '#7a8a74')}`;
    }
  },

  // Today's fixtures list. list: "home | away | league | time | homeLogo? | awayLogo?" per line.
  fixtures: {
    name: 'مباريات اليوم',
    fields: ['date', 'comp', 'list'],
    content: d => {
      const rows = listRows(d.list, 12);
      const top = 330, bottom = 930, gap = Math.min(60, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(20, Math.min(28, Math.floor(gap * 0.5)));
      const lr = Math.min(18, Math.floor(gap * 0.34)); // logo radius
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r);
        const home = p[0] || '', away = p[1] || '', league = p[2] || '', time = p[3] || '', homeLogo = p[4] || '', awayLogo = p[5] || '';
        const y = top + i * gap, cy = y + gap / 2, tb = (cy + fs * 0.34).toFixed(1);
        body += `<text x="95" y="${tb}" font-family="Anton" font-size="${fs + 2}" fill="${C.navy}">${esc(time)}</text>`;
        body += rowLogo(752, cy, homeLogo, lr);                    // home badge (right, toward league)
        body += arBox(560, cy - gap / 2, 170, gap, home, 800, fs, C.navy);
        body += `<text x="540" y="${tb}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${C.navy}" opacity="0.5">×</text>`;
        body += arBox(350, cy - gap / 2, 170, gap, away, 800, fs, C.navy);
        body += rowLogo(328, cy, awayLogo, lr);                    // away badge (left, toward time)
        if (league) body += `<text x="985" y="${tb}" text-anchor="end" font-family="Cairo" font-weight="700" font-size="${fs - 6}" fill="#3a5a33">${esc(league)}</text>`;
        if (i < rows.length - 1) body += `<line x1="95" y1="${(y + gap).toFixed(0)}" x2="985" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.2" opacity="0.55"/>`;
      });
      return `
    <rect x="370" y="158" width="340" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(370, 158, 340, 72, 'مباريات اليوم', 900, 36, C.yellow)}
    ${arBox(80, 248, 920, 44, [d.comp, d.date].filter(has).join('   ·   '), 700, 30, '#13350c')}
    ${body}`;
    }
  },

  // Today's results list. list: "home | away | score | note | homeLogo? | awayLogo?" per line.
  results: {
    name: 'نتائج اليوم',
    fields: ['date', 'comp', 'list'],
    content: d => {
      const rows = listRows(d.list, 10);
      const top = 330, bottom = 930, gap = Math.min(64, (bottom - top) / Math.max(rows.length, 1));
      const fs = Math.max(20, Math.min(28, Math.floor(gap * 0.46)));
      const lr = Math.min(18, Math.floor(gap * 0.32)); // logo radius
      let body = '';
      rows.forEach((r, i) => {
        const p = cells(r);
        const home = p[0] || '', away = p[1] || '', score = p[2] || '', note = p[3] || '', homeLogo = p[4] || '', awayLogo = p[5] || '';
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
        if (note) body += `<text x="985" y="${tb}" text-anchor="end" font-family="Cairo" font-weight="700" font-size="${fs - 6}" fill="#3a5a33">${esc(note)}</text>`;
        if (i < rows.length - 1) body += `<line x1="95" y1="${(y + gap).toFixed(0)}" x2="985" y2="${(y + gap).toFixed(0)}" stroke="${C.yellow}" stroke-width="1.2" opacity="0.55"/>`;
      });
      return `
    <rect x="330" y="158" width="420" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(330, 158, 420, 72, 'نتائج اليوم', 900, 34, C.yellow)}
    ${arBox(80, 248, 920, 44, [d.comp, d.date].filter(has).join('   ·   '), 700, 30, '#13350c')}
    ${body}`;
    }
  },
};
