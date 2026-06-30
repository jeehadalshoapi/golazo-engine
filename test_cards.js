/**
 * test_cards.js — local visual test. Renders one sample PNG per template into
 * an output dir, then you open them and eyeball: Arabic shaped + RTL correct,
 * multi-line wrap centered, no missing text, full frame present.
 *
 *   node test_cards.js          -> writes to ./out
 *   node test_cards.js <dir>    -> writes to <dir>
 */
const fs = require('fs');
const path = require('path');
const { buildSvg, TEMPLATES } = require('./src/templates');
const { svgToPng } = require('./src/render');

const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLES = {
  breaking: {
    time: 'الآن',
    headline: 'نيوكاسل يتغلب على وست هام بثلاثية في سانت جيمس بارك',
    details: 'فوز كبير 3-1 على ملعبه\nثنائية لأوسولا وهدف لجوردان',
    source: 'سكاي سبورتس',
  },
  confirmed: {
    player: 'فلوريان فيرتز',
    club: 'ليفربول',
    contract: '5 سنوات',
    fee: '116 مليون جنيه',
    until: '2030',
    source: 'فابريزيو رومانو',
  },
  rumors: {
    player: 'ماركوس راشفورد',
    fromClub: 'مانشستر يونايتد',
    toClub: 'برشلونة',
    details: 'مفاوضات متقدمة لإتمام الصفقة على سبيل الإعارة مع خيار الشراء في نهاية الموسم',
    status: 'مفاوضات متقدمة',
    source: 'ديلي ميل',
  },
  quote: {
    quote: 'نلعب من أجل اللقب حتى النهاية ولن نستسلم مهما كانت الصعوبات',
    author: 'بيب جوارديولا',
    role: 'مدرب مانشستر سيتي',
  },
  standing: {
    comp: 'دوري روشن السعودي',
    rows: 'الهلال | 24 | +38 | 60\nالاتحاد | 24 | +25 | 52\nالنصر | 24 | +21 | 50\nالأهلي | 24 | +18 | 47\nالقادسية | 24 | +9 | 41',
  },
  group: {
    comp: 'دوري أبطال أوروبا',
    group: 'المجموعة A',
    rows: 'ريال مدريد | 6 | +11 | 16\nمان سيتي | 6 | +7 | 13\nإنتر ميلان | 6 | -2 | 7\nيونغ بويز | 6 | -16 | 0',
  },
  knockout: {
    comp: 'دوري أبطال أوروبا',
    round: 'ربع النهائي',
    list: 'ريال مدريد | مان سيتي | 3 - 2\nبايرن ميونخ | باريس سان جيرمان | 1 - 1\nأرسنال | برشلونة | 2 - 0\nإنتر ميلان | ليفربول',
  },
  bracket: {
    comp: 'دوري أبطال أوروبا',
    champion: 'ريال مدريد',
    rounds: [
      { title: 'دور الـ16', matches: [
        { home: 'ريال مدريد', away: 'لايبزيغ', hs: 2, as: 0 },
        { home: 'مان سيتي', away: 'كوبنهاجن', hs: 3, as: 1 },
        { home: 'بايرن ميونخ', away: 'لاتسيو', hs: 3, as: 0 },
        { home: 'أرسنال', away: 'بورتو', hs: 1, as: 0 },
        { home: 'برشلونة', away: 'نابولي', hs: 3, as: 1 },
        { home: 'باريس', away: 'سوسيداد', hs: 2, as: 0 },
        { home: 'دورتموند', away: 'آيندهوفن', hs: 2, as: 0 },
        { home: 'أتلتيكو', away: 'إنتر', hs: 2, as: 1 },
      ] },
      { title: 'ربع النهائي', matches: [
        { home: 'ريال مدريد', away: 'مان سيتي', hs: 4, as: 3 },
        { home: 'بايرن ميونخ', away: 'أرسنال', hs: 1, as: 0 },
        { home: 'برشلونة', away: 'باريس', hs: 1, as: 4 },
        { home: 'دورتموند', away: 'أتلتيكو', hs: 4, as: 2 },
      ] },
      { title: 'نصف النهائي', matches: [
        { home: 'ريال مدريد', away: 'بايرن ميونخ', hs: 2, as: 1 },
        { home: 'باريس', away: 'دورتموند', hs: 0, as: 1 },
      ] },
      { title: 'النهائي', matches: [
        { home: 'ريال مدريد', away: 'دورتموند', hs: 2, as: 0 },
      ] },
    ],
  },
  prematch: {
    comp: 'دوري أبطال آسيا',
    round: 'دور الـ 16 — ذهاب',
    home: 'الهلال', away: 'النصر',
    date: 'الثلاثاء 12 أغسطس', time: '9:00 مساءً', stadium: 'المملكة أرينا',
  },
  result: {
    comp: 'دوري روشن السعودي', round: 'الجولة 24',
    home: 'الهلال', away: 'النصر', hs: '3', as: '1',
    // red cards arrive as "[R] name time" → drawn with a red-card glyph;
    // pens (homePens/awayPens) "1 0 1" → green/red shootout dots under the score.
    homeEvents: 'ميتروفيتش 23\nمالكوم 56\n[R] سالم الدوسري 78',
    awayEvents: 'رونالدو 90+2\n[R] تيليس 70',
  },
  matchstats: {
    home: 'الهلال', away: 'النصر', score: '3 - 1',
    stats: 'الاستحواذ % | 58 | 42\nالتسديدات | 14 | 9\nعلى المرمى | 6 | 3\nالركنيات | 7 | 4\nالأخطاء | 11 | 14\nxG | 2.3 | 1.1',
  },
  ratings: {
    team: 'الهلال أمام النصر — تقييمات الأداء',
    list: 'بونو | 7.2\nكوليبالي | 7.8\nسالم الدوسري | 8.7\nميتروفيتش | 8.1\nمالكوم | 7.6\nنيفيز | 7.0\nرومارينهو | 6.4\nالبليهي | 6.8',
  },
  fixtures: {
    date: 'الجمعة 12 أغسطس 2026', comp: 'مباريات مختارة',
    list: 'الهلال | النصر | روشن | 9:00 م\nريال مدريد | برشلونة | الليغا | 11:00 م\nمان سيتي | ليفربول | البريميرليغ | 6:30 م\nبايرن | دورتموند | البوندسليغا | 8:30 م\nيوفنتوس | إنتر | السيري آ | 10:45 م',
  },
  results: {
    date: 'الجمعة 12 أغسطس 2026', comp: 'نتائج مختارة',
    list: 'الهلال | النصر | 3 - 1 | روشن\nريال مدريد | برشلونة | 2 - 2 | الليغا\nمان سيتي | ليفربول | 1 - 0 | البريميرليغ\nبايرن | دورتموند | 4 - 0 | البوندسليغا',
  },
};

for (const key of Object.keys(TEMPLATES)) {
  const svg = buildSvg(key, SAMPLES[key] || {});
  const png = svgToPng(svg);
  const file = path.join(OUT, `card_${key}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓ ${key.padEnd(10)} -> ${file}  (${png.length} bytes)`);
}
console.log(`\nDone. Open the PNGs in ${OUT} and verify them visually.`);
