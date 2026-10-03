// Reproducible browser evidence: production HTML/CSS/JS, fixture API responses only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const frontend = path.resolve(__dirname, '../../frontend');
const output = __dirname;
const hours = Array.from({ length: 168 }, (_, i) => 16 + Math.round(8 * Math.sin((i % 24 - 6) / 24 * Math.PI * 2)) + Math.floor(i / 24) % 3);
const weather = {
  current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
  hourly: {
    time: hours.map((_, i) => `2026-10-${String(3 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
    temperature_2m: hours, apparent_temperature: hours,
    relativehumidity_2m: hours.map(() => 60), cloudcover: hours.map(() => 25), uv_index: hours.map(() => 2),
    precipitation_probability: hours.map(() => 10), pressure_msl: hours.map(() => 1013), visibility: hours.map(() => 10000)
  },
  daily: {
    time: Array.from({ length: 7 }, (_, i) => `2026-10-${String(3 + i).padStart(2, '0')}`),
    temperature_2m_max: [24, 25, 26, 24, 25, 26, 24], temperature_2m_min: [14, 15, 14, 15, 14, 15, 14],
    weathercode: [0, 1, 2, 3, 61, 71, 95], precipitation_probability_max: [8, 11, 14, 17, 20, 23, 26]
  }
};
const shanghai = { name: '上海', admin1: '上海', country: '中国', lat: 31.23, lon: 121.47 };
async function start() {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(frontend, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(frontend + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
      if (error) return res.writeHead(404).end();
      const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  return { browser, url: `http://127.0.0.1:${server.address().port}/`, close: async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); } };
}
async function pageFor(runtime, width, { loggedIn = true, fallback = false, height = 1100 } = {}) {
  const context = await runtime.browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript(({ loggedIn, shanghai }) => {
    localStorage.setItem('wx_recent', JSON.stringify([shanghai]));
    if (loggedIn) localStorage.setItem('wx_token', 'task015e-fixture-session');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_, reject) { reject(new Error('GPS disabled for fixture')); } } });
  }, { loggedIn, shanghai });
  const requests = { weather: 0, direct: 0, favoriteWrites: 0 };
  let favorites = [], history = [];
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.hostname === 'embed.windy.com') return route.fulfill({ contentType: 'text/html', body: '<p>离线验收：天气地图 iframe 网络内容未验证</p>' });
    if (u.hostname === 'api.open-meteo.com') { requests.direct++; return json(weather); }
    if (u.pathname === '/api/weather') { requests.weather++; return json(fallback ? { error: 'fixture backend unavailable' } : weather, fallback ? 503 : 200); }
    if (u.pathname === '/api/location') return json({ city: '北京', region: '北京', country: '中国', lat: 39.904, lon: 116.407 });
    if (u.pathname === '/api/wx-params') return route.fulfill({ contentType: 'text/plain', body: 'current_weather=true&forecast_days=7' });
    if (u.pathname === '/api/me') return json({ user: { id: 1, username: '验收用户' } });
    if (u.pathname === '/api/favorites') {
      if (request.method() === 'POST') {
        requests.favoriteWrites++;
        const item = { ...request.postDataJSON(), id: Date.now() };
        await new Promise(resolve => setTimeout(resolve, 900));
        favorites.unshift(item); return json(item);
      }
      return json(favorites);
    }
    if (u.pathname.startsWith('/api/favorites/')) { favorites = favorites.filter(f => String(f.id) !== u.pathname.split('/').pop()); return json({ ok: true }); }
    if (u.pathname === '/api/history') {
      if (request.method() === 'POST') history.unshift({ ...request.postDataJSON(), time: Date.now() });
      if (request.method() === 'DELETE') history = [];
      return json(request.method() === 'GET' ? history : { ok: true });
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.url);
  await page.waitForFunction(() => document.querySelectorAll('.day-row').length === 7 && !document.querySelector('#weather-card').classList.contains('hidden'));
  return { page, context, errors, requests };
}
async function tabTo(page, selector, log = []) {
  for (let tabs = 0; tabs < 90; tabs++) {
    if (await page.evaluate(sel => document.activeElement?.matches(sel), selector)) {
      await page.waitForFunction(sel => {
        const el = document.activeElement;
        return el?.matches(sel) && getComputedStyle(el).outlineWidth === '2px';
      }, selector);
      const focus = await page.locator(selector).first().evaluate(el => ({ visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
      assert.deepEqual(focus, { visible: true, outline: 'solid', width: '2px' }, `${selector}: unified keyboard focus`);
      log.push(`Tab × ${tabs} → ${selector}（焦点环 2px solid）`);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab cannot reach ${selector}`);
}
async function metrics(page, width) {
  const result = await page.evaluate(() => ({ innerWidth, clientWidth: document.documentElement.clientWidth, bodyScrollWidth: document.body.scrollWidth }));
  assert.equal(result.innerWidth, width, 'innerWidth must match requested viewport');
  assert.ok(result.bodyScrollWidth <= result.clientWidth + 1, `body overflow: ${JSON.stringify(result)}`);
  return result;
}
module.exports = { assert, fs, path, output, start, pageFor, tabTo, metrics };
