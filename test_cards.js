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
};

for (const key of Object.keys(TEMPLATES)) {
  const svg = buildSvg(key, SAMPLES[key] || {});
  const png = svgToPng(svg);
  const file = path.join(OUT, `card_${key}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓ ${key.padEnd(10)} -> ${file}  (${png.length} bytes)`);
}
console.log(`\nDone. Open the PNGs in ${OUT} and verify them visually.`);
