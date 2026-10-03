const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const label = process.argv[2] || 'final';
const output = path.join(__dirname, label);
fs.mkdirSync(output, { recursive: true });
const checks = [
  ['evidence/TASK-016c/fingerprint.cjs'],
  ['evidence/TASK-016c/fingerprint.cjs', '--via-fallback'],
  ['evidence/TASK-015e/browser.cjs'],
  ['evidence/TASK-015e/keyboard.cjs'],
  ['evidence/TASK-018b/race.cjs'],
  ['evidence/TASK-018b/race.cjs', '--location'],
  ['evidence/TASK-018b/latency.cjs'],
  ['evidence/TASK-016c/screenshots.cjs']
];
const logs = [];
for (const args of checks) {
  const result = spawnSync(process.execPath, ['--require', path.join(__dirname, 'preload.cjs'), ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000,
    env: { ...process.env, TASK016B_OUTPUT_DIR: output }
  });
  const log = `$ node ${args.join(' ')}\n${result.stdout || ''}${result.stderr || ''}`;
  logs.push(log);
  fs.writeFileSync(path.join(output, 'regression.txt'), logs.join('\n'));
  process.stdout.write(log);
  assert.equal(result.status, 0, `${args.join(' ')} failed: ${result.error || result.stderr}`);
  if (args[0].endsWith('latency.cjs')) {
    const latency = JSON.parse(result.stdout.slice(0, result.stdout.indexOf('\nPASS:')));
    assert.ok(latency.common.elapsedMs <= 700, `common cold start exceeds 700ms: ${latency.common.elapsedMs}`);
  }
}
console.log(`PASS: ${label} complete regression, including keyboard and screenshots at 375 / 768 / 1280px`);
