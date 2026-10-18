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
  body.preview { padding: 0; width: 272px; height: 180px; display: grid; place-items: center; background: #24324d; }
  body.preview h1, body.preview .label { display: none; }
  body.preview .grid { display: block; }
  body.preview .tile { min-height: 0; border: 0; background: none; display: block; }
  body.preview .tile svg { display: block; }
</style>
<h1 id="title"></h1><main id="root" class="grid"></main>
<script type="module">
  import { icon } from '${moduleUrl}';
  const size = Number(new URLSearchParams(location.search).get('size') || 48);
  document.documentElement.style.setProperty('--size', size + 'px');
  document.querySelector('#title').textContent = '天气图标家族 · ' + size + 'px · 2026-10-18（晴夜：实心月牙 + 双星）';
  document.querySelector('#root').innerHTML = ${JSON.stringify(icons)}.map(([name, label]) =>
    '<section class="tile" data-icon="' + name + '"><div>' + icon.weather[name]() + '</div><div class="label">' + label + '</div></section>'
  ).join('');
  if (new URLSearchParams(location.search).has('preview')) {
    document.body.classList.add('preview');
    document.querySelectorAll('.tile').forEach(tile => {
      if (tile.dataset.icon !== 'clearNight') tile.remove();
    });
  }
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
      sizes: [dimensions(day), dimensions(night)],
      paths: [...night.querySelectorAll('path')].map(element => {
        const { x, y, width, height } = element.getBBox();
        return { x, y, width, height, stroke: getComputedStyle(element).stroke, fill: getComputedStyle(element).fill };
      })
    };
  });
  assert.notEqual(rendered.day, rendered.night, `${filename}: nighttime must use its own moon icon`);
  assert.match(rendered.night, /<g fill="currentColor" stroke="none">/, `${filename}: moon and stars must be solid without outlines`);
  assert.deepEqual(rendered.labels, ['晴', '晴夜'], `${filename}: both comparison labels must remain`);
  assert.deepEqual(rendered.sizes, [[size, size], [size, size]], `${filename}: use the requested size`);
  assert.equal(rendered.paths.length, 3, `${filename}: one moon and two stars`);
  for (const shape of rendered.paths) {
    assert.equal(shape.stroke, 'none', `${filename}: no outlines`);
    assert.notEqual(shape.fill, 'none', `${filename}: solid fill`);
    assert.ok(shape.x >= 0 && shape.y >= 0 && shape.x + shape.width <= 24 && shape.y + shape.height <= 24,
      `${filename}: all shapes must remain inside the 24px viewBox`);
  }
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  assert.ok(fs.statSync(path.join(output, filename)).size > 1000, `${filename}: screenshot is empty`);
  console.log(`PASS: ${filename}, ${size}px, 晴 / 晴夜 are distinct; solid moon and two stars`);
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
    await page.setViewportSize({ width: 272, height: 180 });
    await page.goto(`${baseUrl}/icons.html?size=64&preview=1`);
    await page.waitForFunction(() => document.querySelectorAll('.tile svg').length === 1);
    await page.screenshot({ path: path.join(output, 'night-icon-preview.png') });
    console.log('PASS: night-icon-preview.png');
    assert.deepEqual(errors, [], 'screenshot page must have no browser errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
