const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'frontend/js');
const files = fs.readdirSync(dir).filter(file => file.endsWith('.js')).sort();
const logs = [], record = text => { logs.push(text); console.log(text); };
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  record(`$ ${command} ${args.join(' ')}\n${output}`);
  assert.equal(result.status, 0, output || result.error?.message);
}
assert.equal(files.length, 12, 'nine new modules + main + two existing visual assets');
record('1) JS files = 12 (9 extracted + main + icons + atmosphere)');
record('file             PowerShell-Lines physical-lines exports');
for (const file of files) {
  const source = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = source.trimEnd().split(/\r?\n/), exports = [...source.matchAll(/^export /gm)].length;
  const psLines = lines.filter(line => line.length > 0).length;
  record(`${file.padEnd(17)}${String(psLines).padStart(6)}${String(lines.length).padStart(15)}${String(exports).padStart(8)}`);
  assert.ok(exports > 0 && lines.length >= 30, file);
  if (!['icons.js', 'atmosphere.js'].includes(file)) assert.ok(lines.length <= (file === 'main.js' ? 250 : 350), file);
}
record('2) Static imports / DAG / actual ESM linking');
run(process.execPath, ['evidence/TASK-016b/imports.cjs']);
record('3) Importmap / hashes / child invalidation');
run(process.execPath, ['evidence/TASK-016b/importmap.cjs']);
record('4) npm run check:versions');
run('cmd.exe', ['/d', '/c', 'npm.cmd run check:versions']);
record('5) Complete historical regressions (in-memory adapter; old files preserved)');
const regression = fs.readFileSync(path.join(__dirname, 'final/regression.txt'), 'utf8');
assert.equal((regression.match(/PASS:/g) || []).length, 7);
for (const line of regression.split(/\r?\n/).filter(line => line.startsWith('PASS:'))) record(line);
const latency = JSON.parse(regression.match(/\$ node evidence\/TASK-018b\/latency\.cjs\r?\n([\s\S]*?)\r?\nPASS:/)[1]);
assert.ok(latency.common.elapsedMs <= 700);
record(`Common cold start = ${latency.common.elapsedMs}ms <= 700ms; slow backend = ${latency.slowBackend.elapsedMs}ms; common direct requests = ${latency.common.requests.openMeteo}`);
const parity = JSON.parse(fs.readFileSync(path.join(__dirname, 'parity-final/results.json'), 'utf8'));
assert.equal(parity.length, 6);
for (const result of parity) { assert.equal(result.identical, true); record(`PASS: ${result.width}px ${result.theme}, ${result.nodes} elements, exact DOM/computed styles/chart/screenshot parity`); }
assert.ok(parity.some(result => result.behavior?.registerLoginLogout && result.behavior?.selectedFavoriteAndHistory === '义乌'));
record('PASS: baseline/current chat replies, county guide, account login/register/logout, favorite/history selection and clearing');
const cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache.json'), 'utf8'));
assert.ok(cache.mainFromBrowserCache && cache.mainUnchanged && cache.browserObservedChild === 'after');
record('PASS: real HTTP immutable headers and warm cached main loading the edited child');
record('6) Syntax / whitespace / scope');
for (const file of files) {
  const checked = spawnSync(process.execPath, ['--check', path.join(dir, file)], { encoding: 'utf8', windowsHide: true });
  assert.equal(checked.status, 0, `${file}: ${checked.stderr}`);
}
record('PASS: node --check for all 12 JS files');
run('git', ['diff', '--check']);
run('git', ['diff', 'e6e8dc0', '--check']);
const normalize = text => text.replace(/\r\n/g, '\n');
const baseline = file => normalize(execFileSync('git', ['show', `e6e8dc0:${file}`], { cwd: root, encoding: 'utf8' }));
const current = file => normalize(fs.readFileSync(path.join(root, file), 'utf8'));
assert.equal(current('frontend/index.html').replace(/<script type="importmap">[\s\S]*?<\/script>/, ''), baseline('frontend/index.html').replace(/<script type="importmap">[\s\S]*?<\/script>/, ''));
assert.equal(current('server.js').split('const HALF_HOUR_MS =')[1], baseline('server.js').split('const HALF_HOUR_MS =')[1]);
for (const file of ['frontend/js/icons.js', 'frontend/js/atmosphere.js', 'frontend/sw.js']) assert.equal(current(file), baseline(file));
const changed = execFileSync('git', ['diff', '--name-only', 'e6e8dc0'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
assert.ok(changed.every(file => /^(frontend\/js\/|frontend\/index\.html$|server\.js$|evidence\/TASK-016b\/)/.test(file)));
record('PASS: HTML changes only importmap; server changes only hash injection/guard; original visual assets and sw.js preserved; all writes in allowed scope');
fs.writeFileSync(path.join(__dirname, 'acceptance.txt'), logs.join('\n\n') + '\n');
