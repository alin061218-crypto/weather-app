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
const mode = process.argv.includes('--via-fallback') ? 'fallback' : 'backend';

const hours = Array.from({ length: 168 }, (_, i) => 16 + Math.round(8 * Math.sin(((i % 24) - 6) / 24 * Math.PI * 2)) + Math.floor(i / 24) % 3);
const days = Array.from({ length: 7 }, (_, i) => ({
  time: `2026-10-${String(3 + i).padStart(2, '0')}`,
  temperature_2m_max: 24 + i % 3,
  temperature_2m_min: 14 + i % 2,
  weathercode: [0, 1, 2, 3, 61, 71, 95][i],
  precipitation_probability_max: 8 + i * 3
}));
const weather = {
  current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
  hourly: {
    time: Array.from({ length: 168 }, (_, i) => `2026-10-${String(3 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
    temperature_2m: hours,
    apparent_temperature: hours,
    relativehumidity_2m: hours.map(() => 60), cloudcover: hours.map(() => 25),
    uv_index: hours.map(() => 2), precipitation_probability: hours.map(() => 10),
    pressure_msl: hours.map(() => 1013), visibility: hours.map(() => 10000)
  },
  daily: {
    time: days.map(d => d.time), temperature_2m_max: days.map(d => d.temperature_2m_max),
    temperature_2m_min: days.map(d => d.temperature_2m_min), weathercode: days.map(d => d.weathercode),
    precipitation_probability_max: days.map(d => d.precipitation_probability_max)
  }
};

const bootstrap = `<script>
const weatherMock = ${JSON.stringify(weather)};
window.__evidenceRequests = { backend: 0, fallback: 0 };
const realFetch = window.fetch.bind(window);
window.fetch = (input, options) => {
  const u = new URL(String(input), location.href);
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/location') {
    return Promise.resolve(new Response(JSON.stringify({ city:'北京', region:'北京', country:'中国', lat:39.904, lon:116.407 }), { headers:{'Content-Type':'application/json'} }));
  }
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/wx-params') {
    return Promise.resolve(new Response('current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover,apparent_temperature,uv_index,precipitation_probability,pressure_msl,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=7', { headers:{'Content-Type':'text/plain'} }));
  }
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/weather') {
    if (${JSON.stringify(mode)} === 'backend') { window.__evidenceRequests.backend++; return Promise.resolve(new Response(JSON.stringify(weatherMock), { headers:{'Content-Type':'application/json'} })); }
    return Promise.resolve(new Response(JSON.stringify({ error:'backend unavailable' }), { status:503, headers:{'Content-Type':'application/json'} }));
  }
  if (u.hostname === 'api.open-meteo.com' && u.pathname === '/v1/forecast') {
    window.__evidenceRequests.fallback++;
    return Promise.resolve(new Response(JSON.stringify(weatherMock), { headers:{'Content-Type':'application/json'} }));
  }
  return realFetch(input, options);
};
</script>`;

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(frontend, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(frontend + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, content) => {
    if (error) return res.writeHead(404).end();
    if (pathname === '/') content = Buffer.from(String(content).replace(
      '<script type="module" src="js/main.js?v=13"></script>',
      bootstrap + '<script type="module" src="js/main.js?v=13"></script>'
    ));
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
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
async function waitForJson(url) {
  for (let i = 0; i < 80; i++) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.nextId = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once:true }); this.socket.addEventListener('error', reject, { once:true }); });
    this.socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id && this.pending.has(message.id)) { const p = this.pending.get(message.id); this.pending.delete(message.id); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result); } });
  }
  command(method, params = {}) { const id = ++this.nextId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.command('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true }); return result.result?.value; }
  close() { this.socket.close(); }
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverUrl = `http://127.0.0.1:${server.address().port}`;
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `task016c-${mode}-`));
  const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide:true, stdio:'ignore' });
  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'no page target');
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.command('Page.enable'); await cdp.command('Runtime.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width:768, height:1100, deviceScaleFactor:1, mobile:false });
    await cdp.command('Page.navigate', { url: `${serverUrl}/?evidence=${mode}` });
    await cdp.evaluate('new Promise(resolve => setTimeout(resolve, 3500))');
    const metrics = await cdp.evaluate(`(() => {
      const canvas = document.querySelector('#temp-chart');
      return {
        mode: ${JSON.stringify(mode)}, pointCount: Number(canvas?.dataset.pointCount || 0),
        fingerprintCount: document.querySelectorAll('.temperature-fingerprint').length,
        fallbackCount: document.querySelectorAll('.temperature-fingerprint-fallback').length,
        axisStart: canvas?.dataset.axisStart, axisEnd: canvas?.dataset.axisEnd,
        requests: window.__evidenceRequests,
        bodyScrollWidth: document.body.scrollWidth, clientWidth: document.documentElement.clientWidth, viewportWidth: innerWidth
      };
    })()`);
    assert.equal(metrics.pointCount, 24, `${mode}: chart must draw 24 points`);
    assert.equal(metrics.fingerprintCount, 7, `${mode}: seven fingerprints required`);
    assert.equal(metrics.fallbackCount, 0, `${mode}: fingerprint fallback must be unused`);
    assert.equal(metrics.axisStart, '00:00', `${mode}: x axis must start at 00:00`);
    assert.equal(metrics.axisEnd, '23:00', `${mode}: x axis must end at 23:00`);
    assert.equal(metrics.requests[mode], 1, `${mode}: expected request path was not used`);
    assert.equal(metrics.requests[mode === 'backend' ? 'fallback' : 'backend'], 0, `${mode}: unexpected alternate path used`);
    assert.ok(metrics.bodyScrollWidth <= metrics.viewportWidth + 1, `${mode}: body horizontal overflow detected`);
    console.log(JSON.stringify(metrics));
    console.log(`PASS: ${mode} path has 24 chart points, seven fingerprints, no fallbacks, 00:00–23:00 axis, and no body overflow`);
    cdp.close();
  } finally {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide:true, stdio:'ignore' });
    for (let attempt = 0; attempt < 8; attempt++) {
      try { fs.rmSync(profile, { recursive:true, force:true }); break; }
      catch (error) { if (attempt === 7) throw error; await new Promise(resolve => setTimeout(resolve, 150)); }
    }
    server.close();
  }
}
main().catch(error => { server.close(); console.error(error.stack || error); process.exitCode = 1; });
