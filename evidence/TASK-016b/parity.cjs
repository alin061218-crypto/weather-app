// Compare the clean Git baseline and current production modules with identical fixtures.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { renderIndex, root } = require('./assets.cjs');
const helperFile = path.join(root, 'evidence/TASK-015e/browser.cjs');
const helper = new Module(helperFile, module);
helper.filename = helperFile;
helper.paths = Module._nodeModulePaths(path.dirname(helperFile));
let source = fs.readFileSync(helperFile, 'utf8');
source = source.replace('await page.goto(runtime.url);', `
  await context.addInitScript(() => {
    let seed = 16016;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  });
  if (runtime.baseline) {
    await page.route('**/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body: runtime.baselineMain }));
  }
  // Reduced motion still moves the Three.js camera. Freeze only that camera in both
  // fixture responses so different frame scheduling cannot create false pixel diffs.
  await page.route('**/js/atmosphere.js*', route => route.fulfill({ contentType: 'text/javascript', body: runtime.fixedAtmosphere }));
  await page.route(runtime.url, route => route.fulfill({ contentType: 'text/html', body: runtime.baseline ? runtime.baselineIndex : runtime.currentIndex }));
  await page.goto(runtime.url);`);
helper._compile(source, helperFile);
const { start, pageFor, tabTo } = helper.exports;
const baselineMain = execFileSync('git', ['show', 'e6e8dc0:frontend/js/main.js'], { cwd: root, encoding: 'utf8' });
const baselineIndex = execFileSync('git', ['show', 'e6e8dc0:frontend/index.html'], { cwd: root, encoding: 'utf8' });
const output = path.join(__dirname, process.argv[2] || 'parity');
fs.mkdirSync(output, { recursive: true });
const hash = bytes => crypto.createHash('sha1').update(bytes).digest('hex');
async function capture(runtime, width, theme, baseline) {
  runtime.baseline = baseline;
  const { page, context, errors } = await pageFor(runtime, width, { loggedIn: false });
  if (theme === 'light') await page.locator('#theme-btn').click();
  await page.evaluate(() => document.fonts.ready);
  await tabTo(page, '.tab-btn[data-tab="home"]');
  await page.evaluate(() => scrollTo(0, 0));
  // Finish finite CSS transitions before serializing computed values.
  await page.waitForTimeout(400);
  const snapshot = await page.evaluate(() => {
    const selectors = ['#weather-card', '.tab-bar', '#guide-content', '#me-login-block', '.ambient-glow'];
    const nodes = selectors.flatMap(selector => [...document.querySelectorAll(selector)].flatMap(root => [root, ...root.querySelectorAll('*')]));
    const styles = nodes.map(el => {
      const css = getComputedStyle(el);
      return [el.tagName, el.id, el.className, [...css].sort().map(property => [property, css.getPropertyValue(property)])];
    });
    const hero = document.querySelector('.weather-hero');
    const heroCss = getComputedStyle(hero), glow = getComputedStyle(hero, '::before');
    return {
      html: document.querySelector('#weather-card').outerHTML,
      styles, chart: document.querySelector('#temp-chart').toDataURL(),
      weatherScene: document.body.dataset.weather,
      hero: { border: heroCss.borderWidth, shadow: heroCss.boxShadow, glow: glow.backgroundImage },
      focus: { visible: document.activeElement.matches(':focus-visible'), outline: getComputedStyle(document.activeElement).outline },
      size: { width: innerWidth, overflow: document.body.scrollWidth > innerWidth + 1 }
    };
  });
  assert.deepEqual(errors, [], 'runtime errors');
  assert.equal(snapshot.hero.border, '0px', 'hero acquired a hard border');
  assert.equal(snapshot.hero.shadow, 'none', 'hero acquired a hard shadow');
  assert.equal(snapshot.focus.visible, true);
  assert.equal(snapshot.size.overflow, false);
  // Match the historical long screenshot framing; UI comparison above uses production layout.
  await page.evaluate(() => {
    const nav = document.querySelector('.tab-bar');
    nav.style.position = 'static'; nav.style.transform = 'none'; nav.style.margin = 'var(--space-3) auto';
  });
  const name = `${baseline ? 'baseline' : 'current'}-${theme}-${width}`;
  const image = await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled' });
  await context.close();
  return { snapshot, image };
}
(async () => {
  const runtime = await start();
  const fixedAtmosphere = fs.readFileSync(path.join(root, 'frontend/js/atmosphere.js'), 'utf8')
    .replace(/this\.camera\.position\.([xy]) \+=[^\n]+/g, 'this.camera.position.$1 = 0;');
  Object.assign(runtime, { baselineMain, baselineIndex, currentIndex: renderIndex(), fixedAtmosphere });
  const results = [];
  try {
    for (const width of [375, 768, 1280]) for (const theme of ['dark', 'light']) {
      const before = await capture(runtime, width, theme, true);
      const after = await capture(runtime, width, theme, false);
      const beforeJson = JSON.stringify(before.snapshot), afterJson = JSON.stringify(after.snapshot);
      if (beforeJson !== afterJson) {
        fs.writeFileSync(path.join(output, 'before.json'), beforeJson);
        fs.writeFileSync(path.join(output, 'after.json'), afterJson);
        throw new Error(`${width}/${theme}: DOM/style/chart snapshots differ; see before.json and after.json`);
      }
      assert.equal(hash(after.image), hash(before.image), `${width}/${theme}: screenshot pixels changed`);
      results.push({ width, theme, nodes: after.snapshot.styles.length, screenshotSHA1: hash(after.image), chartSHA1: hash(after.snapshot.chart), identical: true });
      console.log(`PASS: ${width}px ${theme}; ${after.snapshot.styles.length} elements' computed styles, DOM, chart pixels, and complete screenshot identical to baseline`);
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  } finally { await runtime.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
