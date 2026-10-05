const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, launchPage, closeEvidence } = require('./common.cjs');

(async () => {
  const runtime = await startServer();
  let browser;
  try {
    const session = await launchPage(runtime.url, { captureErrors: true });
    browser = session.browser;
    const state = await session.page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return { controller: Boolean(navigator.serviceWorker.controller), active: registration.active?.state || null, caches: await caches.keys() };
    });
    assert.equal(state.controller, true, 'service worker controller must be non-empty');
    assert.equal(state.active, 'activated', 'service worker must be activated');
    const cacheReport = await session.page.evaluate(async () => {
      let count = 0;
      const urls = [];
      for (const name of await caches.keys()) {
        const entries = await (await caches.open(name)).keys();
        count += entries.length;
        urls.push(...entries.map(request => request.url));
      }
      const imports = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports;
      const expected = ['/', '/index.html', '/css/style.css', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', ...Object.values(imports)]
        .map(asset => new URL(asset, location.origin).href);
      return { count, expected, cached: urls };
    });
    const missing = cacheReport.expected.filter(url => !cacheReport.cached.includes(url));
    assert.deepEqual(missing, [], `precache entries missing: ${missing.join(', ')}`);
    assert.equal(session.consoleMessages.filter(message => message.startsWith('pageerror:')).length, 0, session.consoleMessages.join('\n'));
    fs.writeFileSync(path.join(__dirname, 'pwa.json'), JSON.stringify({ ...state, precacheExpected: cacheReport.expected.length, precacheCached: cacheReport.expected.length - missing.length, cacheEntriesTotal: cacheReport.count, consoleMessages: session.consoleMessages }, null, 2) + '\n');
    console.log(`PASS: controller=${state.controller}, active=${state.active}, precache success ${cacheReport.expected.length}/${cacheReport.expected.length}, cache entries total ${cacheReport.count}`);
  } finally {
    await closeEvidence(runtime, browser);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
