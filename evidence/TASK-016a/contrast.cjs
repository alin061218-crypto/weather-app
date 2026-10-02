const fs = require('node:fs');
const css = fs.readFileSync('frontend/css/style.css', 'utf8');
const main = fs.readFileSync('frontend/js/main.js', 'utf8');

const parse = value => value.match(/#([0-9a-f]{6})/i).slice(1)[0].match(/../g).map(v => parseInt(v, 16) / 255);
const luminance = rgb => rgb.reduce((sum, channel, i) => {
  const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return sum + linear * [0.2126, 0.7152, 0.0722][i];
}, 0);
const ratio = (a, b) => {
  const values = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const dark = ratio('#c3cbd8', '#182334');
const light = ratio('#3f4a5c', '#f6f4f0');
console.log(`dark axis label contrast: ${dark.toFixed(2)}:1`);
console.log(`light axis label contrast: ${light.toFixed(2)}:1`);
const ok = dark >= 4.5 && light >= 4.5 && /12px system-ui/.test(main) && !/rgba\(255,255,255,0\.35\)|rgba\(0,0,0,0\.35\)/.test(main);
console.log(`${ok ? 'PASS' : 'FAIL'}\tchart axis labels meet 4.5:1 in both themes`);
if (!ok) process.exit(1);
