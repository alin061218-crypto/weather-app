const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const commands = [
  ...['TASK-019', 'TASK-015e', 'TASK-015c', 'TASK-015', 'TASK-016a', 'TASK-016c'].map(task => `node evidence/${task}/contrast.cjs`),
  'node evidence/TASK-009/coverage.cjs',
  'node evidence/TASK-009/axe.cjs',
  'npm run check:versions',
  'npm run check:evidence -- --static-only',
  'npm test',
  'git diff --check',
  'git diff --cached --check'
];
const logs = [];
for (const command of commands) {
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 20 * 1024 * 1024
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  logs.push(`> ${command}\nexit: ${result.status}\n${output}`);
  fs.writeFileSync(path.join(__dirname, 'checks.txt'), logs.join('\n'));
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'}: ${command}`);
  assert.equal(result.status, 0, result.error?.message || output);
}
const hardCoded = ['TASK-019', 'TASK-015e'].flatMap(task =>
  fs.readFileSync(path.join(root, 'evidence', task, 'contrast.cjs'), 'utf8').match(/const scenes = \['/g) || []);
assert.equal(hardCoded.length, 0);
logs.push('PASS: Select-String equivalent, const scenes = array literals: 0 hits\n');
fs.writeFileSync(path.join(__dirname, 'checks.txt'), logs.join('\n'));
