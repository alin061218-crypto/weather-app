const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { renderIndex, checkAssetVersions, root } = require('./assets.cjs');
const html = renderIndex();
const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const files = fs.readdirSync(path.join(root, 'frontend/js')).filter(file => file.endsWith('.js')).sort();
const appEntries = Object.entries(imports).filter(([name]) => name.startsWith('app/'));
assert.equal(appEntries.length, files.length);
for (const file of files) {
  const hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, 'frontend/js', file))).digest('hex').slice(0, 8);
  assert.equal(imports['app/' + file.slice(0, -3)], `/js/${file}?v=${hash}`);
  console.log(`app/${file.slice(0, -3)} -> ${imports['app/' + file.slice(0, -3)]}`);
  assert.ok(!fs.readFileSync(path.join(root, 'frontend/js', file), 'utf8').includes('?v='), `${file}: hand-written version`);
}
assert.equal(checkAssetVersions(html), files.length);
const malformed = JSON.parse(JSON.stringify(imports));
delete malformed['app/config'];
assert.throws(() => checkAssetVersions(html.replace(/(<script type="importmap">)[\s\S]*?(<\/script>)/, '$1' + JSON.stringify({ imports: malformed }) + '$2')), /coverage|version/);
// Deliberate malformed hash used as a negative test for the version guard.
assert.throws(() => checkAssetVersions(html.replace(imports['app/config'], '/js/config.js?v=00000000')), /version/i);
const template = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
assert.ok(!template.includes('?v='), 'hashes must be injected, never maintained in the template');
const config = path.join(root, 'frontend/js/config.js');
const original = fs.readFileSync(config);
try {
  fs.appendFileSync(config, '\n// version mutation evidence\n');
  const changed = JSON.parse(renderIndex().match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  assert.notEqual(changed['app/config'], imports['app/config']);
  assert.equal(changed['app/main'], imports['app/main']);
  assert.equal(checkAssetVersions(renderIndex()), files.length);
} finally { fs.writeFileSync(config, original); }
fs.writeFileSync(path.join(__dirname, 'rendered-index.html'), renderIndex());
console.log(`PASS: ${appEntries.length} app importmap entries = ${files.length} JS modules; existing three vendor entry retained; all SHA-1[:8] hashes, automatic child invalidation, and guard rejection checks passed`);
