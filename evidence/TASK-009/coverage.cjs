// Guard against the original methodological defect: newly added CSS scenes must be audited.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readPalette, composite, ratio } = require('./contrast-common.cjs');
const css = fs.readFileSync(require('node:path').resolve(__dirname, '../../frontend/css/style.css'), 'utf8');
const base = readPalette(css);
const sourceRule = css.match(/body\[data-weather="([\w-]+)"\]\s*\{[^}]+\}/)[0];
const addedRule = sourceRule.replace(/data-weather="[\w-]+"/, 'data-weather="coverage-fixture"');
const added = readPalette(`${css}\n${addedRule}`);
assert.equal(added.scenes.length, base.scenes.length + 1);
assert.equal(added.coverage.cssPaletteRuleCount, base.coverage.cssPaletteRuleCount + 1);
assert.ok(added.scenes.some(scene => scene.name === 'coverage-fixture'));
assert.throws(() => readPalette(`${css}\n${sourceRule}`), /duplicate scene/);
assert.throws(() => readPalette(`${css}\n${addedRule.replace(/--scene-muted:[^;]+;/, '')}`), /must define a solid --scene-muted/);
assert.throws(() => readPalette(`${css}\n[data-theme="light"] ${addedRule}`), /unsupported weather palette selector/);
assert.equal(readPalette(`${css}\n/* ${addedRule} */`).scenes.length, base.scenes.length);
const beforeOpacity = ['dark', 'light'].map(theme => {
  const tokens = theme === 'dark' ? base.scenes[0].tokens : base.lightScene;
  const effective = composite(tokens['--scene-muted'], tokens['--scene-bg'], .6);
  const value = ratio(effective, tokens['--scene-bg']);
  assert.ok(value < 4.5, 'the original recent-clear opacity creates a real text contrast failure');
  return { theme, opacity: .6, foreground: tokens['--scene-muted'], background: tokens['--scene-bg'], effective, ratio: +value.toFixed(2), threshold: 4.5 };
});
fs.writeFileSync(require('node:path').join(__dirname, 'recent-clear-before.json'), JSON.stringify(beforeOpacity, null, 2) + '\n');
console.log('PASS: added CSS scene automatically included; duplicates, missing colors and unsupported overrides fail; commented rules excluded');
