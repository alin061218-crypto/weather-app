const fs = require('node:fs');
const css = fs.readFileSync('frontend/css/style.css', 'utf8');

const parse = value => value.match(/#([0-9a-f]{6})/i).slice(1)[0].match(/../g).map(v => parseInt(v, 16) / 255);
const luminance = rgb => rgb.reduce((sum, channel, i) => {
  const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return sum + linear * [0.2126, 0.7152, 0.0722][i];
}, 0);
const ratio = (a, b) => {
  const values = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${label}`);
  if (!ok) process.exitCode = 1;
};

const darkScenes = {
  'clear-day': ['#a9b4c5', '#182334'], 'clear-night': ['#a9b4c5', '#0a0e17'],
  cloudy: ['#a9b4c5', '#172233'], overcast: ['#a9b4c5', '#151f2e'],
  rain: ['#a9b4c5', '#101c2e'], snow: ['#b4becd', '#2b3648'],
  fog: ['#b4becd', '#262e3a'], storm: ['#b1bdcd', '#111827']
};
for (const [scene, [ink, bg]] of Object.entries(darkScenes)) {
  const value = ratio(ink, bg);
  console.log(`dark ${scene} --ink-muted: ${value.toFixed(2)}:1`);
  check(`${scene} maps --ink-muted at AA`, value >= 4.5);
}
const light = ratio('#596476', '#f6f4f0');
const lightNight = ratio('#b4becd', '#243047');
console.log(`light generic --ink-muted: ${light.toFixed(2)}:1`);
console.log(`light clear-night --ink-muted: ${lightNight.toFixed(2)}:1`);
check('light scenes map --ink-muted at AA', light >= 4.5 && lightNight >= 4.5);
check('body[data-weather] applies --ink-muted from scene mapping', /body\[data-weather\]\s*\{[^}]*--ink-muted:\s*var\(--scene-muted\)/.test(css));

const buttons = [
  ['dark button', '#08101c', '#5b9cf5'], ['dark hover', '#08101c', '#73adf7'],
  ['light button', '#ffffff', '#2c6ccf'], ['light hover', '#ffffff', '#2c6ccf']
];
for (const [label, fg, bg] of buttons) {
  const value = ratio(fg, bg);
  console.log(`${label} contrast: ${value.toFixed(2)}:1`);
  check(`${label} meets AA`, value >= 4.5);
}
check('primary button uses --primary-on', /\.btn-primary\s*\{[^}]*color:\s*var\(--primary-on\)/.test(css));

if (process.exitCode) process.exit(1);
