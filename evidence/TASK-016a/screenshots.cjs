const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const outputDir = path.resolve(__dirname);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), `Edge not found: ${edge}`);

const hours = Array.from({ length: 168 }, (_, i) => {
  const hour = i % 24;
  return 16 + Math.round(8 * Math.sin((hour - 6) / 24 * Math.PI * 2)) + Math.floor(i / 24) % 3;
});
const days = Array.from({ length: 7 }, (_, i) => ({
  time: `2026-10-${String(2 + i).padStart(2, '0')}`,
  temperature_2m_max: 24 + i % 3,
  temperature_2m_min: 14 + i % 2,
  weathercode: [0, 1, 2, 3, 61, 71, 95][i],
  precipitation_probability_max: 8 + i * 3
}));
const weather = {
  current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
  hourly: {
    time: Array.from({ length: 168 }, (_, i) => `2026-10-${String(2 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
    temperature_2m: hours,
    apparent_temperature: hours,
    relativehumidity_2m: hours.map(() => 60),
    cloudcover: hours.map(() => 25),
    uv_index: hours.map(() => 2),
    precipitation_probability: hours.map(() => 10),
    pressure_msl: hours.map(() => 1013),
    visibility: hours.map(() => 10000)
  },
  daily: {
    time: days.map(d => d.time),
    temperature_2m_max: days.map(d => d.temperature_2m_max),
    temperature_2m_min: days.map(d => d.temperature_2m_min),
    weathercode: days.map(d => d.weathercode),
    precipitation_probability_max: days.map(d => d.precipitation_probability_max)
  }
};

const bootstrap = `<script>
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_, reject) { reject(new Error('GPS disabled')); } } });
const realFetch = window.fetch.bind(window);
window.fetch = (input, options) => { const u = new URL(String(input), location.href);
  if (u.pathname === '/api/location') return Promise.resolve(new Response(JSON.stringify({ city:'北京', region:'北京', country:'中国', lat:39.904, lon:116.407 }), { headers:{'Content-Type':'application/json'} }));
  if (u.pathname === '/api/weather') return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(weather))}, { headers:{'Content-Type':'application/json'} }));
  return realFetch(input, options);
};
</script>`;

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(frontend, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(frontend + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    if (pathname === '/') content = Buffer.from(String(content).replace(
      '<script type="module" src="js/main.js?v=13"></script>',
      bootstrap + '<script type="module" src="js/main.js?v=13"></script>'
    ));
    const type = path.extname(file) === '.html' ? 'text/html' : path.extname(file) === '.js' ? 'text/javascript' : path.extname(file) === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(content);
  });
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
}

async function waitForJson(url, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.nextId = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) { const { resolve, reject } = this.pending.get(message.id); this.pending.delete(message.id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); }
    });
  }
  command(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  async evaluate(expression) { const result = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return result.result?.value; }
  close() { this.socket.close(); }
}

async function capture(name, width, url, serverUrl) {
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `task016a-${name}-`));
  const child = spawn(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, `${name}: no page target`);
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
    await cdp.command('Page.navigate', { url: `${serverUrl}/?evidence=${name}` });
    await cdp.evaluate(`new Promise(resolve => setTimeout(resolve, 3500))`);
    const metrics = await cdp.evaluate(`(() => {
      const chart = document.querySelector('.chart-section');
      const daily = document.querySelector('.daily-section');
      const rows = [...document.querySelectorAll('.day-row')];
      return {
        innerWidth,
        metricCount: rows.length,
        fingerprintBars: rows.map(row => row.querySelectorAll('.temperature-fingerprint-bar').length),
        chartTop: chart?.offsetTop,
        dailyTop: daily?.offsetTop,
        chartWidth: chart?.getBoundingClientRect().width,
        contentWidth: document.querySelector('.weather-view')?.getBoundingClientRect().width,
        statOverflow: [...document.querySelectorAll('.stat-chip')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim()),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      };
    })()`);
    assert.equal(metrics.innerWidth, width, `${name}: innerWidth must equal ${width}`);
    assert.equal(metrics.metricCount, 7, `${name}: expected seven forecast rows`);
    assert.deepEqual(metrics.fingerprintBars, [24, 24, 24, 24, 24, 24, 24], `${name}: every row needs 24 fingerprint bars`);
    assert.ok(metrics.chartTop < metrics.dailyTop, `${name}: chart must precede daily forecast`);
    assert.ok(Math.abs(metrics.chartWidth - metrics.contentWidth) <= 2, `${name}: chart must span content width`);
    assert.deepEqual(metrics.statOverflow, [], `${name}: stat chip overflow detected`);
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${name}: horizontal overflow detected`);
    // Keep the navigation visible in the evidence while removing its fixed overlay from the long capture.
    await cdp.evaluate(`(() => { const nav = document.querySelector('.tab-bar'); if (nav) { nav.style.position = 'static'; nav.style.transform = 'none'; nav.style.margin = 'var(--space-3) auto'; } })()`);
    const image = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(image.data, 'base64'));
    cdp.close();
    return metrics;
  } finally {
    // Edge starts renderer children that survive child.kill(); end the whole tree before removing its profile.
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 7) throw error;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
  }
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverUrl = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  for (const [name, width] of [['compact-375', 375], ['medium-768', 768], ['expanded-1280', 1280]]) results.push({ name, width, ...(await capture(name, width, `${serverUrl}/`, serverUrl)) });
  server.close();
  for (const result of results) console.log(JSON.stringify(result));
  console.log('PASS: innerWidth, layout order, full-width chart, seven rows, and 24 bars verified at 375 / 768 / 1280px');
}

main().catch(error => { server.close(); console.error(error.stack || error); process.exitCode = 1; });
