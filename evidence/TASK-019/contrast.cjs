// CSS-token contrast evidence for the seven rendered weather contexts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '../../frontend/css/style.css'), 'utf8');
const scenes = ['clear-day', 'clear-night', 'cloudy', 'rain', 'snow', 'fog', 'storm'];
const declarations = block => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
const parseHex = value => {
  const match = value.match(/^#([a-f0-9]{6})$/i);
  assert.ok(match, `expected solid hex color, got ${value}`);
  return match[1].match(/../g).map(channel => parseInt(channel, 16) / 255);
};
const luminance = color => parseHex(color).reduce((sum, channel, index) => {
  const linear = channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  return sum + linear * [.2126, .7152, .0722][index];
}, 0);
const ratio = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
};
const light = declarations(css.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)[1]);
const lightScene = declarations(css.match(/\[data-theme="light"\]\s*body\[data-weather\]\s*\{([^}]+)\}/)[1]);
assert.equal((css.match(/\[data-theme="light"\]\s*body\[data-weather="clear-night"\]/g) || []).length, 0, 'clear-night light exception must be removed');
assert.ok(lightScene['--scene-bg'] && lightScene['--scene-ink'] && lightScene['--scene-secondary'] && lightScene['--scene-muted']);

const rows = [];
for (const scene of scenes) {
  const match = css.match(new RegExp(`^body\\[data-weather="${scene}"\\]\\s*\\{([^}]+)\\}`, 'm'));
  assert.ok(match, `missing dark scene ${scene}`);
  const dark = declarations(match[1]);
  for (const [label, foreground, background] of [
    ['main', lightScene['--scene-ink'], lightScene['--scene-bg']],
    ['secondary', lightScene['--scene-secondary'], lightScene['--scene-bg']],
    ['muted', lightScene['--scene-muted'], lightScene['--scene-bg']]
  ]) {
    const value = ratio(foreground, background);
    const row = { theme: 'light', scene, label, foreground, background, ratio: +value.toFixed(2), threshold: 4.5 };
    rows.push(row);
    console.log(`PASS\tlight ${scene} ${label}\t${foreground} / ${background}\t${value.toFixed(2)}:1 >= 4.5:1`);
    assert.ok(value >= 4.5, JSON.stringify(row));
  }
  assert.ok(dark['--scene-bg'], `dark scene ${scene} must remain defined`);
}

for (const [label, foreground, background] of [
  ['theme button text', light['--primary-on'], light['--primary']],
  ['theme focus ring', light['--primary'], light['--surface-raised']]
]) {
  const value = ratio(foreground, background);
  const row = { theme: 'light', label, foreground, background, ratio: +value.toFixed(2), threshold: label.includes('focus') ? 3 : 4.5 };
  rows.push(row);
  console.log(`PASS\t${label}\t${foreground} / ${background}\t${value.toFixed(2)}:1 >= ${row.threshold}:1`);
  assert.ok(value >= row.threshold, JSON.stringify(row));
}

fs.writeFileSync(path.join(__dirname, 'contrast.json'), JSON.stringify(rows, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'contrast.txt'), rows.map(row => `PASS\t${row.theme} ${row.scene || ''} ${row.label}\t${row.ratio}:1 >= ${row.threshold}:1`).join('\n') + '\n');
console.log(`PASS: ${scenes.length} scenes × light theme main/secondary/muted contrast`);
