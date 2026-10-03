const { spawn } = require('node:child_process');
const { assert, fs, path, root, start } = require('../TASK-017/runtime.cjs');

async function run(label, command, args, env) {
  const child = spawn(command, args, { cwd: root, env, windowsHide: true });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    output += chunk;
    process.stdout.write(chunk);
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  fs.writeFileSync(path.join(__dirname, `${label}.txt`), `exit: ${code}\n${output}`);
  assert.equal(code, 0, label);
  return { label, exit: code, output };
}

async function main() {
  // Optional HTTP checks reuse the existing disposable-DB fixture.
  const runtime = process.argv.includes('--real-server') ? await start() : null;
  const reports = [];
  try {
    const env = { ...process.env, ...(runtime ? { WEATHER_URL: runtime.url } : {}) };
    reports.push(await run('light-night', process.execPath, ['evidence/TASK-019/light-night.cjs'], env));
    const npm = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
    const npmArgs = name => process.platform === 'win32' ? ['/d', '/s', '/c', `npm run ${name}`] : ['run', name];
    reports.push(await run('check-versions', npm, npmArgs('check:versions'), env));
    reports.push(await run(runtime ? 'check-evidence-real-server' : 'check-evidence', npm, npmArgs('check:evidence'), env));
    reports.push(await run('diff-check', 'git', ['diff', '--check'], env));
    fs.writeFileSync(path.join(__dirname, 'regression.json'), JSON.stringify({
      server: runtime ? 'Real server with a disposable SQLite DB and generated test credentials; stopped after checks.' : 'Default repository guard; no application server is running, so TASK-018 explicitly skips.',
      commands: reports
    }, null, 2) + '\n');
    console.log('PASS TASK-021 regression: light-night, check:versions, check:evidence, git diff --check');
  } finally { await runtime?.close(); }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
