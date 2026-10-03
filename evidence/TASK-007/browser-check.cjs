const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'task007-edge-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const bootstrap = `<script>
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
  getCurrentPosition(_, reject) { reject(new Error('GPS disabled for test')); }
} });
localStorage.setItem('wx_recent', JSON.stringify([{ name: '义乌', admin1: '浙江', country: '中国', lat: 29.068, lon: 119.637 }]));
localStorage.setItem('wx_token', 'task007');
window.__weatherCalls = [];
window.__fetches = [];
window.__errors = [];
window.addEventListener('error', e => window.__errors.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));
const originalFetch = window.fetch.bind(window);
window.fetch = (input, options) => {
  const url = new URL(String(input), location.href);
  window.__fetches.push(url.href);
  if (url.pathname === '/api/me') return Promise.resolve(new Response(JSON.stringify({ user: { id: 1, username: 'test' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (url.pathname === '/api/favorites') return Promise.resolve(new Response(JSON.stringify([{ id: 1, name: '义乌', admin1: '浙江', country: '中国', lat: 29.068, lon: 119.637 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (url.pathname === '/api/location') return Promise.resolve(new Response(JSON.stringify({ city: '北京', region: '北京', country: '中国', lat: 39.904, lon: 116.407 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (url.pathname === '/api/weather') {
    window.__weatherCalls.push(url.href);
    return Promise.resolve(new Response(JSON.stringify({ current_weather: { temperature: 20, weathercode: 0, is_day: 1, windspeed: 2 }, hourly: {}, daily: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return originalFetch(input, options);
};
</script>`;

const check = `<script>
document.addEventListener('DOMContentLoaded', async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function search(name) {
    const input = document.getElementById('search-input');
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    for (let i = 0; i < 30; i++) {
      await wait(50);
      const item = document.querySelector('#search-results li');
      if (item && item.textContent.includes(name)) return item;
    }
    throw new Error('Search result missing: ' + name);
  }
  function selectedLocationFromPage() {
    try {
      const cached = JSON.parse(localStorage.getItem('wx_last') || 'null');
      const lat = Number(cached?.loc?.lat);
      const lon = Number(cached?.loc?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat: String(lat), lon: String(lon) };
    } catch {}
    throw new Error('Weather selection produced neither a request nor a cached location');
  }
  function weatherLocationSince(index) {
    const raw = window.__weatherCalls.slice(index).at(-1);
    if (raw) {
      const parsed = new URL(raw);
      return { lat: parsed.searchParams.get('lat'), lon: parsed.searchParams.get('lon') };
    }
    return selectedLocationFromPage();
  }
  async function select(name) {
    const item = await search(name);
    const resultText = item.textContent;
    const count = window.__weatherCalls.length;
    (item.querySelector('button') || item).click();
    for (let i = 0; i < 20; i++) {
      const renderedCity = document.getElementById('city')?.textContent || '';
      if (window.__weatherCalls.length !== count || renderedCity.includes(name)) break;
      await wait(50);
    }
    await wait(100);
    return { resultText, ...weatherLocationSince(count) };
  }
  let result;
  try {
    await wait(100);
    const oldRecent = document.querySelector('#recent-list .recent-chip');
    if (!oldRecent) throw new Error('Old recent city missing');
    const beforeRecent = window.__weatherCalls.length;
    oldRecent.click();
    for (let i = 0; i < 20 && window.__weatherCalls.length === beforeRecent; i++) await wait(50);
    const migratedRecent = weatherLocationSince(beforeRecent);
    const first = await select('义乌');
    const starActiveAfterFirst = document.getElementById('fav-btn').classList.contains('active');
    let oldFavorite;
    for (let i = 0; i < 20; i++) {
      oldFavorite = document.querySelector('#me-fav-list .fav-item-click');
      if (oldFavorite) break;
      await wait(50);
    }
    if (!oldFavorite) throw new Error('Old favorite missing');
    const beforeFavorite = window.__weatherCalls.length;
    oldFavorite.click();
    for (let i = 0; i < 20 && window.__weatherCalls.length === beforeFavorite; i++) await wait(50);
    const migratedFavorite = weatherLocationSince(beforeFavorite);
    const second = await select('义乌');
    const fallback = await select('贵德');
    result = { migratedRecent, migratedFavorite, starActiveAfterFirst, first, second, fallback, region: document.getElementById('region').textContent,
      cityFetches: window.__fetches.filter(url => url.endsWith('/data/cities.json')).length };
  } catch (error) { result = { error: error.message, errors: window.__errors, fetches: window.__fetches, resultHtml: document.getElementById('search-results').outerHTML }; }
  const pre = document.createElement('pre');
  pre.id = 'task007-result';
  pre.textContent = 'TASK007_RESULT:' + btoa(unescape(encodeURIComponent(JSON.stringify(result))));
  document.body.appendChild(pre);
});
</script>`;

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(frontend, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(frontend + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    if (pathname === '/') {
      content = Buffer.from(String(content).replace(/<script\b[^>]*type=["']module["'][^>]*><\/script>/, `${bootstrap}$&${check}`));
    }
    res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(content);
  });
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--virtual-time-budget=30000', '--dump-dom', url], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let html = '';
  browser.stdout.on('data', chunk => { html += chunk; });
  browser.stderr.resume();
  const exitCode = await new Promise((resolve, reject) => {
    browser.on('error', reject);
    browser.on('close', resolve);
  });
  assert.equal(exitCode, 0, 'Edge exited with an error');
  const match = html.match(/TASK007_RESULT:([A-Za-z0-9+/=]+)/);
  assert.ok(match, 'browser result marker missing');
  const result = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  console.log(JSON.stringify(result, null, 2));
  assert.ifError(result.error);
  assert.equal(result.migratedRecent.lat, '29.069');
  assert.equal(result.migratedRecent.lon, '119.658');
  assert.equal(result.migratedFavorite.lat, '29.069');
  assert.equal(result.migratedFavorite.lon, '119.658');
  assert.equal(result.starActiveAfterFirst, true);
  assert.equal(result.first.lat, result.second.lat);
  assert.equal(result.first.lon, result.second.lon);
  assert.equal(result.first.lat, '29.069');
  assert.equal(result.first.lon, '119.658');
  assert.equal(result.cityFetches, 1);
  assert.match(result.fallback.resultText, /所属地级市坐标/);
  assert.match(result.region, /所属地级市坐标/);
  console.log('PASS: TASK-007 recent/favorite coordinate migration and prefecture fallback verified');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  server.close();
  if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
