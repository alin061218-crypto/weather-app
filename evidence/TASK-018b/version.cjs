const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const asset = path.join(root, 'frontend', 'js', 'main.js');
const serverFile = path.join(root, 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function readDotEnv() {
  const values = {};
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

async function waitForIndex(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`server did not become ready: ${lastError?.message || 'unknown error'}`);
}

function versionOf(html, url) {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`${escaped}\\?v=([a-f0-9]{8})`));
  assert.ok(match, `${url} version missing from index.html`);
  return match[1];
}

(async () => {
  const original = fs.readFileSync(asset);
  const expectedBefore = crypto.createHash('sha1').update(original).digest('hex').slice(0, 8);
  const port = await freePort();
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task018b-version-db-'));
  const env = { ...process.env, ...readDotEnv(), PORT: String(port), DB_DIR: dbDir, NODE_ENV: 'development' };
  const child = spawn(process.execPath, [serverFile], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const beforeHtml = await waitForIndex(`http://127.0.0.1:${port}/index.html`, child);
    const beforeVersion = versionOf(beforeHtml, '/js/main.js');
    assert.equal(beforeVersion, expectedBefore, 'initial injected version must equal SHA-1[:8]');

    fs.appendFileSync(asset, Buffer.from('\n// TASK-018b version evidence mutation\n'));
    const mutated = fs.readFileSync(asset);
    const expectedAfter = crypto.createHash('sha1').update(mutated).digest('hex').slice(0, 8);
    assert.notEqual(expectedAfter, expectedBefore, 'evidence mutation must change the content hash');
    const afterHtml = await waitForIndex(`http://127.0.0.1:${port}/index.html`, child);
    const afterVersion = versionOf(afterHtml, '/js/main.js');
    assert.equal(afterVersion, expectedAfter, 'mutated asset version must equal SHA-1[:8]');
    assert.notEqual(afterVersion, beforeVersion, 'injected version must change after content mutation');

    console.log(JSON.stringify({ before: { version: beforeVersion, sha1_8: expectedBefore }, after: { version: afterVersion, sha1_8: expectedAfter } }, null, 2));
    console.log('PASS: changing main.js changes the injected ?v= and both values equal SHA-1[:8]');
  } finally {
    fs.writeFileSync(asset, original);
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    fs.rmSync(dbDir, { recursive: true, force: true });
    if (child.exitCode && stderr) process.stderr.write(stderr);
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
