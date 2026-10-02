const fs = require('fs');

const css = fs.readFileSync('frontend/css/style.css', 'utf8');
const hex = value => {
  const m = String(value).trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`Expected six digit hex color, got ${value}`);
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255);
};
const lum = rgb => rgb.reduce((sum, c, i) => {
  const s = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return sum + s * [0.2126, 0.7152, 0.0722][i];
}, 0);
const contrast = (a, b) => {
  const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const block = (pattern, source = css) => source.match(pattern)?.[1] || '';
const value = (source, name) => source.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
const root = block(/:root\s*\{([\s\S]*?)\}/);
const light = block(/\[data-theme="light"\]\s*\{([\s\S]*?)\}/);
const expected = {
  dark: { bg: value(root, '--bg'), ink: value(root, '--ink'), muted: value(root, '--ink-muted'), primaryText: value(root, '--primary') },
  light: { bg: value(light, '--bg'), ink: value(light, '--ink'), muted: value(light, '--ink-muted'), primaryText: value(light, '--primary') }
};
if (Object.values(expected).some(tokens => Object.values(tokens).some(color => !color))) throw new Error('Could not parse theme tokens from style.css');
const scenes = {
  'clear-day': { dark: ['#182334', '#f3f6fa', '#c3cbd8'], light: ['#f6f4f0', '#1a1d24', '#3f4a5c'] },
  'clear-night': { dark: ['#0a0e17', '#eef3fa', '#c3cbd8'], light: ['#243047', '#f2f5f9', '#d1d8e2'] },
  cloudy: { dark: ['#172233', '#eef2f7', '#c3cbd8'], light: ['#f6f4f0', '#1a1d24', '#3f4a5c'] },
  rain: { dark: ['#101c2e', '#eef2f7', '#c3cbd8'], light: ['#f6f4f0', '#1a1d24', '#3f4a5c'] },
  snow: { dark: ['#2b3648', '#f2f5f9', '#d1d8e2'], light: ['#f6f4f0', '#1a1d24', '#3f4a5c'] },
  fog: { dark: ['#262e3a', '#f2f5f9', '#d1d8e2'], light: ['#f6f4f0', '#1a1d24', '#3f4a5c'] },
  storm: { dark: ['#111827', '#f2f5f9', '#cfd7e2'], light: ['#f6f4f0', '#1a1d24', '#3f4a5c'] }
};
const failures = [];
for (const [theme, token] of Object.entries(expected)) {
  const mutedRatio = contrast(token.muted, token.bg);
  if (mutedRatio < 4.5) failures.push(`${theme} --ink-muted ${mutedRatio.toFixed(2)}`);
  if (theme === 'light' && contrast(token.primaryText, token.bg) < 4.5) failures.push(`light --primary text`);
  for (const [scene, colors] of Object.entries(scenes)) {
    const selector = `[data-theme="${theme}"][data-weather="${scene}"]`;
    const darkRule = block(new RegExp(`body\\[data-weather="${scene}"\\]\\s*\\{([\\s\\S]*?)\\}`));
    const lightRule = block(/\[data-theme="light"\]\s*body\[data-weather\]\s*\{([\s\S]*?)\}/);
    const lightNightRule = block(/\[data-theme="light"\]\s*body\[data-weather="clear-night"\]\s*\{([\s\S]*?)\}/);
    const sceneRule = theme === 'light' ? (scene === 'clear-night' ? lightNightRule : lightRule) : darkRule;
    const bg = value(sceneRule, '--scene-bg') || colors[theme][0];
    const main = value(sceneRule, '--scene-ink') || colors[theme][1];
    const sec = value(sceneRule, '--scene-secondary') || colors[theme][2];
    const mainRatio = contrast(main, bg);
    const secRatio = contrast(sec, bg);
    if (mainRatio < 4.5) failures.push(`${selector} primary ${mainRatio.toFixed(2)}`);
    if (secRatio < 4.5) failures.push(`${selector} secondary ${secRatio.toFixed(2)}`);
    console.log(`${theme}\t${scene}\tprimary ${mainRatio.toFixed(2)}:1\tsecondary ${secRatio.toFixed(2)}:1`);
  }
  console.log(`${theme}\t--ink-muted\t${mutedRatio.toFixed(2)}:1`);
  if (theme === 'light') console.log(`light\t--primary text\t${contrast(token.primaryText, token.bg).toFixed(2)}:1`);
}
if (failures.length) { console.error(`FAIL: ${failures.join('; ')}`); process.exit(1); }
console.log(`PASS: ${Object.keys(scenes).length * 2} scene pairs plus muted and light primary text meet 4.5:1`);
