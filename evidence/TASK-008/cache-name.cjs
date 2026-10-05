const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, launchPage, closeEvidence } = require('./common.cjs');

async function readCacheName(runtime) {
  const session = await launchPage(runtime.url);
  const name = (await session.page.evaluate(() => caches.keys()))[0];
  await session.browser.close();
  return name;
}

(async () => {
  const style = path.join(__dirname, '../../frontend/css/style.css');
  const original = fs.readFileSync(style);
  let firstRuntime;
  let secondRuntime;
  try {
    firstRuntime = await startServer();
    const before = await readCacheName(firstRuntime);
    firstRuntime.stop();
    firstRuntime = null;

    fs.appendFileSync(style, '\n/* TASK-008 cache-name probe */\n');
    secondRuntime = await startServer();
    const after = await readCacheName(secondRuntime);
    assert.match(before, /^weather-app-[a-f0-9]{8}$/);
    assert.match(after, /^weather-app-[a-f0-9]{8}$/);
    assert.notEqual(after, before, 'style content change must change CACHE_NAME');
    console.log(`PASS: CACHE_NAME changed ${before} -> ${after} after one-byte style mutation`);
  } finally {
    if (firstRuntime) firstRuntime.stop();
    if (secondRuntime) secondRuntime.stop();
    fs.writeFileSync(style, original);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
