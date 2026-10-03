// TASK-019 browser fixture. It serves the production frontend and uses only
// deterministic API responses; the main module is instrumented in this test
// server so CDP can inspect the active Three.js scene.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const frontend = path.resolve(__dirname, '../../frontend');
const output = __dirname;
const scenes = {
  'clear-day': { code: 0, isDay: 1 },
  'clear-night': { code: 0, isDay: 0 },
  cloudy: { code: 2, isDay: 1 },
  rain: { code: 61, isDay: 1 },
  snow: { code: 71, isDay: 1 },
  fog: { code: 45, isDay: 1 },
  storm: { code: 95, isDay: 1 }
};

function fixtureWeather(scene) {
  const current = scenes[scene] || scenes['clear-day'];
  const hours = Array.from({ length: 168 }, (_, i) => 16 + Math.round(8 * Math.sin((i % 24 - 6) / 24 * Math.PI * 2)) + Math.floor(i / 24) % 3);
  const days = Array.from({ length: 7 }, (_, i) => ({
    time: `2026-10-${String(3 + i).padStart(2, '0')}`,
    temperature_2m_max: 24 + i % 3,
    temperature_2m_min: 14 + i % 2,
    weathercode: [0, 1, 2, 3, 61, 71, 95][i],
    precipitation_probability_max: 8 + i * 3
  }));
  return {
    current_weather: { temperature: 22, weathercode: current.code, is_day: current.isDay, windspeed: 8 },
    hourly: {
      time: hours.map((_, i) => `2026-10-${String(3 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
      temperature_2m: hours, apparent_temperature: hours,
      relativehumidity_2m: hours.map(() => 60), cloudcover: hours.map(() => 25), uv_index: hours.map(() => 2),
      precipitation_probability: hours.map(() => 10), pressure_msl: hours.map(() => 1013), visibility: hours.map(() => 10000)
    },
    daily: {
      time: days.map(d => d.time),
      temperature_2m_max: days.map(d => d.temperature_2m_max), temperature_2m_min: days.map(d => d.temperature_2m_min),
      weathercode: days.map(d => d.weathercode), precipitation_probability_max: days.map(d => d.precipitation_probability_max),
      sunrise: days.map(d => `${d.time}T06:12`), sunset: days.map(d => `${d.time}T17:54`), uv_index_max: days.map(() => 4)
    }
  };
}

async function start() {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(frontend, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(frontend + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
      if (error) return res.writeHead(404).end();
      let content = bytes;
      if (pathname === '/js/main.js') {
        content = Buffer.from(String(bytes).replace(
          'state.atmosphere = new Atmosphere(atmContainer);',
          'state.atmosphere = new Atmosphere(atmContainer); window.__task019Atmosphere = state.atmosphere;'
        ));
      }
      const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(content);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  return { browser, url: `http://127.0.0.1:${server.address().port}/`, close: async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); } };
}

async function pageFor(runtime, width, scene, theme, height = 1100) {
  const context = await runtime.browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript(({ theme }) => {
    localStorage.setItem('wx_theme', theme);
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_, reject) { reject(new Error('GPS disabled for fixture')); } } });
  }, { theme });
  const requests = { weather: 0, direct: 0 };
  const weather = fixtureWeather(scene);
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.hostname === 'embed.windy.com') return route.fulfill({ contentType: 'text/html', body: '<p>offline fixture</p>' });
    if (u.pathname === '/api/location') return json({ city: '北京', region: '北京', country: '中国', lat: 39.904, lon: 116.407 });
    if (u.pathname === '/api/wx-params') return route.fulfill({ contentType: 'text/plain', body: 'current_weather=true&forecast_days=7' });
    if (u.pathname === '/api/weather') { requests.weather++; return json(weather); }
    if (u.hostname === 'api.open-meteo.com' && u.pathname === '/v1/forecast') { requests.direct++; return json(weather); }
    if (u.pathname === '/api/air') return json({ error: 'offline fixture' }, 503);
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.url + `?task=019&scene=${scene}&theme=${theme}`);
  await page.waitForFunction(() => document.querySelectorAll('.day-row').length === 7 && !document.querySelector('#weather-card').classList.contains('hidden'));
  await page.waitForFunction(() => window.__task019Atmosphere?.currentScene?.group?.children?.length > 0);
  return { page, context, errors, requests, weather };
}

async function cdpEvaluate(page, expression) {
  const cdp = await page.context().newCDPSession(page);
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  await cdp.detach();
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'CDP evaluation failed');
  return result.result?.value;
}

async function metrics(page, width) {
  const result = await page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    theme: document.documentElement.getAttribute('data-theme'),
    weather: document.body.getAttribute('data-weather')
  }));
  assert.equal(result.innerWidth, width, `innerWidth must match requested viewport ${width}`);
  assert.ok(result.bodyScrollWidth <= result.clientWidth + 1, `body overflow: ${JSON.stringify(result)}`);
  return result;
}

module.exports = { assert, fs, path, output, scenes, start, pageFor, cdpEvaluate, metrics };
