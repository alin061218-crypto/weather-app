// Platform fact only: this is NOT a SIGTERM acceptance test of server.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
if (process.argv[2] === '--child') {
    process.on('SIGTERM', () => { fs.writeFileSync(process.argv[3], 'handler ran'); process.exit(0); });
    process.send('ready');
    setInterval(() => {}, 1000);
} else {
    assert.equal(process.platform, 'win32', 'This probe documents native Windows behavior only');
    const scratch = fs.mkdtempSync(path.join(__dirname, 'platform-')) + '.tmp';
    fs.renameSync(scratch.slice(0, -4), scratch);
    const marker = path.join(scratch, 'handler-ran');
    const child = fork(__filename, ['--child', marker], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true });
    const timer = setTimeout(() => { console.error('platform probe timed out'); child.kill(); process.exitCode = 1; }, 5000);
    child.once('message', () => { assert.ok(child.kill('SIGTERM')); });
    child.once('close', (code, signal) => {
        clearTimeout(timer);
        let childAlive = true;
        try { process.kill(child.pid, 0); } catch (error) { if (error.code === 'ESRCH') childAlive = false; else throw error; }
        const handlerRan = fs.existsSync(marker);
        assert.equal(handlerRan, false);
        assert.equal(childAlive, false);
        console.log(JSON.stringify({ platform: process.platform, sent: 'SIGTERM', handlerRan, childAlive, code, signal }));
        console.log('Windows platform fact verified; server SIGTERM delivery NOT verified; deferred to TASK-010b.');
    });
}
