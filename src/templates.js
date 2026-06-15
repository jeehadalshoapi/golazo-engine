/**
 * templates.js — single entry point for card generation.
 *
 * Splits by concern (this file stays small and just wires them together):
 *   src/svg-helpers.js    shared engine — constants, native-<text> helpers, frame
 *   src/news-templates.js NEWS cards (breaking/confirmed/rumors/quote) + roundup cover
 *   src/match-templates.js MATCH cards (standing/group/knockout/prematch/result/…)
 *
 * CRITICAL constraint lives in svg-helpers.js: @resvg/resvg-js does NOT render
 * <foreignObject>, so every Arabic text run is a native <text> (arText/arBox/arBlock).
 */
const { C, W, H, frame } = require('./svg-helpers');
const NEWS = require('./news-templates');
const MATCH = require('./match-templates');

// Registry: news cards first, then match cards. Keys must stay lowercase + unique.
const TEMPLATES = Object.assign({}, NEWS, MATCH);

function buildSvg(template, data) {
  const tpl = TEMPLATES[template];
  if (!tpl) throw new Error('Unknown template: ' + template);
  const d = Object.assign({ hashtag: '#GOLAZO', tlogo: '' }, data || {});
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0"/></filter></defs>
  ${frame(d)}
  ${tpl.content(d)}
  </svg>`;
}

module.exports = { buildSvg, TEMPLATES, C, W, H };
