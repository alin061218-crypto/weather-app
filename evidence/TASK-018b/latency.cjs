const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const frontend = path.resolve(__dirname, '../../frontend');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), `Edge not found: ${edge}`);
const weather = {
  current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
  hourly: { time: ['2026-10-03T00:00'], temperature_2m: [22], apparent_temperature: [22], relativehumidity_2m: [60], cloudcover: [25], uv_index: [2], precipitation_probability: [10], pressure_msl: [1013], visibility: [10000] },
  daily: { time: ['2026-10-03'], temperature_2m_max: [24], temperature_2m_min: [14], weathercode: [0], precipitation_probability_max: [8] }
};

function freePort() {
  return new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); }); });
}
async function waitForJson(url) {
  for (let i = 0; i < 100; i++) { try { const response = await fetch(url); if (response.ok) return response.json(); } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(`Timed out waiting for ${url}`);
}
class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.nextId = 0; this.pending = new Map(); }
  async open() { await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once:true }); this.socket.addEventListener('error', reject, { once:true }); }); this.socket.addEventListener('message', event => { const message = JSON.parse(event.data); const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result); }); }
  command(method, params = {}) { const id = ++this.nextId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  evaluate(expression) { return this.command('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true }).then(result => result.result?.value); }
  close() { this.socket.close(); }
}

async function run(mode) {
  const backendDelay = mode === 'slow-backend' ? 6000 : 80;
  const directDelay = 300;
  const bootstrap = `<script>
const weatherMock = ${JSON.stringify(weather)};
window.__evidence = { backendWeather: 0, openMeteo: 0, backendCanceled: 0 };
const realFetch = window.fetch.bind(window);
function delayed(delay, body, signal, onCancel) { return new Promise((resolve, reject) => { let settled = false; const cancel = () => { if (settled) return; settled = true; onCancel(); reject(new DOMException('The operation was aborted.', 'AbortError')); }; if (signal) signal.addEventListener('abort', cancel, { once:true }); setTimeout(() => { if (settled) return; settled = true; if (signal) signal.removeEventListener('abort', cancel); resolve(new Response(JSON.stringify(body), { headers:{'Content-Type':'application/json'} })); }, delay); }); }
window.fetch = (input, options = {}) => { const u = new URL(String(input), location.href);
  if (u.pathname === '/api/location') return Promise.resolve(new Response(JSON.stringify({ city:'北京', region:'北京', country:'中国', lat:39.904, lon:116.407 }), { headers:{'Content-Type':'application/json'} }));
  if (u.pathname === '/api/wx-params') return Promise.resolve(new Response('current_weather=true&forecast_days=7', { headers:{'Content-Type':'text/plain'} }));
  if (u.pathname === '/api/weather') { window.__evidence.backendWeather++; return delayed(${backendDelay}, weatherMock, options.signal, () => window.__evidence.backendCanceled++); }
  if (u.hostname === 'api.open-meteo.com' && u.pathname === '/v1/forecast') { window.__evidence.openMeteo++; return delayed(${directDelay}, weatherMock, options.signal, () => {}); }
  return realFetch(input, options);
};
</script>`;
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(frontend, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!file.startsWith(frontend + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, content) => { if (error) return res.writeHead(404).end(); if (pathname === '/') content = Buffer.from(String(content).replace('<script type="module" src="/js/main.js"></script>', bootstrap + '<script type="module" src="/js/main.js"></script>')); const ext = path.extname(file); const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream'; res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(content); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverUrl = `http://127.0.0.1:${server.address().port}`;
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `task018b-latency-${mode}-`));
  const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide:true, stdio:'ignore' });
  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    const cdp = new Cdp(page.webSocketDebuggerUrl); await cdp.open(); await cdp.command('Runtime.enable');
    const startedAt = Date.now();
    await cdp.command('Page.navigate', { url: `${serverUrl}/?started=${startedAt}` });
    const result = await cdp.evaluate(`new Promise(resolve => { const started = Number(new URL(location.href).searchParams.get('started')); const check = () => { const view = document.querySelector('.weather-view'); if (view && getComputedStyle(view).display !== 'none') return resolve({ elapsedMs: Date.now() - started, visible:true, requests:window.__evidence, bodyScrollWidth:document.body.scrollWidth, viewportWidth:innerWidth, city:document.querySelector('#city')?.textContent }); if (Date.now() - started > 8000) return resolve({ elapsedMs:Date.now() - started, visible:false, requests:window.__evidence, bodyScrollWidth:document.body.scrollWidth, viewportWidth:innerWidth }); setTimeout(check, 20); }; check(); })`);
    assert.equal(result.visible, true, `${mode}: weather view did not render: ${JSON.stringify(result)}`);
    assert.ok(result.bodyScrollWidth <= result.viewportWidth + 1, `${mode}: body overflow: ${JSON.stringify(result)}`);
    if (mode === 'common') assert.equal(result.requests.openMeteo, 0, `common scene should not start direct fallback: ${JSON.stringify(result)}`);
    if (mode === 'slow-backend') { assert.equal(result.requests.openMeteo, 1, `slow scene should use one direct fallback: ${JSON.stringify(result)}`); assert.equal(result.requests.backendCanceled, 1, `slow backend should be canceled after direct winner: ${JSON.stringify(result)}`); }
    cdp.close();
    return { mode, backendDelay, directDelay, ...result };
  } finally {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide:true, stdio:'ignore' }); server.close();
    for (let attempt = 0; attempt < 8; attempt++) { try { fs.rmSync(profile, { recursive:true, force:true }); break; } catch (error) { if (attempt === 7) throw error; await new Promise(resolve => setTimeout(resolve, 150)); } }
  }
}

(async () => {
  const slowBackend = await run('slow-backend');
  const common = await run('common');
  console.log(JSON.stringify({ slowBackend, common }, null, 2));
  console.log(`PASS: cold-start latency measured for slow-backend and common backend/cache scenes; common direct requests=${common.requests.openMeteo}`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
