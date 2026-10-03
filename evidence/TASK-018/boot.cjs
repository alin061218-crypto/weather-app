const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), `Edge not found: ${edge}`);
const weather = { current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 }, hourly: { time: ['2026-10-03T00:00'], temperature_2m: [22], apparent_temperature: [22], relativehumidity_2m: [60], cloudcover: [25], uv_index: [2], precipitation_probability: [10], pressure_msl: [1013], visibility: [10000] }, daily: { time: ['2026-10-03'], temperature_2m_max: [24], temperature_2m_min: [14], weathercode: [0], precipitation_probability_max: [8] } };
const bootstrap = `<script>
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_, reject) { reject(new Error('GPS disabled')); } } });
const weatherMock = ${JSON.stringify(weather)};
const realFetch = window.fetch.bind(window);
window.fetch = (input, options) => { const u = new URL(String(input), location.href);
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/location') return Promise.reject(new Error('ipapi unreachable'));
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/wx-params') return Promise.resolve(new Response('current_weather=true&forecast_days=7', { headers: {'Content-Type':'text/plain'} }));
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/weather') return new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify(weatherMock), { headers: {'Content-Type':'application/json'} })), 120));
  if (u.hostname === 'api.open-meteo.com') return Promise.resolve(new Response(JSON.stringify(weatherMock), { headers: {'Content-Type':'application/json'} }));
  return realFetch(input, options);
};
</script>`;

function freePort() { return new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); }); }
function waitJson(url) {
  return new Promise(resolve => {
    const attempt = () => {
      require('node:http').get(url, response => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { setTimeout(attempt, 50); }
        });
      }).on('error', () => setTimeout(attempt, 50));
    };
    attempt();
  });
}
class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() { await new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); }); this.ws.addEventListener('message', event => { const m = JSON.parse(event.data); const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }); }
  command(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  evaluate(expression) { return this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then(result => result.result?.value); }
}

(async () => {
  const server = http.createServer((req, res) => { const pathname = new URL(req.url, 'http://localhost').pathname; const file = path.resolve(frontend, pathname === '/' ? 'index.html' : '.' + pathname); if (!file.startsWith(frontend + path.sep)) return res.writeHead(403).end(); fs.readFile(file, (error, content) => { if (error) return res.writeHead(404).end(); if (pathname === '/') content = Buffer.from(String(content).replace('<script type="module" src="js/main.js?v=13"></script>', bootstrap + '<script type="module" src="js/main.js?v=13"></script>')); res.writeHead(200, { 'Content-Type': path.extname(file) === '.html' ? 'text/html' : path.extname(file) === '.js' ? 'text/javascript' : 'text/css' }); res.end(content); }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverUrl = `http://127.0.0.1:${server.address().port}`;
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'task018-boot-'));
  const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  try {
    const version = await waitJson(`http://127.0.0.1:${debugPort}/json/version`);
    const targets = await waitJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    const cdp = new Cdp(page.webSocketDebuggerUrl); await cdp.open();
    await cdp.command('Runtime.enable');
    const start = Date.now(); await cdp.command('Page.navigate', { url: serverUrl });
    const result = await cdp.evaluate(`new Promise(resolve => { const started = performance.now(); const check = () => { const view = document.querySelector('.weather-view'); if (view && getComputedStyle(view).display !== 'none') return resolve({ elapsedMs: Math.round(performance.now() - started), visible: true, bodyScrollWidth: document.body.scrollWidth, viewportWidth: innerWidth, city: document.querySelector('#city')?.textContent }); if (performance.now() - started > 1500) resolve({ elapsedMs: Math.round(performance.now() - started), visible: false, bodyScrollWidth: document.body.scrollWidth, viewportWidth: innerWidth, city: document.querySelector('#city')?.textContent }); else setTimeout(check, 20); }; check(); })`);
    assert.equal(result.visible, true); assert.ok(result.elapsedMs < 1500, JSON.stringify(result)); assert.ok(result.bodyScrollWidth <= result.viewportWidth + 1, JSON.stringify(result));
    console.log(JSON.stringify(result, null, 2)); console.log('PASS: weather view rendered within 1s while location providers were unreachable');
    cdp.ws.close();
  } finally {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    server.close();
    for (let attempt = 0; attempt < 8; attempt++) {
      try { fs.rmSync(profile, { recursive: true, force: true }); break; }
      catch { if (attempt === 7) throw new Error(`could not remove Edge profile: ${profile}`); }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
