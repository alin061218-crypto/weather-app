// All contrast entry points derive their palette and coverage from production CSS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssPath = path.resolve(__dirname, '../../frontend/css/style.css');
const declarations = block => Object.fromEntries(
  [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()])
);

function readPalette(source = fs.readFileSync(cssPath, 'utf8')) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => ({ selector: m[1].trim(), tokens: declarations(m[2]) }));
  const root = rules.find(rule => rule.selector === ':root')?.tokens;
  const light = rules.find(rule => rule.selector === '[data-theme="light"]')?.tokens;
  assert.ok(root && light, 'both theme token rules must exist');
  // Count every rule with an explicit weather selector, plus palette overrides.
  // The generic body[data-weather] alias rule has no --scene-* declarations.
  const weatherRules = rules.filter(rule => /body\s*\[data-weather\s*(?:=|\])/.test(rule.selector)
    && (/body\s*\[data-weather\s*=/.test(rule.selector)
      || Object.keys(rule.tokens).some(key => key.startsWith('--scene-'))));
  const lightOverrides = weatherRules.filter(rule => rule.selector === '[data-theme="light"] body[data-weather]');
  assert.equal(lightOverrides.length, 1, 'exactly one uniform light palette override is required');
  const scenes = weatherRules.filter(rule => !lightOverrides.includes(rule)).map(rule => {
    const match = rule.selector.match(/^body\s*\[data-weather\s*=\s*["']?([\w-]+)["']?\s*\]$/);
    assert.ok(match, `unsupported weather palette selector: ${rule.selector}; extend the parser before claiming coverage`);
    return { name: match[1], tokens: rule.tokens };
  });
  assert.ok(scenes.length > 0, 'CSS must define weather scenes');
  assert.equal(new Set(scenes.map(scene => scene.name)).size, scenes.length, 'duplicate scene rules must not inflate coverage');
  assert.equal(scenes.length, weatherRules.length - 1, 'validated scenes must equal CSS weather palette rules minus the light override');
  const lightScene = lightOverrides[0].tokens;
  for (const [name, tokens] of [...scenes.map(scene => [scene.name, scene.tokens]), ['light override', lightScene]]) {
    for (const key of ['--scene-bg', '--scene-ink', '--scene-secondary', '--scene-muted']) {
      assert.match(tokens[key] || '', /^#[a-f0-9]{6}$/i, `${name} must define a solid ${key}; no copied fallback colors`);
    }
  }
  return { css, root, light: { ...root, ...light }, lightScene, scenes, coverage: {
    cssPaletteRuleCount: weatherRules.length,
    lightOverrideRuleCount: lightOverrides.length,
    expectedSceneCount: weatherRules.length - 1,
    validatedSceneCount: scenes.length,
    scenes: scenes.map(scene => scene.name)
  } };
}

function luminance(color) {
  assert.match(color || '', /^#[a-f0-9]{6}$/i, `expected solid CSS color: ${color}`);
  return color.slice(1).match(/../g).reduce((sum, hex, i) => {
    const channel = parseInt(hex, 16) / 255;
    return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
}
function ratio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function composite(foreground, background, opacity) {
  const channels = color => color.slice(1).match(/../g).map(hex => parseInt(hex, 16));
  const fg = channels(foreground), bg = channels(background);
  return '#' + fg.map((channel, i) => Math.round(channel * opacity + bg[i] * (1 - opacity)).toString(16).padStart(2, '0')).join('');
}

function runContrast(task, { chart = false } = {}) {
  const { css, root, light, lightScene, scenes, coverage } = readPalette();
  const clearRule = css.match(/\.recent-clear\s*\{([^}]+)\}/)?.[1];
  assert.ok(clearRule, 'recent clear control CSS must exist');
  const clearOpacity = Number(clearRule.match(/opacity:\s*([\d.]+)/)?.[1] ?? 1);
  assert.ok(clearOpacity >= 0 && clearOpacity <= 1, 'recent clear opacity must be valid');
  const rows = [];
  function check(theme, scene, label, foreground, background, threshold) {
    const value = ratio(foreground, background);
    const row = { theme, scene, label, foreground, background, ratio: +value.toFixed(2), threshold };
    assert.ok(value >= threshold, JSON.stringify(row));
    rows.push(row);
  }
  for (const scene of scenes) {
    for (const [theme, tokens, themeTokens] of [['dark', scene.tokens, root], ['light', lightScene, light]]) {
      for (const [label, token] of [['main', '--scene-ink'], ['secondary', '--scene-secondary'], ['muted', '--scene-muted']]) {
        check(theme, scene.name, label, tokens[token], tokens['--scene-bg'], 4.5);
      }
      check(theme, scene.name, 'focus ring', themeTokens['--primary'], tokens['--scene-bg'], 3);
      check(theme, scene.name, 'recent clear effective text', composite(tokens['--scene-muted'], tokens['--scene-bg'], clearOpacity), tokens['--scene-bg'], 4.5);
    }
  }
  for (const [theme, tokens] of [['dark', root], ['light', light]]) {
    for (const bg of ['--primary', '--primary-hover']) {
      check(theme, null, `button ${bg}`, tokens['--primary-on'], tokens[bg], 4.5);
    }
    check(theme, null, 'focus ring on raised', tokens['--primary'], tokens['--surface-raised'], 3);
  }
  assert.match(css, /body\[data-weather\]\s*\{[^}]*--ink-muted:\s*var\(--scene-muted\)/, 'muted text must use the validated scene token');
  assert.match(css, /\.btn-primary\s*\{[^}]*color:\s*var\(--primary-on\)/, 'primary buttons must use the validated text token');
  if (chart) {
    const render = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/visuals.js'), 'utf8');
    assert.match(render, /12px system-ui/, 'chart axes retain their legible font');
    assert.match(render, /getPropertyValue\(['"]--ink-secondary['"]\)/, 'chart axes use the validated scene secondary token');
  }
  const text = rows.map(row => `PASS\t${row.theme} ${row.scene || ''} ${row.label}\t${row.foreground} / ${row.background}\t${row.ratio}:1 >= ${row.threshold}:1`).join('\n');
  const summary = `PASS: ${coverage.validatedSceneCount} scenes = ${coverage.cssPaletteRuleCount} CSS palette rules - 1 light override; ${scenes.length * 2 * 3} text checks (dark/light × main/secondary/muted)`;
  fs.writeFileSync(path.join(__dirname, `contrast-${task}.json`), JSON.stringify({ coverage, rows }, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, `contrast-${task}.txt`), `${text}\n${summary}\nScenes: ${coverage.scenes.join(', ')}\n`);
  console.log(`${text}\n${summary}\nScenes: ${coverage.scenes.join(', ')}`);
  return { coverage, rows };
}

module.exports = { readPalette, ratio, composite, runContrast };
