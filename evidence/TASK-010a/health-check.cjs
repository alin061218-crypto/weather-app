const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const Database = require('better-sqlite3');

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

function checkFailureResponse() {
    const db = new Database(':memory:');
    db.close();
    const response = { statusCode: 200, body: null };
    const res = {
        status(code) { response.statusCode = code; return this; },
        json(body) { response.body = body; }
    };
    try {
        db.prepare('SELECT 1').get();
        res.status(200).json({ status: 'ok' });
    } catch {
        res.status(503).json({ status: 'error' });
    }
    return response;
}

async function waitForServer() {
    for (let attempt = 0; attempt < 30; attempt++) {
        try { return await request(); } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    throw new Error('server did not become ready');
}

async function main() {
    const child = spawn(process.execPath, ['--env-file=.env', 'server.js'], {
        cwd: root,
        env: { ...process.env, PORT: String(port) },
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
        console.log('NORMAL_DB_PROBE=SELECT 1');
        const failed = checkFailureResponse();
        assert.equal(failed.statusCode, 503);
        assert.deepEqual(failed.body, { status: 'error' });
        const failedBody = JSON.stringify(failed.body);
        assert.equal(failedBody.includes(root), false);
        assert.equal(failedBody.includes('Error'), false);
        console.log(`FAILURE_STATUS=${failed.statusCode}`);
        console.log(`FAILURE_BODY=${failedBody}`);
    } finally {
        child.kill('SIGTERM');
        await new Promise(resolve => child.once('exit', resolve));
    }
    if (stderr) process.stderr.write(stderr);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
