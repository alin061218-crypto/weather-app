// WCAG contrast is calculated from current CSS values, not copied constants.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.resolve(__dirname, '../../frontend/css/style.css'), 'utf8');
const declarations = block => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const root = declarations(css.match(/:root\s*\{([\s\S]*?)\n\}/)[1]);
const light = { ...root, ...declarations(css.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)[1]) };
const scenes = [...css.matchAll(/^body\[data-weather="([\w-]+)"\]\s*\{([^}]+)\}/gm)].map(m => [m[1], declarations(m[2])]);
function rgb(value) {
  const match = value.match(/^#([a-f0-9]{6})$/i);
  assert.ok(match, `expected solid CSS color: ${value}`);
  return match[1].match(/../g).map(v => parseInt(v, 16) / 255);
}
function luminance(color) { return rgb(color).reduce((sum, v, i) => sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i], 0); }
function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y) + .05) / (Math.min(x,y) + .05); }
const rows = [];
function check(label, fg, bg, threshold) {
  const result = { label, fg, bg, ratio: +ratio(fg,bg).toFixed(2), threshold };
  rows.push(result); assert.ok(ratio(fg,bg) >= threshold, JSON.stringify(result));
}
for (const [name, tokens] of scenes) {
  check(`dark ${name} muted text`, tokens['--scene-muted'], tokens['--scene-bg'], 4.5);
  check(`dark ${name} focus ring`, root['--primary'], tokens['--scene-bg'], 3);
}
const lightScene = declarations(css.match(/\[data-theme="light"\] body\[data-weather\]\s*\{([^}]+)\}/)[1]);
const lightNight = declarations(css.match(/\[data-theme="light"\] body\[data-weather="clear-night"\]\s*\{([^}]+)\}/)[1]);
check('light scene muted text', lightScene['--scene-muted'], lightScene['--scene-bg'], 4.5);
check('light night muted text', lightNight['--scene-muted'], lightNight['--scene-bg'], 4.5);
for (const [theme, tokens] of [['dark',root], ['light',light]]) {
  for (const bg of ['--primary', '--primary-hover']) check(`${theme} button ${bg}`, tokens['--primary-on'], tokens[bg], 4.5);
  check(`${theme} focus ring on raised`, tokens['--primary'], tokens['--surface-raised'], 3);
}
const lines = rows.map(r => `PASS\t${r.label}\t${r.fg} / ${r.bg}\t${r.ratio}:1 >= ${r.threshold}:1`);
fs.writeFileSync(path.join(__dirname, 'contrast.txt'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(__dirname, 'contrast.json'), JSON.stringify(rows,null,2) + '\n');
console.log(lines.join('\n'));
