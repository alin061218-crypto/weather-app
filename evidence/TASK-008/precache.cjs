const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./common.cjs');

(async () => {
  const runtime = await startServer();
  try {
    const html = await (await fetch(`${runtime.url}/index.html`)).text();
    const importmap = html.match(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i);
    assert.ok(importmap, 'index.html must contain an importmap');
    const imports = JSON.parse(importmap[1]).imports;
    const shell = ['/', '/index.html', '/css/style.css', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
    const assets = [...shell, ...Object.values(imports)];
    const failures = [];
    for (const asset of assets) {
      const response = await fetch(new URL(asset, runtime.url));
      if (response.status !== 200) failures.push(`${asset} -> ${response.status}`);
    }
    assert.deepEqual(failures, [], `precache assets failed: ${failures.join(', ')}`);
    assert.ok(Object.keys(imports).includes('three'), 'importmap must retain three');
    assert.ok(Object.keys(imports).some(key => key.startsWith('app/')), 'importmap must expose app modules');
    const sw = fs.readFileSync(path.join(__dirname, '../../frontend/sw.js'), 'utf8');
    for (const deleted of ['js/app.js', 'js/chart.js', 'js/particles.js', 'js/advice.js', 'js/storage.js', 'js/utils.js', 'light.css']) {
      assert.equal(sw.includes(deleted), false, `deleted asset remains in SW: ${deleted}`);
    }
    console.log(`PASS: precache assets ${assets.length} / failed 0 (shell 6 + importmap modules ${Object.keys(imports).length})`);
  } finally {
    runtime.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
