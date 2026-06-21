/**
 * gallery.js — visual review tool. Renders EVERY template through the REAL engine
 * (same code path as production, logos embedded) into one self-contained
 * gallery.html you open in a browser. Replaces eyeballing the studio HTML, which
 * uses <foreignObject> and so does NOT match the deployed resvg output.
 *
 *   node gallery.js            -> writes ./gallery.html
 *   then open gallery.html
 */
const fs = require('fs');
const path = require('path');
const { buildSvg, TEMPLATES } = require('./src/templates');
const { svgToPng } = require('./src/render');
const { collectLogoUrls, resolveLogos } = require('./src/logos');

const L = id => `https://media.api-sports.io/football/teams/${id}.png`;
const Lg = id => `https://media.api-sports.io/football/leagues/${id}.png`;
const CL = { epl: Lg(39), ucl: Lg(2), wc: Lg(1) };
// a few real api-football team ids (logos for the visual test)
const T = { rm: 541, bar: 529, city: 50, liv: 40, bay: 157, psg: 85, ars: 42, int: 505, che: 49, juv: 496, dor: 165, tot: 47, mil: 489, nap: 492, atm: 530, por: 212, bvb: 165, nwc: 34 };

const SAMPLES = {
  breaking: { time: 'الآن', headline: 'نيوكاسل يتغلب على وست هام بثلاثية في سانت جيمس بارك', details: 'فوز كبير 3-1 على ملعبه\nثنائية لأوسولا وهدف لجوردان', source: 'سكاي سبورتس' },
  confirmed: { player: 'فلوريان فيرتز', club: 'ليفربول', contract: '5 سنوات', fee: '116 مليون جنيه', until: '2030', source: 'فابريزيو رومانو' },
  rumors: { player: 'ماركوس راشفورد', fromClub: 'مانشستر يونايتد', toClub: 'برشلونة', details: 'مفاوضات متقدمة لإتمام الصفقة على سبيل الإعارة مع خيار الشراء', status: 'مفاوضات متقدمة', source: 'ديلي ميل' },
  quote: { quote: 'نلعب من أجل اللقب حتى النهاية ولن نستسلم مهما كانت الصعوبات', author: 'بيب جوارديولا', role: 'مدرب مانشستر سيتي' },
  cover: { title: 'موجز اليوم', subtitle: 'أبرز أخبار الانتقالات', date: 'الجمعة 12 أغسطس' },
  standing: {
    comp: 'الدوري الإنجليزي', compLogo: CL.epl,
    rows: [
      `ليفربول | 24 | +38 | 60 | ${L(T.liv)}`,
      `أرسنال | 24 | +25 | 52 | ${L(T.ars)}`,
      `مان سيتي | 24 | +21 | 50 | ${L(T.city)}`,
      `نيوكاسل | 24 | +18 | 47 | ${L(T.nwc)}`,
      `تشيلسي | 24 | +9 | 41 | ${L(T.che)}`,
      `توتنهام | 24 | +6 | 38 | ${L(T.tot)}`,
      `أستون فيلا | 24 | +4 | 37`,
      `برايتون | 24 | +2 | 35`,
      `وست هام | 24 | -1 | 32`,
      `فولهام | 24 | -3 | 30`,
      `إيفرتون | 24 | -5 | 27`,
      `بورنموث | 24 | -7 | 25`,
      `كريستال بالاس | 24 | -9 | 23`,
      `نوتنغهام | 24 | -12 | 20`,
      `لوتون تاون | 24 | -18 | 17`,
      `بيرنلي | 24 | -22 | 14`,
      `شيفيلد يونايتد | 24 | -30 | 10`,
    ].join('\n'),
  },
  group: {
    comp: 'دوري أبطال أوروبا', compLogo: CL.ucl, group: 'المجموعة A',
    rows: [
      `ريال مدريد | 6 | +11 | 16 | ${L(T.rm)}`,
      `مان سيتي | 6 | +7 | 13 | ${L(T.city)}`,
      `إنتر ميلان | 6 | -2 | 7 | ${L(T.int)}`,
      `بوروسيا دورتموند | 6 | -16 | 0 | ${L(T.dor)}`,
    ].join('\n'),
  },
  knockout: {
    comp: 'دوري أبطال أوروبا', compLogo: CL.ucl, round: 'ربع النهائي',
    list: [
      `ريال مدريد | مان سيتي | 3 - 2 | ${L(T.rm)} | ${L(T.city)}`,
      `بايرن ميونخ | باريس سان جيرمان | 1 - 1 | ${L(T.bay)} | ${L(T.psg)}`,
      `أرسنال | برشلونة | 2 - 0 | ${L(T.ars)} | ${L(T.bar)}`,
      `إنتر ميلان | ليفربول | | ${L(T.int)} | ${L(T.liv)}`,
    ].join('\n'),
  },
  bracket: {
    comp: 'دوري أبطال أوروبا', compLogo: CL.ucl,
    champion: 'ريال مدريد',
    rounds: [
      { title: 'ربع النهائي', matches: [
        { home: 'ريال مدريد', away: 'أرسنال', hs: 2, as: 1, homeLogo: L(T.rm), awayLogo: L(T.ars) },
        { home: 'مان سيتي', away: 'بايرن', hs: 0, as: 1, homeLogo: L(T.city), awayLogo: L(T.bay) },
        { home: 'ليفربول', away: 'برشلونة', hs: 3, as: 3, homeLogo: L(T.liv), awayLogo: L(T.bar) },
        { home: 'إنتر', away: 'باريس', hs: 1, as: 0, homeLogo: L(T.int), awayLogo: L(T.psg) },
      ]},
      { title: 'نصف النهائي', matches: [
        { home: 'ريال مدريد', away: 'بايرن', hs: 2, as: 0, homeLogo: L(T.rm), awayLogo: L(T.bay) },
        { home: 'ليفربول', away: 'إنتر', hs: 1, as: 2, homeLogo: L(T.liv), awayLogo: L(T.int) },
      ]},
      { title: 'النهائي', matches: [
        { home: 'ريال مدريد', away: 'إنتر', hs: 3, as: 1, homeLogo: L(T.rm), awayLogo: L(T.int) },
      ]},
    ],
  },
  prematch: { comp: 'دوري أبطال أوروبا', compLogo: CL.ucl, round: 'نصف النهائي — ذهاب', home: 'ريال مدريد', away: 'مان سيتي', homeLogo: L(T.rm), awayLogo: L(T.city), date: 'الثلاثاء 12 أغسطس', time: '10:00 مساءً', stadium: 'سانتياغو برنابيو' },
  result: { comp: 'دوري أبطال أوروبا', compLogo: CL.ucl, round: 'نصف النهائي', home: 'ريال مدريد', away: 'مان سيتي', homeLogo: L(T.rm), awayLogo: L(T.city), hs: '3', as: '1', homeEvents: 'بيلينغهام 23\nفينيسيوس 56\nرودريغو 78', awayEvents: 'هالاند 90+2' },
  matchstats: { home: 'ريال مدريد', homeLogo: L(T.rm), away: 'مان سيتي', awayLogo: L(T.city), score: '3 - 1', stats: 'الاستحواذ % | 52 | 48\nالتسديدات | 14 | 11\nعلى المرمى | 6 | 4\nالركنيات | 7 | 5\nالأخطاء | 11 | 13\nxG | 2.3 | 1.4' },
  ratings: {
    homeTeam: 'ريال مدريد', homeLogo: L(T.rm),
    home: 'كورتوا | 7.2\nكاريخال | 7.8\nروديغر | 6.8\nمندي | 7.1\nفالفيردي | 7.9\nمودريتش | 7.0\nتشواميني | 6.3\nبيلينغهام | 8.4\nفينيسيوس | 8.7\nرودريغو | 7.6\nخوسيلو | 5.9',
    awayTeam: 'مان سيتي', awayLogo: L(T.city),
    away: 'إيدرسون | 6.4\nووكر | 6.6\nديأس | 7.0\nأكانجي | 6.9\nرودري | 7.5\nدي بروين | 7.8\nفودين | 7.2\nهالاند | 6.7\nغريليش | 6.5\nستونز | 6.1\nبرناردو | 7.3',
  },
  fixtures: {
    date: 'الجمعة 12 أغسطس 2026',
    list: [
      `ريال مدريد | برشلونة | الليغا | 11:00 م | ${L(T.rm)} | ${L(T.bar)} | ${Lg(140)}`,
      `مان سيتي | ليفربول | البريميرليغ | 6:30 م | ${L(T.city)} | ${L(T.liv)} | ${Lg(39)}`,
      `بايرن | دورتموند | البوندسليغا | 8:30 م | ${L(T.bay)} | ${L(T.dor)} | ${Lg(78)}`,
      `يوفنتوس | إنتر | السيري آ | 10:45 م | ${L(T.juv)} | ${L(T.int)} | ${Lg(135)}`,
    ].join('\n'),
  },
  results: {
    date: 'الجمعة 12 أغسطس 2026',
    list: [
      `ريال مدريد | برشلونة | 2 - 1 | الليغا | ${L(T.rm)} | ${L(T.bar)} | ${Lg(140)}`,
      `مان سيتي | ليفربول | 1 - 0 | البريميرليغ | ${L(T.city)} | ${L(T.liv)} | ${Lg(39)}`,
      `بايرن | دورتموند | 4 - 0 | البوندسليغا | ${L(T.bay)} | ${L(T.dor)} | ${Lg(78)}`,
      `يوفنتوس | إنتر | 2 - 2 | السيري آ | ${L(T.juv)} | ${L(T.int)} | ${Lg(135)}`,
    ].join('\n'),
  },
};

