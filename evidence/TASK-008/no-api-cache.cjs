const assert = require('node:assert/strict');
const { startServer, launchPage, closeEvidence } = require('./common.cjs');

(async () => {
  const runtime = await startServer();
  let browser;
  try {
    const session = await launchPage(runtime.url);
    browser = session.browser;
    const requests = await session.page.evaluate(async () => {
      const responses = [];
      for (const url of ['/api/me', '/admin/api/stats']) {
        const response = await fetch(url, { headers: { Authorization: 'Bearer task008-fixture' } });
        responses.push({ url, status: response.status });
      }
      return responses;
    });
    const entries = await session.page.evaluate(async () => {
      const result = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        result.push(...(await cache.keys()).map(request => request.url));
      }
      return result;
    });
    const forbidden = entries.filter(url => /\/api\/|\/admin(?:[/?#]|$)/i.test(new URL(url).pathname + new URL(url).search));
    assert.deepEqual(forbidden, [], `API/admin URLs were cached: ${forbidden.join(', ')}`);
    console.log(`PASS: ${JSON.stringify(requests)}; cache entries ${entries.length}; forbidden API/admin entries 0`);
  } finally {
    await closeEvidence(runtime, browser);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
