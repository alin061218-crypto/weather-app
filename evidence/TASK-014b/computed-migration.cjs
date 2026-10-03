const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const frontend = path.join(root, 'frontend');
const baselinePath = path.join(__dirname, 'migration-before.json');
const widths = [375, 768, 1120];
const moved = {
  weatherMeta: ['.weather-meta', ['gridColumn', 'gridRow', 'color', 'font', 'marginTop']],
  weatherMetaP: ['.weather-meta p', ['marginTop']],
  lifeIndices: ['.life-indices', ['gridColumn', 'display', 'gridTemplateColumns', 'gap']],
  lifeIndex: ['.life-index', ['minWidth', 'padding', 'backgroundColor', 'border', 'borderRadius']],
  lifeIndexH3: ['.life-index h3', ['font', 'color']],
  lifeIndexH3Span: ['.life-index h3 span', ['display', 'color', 'marginTop']],
  lifeIndexP: ['.life-index p', ['font', 'color', 'marginTop']],
  siteInfo: ['.site-info', ['gridColumn', 'textAlign', 'color', 'font', 'paddingBlock']],
  siteInfoA: ['.site-info a', ['color']],
  supportButton: ['.support-button', ['border', 'borderRadius', 'backgroundColor', 'color', 'minHeight', 'padding', 'cursor', 'font']],
  tabMe: ['#tab-me', ['position']],
  meSupport: ['.me-support', ['position', 'inset', 'display', 'justifyContent', 'gap']],
  dialogBox: ['.content-dialog .modal-box', ['maxWidth', 'maxHeight', 'overflowY']],
  dialogH2: ['.content-dialog h2', ['paddingRight', 'marginBottom']],
  dialogP: ['.content-dialog p', ['font', 'color', 'marginBlock']],
  dialogLabel: ['.content-dialog label', ['display', 'gap', 'marginBlock', 'font']],
  dialogControls: ['.content-dialog select', ['width', 'minHeight', 'backgroundColor', 'color', 'border', 'borderRadius', 'padding', 'font']],
  dialogSummary: ['.content-dialog summary', ['cursor', 'font', 'minHeight', 'paddingBlock']],
  dialogA: ['.content-dialog a', ['color']],
  feedbackStatus: ['#feedback-status', ['minHeight']]
};

function contentType(file) {
  const ext = path.extname(file);
  return ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'application/octet-stream';
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(frontend, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!file.startsWith(frontend + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, body) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': `${contentType(file)}; charset=utf-8` });
      response.end(body);
    });
  });
}

async function inspect(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('http://127.0.0.1:0/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  // The URL is replaced by the caller after the ephemeral server port is known.
}

async function readAt(page, url, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.body.dataset.weather = 'clear-night';
    const stats = document.querySelector('#stats-scroll');
    stats.innerHTML = Array.from({ length: 10 }, (_, i) => `<span class="stat-chip">${i}</span>`).join('');
    const indices = document.querySelector('.life-indices');
    if (!indices.querySelector('.life-index')) indices.innerHTML = '<section class="life-index"><h3>指数<span>测试</span></h3><p>测试</p></section>';
  });
  return page.evaluate(({ moved, width }) => {
    const read = ([selector, properties]) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing selector: ${selector}`);
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map(property => [property, style[property]]));
    };
    const stats = document.querySelector('.stats-scroll');
    const skeleton = document.querySelector('.skeleton-stats');
    const chips = document.querySelectorAll('.stat-chip').length;
    return {
      width,
      moved: Object.fromEntries(Object.entries(moved).map(([name, spec]) => [name, read(spec)])),
      statsColumns: getComputedStyle(stats).gridTemplateColumns,
      skeletonColumns: getComputedStyle(skeleton).gridTemplateColumns,
      skeletonSpans: skeleton.querySelectorAll('span').length,
      chipCount: chips
    };
  }, { moved, width });
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const results = [];
    for (const width of widths) results.push(await readAt(page, url, width));
    if (process.argv.includes('--capture-before')) {
      fs.writeFileSync(baselinePath, `${JSON.stringify(results, null, 2)}\n`);
      console.log(`Wrote migration baseline: ${baselinePath}`);
      return;
    }
    assert.ok(fs.existsSync(baselinePath), `Missing migration baseline: ${baselinePath}`);
    const before = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    for (let i = 0; i < results.length; i++) {
      const current = results[i], prior = before[i];
      assert.equal(current.width, prior.width);
      for (const key of Object.keys(moved)) assert.deepEqual(current.moved[key], prior.moved[key], `${current.width}px ${key} computed style changed`);
      console.log(`${current.width}px moved-style computed values: PASS`);
      console.log(`  stats before=${prior.statsColumns}; after=${current.statsColumns}`);
      console.log(`  skeleton before=${prior.skeletonColumns}; after=${current.skeletonColumns}`);
    }
    fs.writeFileSync(path.join(__dirname, 'migration-after.json'), `${JSON.stringify(results, null, 2)}\n`);
    console.log('PASS: moved inline styles retain computed values after migration');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
