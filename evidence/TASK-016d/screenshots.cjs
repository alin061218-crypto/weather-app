const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const output = __dirname;
const icons = [
  ['clearDay', '晴'], ['clearNight', '晴夜'], ['partlyCloudy', '少云'], ['cloudy', '多云'],
  ['overcast', '阴'], ['fog', '雾'], ['rainLight', '小雨'], ['rainHeavy', '大雨'],
  ['snow', '雪'], ['storm', '雷暴']
];
// Import the current source bytes directly; this evidence page uses no cached
// app resource URL, copied icon markup, or manually maintained asset version.
const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/icons.js'), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const pageMarkup = `<!doctype html>
<meta charset="utf-8">
<style>
  :root { color-scheme: dark; background: #101722; color: #edf3fa; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 28px; background: #101722; }
  h1 { margin: 0 0 22px; font-size: 22px; font-weight: 650; }
  .grid { display: grid; grid-template-columns: repeat(5, minmax(125px, 1fr)); gap: 14px; max-width: 1040px; }
  .tile { min-height: 118px; display: grid; place-items: center; align-content: center; gap: 9px; border: 1px solid #344153; background: #182230; }
  .tile svg { width: var(--size); height: var(--size); color: #f3f7fb; }
  .label { font-size: 13px; color: #bdc8d6; }
</style>
<h1 id="title"></h1><main id="root" class="grid"></main>
<script type="module">
  import { icon } from '${moduleUrl}';
  const size = Number(new URLSearchParams(location.search).get('size') || 48);
  document.documentElement.style.setProperty('--size', size + 'px');
  document.querySelector('#title').textContent = '天气图标家族 · ' + size + 'px · 方案 A（晴 / 晴夜共用太阳）';
  document.querySelector('#root').innerHTML = ${JSON.stringify(icons)}.map(([name, label]) =>
    '<section class="tile" data-icon="' + name + '"><div>' + icon.weather[name]() + '</div><div class="label">' + label + '</div></section>'
  ).join('');
</script>`;

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') return response.writeHead(204).end();
    if (url.pathname !== '/icons.html') return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(pageMarkup);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function capture(page, baseUrl, filename, size) {
  await page.goto(`${baseUrl}/icons.html?size=${size}`);
  await page.waitForFunction(() => document.querySelectorAll('.tile svg').length === 10);
  await page.evaluate(() => document.fonts.ready);
  const rendered = await page.evaluate(() => {
    const day = document.querySelector('[data-icon="clearDay"]');
    const night = document.querySelector('[data-icon="clearNight"]');
    const dimensions = tile => {
      const { width, height } = tile.querySelector('svg').getBoundingClientRect();
      return [width, height];
    };
    return {
      day: day.querySelector('svg').outerHTML,
      night: night.querySelector('svg').outerHTML,
      labels: [day, night].map(tile => tile.querySelector('.label').textContent),
      sizes: [dimensions(day), dimensions(night)]
    };
  });
  assert.equal(rendered.day, rendered.night, `${filename}: day and night SVGs must match`);
  assert.deepEqual(rendered.labels, ['晴', '晴夜'], `${filename}: both comparison labels must remain`);
  assert.deepEqual(rendered.sizes, [[size, size], [size, size]], `${filename}: use the requested size`);
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  assert.ok(fs.statSync(path.join(output, filename)).size > 1000, `${filename}: screenshot is empty`);
  console.log(`PASS: ${filename}, ${size}px, 晴 / 晴夜 SVGs match`);
}

async function main() {
  const server = await startServer();
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 760 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await capture(page, baseUrl, 'icons-24.png', 24);
    await capture(page, baseUrl, 'icons-48.png', 48);
    await capture(page, baseUrl, 'icons-hero.png', 96);
    assert.deepEqual(errors, [], 'screenshot page must have no browser errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
