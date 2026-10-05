const assert = require('node:assert/strict');
const { startServer, launchPage, closeEvidence } = require('./common.cjs');

(async () => {
  const runtime = await startServer();
  let browser;
  try {
    const session = await launchPage(runtime.url);
    browser = session.browser;
    const before = await session.page.evaluate(async () => {
      const cache = await caches.open('task008-logout-fixture');
      await cache.put('/logout-fixture', new Response('fixture'));
      return caches.keys();
    });
    assert.ok(before.length > 0, 'logout fixture cache must exist before logout');
    await session.page.evaluate(() => document.getElementById('me-logout').click());
    await session.page.waitForFunction(async () => (await caches.keys()).length === 0, null, { timeout: 5000 });
    const after = await session.page.evaluate(() => caches.keys());
    assert.deepEqual(after, [], 'logout must leave Cache Storage empty');
    console.log(`PASS: logout cleared ${before.length} cache(s); caches.keys() after logout = []`);
  } finally {
    await closeEvidence(runtime, browser);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
