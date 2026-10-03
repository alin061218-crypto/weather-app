const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { assert, fs, path, start, pageFor } = require('../TASK-019/browser.cjs');
const baseline = require('./baseline.json');
const root = path.resolve(__dirname, '../..');
const output = __dirname;
const runtimeModules = process.env.EVIDENCE_MODULES || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const sharp = require(path.join(runtimeModules, 'sharp'));

function sourceFor(version) {
  return version === 'before'
    ? execFileSync('git', ['show', `${baseline.commit}:${baseline.path}`], { cwd: root, encoding: 'utf8', windowsHide: true })
    : fs.readFileSync(path.join(root, baseline.path), 'utf8');
}

async function rainPage(runtime, { version = 'after', width = 1280, height = 900, theme = 'dark', seed = 21, level = 'rain' } = {}) {
  const fixture = await pageFor(runtime, width, 'rain', theme, height);
  const { page, context } = fixture;
  const source = sourceFor(version);
  await page.route('**/js/atmosphere.js*', route => route.fulfill({ contentType: 'text/javascript', body: source }));
  await page.route('**/api/location', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ city: '\u4e0a\u6d77', region: '\u4e0a\u6d77', country: '\u4e2d\u56fd', lat: 31.23, lon: 121.47 }) }));
  await page.evaluate(() => localStorage.removeItem('wx_last'));
  await page.reload();
  await page.waitForFunction(() => window.__task019Atmosphere?.currentScene?.data?.length && document.querySelector('#city').textContent.includes('\u4e0a\u6d77'));
  await page.evaluate(async ({ seed, level }) => {
    window.__task021Three = await import('three');
    const a = window.__task019Atmosphere;
    a.reducedMotion = true;
    a.camera.position.set(0, 0, 5);
    a.camera.updateMatrixWorld();
    const RainScene = a.currentScene.constructor;
    a.currentScene.dispose();
    let state = seed >>> 0;
    const originalRandom = Math.random;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    try { a.currentScene = new RainScene(a.scene, level === 'storm', level); }
    finally { Math.random = originalRandom; }
    a.renderer.render(a.scene, a.camera);
    window.__task021Project = d => {
      const p = new window.__task021Three.Vector3(d.x, d.y, d.z || 0).project(a.camera);
      return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
    };
  }, { seed, level });
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: document.body.scrollWidth, client: document.documentElement.clientWidth }));
  assert.equal(viewport.width, width);
  assert.equal(viewport.height, height);
  assert.ok(viewport.scroll <= viewport.client + 1, JSON.stringify(viewport));
  return { ...fixture, sourceHash: createHash('sha256').update(source).digest('hex'), viewport, context };
}

function saveJson(filename, data) {
  fs.writeFileSync(path.join(output, filename), JSON.stringify(data, null, 2) + '\n');
}

module.exports = { assert, fs, path, output, root, sharp, baseline, start, rainPage, sourceFor, saveJson };
