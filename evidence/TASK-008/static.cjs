const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sw = fs.readFileSync(path.join(__dirname, '../../frontend/sw.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '../../frontend/index.html'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../../frontend/js/main.js'), 'utf8');
assert.equal(sw.includes("const CACHE_NAME = 'weather-app-v2'"), false);
assert.match(sw, /CACHE_NAME\s*=\s*`weather-app-\$\{shellHashFrom\(html\)\}`/);
assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
assert.match(sw, /url\.pathname === '\/admin'/);
assert.match(main, /registration\.active\?\.postMessage\(\{ type: 'clear-caches' \}\)/);
for (const meta of ['Cache-Control', 'Pragma', 'Expires']) assert.equal(index.includes(`http-equiv="${meta}"`), false, `${meta} meta must be removed`);
console.log('PASS: static SW shell/importmap/hash/network-only/logout checks; obsolete cache-control metas removed');
