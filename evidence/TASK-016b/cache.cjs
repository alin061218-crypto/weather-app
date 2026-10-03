// Real HTTP headers + an actual warm browser cache across a child-module edit.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const config = path.join(root, 'frontend/js/config.js');
const main = path.join(root, 'frontend/js/main.js');
const hash = bytes => crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 8);
const mapOf = html => JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
async function freePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function waitForIndex(url, child) {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(url); if (response.ok) return { response, html: await response.text() }; } catch {}
    if (child.exitCode !== null) throw new Error('Evidence server exited');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Evidence server did not start');
}
(async () => {
  const original = fs.readFileSync(config), mainBefore = hash(fs.readFileSync(main));
  const port = await freePort(), url = `http://127.0.0.1:${port}/`;
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task016b-cache-db-'));
  let child, browser;
  try {
    fs.appendFileSync(config, '\nglobalThis.__childVersionEvidence = "before";\n');
    const env = {
      ...process.env, PORT: String(port), DB_DIR: dbDir, NODE_ENV: 'development',
      JWT_SECRET: crypto.randomBytes(32).toString('hex'), ADMIN_USER: 'task016b-fixture',
      ADMIN_PASSWORD_HASH: require(path.join(root, 'node_modules/bcryptjs')).hashSync('fixture-only-password', 4)
    };
    child = spawn(process.execPath, ['server.js'], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
    const first = await waitForIndex(url, child), beforeMap = mapOf(first.html);
    assert.equal(first.response.headers.get('cache-control'), 'no-cache');
    const modules = Object.entries(beforeMap).filter(([name]) => name.startsWith('app/'));
    for (const [name, asset] of modules) {
      const response = await fetch(new URL(asset, url));
      assert.equal(response.status, 200, name);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable', name);
      assert.equal(new URL(asset, url).searchParams.get('v'), hash(Buffer.from(await response.arrayBuffer())), name);
    }
    browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    // A saved fresh weather fixture avoids API traffic without Playwright routing,
    // which would disable the browser HTTP cache and invalidate this test.
    await context.addInitScript(() => {
      const wx = {
        current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
        hourly: { time: ['2026-10-03T00:00'], temperature_2m: [22] },
        daily: { time: ['2026-10-03'], temperature_2m_max: [24], temperature_2m_min: [14], weathercode: [0] }
      };
      localStorage.setItem('wx_last', JSON.stringify({ loc: { city: '北京', region: '北京', country: '中国', lat: 39.904, lon: 116.407 }, wx, ts: Date.now() }));
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const cacheHits = new Set(), requestUrls = new Map();
    cdp.on('Network.requestWillBeSent', event => requestUrls.set(event.requestId, event.request.url));
    cdp.on('Network.requestServedFromCache', event => cacheHits.add(requestUrls.get(event.requestId)));
    cdp.on('Network.responseReceived', event => { if (event.response.fromDiskCache) cacheHits.add(event.response.url); });
    await page.goto(url);
    await page.waitForFunction(() => globalThis.__childVersionEvidence === 'before');
    fs.appendFileSync(config, '\nglobalThis.__childVersionEvidence = "after";\n');
    const second = await waitForIndex(url, child), afterMap = mapOf(second.html);
    assert.notEqual(afterMap['app/config'], beforeMap['app/config']);
    assert.equal(afterMap['app/main'], beforeMap['app/main']);
    await page.reload();
    await page.waitForFunction(() => globalThis.__childVersionEvidence === 'after');
    await page.waitForFunction(() => !document.querySelector('#weather-card').classList.contains('hidden'));
    assert.deepEqual(errors, []);
    assert.ok(cacheHits.has(new URL(afterMap['app/main'], url).href), 'unchanged main.js must actually come from warm browser cache');
    assert.equal(hash(fs.readFileSync(main)), mainBefore);
    const result = { moduleCount: modules.length, indexCacheControl: 'no-cache', moduleCacheControl: 'public, max-age=31536000, immutable', beforeConfig: beforeMap['app/config'], afterConfig: afterMap['app/config'], mainUnchanged: true, mainFromBrowserCache: true, browserObservedChild: 'after', errors };
    fs.writeFileSync(path.join(__dirname, 'cache.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('PASS: all module HTTP hashes/immutable headers; warm cached main loads edited child through automatically updated importmap');
  } finally {
    if (browser) await browser.close();
    if (child) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    fs.writeFileSync(config, original);
    fs.rmSync(dbDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
