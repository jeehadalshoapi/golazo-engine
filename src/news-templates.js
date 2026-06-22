/**
 * news-templates.js — the NEWS pipeline cards (DeepSeek output) + the roundup cover.
 * Bodies from design.md §4, verified against the Studio layout. Native <text> only.
 */
const { C, esc, has, arBox, vstack } = require('./svg-helpers');

module.exports = {
  breaking: {
    name: 'خبر عاجل',
    fields: ['time', 'headline', 'details', 'source'],
    content: d => `
    ${d.roundup ? '' : `
    <rect x="380" y="160" width="320" height="74" rx="10" fill="${C.red}"/>
    <circle cx="430" cy="197" r="8" fill="#fff"/>
    <text x="555" y="210" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="40" fill="#fff">خبر عاجل</text>
    ${has(d.time) ? `<text x="1000" y="210" text-anchor="end" font-family="Cairo" font-weight="700" font-size="28" fill="${C.navy}">${esc(d.time)}</text>` : ''}`}
    ${vstack(258, 950, [
      { h: 300, render: y => arBox(90, y, 900, 300, d.headline, 900, 74, C.navy) },
      has(d.details) ? { h: 250, gap: 10, render: y =>
        `<line x1="150" y1="${(y + 18).toFixed(0)}" x2="930" y2="${(y + 18).toFixed(0)}" stroke="${C.yellow}" stroke-width="5"/>` +
        arBox(120, y + 30, 840, 220, d.details, 600, 40, '#13350c') } : null,
      has(d.source) ? { h: 46, gap: 24, render: y =>
        `<text x="540" y="${(y + 32).toFixed(0)}" text-anchor="middle" font-family="Cairo" font-weight="700" font-size="30" fill="${C.navy}">المصدر: ${esc(d.source)}</text>` } : null,
    ])}`
  },
  confirmed: {
    name: 'انتقال رسمي',
    fields: ['player', 'club', 'contract', 'fee', 'until', 'source'],
    content: d => {
      const rows = [];
      if (has(d.contract)) rows.push('المدة:  ' + d.contract);
      if (has(d.fee)) rows.push('القيمة:  ' + d.fee);
      if (has(d.until)) rows.push('نهاية العقد:  ' + d.until);
      const info = rows.join('\n');
      return `
    <rect x="400" y="162" width="280" height="72" rx="36" fill="${C.navy}"/>
    <path d="M615 198 l12 12 l22 -26" stroke="${C.yellow}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="525" y="212" text-anchor="middle" font-family="Cairo" font-weight="900" font-size="40" fill="${C.yellow}">رسمياً</text>
    ${vstack(255, 950, [
      { h: 120, render: y => arBox(80, y, 920, 120, d.player, 900, 70, C.navy) },
      has(d.club) ? { h: 150, gap: 10, render: y =>
        arBox(80, y, 920, 46, 'انتقال إلى', 700, 32, '#13350c') +
        `<rect x="260" y="${(y + 64).toFixed(0)}" width="560" height="86" rx="8" fill="${C.yellow}"/>` +
        arBox(260, y + 64, 560, 86, d.club, 900, 46, C.navy) } : null,
      has(info) ? { h: 250, gap: 16, render: y => arBox(140, y, 800, 250, info, 700, 40, '#13350c') } : null,
      has(d.source) ? { h: 50, gap: 10, render: y => arBox(80, y, 920, 50, 'المصدر: ' + d.source, 700, 30, C.navy) } : null,
    ])}`;
    }
  },
  rumors: {
    name: 'شائعات/تقارير',
    fields: ['player', 'fromClub', 'toClub', 'details', 'status', 'source'],
    content: d => {
      const move = has(d.fromClub) && has(d.toClub) ? (d.fromClub + '   ←   ' + d.toClub)
        : has(d.fromClub) ? d.fromClub
        : has(d.toClub) ? d.toClub : '';
      return `
    <rect x="390" y="162" width="300" height="72" rx="36" fill="none" stroke="${C.navy}" stroke-width="4" stroke-dasharray="11 8"/>
    ${arBox(390, 162, 300, 72, 'تقارير وشائعات', 900, 36, C.navy)}
    ${vstack(250, 950, [
      { h: 120, render: y => arBox(80, y, 920, 120, d.player, 900, 66, C.navy) },
      has(move) ? { h: 60, gap: 8, render: y => arBox(80, y, 920, 60, move, 800, 40, '#13350c') } : null,
      has(d.details) ? { h: 235, gap: 18, render: y =>
        `<line x1="180" y1="${y.toFixed(0)}" x2="900" y2="${y.toFixed(0)}" stroke="${C.yellow}" stroke-width="4"/>` +
        arBox(130, y + 22, 820, 210, d.details, 600, 38, '#13350c') } : null,
      has(d.status) ? { h: 72, gap: 18, render: y =>
        `<rect x="300" y="${y.toFixed(0)}" width="480" height="72" rx="36" fill="${C.yellow}"/>` +
        arBox(300, y, 480, 72, 'الموقف: ' + d.status, 800, 34, C.navy) } : null,
      has(d.source) ? { h: 50, gap: 14, render: y => arBox(80, y, 920, 50, 'المصدر: ' + d.source, 700, 30, C.navy) } : null,
    ])}`;
    }
  },
  quote: {
    name: 'تصريح',
    fields: ['quote', 'author', 'role'],
    content: d => `
    <rect x="400" y="160" width="280" height="72" rx="36" fill="${C.navy}"/>
    ${arBox(400, 160, 280, 72, 'تصريح', 900, 40, C.yellow)}
    <text x="540" y="332" text-anchor="middle" font-family="Anton" font-size="130" fill="${C.yellow}">&#8221;</text>
    ${vstack(352, 885, [
      { h: 320, render: y => arBox(110, y, 860, 320, d.quote, 800, 54, C.navy) },
      (has(d.author) || has(d.role)) ? { h: 16 + (has(d.author) ? 70 : 0) + (has(d.role) ? 50 : 0), gap: 16, render: y =>
        `<line x1="300" y1="${y.toFixed(0)}" x2="780" y2="${y.toFixed(0)}" stroke="${C.yellow}" stroke-width="5"/>` +
        (has(d.author) ? arBox(80, y + 16, 920, 70, '— ' + d.author, 900, 52, C.navy) : '') +
        (has(d.role) ? arBox(80, y + 16 + (has(d.author) ? 70 : 0), 920, 50, d.role, 700, 34, '#13350c') : '') } : null,
    ])}`
  },
  // Roundup cover slide (adapted from the studio `brand` template). Not a DeepSeek
  // output — built by the roundup workflow as the first slide of the daily carousel.
  cover: {
    name: 'غلاف الملخص',
    fields: ['title'],
    content: d => `
    ${vstack(280, 830, [
      { h: 180, render: y => arBox(90, y, 900, 180, d.title || 'أبرز أخبار اليوم', 900, 86, C.navy) },
      { h: 6, gap: 26, render: y => `<rect x="360" y="${y.toFixed(0)}" width="360" height="6" fill="${C.yellow}"/>` },
      { h: 52, gap: 44, render: y => arBox(90, y, 900, 52, 'اسحب للمزيد', 800, 34, '#13350c') },
    ])}`
  },
  // Brand-voice outro slide — appended to the tail of every carousel (scroll).
  brand: {
    name: 'الهوية',
    fields: [],
    content: d => `
    ${vstack(300, 820, [
      { h: 180, render: y => `<text x="540" y="${(y + 150).toFixed(0)}" text-anchor="middle" font-family="Anton" font-size="170" fill="${C.navy}">GOLAZO!</text>` },
      { h: 6, gap: 30, render: y => `<rect x="360" y="${y.toFixed(0)}" width="360" height="6" fill="${C.yellow}"/>` },
      { h: 200, gap: 34, render: y => arBox(90, y, 900, 200, 'نحلل كرة القدم بالأرقام لا بالضجيج. هنا تجد الحقيقة خلف كل مباراة.', 700, 44, C.navy) },
    ])}`
  }
};
