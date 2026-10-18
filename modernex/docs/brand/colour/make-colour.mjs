// More colour options for both logos. B: the block in ink; what is cut in it coloured; a four-colour speckle.
// C: the block's four sides each one colour; what is cut in it, and the saw's cut, in ink.
import fs from 'node:fs';
import opentype from 'opentype.js';
const [OUT, FONT] = process.argv.slice(2);
const font = opentype.parse(fs.readFileSync(FONT).buffer);
const C = { blue: '#1E6FD9', red: '#D93A2B', green: '#1F9D55', orange: '#F08C1A' };
const L = (c, d, w = 1.6, o = 1, cap = 'round') => `<path fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="${cap}" stroke-linejoin="round" d="${d}"/>`;
const rect = (c) => `<rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="${c}" stroke-width="1.6"/>`;
// The block's four sides, each with its corner turning into the next.
// Sawn square: red and green run the full width (square ends cover the corners), blue and orange stand between them.
const S = (c, d, cap) => `<path fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="${cap}" d="${d}"/>`;
const sides = S(C.red, 'M3 3H21', 'square') + S(C.blue, 'M21 3V21', 'butt') + S(C.green, 'M21 21H3', 'square') + S(C.orange, 'M3 21V3', 'butt');
const spE = (k) => k === 'B' ? L(C.red, 'M6 6.3h0', 1.5) + L(C.green, 'M18.6 8.2h0', 1.5) + L(C.orange, 'M8.3 18.7h0', 1.5) +
                          L(C.blue, 'M9.1 5.6h0M18.9 17.2h0', 1.1) + L(C.orange, 'M17.4 5.9h0M5.8 17.6h0', 1.1) + L(C.green, 'M5.9 9.6h0M15.6 18.9h0', 1.1)
                       : L('INK', 'M6 6.3h0M18.6 8.2h0M8.3 18.7h0', 1.5) + L('INK', 'M9.1 5.6h0M17.4 5.9h0M5.9 9.6h0M18.9 17.2h0M5.8 17.6h0M15.6 18.9h0', 1.1, .45);
const spM = (k) => k === 'B' ? L(C.orange, 'M6.2 6.2h0', 1.5) + L(C.blue, 'M18.4 12.2h0', 1.5) + L(C.red, 'M6.2 9.8h0M16.4 16h0', 1.1) +
                          L(C.green, 'M8.6 5.8h0M18.4 15.4h0', 1.1) + L(C.blue, 'M17.8 5.8h0', 1.1)
                       : L('INK', 'M6.2 6.2h0M18.4 12.2h0', 1.5) + L('INK', 'M6.2 9.8h0M8.6 5.8h0M18.4 15.4h0M16.4 16h0M17.8 5.8h0', 1.1, .45);
const marks = {
  B: { emodernex: rect('INK') + L(C.blue, 'M16.6 12.5A5 5 0 1 0 15.2 16') + L(C.red, 'M6.6 12.5H22.4') + spE('B'),
       modernex: rect('INK') + L(C.red, 'M7.2 15.8L10.6 7.6') + L(C.blue, 'M10.6 15.8L14 7.6') + L(C.green, 'M14 15.8L17.4 7.6') + L(C.orange, 'M6.6 18.4H22.4') + spM('B') },
  C: { emodernex: sides + L('INK', 'M16.6 12.5A5 5 0 1 0 15.2 16', 1.6, 1, 'butt') + L('INK', 'M6.6 12.5H22.4', 1.6, 1, 'square') + spE('C'),
       modernex: sides + L('INK', 'M7.2 15.8L10.6 7.6M10.6 15.8L14 7.6M14 15.8L17.4 7.6', 1.6, 1, 'square') + L('INK', 'M6.6 18.4H22.4', 1.6, 1, 'square') + spM('C') },
};
const words = { emodernex: ['eModernex', -0.03], modernex: ['Modernex Stones', -0.033] };
const fav = { emodernex: sides + L('#1f1f1f', 'M16.6 12.5A5 5 0 1 0 15.2 16', 1.6, 1, 'butt') + L('#1f1f1f', 'M6.6 12.5H22.4', 1.6, 1, 'square'),
              modernex: sides + L('#1f1f1f', 'M7.2 15.8L10.6 7.6M10.6 15.8L14 7.6M14 15.8L17.4 7.6', 1.6, 1, 'square') + L('#1f1f1f', 'M6.6 18.4H22.4', 1.6, 1, 'square') };
for (const k of Object.keys(fav)) fs.writeFileSync(`${OUT}/${k}-favicon-colour-C.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#ffffff"/>${fav[k]}</svg>\n`);
let html = '<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:sans-serif">';
for (const opt of ['B', 'C']) for (const k of ['emodernex', 'modernex']) {
  const [word, ls] = words[k]; const h = 48;
  const p = font.getPath(word, h * 1.3, h * 0.71, h * 0.6, { kerning: true, letterSpacing: ls }); const w = Math.ceil(p.getBoundingBox().x2 + 2);
  for (const [bg, ink] of [['light', '#1f1f1f'], ['dark', '#e8e8e8']]) {
    const m = marks[opt][k].replaceAll('INK', ink);
    fs.writeFileSync(`${OUT}/${k}-logo-colour-${opt}-on-${bg}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${word}"><g transform="scale(2)">${m}</g><path fill="${ink}" d="${p.toPathData(2)}"/></svg>\n`);
    fs.writeFileSync(`${OUT}/${k}-mark-colour-${opt}-on-${bg}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="${word}">${m}</svg>\n`);
  }
  html += `<div style="display:flex"><div style="background:#fff;padding:22px;flex:1;display:flex;gap:22px;align-items:center"><b style="width:20px">${opt}</b>
    <img src="${k}-logo-colour-${opt}-on-light.svg" style="height:64px"><img src="${k}-mark-colour-${opt}-on-light.svg" style="height:24px"></div>
    <div style="background:#252526;padding:22px;flex:1;display:flex;gap:22px;align-items:center"><img src="${k}-logo-colour-${opt}-on-dark.svg" style="height:64px"><img src="${k}-mark-colour-${opt}-on-dark.svg" style="height:24px"></div></div>`;
}
fs.writeFileSync(`${OUT}/sheet.html`, html + '</body>');
console.log('made');
