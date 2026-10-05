// Optional Lighthouse uses the npm exec cache, without adding runtime dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { start, pageFor } = require('../TASK-015e/browser.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

function lighthousePath() {
  if (process.env.LIGHTHOUSE_PATH) return process.env.LIGHTHOUSE_PATH;
  try { return require.resolve('lighthouse'); } catch {}
  const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
  for (const entry of fs.readdirSync(cache, { withFileTypes: true })) {
    const file = path.join(cache, entry.name, 'node_modules/lighthouse/core/index.js');
    if (entry.isDirectory() && fs.existsSync(file)) return file;
  }
  throw new Error('Run npm exec --yes --package=lighthouse -- lighthouse --version first, or set LIGHTHOUSE_PATH');
}

async function main() {
  const { default: lighthouse } = await import(pathToFileURL(lighthousePath()).href);
  const runtime = await start();
  let chrome, browser, profile;
  try {
    const seed = await pageFor(runtime, 1280, { loggedIn: false });
    const weatherCache = await seed.page.evaluate(() => JSON.parse(localStorage.getItem('wx_last')));
    await seed.context.close();
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'task009-lighthouse-'));
    chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
      '--headless=new', '--no-first-run', '--no-default-browser-check',
      `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
    ], { windowsHide: true, stdio: 'ignore' });
    const endpoint = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await fetch(`${endpoint}/json/version`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Chrome CDP must be ready');
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    await context.addInitScript(cache => {
      localStorage.setItem('wx_theme', 'light');
      localStorage.setItem('wx_recent', JSON.stringify([{ name: '上海', admin1: '上海', country: '中国', lat: 31.23, lon: 121.47 }]));
      localStorage.setItem('wx_last', JSON.stringify({ ...cache, ts: Date.now() }));
    }, weatherCache);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/weather' || url.hostname === 'api.open-meteo.com') return json(weatherCache.wx);
      if (url.pathname === '/api/location') return json(weatherCache.loc);
      if (url.pathname === '/api/wx-params') return route.fulfill({ contentType: 'text/plain', body: 'current_weather=true&forecast_days=7' });
      if (url.pathname === '/api/air') return json({ error: 'offline fixture' }, 503);
      return route.continue();
    });
    const result = await lighthouse(runtime.url, {
      port, onlyCategories: ['accessibility'], output: ['json', 'html'], logLevel: 'error',
      formFactor: 'desktop', screenEmulation: { mobile: false, width: 1280, height: 1100, deviceScaleFactor: 1, disabled: false },
      disableStorageReset: true, throttlingMethod: 'provided', maxWaitForLoad: 15000
    });
    assert.ok(result?.lhr && !result.lhr.runtimeError, 'Lighthouse must produce a valid report');
    fs.writeFileSync(path.join(__dirname, 'lighthouse.json'), JSON.stringify(result.lhr, null, 2) + '\n');
    // Lighthouse emits space-only lines; normalize those for Git's whitespace check.
    fs.writeFileSync(path.join(__dirname, 'lighthouse.html'), result.report[1].replace(/^[ \t]+(?=\r?$)/gm, ''));
    const score = Math.round(result.lhr.categories.accessibility.score * 100);
    const failures = Object.values(result.lhr.audits).filter(audit => audit.score === 0).map(audit => ({ id: audit.id, title: audit.title, description: audit.description }));
    fs.writeFileSync(path.join(__dirname, 'lighthouse-summary.json'), JSON.stringify({ lighthouseVersion: result.lhr.lighthouseVersion, score, width: 1280, theme: 'light', scene: 'clear-day', failures, warnings: result.lhr.runWarnings }, null, 2) + '\n');
    console.log(`Lighthouse ${result.lhr.lighthouseVersion}: Accessibility ${score}/100; ${failures.length} failed audits`);
  } finally {
    if (browser) await browser.close();
    if (chrome && chrome.exitCode === null) chrome.kill();
    await runtime.close();
    if (profile) {
      assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()), 'only delete the task-created temp profile');
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
