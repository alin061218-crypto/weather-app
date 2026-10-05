const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const playwright = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForIndex(url, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${url}/index.html`);
      if (response.ok) return response;
    } catch {}
    if (child.exitCode !== null) throw new Error('evidence server exited before serving index.html');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('evidence server did not start');
}

async function startServer() {
  const port = await freePort();
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task008-db-'));
  const env = {
    ...process.env,
    PORT: String(port),
    DB_DIR: dbDir,
    NODE_ENV: 'development',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    ADMIN_USER: 'task008-fixture',
    ADMIN_PASSWORD_HASH: require(path.join(root, 'node_modules/bcryptjs')).hashSync('fixture-only-password', 4)
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  await waitForIndex(url, child);
  return {
    child,
    dbDir,
    url,
    output: () => output,
    stop() {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
  };
}

async function launchPage(url, options = {}) {
  const browser = await playwright.chromium.launch({
    executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const wx = {
      current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
      hourly: { time: ['2026-10-05T00:00'], temperature_2m: [22] },
      daily: { time: ['2026-10-05'], temperature_2m_max: [24], temperature_2m_min: [14], weathercode: [0] }
    };
    localStorage.setItem('wx_last', JSON.stringify({ loc: { city: '北京', region: '北京', country: '中国', lat: 39.904, lon: 116.407 }, wx, ts: Date.now() }));
  });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on('console', message => consoleMessages.push(`${message.type()}: ${message.text()}`));
  if (options.captureErrors) page.on('pageerror', error => consoleMessages.push(`pageerror: ${error.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated', null, { timeout: 15000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller && navigator.serviceWorker.controller.state === 'activated'), null, { timeout: 15000 });
  } catch (error) {
    const diagnostics = await page.evaluate(async () => ({
      controller: Boolean(navigator.serviceWorker.controller),
      registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => ({
        scope: registration.scope,
        active: registration.active?.state || null,
        installing: registration.installing?.state || null,
        waiting: registration.waiting?.state || null
      }))
    }));
    console.error('SW diagnostics:', JSON.stringify(diagnostics));
    throw error;
  }
  return { browser, context, page, consoleMessages };
}

async function closeEvidence(runtime, browser) {
  if (browser) await browser.close();
  runtime?.stop();
}

module.exports = { root, playwright, startServer, launchPage, closeEvidence };
