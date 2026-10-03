const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, fork, execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const project = path.resolve(__dirname, '../..');
const windows = process.platform === 'win32';
const scratch = fs.mkdtempSync(path.join(__dirname, 'run-')) + '.tmp';
fs.renameSync(scratch.slice(0, -4), scratch);
const report = [];
const services = new Set();
const sockets = new Set();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const adminHash = bcrypt.hashSync('task020b-fixture-only', 4);
const expectedRows = { users: 1, favorites: 3, history: 3, cache: 0, feedback: 3 };
function sizes(dir) {
    return Object.fromEntries(['weather.db', 'weather.db-wal'].map(name => [name, fs.existsSync(path.join(dir, name)) ? fs.statSync(path.join(dir, name)).size : null]));
}
function rows(file) {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
        return Object.fromEntries(Object.keys(expectedRows).map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
    } finally { db.close(); }
}
function log(result) {
    report.push(result);
    console.log(JSON.stringify(result, null, 2));
}
async function until(check, label, timeout = 10000) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
        const result = check();
        if (result) return result;
        await wait(10);
    }
    throw new Error(`Timed out: ${label}`);
}
function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}
async function start(name, { consoleSignal = false, fault = '' } = {}) {
    const dir = path.join(scratch, name);
    const dbDir = path.join(dir, 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const seed = new Database(path.join(dbDir, 'weather.db'));
    seed.pragma('journal_mode = WAL'); seed.close();
    const before = sizes(dbDir);
    const port = await freePort();
    const traceFile = path.join(dir, 'trace.jsonl');
    const env = { ...process.env, PORT: String(port), DB_DIR: dbDir,
        JWT_SECRET: crypto.randomBytes(32).toString('hex'), ADMIN_USER: 'task020b', ADMIN_PASSWORD_HASH: adminHash,
        TASK020B_FAULT: fault, TASK020B_TRACE: traceFile };
    const stdoutFile = path.join(dir, 'stdout.log'), stderrFile = path.join(dir, 'stderr.log');
    let service, exit, stdout = '', stderr = '';
    if (windows && consoleSignal) {
        const launcher = spawn('pwsh', ['-NoProfile', '-File', path.join(__dirname, 'start-console.ps1')], {
            cwd: project, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...env, TASK020B_NODE: process.execPath, TASK020B_PROJECT: project, TASK020B_RUN_DIR: dir }
        });
        let launcherError = '';
        launcher.stderr.on('data', chunk => launcherError += chunk);
        launcher.on('error', error => { launcherError += error.stack; });
        const pidFile = path.join(dir, 'pid');
        const pid = await until(() => {
            if (launcherError) throw new Error(launcherError);
            return fs.existsSync(pidFile) && Number(fs.readFileSync(pidFile, 'utf8'));
        }, `${name} console PID`);
        service = { pid };
        exit = new Promise((resolve, reject) => {
            launcher.once('close', code => {
                if (code !== 0) reject(new Error(launcherError || `launcher exit ${code}`));
                else { try { resolve(JSON.parse(fs.readFileSync(path.join(dir, 'exit.json'), 'utf8'))); } catch (error) { reject(error); } }
            });
        });
    } else {
        const options = { cwd: project, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], execArgv: ['--require', path.join(__dirname, 'observe.cjs')] };
        service = consoleSignal
            ? spawn(process.execPath, [...options.execArgv, 'server.js'], options)
            : fork(path.join(__dirname, 'call-shutdown.cjs'), [], { ...options, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        service.stdout.on('data', chunk => stdout += chunk);
        service.stderr.on('data', chunk => stderr += chunk);
        exit = new Promise((resolve, reject) => {
            service.once('error', reject);
            service.once('close', (code, signal) => resolve({ code, signal }));
        });
    }
    const output = () => windows && consoleSignal
        ? { stdout: fs.existsSync(stdoutFile) ? fs.readFileSync(stdoutFile, 'utf8') : '', stderr: fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, 'utf8') : '' }
        : { stdout, stderr };
    const trace = () => fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    const test = { name, dir, dbDir, before, port, service, exit, stdoutFile, output, trace, consoleSignal, exited: false };
    services.add(test);
    exit.then(() => { test.exited = true; }, () => { test.exited = true; });
    await until(() => { if (test.exited) throw new Error(`${name} exited before startup: ${JSON.stringify(output())}`); return output().stdout.includes('天气后端服务已启动'); }, `${name} ready`);
    return test;
}
function request(test, pathname, body, token) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({ host: '127.0.0.1', port: test.port, path: pathname, method: 'POST', agent: false,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, res => {
            let text = '';
            res.setEncoding('utf8'); res.on('data', chunk => text += chunk);
            res.on('end', () => { try { assert.equal(res.statusCode, 200, `${pathname}: ${text}`); resolve(JSON.parse(text)); } catch (error) { reject(error); } });
        });
        req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
        req.on('error', reject); req.end(data);
    });
}
async function writeData(test) {
    const { token } = await request(test, '/api/register', { username: 'task020b_user', password: 'fixture-password' });
    await request(test, '/api/login', { username: 'task020b_user', password: 'fixture-password' });
    for (let i = 0; i < 3; i++) {
        await request(test, '/api/favorites', { name: `验收城市${i}`, admin1: '测试', country: '测试', lat: 30 + i, lon: 110 + i }, token);
        await request(test, '/api/history', { city: `验收城市${i}`, lat: 30 + i, lon: 110 + i, weather: '晴' }, token);
        await request(test, '/api/feedback', { rating: 5, comment: '验收'.repeat(950) });
    }
}
function direct(test) {
    assert.ok(test.service.send({ command: 'shutdown', reason: 'test' }));
}
async function signal(test, count = 1) {
    if (windows) {
        return new Promise((resolve, reject) => {
            const sender = spawn('pwsh', ['-NoProfile', '-File', path.join(__dirname, 'send-ctrl-c.ps1'), '-TargetPid', String(test.service.pid), '-StdoutFile', test.stdoutFile, '-Count', String(count)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
            let out = '', err = '';
            sender.stdout.on('data', chunk => out += chunk); sender.stderr.on('data', chunk => err += chunk);
            sender.once('error', reject);
            sender.once('close', code => { if (code !== 0) reject(new Error(err || out)); else { try { resolve(JSON.parse(out)); } catch (error) { reject(error); } } });
        });
    }
    assert.ok(test.service.kill('SIGINT'));
    let secondExitMs = null;
    if (count === 2) {
        await until(() => test.output().stdout.includes('正在关闭'), 'first signal handled');
        const start = performance.now();
        assert.ok(test.service.kill('SIGINT'));
        await test.exit;
        secondExitMs = Math.round(performance.now() - start);
        assert.ok(secondExitMs < 1000, `second signal took ${secondExitMs}ms`);
    }
    return { method: 'OS SIGINT', count, secondExitMs };
}
async function exited(test, timeout = 8000) {
    let timer;
    try { return await Promise.race([test.exit, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${test.name} exit timeout`)), timeout); })]); }
    finally { clearTimeout(timer); }
}
function checkTrace(test) {
    const trace = test.trace();
    assert.deepEqual(trace.map(item => item.event), ['server.close', 'wal_checkpoint(TRUNCATE)', 'checkpoint.result', 'db.close', 'db.closed']);
    assert.equal(trace[2].result[0].busy, 0);
    assert.equal(trace[4].open, false);
    return trace;
}
async function normal(name, consoleSignal) {
    const test = await start(name, { consoleSignal });
    await writeData(test);
    const during = sizes(test.dbDir);
    assert.ok(during['weather.db-wal'] > 0);
    const sent = consoleSignal ? await signal(test) : (direct(test), { method: "direct shutdown('test') (no signal)" });
    const exit = await exited(test);
    const after = sizes(test.dbDir), output = test.output();
    assert.equal(exit.code, 0);
    assert.match(output.stdout, /正在关闭/);
    assert.match(output.stdout, /已优雅关闭（WAL 已合并）/);
    assert.ok(after['weather.db-wal'] === null || after['weather.db-wal'] === 0);
    assert.ok(after['weather.db'] > test.before['weather.db']);
    const standalone = path.join(test.dir, 'main-only.db');
    fs.copyFileSync(path.join(test.dbDir, 'weather.db'), standalone);
    const standaloneRows = rows(standalone);
    assert.deepEqual(standaloneRows, expectedRows);
    log({ case: `PASS ${name}`, before: test.before, during, after, exit, sent, standaloneRows, trace: checkTrace(test), ...output });
    return test;
}
async function holdRequest(test) {
    const body = JSON.stringify({ rating: 5, comment: '在途请求正常入库' });
    const socket = net.connect(test.port, '127.0.0.1');
    sockets.add(socket);
    let response = '';
    socket.on('data', chunk => response += chunk); socket.on('error', () => {});
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    socket.write(`POST /api/feedback HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body.slice(0, 1)}`);
    await wait(150);
    return { socket, finish: () => socket.write(body.slice(1)), response: () => response };
}
async function main() {
    console.log(`platform=${process.platform} node=${process.version}`);
    const directTest = await normal('direct-shutdown', false);
    await normal('SIGINT-Ctrl-C', true);
    const draining = await start('drain');
    const inFlight = await holdRequest(draining);
    direct(draining);
    await until(() => draining.output().stdout.includes('正在关闭'), 'drain starts');
    await new Promise((resolve, reject) => {
        const socket = net.connect(draining.port, '127.0.0.1');
        socket.once('connect', () => { socket.destroy(); reject(new Error('Still accepting connections')); });
        socket.once('error', error => { if (error.code === 'ECONNREFUSED') resolve(); else reject(error); });
    });
    inFlight.finish();
    assert.equal((await exited(draining)).code, 0);
    await until(() => inFlight.response().includes('"ok":true'), 'in-flight response');
    inFlight.socket.destroy();
    assert.equal(rows(path.join(draining.dbDir, 'weather.db')).feedback, 1);
    log({ case: 'PASS in-flight request drains; new connections refused', trace: checkTrace(draining), ...draining.output() });

    const timed = await start('timeout');
    const hanging = await holdRequest(timed);
    direct(timed);
    await until(() => timed.output().stdout.includes('正在关闭'), 'timeout starts');
    const timeoutStart = performance.now();
    assert.equal((await exited(timed)).code, 0);
    const elapsedMs = Math.round(performance.now() - timeoutStart);
    hanging.socket.destroy();
    assert.ok(elapsedMs >= 4500 && elapsedMs < 6500, `hard timeout took ${elapsedMs}ms`);
    assert.match(timed.output().stderr, /关闭等待已达 5s/);
    log({ case: 'PASS hard timeout proceeds to checkpoint and exit', elapsedMs, after: sizes(timed.dbDir), trace: checkTrace(timed), ...timed.output() });

    const doubled = await start('double-SIGINT', { consoleSignal: true });
    const held = await holdRequest(doubled);
    const sent = await signal(doubled, 2);
    assert.equal((await exited(doubled)).code, 1);
    assert.match(doubled.output().stderr, /再次收到 SIGINT，立即退出/);
    assert.ok(sent.secondExitMs < 1000);
    held.socket.destroy();
    log({ case: 'PASS repeated SIGINT exits within 1s', exitCode: 1, ...sent, ...doubled.output() });

    for (const fault of ['server.close', 'checkpoint', 'db.close']) {
        const test = await start(fault, { fault });
        direct(test);
        assert.equal((await exited(test)).code, 1);
        assert.match(test.output().stderr, /injected/);
        assert.ok(!test.output().stdout.includes('已优雅关闭'));
        if (fault !== 'db.close') assert.ok(test.trace().some(item => item.event === 'db.closed'));
        log({ case: `PASS ${fault} failure logs error and exits 1`, trace: test.trace(), ...test.output() });
    }

    // Run the unchanged npm backup script on fixture data without rotating the user's backups.
    const backupProject = path.join(scratch, 'backup-project');
    fs.mkdirSync(path.join(backupProject, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(project, 'package.json'), path.join(backupProject, 'package.json'));
    fs.copyFileSync(path.join(project, 'scripts', 'backup-db.js'), path.join(backupProject, 'scripts', 'backup-db.js'));
    fs.writeFileSync(path.join(backupProject, '.env'), `DB_DIR=${directTest.dbDir}\n`);
    fs.symlinkSync(path.join(project, 'node_modules'), path.join(backupProject, 'node_modules'), windows ? 'junction' : 'dir');
    const backupOutput = windows
        ? execFileSync('pwsh', ['-NoProfile', '-Command', 'npm run backup:db'], { cwd: backupProject, encoding: 'utf8' })
        : execFileSync('npm', ['run', 'backup:db'], { cwd: backupProject, encoding: 'utf8' });
    const snapshot = fs.readdirSync(path.join(backupProject, 'backups')).find(name => name.endsWith('.db'));
    const snapshotRows = rows(path.join(backupProject, 'backups', snapshot));
    assert.deepEqual(snapshotRows, expectedRows);
    assert.match(backupOutput, /users=1 favorites=3 history=3 feedback=3/);
    log({ case: 'PASS npm run backup:db (unchanged script; isolated project)', snapshotRows, output: backupOutput });
    console.log('SIGTERM 的信号投递为平台行为：Windows 无真实信号（实测处理器不触发）。');
    console.log('本机已验证关闭流程本身；SIGTERM 投递将在 TASK-010b 选定 Linux 部署目标后实测。');
    console.log('PASS TASK-020b Windows acceptance (SIGTERM delivery NOT verified)');
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const socket of sockets) socket.destroy();
    for (const test of services) {
        if (test.exited) continue;
        try { if (test.consoleSignal) await signal(test); else direct(test); await exited(test); }
        catch (error) { console.error(`cleanup ${test.name}: ${error.message}`); }
    }
    fs.writeFileSync(path.join(__dirname, 'shutdown.json'), JSON.stringify({ platform: process.platform, node: process.version, sigtermDelivery: 'not verified; deferred to TASK-010b Linux target', results: report }, null, 2) + '\n');
    console.log(`isolated artifacts: ${scratch}`);
});
