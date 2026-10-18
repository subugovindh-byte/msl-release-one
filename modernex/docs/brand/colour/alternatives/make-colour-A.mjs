// The two logos in colour: red, blue, green and orange, given to the parts of each mark (the block, what is cut in it, the
// saw's cut, the speckle); the wordmark stays ink on light, light on dark. Our own shades of the four colours.
import fs from 'node:fs';
import opentype from 'opentype.js';
const [OUT, FONT] = process.argv.slice(2);
const font = opentype.parse(fs.readFileSync(FONT).buffer);
const C = { blue: '#1E6FD9', red: '#D93A2B', green: '#1F9D55', orange: '#F08C1A' };
const line = (c, d, w = 1.6, o = 1) => `<path fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;
const block = `<rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="${C.blue}" stroke-width="1.6"/>`;
const marks = {
  emodernex: (sp = true) => block + line(C.red, 'M16.6 12.5A5 5 0 1 0 15.2 16') + line(C.green, 'M6.6 12.5H22.4') +
    (sp ? line(C.orange, 'M6 6.3h0M18.6 8.2h0M8.3 18.7h0', 1.5) + line(C.blue, 'M9.1 5.6h0M17.4 5.9h0M5.9 9.6h0', 1.1, .55) +
          line(C.green, 'M18.9 17.2h0M5.8 17.6h0M15.6 18.9h0', 1.1, .55) : ''),
  modernex: (sp = true) => block + line(C.red, 'M7.2 15.8L10.6 7.6') + line(C.orange, 'M10.6 15.8L14 7.6') + line(C.green, 'M14 15.8L17.4 7.6') +
    line(C.blue, 'M6.6 18.4H22.4') +
    (sp ? line(C.orange, 'M6.2 6.2h0', 1.5) + line(C.red, 'M18.4 12.2h0', 1.5) + line(C.green, 'M6.2 9.8h0M18.4 15.4h0', 1.1, .55) +
          line(C.blue, 'M8.6 5.8h0M16.4 16h0M17.8 5.8h0', 1.1, .55) : ''),
};
const words = { emodernex: ['eModernex', -0.03], modernex: ['Modernex Stones', -0.033] };
for (const k of Object.keys(marks)) {
  const [word, ls] = words[k];
  const h = 48; const p = font.getPath(word, h * 1.3, h * 0.71, h * 0.6, { kerning: true, letterSpacing: ls }); const w = Math.ceil(p.getBoundingBox().x2 + 2);
  for (const [bg, ink] of [['light', '#1f1f1f'], ['dark', '#e8e8e8']]) {
    fs.writeFileSync(`${OUT}/${k}-logo-colour-on-${bg}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${word}">
  <g transform="scale(2)">${marks[k]()}</g>
  <path fill="${ink}" d="${p.toPathData(2)}"/>
</svg>
`);
  }
  fs.writeFileSync(`${OUT}/${k}-mark-colour.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="${word}">${marks[k]()}</svg>\n`);
  fs.writeFileSync(`${OUT}/${k}-favicon-colour.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#ffffff"/>${marks[k](false)}</svg>\n`);
}
fs.writeFileSync(`${OUT}/sheet.html`, `<!doctype html><meta charset="utf-8"><body style="margin:0">
${['emodernex', 'modernex'].map((k) => `<div style="background:#fff;padding:28px;display:flex;gap:28px;align-items:center;flex-wrap:wrap">
  <img src="${k}-logo-colour-on-light.svg" style="height:80px"><img src="${k}-logo-colour-on-light.svg" style="height:32px">
  <img src="${k}-mark-colour.svg" style="height:64px"><img src="${k}-mark-colour.svg" style="height:24px"><img src="${k}-favicon-colour.svg" style="height:32px;box-shadow:0 0 0 1px #ddd;border-radius:6px"><img src="${k}-favicon-colour.svg" style="height:16px"></div>
<div style="background:#252526;padding:28px;display:flex;gap:28px;align-items:center;flex-wrap:wrap">
  <img src="${k}-logo-colour-on-dark.svg" style="height:80px"><img src="${k}-logo-colour-on-dark.svg" style="height:32px"><img src="${k}-mark-colour.svg" style="height:64px"></div>`).join('')}</body>`);
console.log('made');
