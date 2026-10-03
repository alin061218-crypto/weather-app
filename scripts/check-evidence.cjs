const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const evidenceRoot = path.join(root, 'evidence');
const soloOutputDir = path.join(evidenceRoot, 'TASK-014d');
const staticOnly = process.argv.includes('--static-only');
const versionPattern = /(main\.js\?v=[0-9a-f]|style\.css\?v=[0-9a-f])/i;
const versionHits = [];

function walk(dir, visitor) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, visitor);
    else visitor(file, entry.name);
  }
}

walk(evidenceRoot, (file, name) => {
  if (!/\.(?:cjs|ps1|js)$/i.test(name)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const negativeFixture = /TASK-016b[\\/]importmap\.cjs$/.test(file) && /v=00000000/.test(line);
    if (versionPattern.test(line) && !negativeFixture) {
      versionHits.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
    }
  });
});

if (versionHits.length) {
  console.error(versionHits.join('\n'));
  process.exit(1);
}
console.log('PASS: no hard-coded asset version strings in evidence scripts (00000000 negative fixture excluded)');

if (staticOnly) {
  console.log('PASS: --static-only requested; browser evidence scripts were not started');
  process.exit(0);
}

const soloRuns = [
  ['TASK-016c-fingerprint', 'evidence/TASK-016c/fingerprint.cjs'],
  ['TASK-016c-fingerprint-via-fallback', 'evidence/TASK-016c/fingerprint.cjs', '--via-fallback'],
  ['TASK-016c-screenshots', 'evidence/TASK-016c/screenshots.cjs'],
  ['TASK-015-screenshots', 'evidence/TASK-015/screenshots.cjs'],
  ['TASK-015b-overflow', 'evidence/TASK-015b/overflow.cjs'],
  ['TASK-015c-screenshots', 'evidence/TASK-015c/screenshots.cjs'],
  ['TASK-016a-screenshots', 'evidence/TASK-016a/screenshots.cjs'],
  ['TASK-016b-importmap', 'evidence/TASK-016b/importmap.cjs'],
  ['TASK-018-headers', 'evidence/TASK-018/headers.cjs'],
  ['TASK-007-browser-check', 'evidence/TASK-007/browser-check.cjs']
];

fs.mkdirSync(soloOutputDir, { recursive: true });
for (const name of fs.readdirSync(soloOutputDir)) {
  if (/^(?:PASS|SKIP|FAIL)-.*\.txt$/i.test(name)) fs.rmSync(path.join(soloOutputDir, name));
}

let failures = 0;
for (const [name, script, ...args] of soloRuns) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('');
  const explicitSkip = /(?:^|\r?\n)SKIP:\s/m.test(output);
  const explicitPass = /(?:^|\r?\n).*\bPASS\b/m.test(output);
  let status = 'PASS';
  if (result.error || result.status !== 0 || (!explicitPass && !explicitSkip)) status = 'FAIL';
  else if (explicitSkip) status = 'SKIP';
  if (status === 'FAIL') failures++;
  const details = [
    `command: node ${script}${args.length ? ` ${args.join(' ')}` : ''}`,
    `exit: ${result.status ?? 'none'}`,
    result.error ? `error: ${result.error.message}` : '',
    '',
    output
  ].filter(Boolean).join('\n');
  fs.writeFileSync(path.join(soloOutputDir, `${status}-${name}.txt`), details);
  console.log(`${status}: ${name}`);
}

if (failures) {
  console.error(`FAIL: ${failures} solo evidence script(s)`);
  process.exit(1);
}
console.log(`PASS: ${soloRuns.length} evidence scripts passed or were explicitly skipped when run solo`);
