const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const frontend = path.resolve(__dirname, '../../frontend');
const output = __dirname;
const icons = [
  ['clearDay', '晴'], ['clearNight', '晴夜'], ['partlyCloudy', '少云'], ['cloudy', '多云'],
  ['overcast', '阴'], ['fog', '雾'], ['rainLight', '小雨'], ['rainHeavy', '大雨'],
  ['snow', '雪'], ['storm', '雷暴']
];

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
  .variants { display: grid; grid-template-columns: repeat(2, 270px); gap: 18px; max-width: 600px; }
  .variant { display: grid; place-items: center; gap: 12px; padding: 18px; border: 1px solid #344153; background: #182230; }
  .variant svg { width: 140px; height: 140px; color: #f3f7fb; }
  .variant .label { font-size: 14px; }
  .siblings { display: grid; grid-template-columns: repeat(4, 190px); gap: 16px; }
  .siblings .tile { min-height: 180px; }
</style>
<h1 id="title"></h1><main id="root"></main>
<script type="module">
  import { icon } from '/js/icons.js';
  const root = document.querySelector('#root');
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const tile = (name, label, size) => '<section class="tile"><div>' + icon.weather[name]() + '</div><div class="label">' + esc(label) + '</div></section>';
  const pathB = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M19 5A8 8 0 1 0 19 19"/></svg>';
  const oneStar = icon.weather.clearNight();
  const twoStar = oneStar.replace('</svg>', '<circle cx="19.2" cy="7.4" r="0.65" fill="currentColor" stroke="none" opacity=".45"/></svg>');
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || 'all';
  const size = Number(params.get('size') || 48);
  document.documentElement.style.setProperty('--size', size + 'px');
  if (mode === 'variants') {
    document.querySelector('#title').textContent = '晴夜造型对比';
    root.className = 'variants';
    root.innerHTML = [
      ['方案 A · 一大一小两颗星', twoStar], ['方案 A · 只留一颗星', oneStar],
      ['方案 B · 中线描边 + 两颗星', pathB.replace('</svg>', '<circle cx="15.5" cy="3.5" r="1.1" fill="currentColor" stroke="none" opacity=".75"/><circle cx="19.2" cy="7.4" r=".65" fill="currentColor" stroke="none" opacity=".45"/></svg>')],
      ['方案 B · 中线描边 + 一颗星', pathB.replace('</svg>', '<circle cx="15.5" cy="3.5" r="1.1" fill="currentColor" stroke="none" opacity=".75"/></svg>')]
    ].map(([label, svg]) => '<section class="variant">' + svg + '<div class="label">' + esc(label) + '</div></section>').join('');
  } else if (mode === 'siblings') {
    document.querySelector('#title').textContent = '晴夜相邻图标核对';
    root.className = 'siblings';
    root.innerHTML = ${JSON.stringify(icons.slice(0, 5))}.map(([name, label]) => tile(name, label, 96)).join('');
  } else {
    document.querySelector('#title').textContent = '天气图标家族 · ' + size + 'px';
    root.className = 'grid';
    root.innerHTML = ${JSON.stringify(icons)}.map(([name, label]) => tile(name, label, size)).join('');
  }
</script>`;

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') return response.writeHead(204).end();
    if (url.pathname === '/icons.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(pageMarkup);
      return;
    }
    const file = path.resolve(frontend, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(frontend + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
      if (error) return response.writeHead(404).end();
      const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      response.end(bytes);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function capture(page, baseUrl, filename, params) {
  await page.goto(`${baseUrl}/icons.html?${params}`);
  await page.waitForFunction(() => document.querySelectorAll('svg').length > 0);
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  assert.ok(fs.statSync(path.join(output, filename)).size > 1000, `${filename}: screenshot is empty`);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 760 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => console.error(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') console.error(`console: ${message.text()}`); });
  try {
    await capture(page, `http://127.0.0.1:${server.address().port}`, 'icons-24.png', 'mode=all&size=24');
    await capture(page, `http://127.0.0.1:${server.address().port}`, 'icons-48.png', 'mode=all&size=48');
    await capture(page, `http://127.0.0.1:${server.address().port}`, 'icons-hero.png', 'mode=all&size=96');
    await capture(page, `http://127.0.0.1:${server.address().port}`, 'clear-night-variants.png', 'mode=variants');
    await capture(page, `http://127.0.0.1:${server.address().port}`, 'siblings.png', 'mode=siblings');
    console.log('PASS: icons-24.png, icons-48.png, icons-hero.png, clear-night-variants.png, siblings.png');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
