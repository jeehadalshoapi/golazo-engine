/**
 * render.js — rasterizes an SVG string to a PNG buffer using @resvg/resvg-js.
 *
 * Fonts are loaded from the committed fonts/ dir by ABSOLUTE path so it works
 * regardless of the process CWD on Railway. loadSystemFonts:false keeps output
 * deterministic (never depends on host-installed fonts).
 */
const { Resvg } = require('@resvg/resvg-js');
const path = require('path');

const FONT_DIR = path.join(__dirname, '..', 'fonts');

function svgToPng(svg) {
  const resvg = new Resvg(svg, {
    font: { fontDirs: [FONT_DIR], loadSystemFonts: false, defaultFontFamily: 'Cairo' },
    background: 'white',
  });
  return resvg.render().asPng();
}

module.exports = { svgToPng };
