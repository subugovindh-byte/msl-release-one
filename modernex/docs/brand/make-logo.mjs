// The Modernex Stones logo, sister to eModernex's: the mark in ghost style (line only, no fill, round ends) in salt-and-pepper greys — a stone block, an
// block cut into slabs leaning off the saw, the blade's cut running out beneath them, granite speckles — beside the wordmark as the apps have always set it:
// Inter ExtraBold, solid, letter-spacing −0.03 em.
import fs from 'node:fs';
import opentype from 'opentype.js';
const OUT = process.argv[2];
const WORD = 'Modernex Stones';
const font = opentype.parse(fs.readFileSync(process.argv[3]).buffer);

const mark = (speckles = true) => [
  '<path stroke-linejoin="miter" d="M3 3H21V21H3Z"/>',     // the block, sawn square
  '<path stroke-linecap="square" d="M7.2 15.8L10.6 7.6M10.6 15.8L14 7.6M14 15.8L17.4 7.6"/>',   // slabs off the gang saw, leaning together
  '<path stroke-linecap="square" d="M6.6 18.4H22.4"/>',  // the blade's cut beneath them, running out through the block
  // Salt and pepper: granite's speckle, scattered unevenly, in two tones and two sizes, clear of the e.
  ...(speckles ? ['<path stroke-width="1.5" d="M6.2 6.2h0M18.4 12.2h0"/>',
                  '<path stroke-width="1.1" stroke-opacity=".45" d="M6.2 9.8h0M8.6 5.8h0M18.4 15.4h0M16.4 16h0M17.8 5.8h0"/>'] : []),
].join('');
const ghost = (w, color, body) => `<g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;

function wordmark(size, x, baseline) {
  const p = font.getPath(WORD, x, baseline, size, { kerning: true, letterSpacing: -0.033 });
  const bb = p.getBoundingBox();
  return { d: p.toPathData(2), width: bb.x2 };
}

function logo(color, { height = 48, stroke = 1.6, textStroke = 1.3 } = {}) {
  const s = height / 24;
  const w = wordmark(height * 0.6, height + height * 0.3, height * 0.71);
  const width = Math.ceil(w.width + 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Modernex Stones">
  <g transform="scale(${s})">${ghost(stroke, color, mark())}</g>
  <path fill="${color}" d="${w.d}"/>
</svg>
`;
}
const icon = (color, speckles = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="Modernex Stones">
  ${ghost(1.6, color, mark(speckles))}
</svg>
`;
const files = {
  'modernex-logo.svg': logo('currentColor'),
  'modernex-logo-on-light.svg': logo('#1f1f1f'),
  'modernex-logo-on-dark.svg': logo('#e8e8e8'),
  'modernex-mark.svg': icon('currentColor'),
  'modernex-mark-on-light.svg': icon('#1f1f1f'),
  'modernex-mark-on-dark.svg': icon('#e8e8e8'),
  'favicon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#252526"/>${ghost(1.8, '#e8e8e8', mark(false))}</svg>\n`,
};
for (const [n, c] of Object.entries(files)) fs.writeFileSync(`${OUT}/${n}`, c);
// A sheet to look at: on light and on the dark header bar, large and at the sizes they are used.
fs.writeFileSync(`${OUT}/sheet.html`, `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:sans-serif">
<div style="background:#fff;padding:32px;display:flex;flex-direction:column;gap:28px">
  <img src="modernex-logo-on-light.svg" style="height:96px;align-self:flex-start">
  <div style="display:flex;gap:28px;align-items:center"><img src="modernex-logo-on-light.svg" style="height:40px"><img src="modernex-logo-on-light.svg" style="height:24px">
    <img src="modernex-mark-on-light.svg" style="height:64px"><img src="modernex-mark-on-light.svg" style="height:32px"><img src="modernex-mark-on-light.svg" style="height:16px"><img src="favicon.svg" style="height:32px"><img src="favicon.svg" style="height:16px"></div>
</div>
<div style="background:#252526;padding:32px;display:flex;flex-direction:column;gap:28px">
  <img src="modernex-logo-on-dark.svg" style="height:96px;align-self:flex-start">
  <div style="display:flex;gap:28px;align-items:center"><img src="modernex-logo-on-dark.svg" style="height:32px"><img src="modernex-mark-on-dark.svg" style="height:64px"><img src="modernex-mark-on-dark.svg" style="height:24px"></div>
  <div style="height:56px;display:flex;align-items:center;gap:10px;border-top:1px solid #444;padding-top:16px"><img src="modernex-logo-on-dark.svg" style="height:28px"><span style="color:#e8e8e8;opacity:.7;font-size:12px">Accounts &amp; Operations</span></div>
</div></body>`);
console.log('made', Object.keys(files).length, 'files');
