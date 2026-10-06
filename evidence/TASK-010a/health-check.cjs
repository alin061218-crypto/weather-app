const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const port = 3310;

function request() {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.setTimeout(2000, () => req.destroy(new Error('request timeout')));
    });
}

async function waitForServer() {
    for (let attempt = 0; attempt < 30; attempt++) {
        try { return await request(); } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    throw new Error('server did not become ready');
}

async function main() {
    const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task010c-health-db-'));
    const dbPath = path.join(dbDir, 'weather.db');
    const child = spawn(process.execPath, ['--env-file=.env', 'server.js'], {
        cwd: root,
        env: { ...process.env, PORT: String(port), DB_DIR: dbDir },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    try {
        const healthy = await waitForServer();
        assert.equal(healthy.status, 200);
        assert.deepEqual(JSON.parse(healthy.body), { status: 'ok' });
        console.log(`NORMAL_STATUS=${healthy.status}`);
        console.log(`NORMAL_BODY=${healthy.body}`);
        console.log('NORMAL_DB_PROBE=SELECT count(*) FROM cache + sqlite_master schema count');

        // Windows rejects fs.unlinkSync(dbPath) with EBUSY while the server holds the database open.
        // Keep the corruption injection reproducible by truncating the database to zero bytes.
        fs.truncateSync(dbPath, 0);
        const failed = await request();
        assert.equal(failed.status, 503);
        assert.deepEqual(JSON.parse(failed.body), { status: 'error' });
        assert.equal(failed.body.includes(root), false);
        assert.equal(failed.body.includes('Error'), false);
        assert.equal(failed.body.includes('at '), false);
        assert.equal(failed.body.includes('cache'), false);
        console.log(`TRUNCATED_STATUS=${failed.status}`);
        console.log(`TRUNCATED_BODY=${failed.body}`);
    } finally {
        child.kill('SIGTERM');
        await new Promise(resolve => child.once('exit', resolve));
    }
    if (stderr) process.stderr.write(stderr);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