(async () => {
  const keys = Object.keys(TEMPLATES);
  const cards = [];
  for (const key of keys) {
    const data = SAMPLES[key] || {};
    await resolveLogos(collectLogoUrls(data));
    const png = svgToPng(buildSvg(key, data));
    const b64 = png.toString('base64');
    const label = (TEMPLATES[key].name || '') + ` (${key})`;
    cards.push(`<figure><img src="data:image/png;base64,${b64}" alt="${key}"/><figcaption>${label}</figcaption></figure>`);
  }
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>Golazo — معرض القوالب</title>
<style>
  body{margin:0;background:#0d3d07;font-family:system-ui,Segoe UI,Arial;color:#fff}
  header{padding:18px 24px;font-size:22px;font-weight:800}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:22px;padding:0 24px 40px}
  figure{margin:0;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.3)}
  figure img{width:100%;display:block}
  figcaption{padding:10px 12px;color:#0d3d07;font-weight:800;text-align:center;background:#7ddb5b}
</style></head><body>
<header>Golazo — معرض القوالب (${keys.length}) — مُولّد من المحرّك الفعلي</header>
<div class="grid">${cards.join('\n')}</div>
</body></html>`;
  fs.writeFileSync(path.join(__dirname, 'gallery.html'), html);
  console.log(`✓ gallery.html written (${keys.length} templates)`);
})();
