const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const frontend = path.join(root, 'frontend');
const output = __dirname;
const tiers = [
  { name: 'compact', width: 375, expectedTracks: 5 },
  { name: 'tablet', width: 768, expectedTracks: 5 },
  { name: 'desktop', width: 1120, expectedTracks: 10 }
];

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

async function cdpEvaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'CDP evaluation failed');
  return result.result?.value;
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const results = [];
  try {
    for (const tier of tiers) {
      const context = await browser.newContext({ viewport: { width: tier.width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await cdpEvaluate(cdp, `(() => {
        const stats = document.querySelector('#stats-scroll');
        stats.innerHTML = Array.from({ length: 10 }, (_, i) => '<span class="stat-chip"><span class="stat-chip-value">' + i + '</span><span class="stat-chip-label">测试指标</span></span>').join('');
        document.querySelector('.skeleton-stats').setAttribute('data-evidence', 'ready');
        document.querySelector('#loading').classList.remove('hidden');
        document.querySelector('#weather-card').classList.remove('hidden');
        document.querySelector('.skeleton-stats').style.width = stats.getBoundingClientRect().width + 'px';
      })()`);
      const before = await cdpEvaluate(cdp, `(() => {
        const grid = element => {
          const raw = getComputedStyle(element).gridTemplateColumns;
          const repeat = raw.match(/^repeat\\((\\d+),/);
          const count = repeat ? Number(repeat[1]) : raw.trim().split(/\\s+/).length;
          const width = element.clientWidth / count;
          const values = repeat ? Array.from({ length: count }, () => width) : raw.trim().split(/\\s+/).map(value => Number.parseFloat(value));
          return { raw, values: values.map(value => Math.round(value * 10) / 10) };
        };
        const skeleton = document.querySelector('.skeleton-stats');
        const stats = document.querySelector('.stats-scroll');
        return {
          width: innerWidth,
          skeletonColumns: grid(skeleton),
          statsColumns: grid(stats),
          skeletonSpans: skeleton.querySelectorAll(':scope > span').length,
          chipCount: stats.querySelectorAll(':scope > .stat-chip').length,
          bodyWidth: document.body.scrollWidth
        };
      })()`);
      assert.equal(before.skeletonColumns.values.length, tier.expectedTracks, `${tier.width}px unexpected skeleton grid track count`);
      assert.equal(before.statsColumns.values.length, tier.expectedTracks, `${tier.width}px unexpected stats grid track count`);
      assert.deepEqual(before.skeletonColumns.values, before.statsColumns.values, `${tier.width}px skeleton/stats computed columns differ`);
      assert.equal(before.skeletonSpans, 10, `${tier.width}px expected 10 skeleton spans`);
      assert.equal(before.chipCount, 10, `${tier.width}px expected 10 stat chips`);
      assert.ok(before.bodyWidth <= tier.width + 1, `${tier.width}px body overflows: ${before.bodyWidth}`);
      await cdpEvaluate(cdp, `(() => { document.querySelector('#weather-card').classList.add('hidden'); })()`);
      await page.screenshot({ path: path.join(output, `skeleton-${tier.width}.png`), fullPage: true });
      await cdpEvaluate(cdp, `(() => { document.querySelector('#weather-card').classList.remove('hidden'); })()`);
      const after = await cdpEvaluate(cdp, `(() => ({
        width: innerWidth,
        skeletonColumns: (() => { const element = document.querySelector('.skeleton-stats'); const raw = getComputedStyle(element).gridTemplateColumns; const repeat = raw.match(/^repeat\\((\\d+),/); const count = repeat ? Number(repeat[1]) : raw.trim().split(/\\s+/).length; const values = repeat ? Array.from({ length: count }, () => element.clientWidth / count) : raw.trim().split(/\\s+/).map(value => Number.parseFloat(value)); return { raw, values: values.map(value => Math.round(value * 10) / 10) }; })(),
        statsColumns: (() => { const element = document.querySelector('.stats-scroll'); const raw = getComputedStyle(element).gridTemplateColumns; const repeat = raw.match(/^repeat\\((\\d+),/); const count = repeat ? Number(repeat[1]) : raw.trim().split(/\\s+/).length; const values = repeat ? Array.from({ length: count }, () => element.clientWidth / count) : raw.trim().split(/\\s+/).map(value => Number.parseFloat(value)); return { raw, values: values.map(value => Math.round(value * 10) / 10) }; })(),
        skeletonSpans: document.querySelector('.skeleton-stats').querySelectorAll(':scope > span').length,
        chipCount: document.querySelector('.stats-scroll').querySelectorAll(':scope > .stat-chip').length,
        bodyWidth: document.body.scrollWidth
      }))()`);
      assert.equal(after.skeletonColumns.values.length, tier.expectedTracks, `${tier.width}px loaded unexpected skeleton grid track count`);
      assert.equal(after.statsColumns.values.length, tier.expectedTracks, `${tier.width}px loaded unexpected stats grid track count`);
      assert.deepEqual(after.skeletonColumns.values, after.statsColumns.values, `${tier.width}px loaded skeleton/stats computed columns differ`);
      assert.equal(after.skeletonSpans, 10);
      assert.equal(after.chipCount, 10);
      assert.ok(after.bodyWidth <= tier.width + 1, `${tier.width}px loaded body overflows: ${after.bodyWidth}`);
      await cdpEvaluate(cdp, `(() => { document.querySelector('#loading').classList.add('hidden'); })()`);
      await page.screenshot({ path: path.join(output, `loaded-${tier.width}.png`), fullPage: true });
      const result = { ...tier, loading: before, loaded: after };
      results.push(result);
      console.log(`PASS ${tier.width}px: skeleton=${before.skeletonColumns.raw}; stats=${before.statsColumns.raw}; spans=${before.skeletonSpans}; chips=${before.chipCount}`);
      console.log(`PASS ${tier.width}px loaded: skeleton=${after.skeletonColumns.raw}; stats=${after.statsColumns.raw}; spans=${after.skeletonSpans}; chips=${after.chipCount}`);
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`PASS: ${results.length} tiers; loading/loaded screenshots and CDP parity captured`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
