const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const project = path.resolve(__dirname, '../..');
const sourceFile = path.join(process.env.DB_DIR || path.join(project, 'data', 'db'), 'weather.db');
const backupDir = path.join(project, 'backups');
function count(file) {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
        return Object.fromEntries(['users', 'favorites', 'history', 'cache', 'feedback'].map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
    } finally { db.close(); }
}
const before = count(sourceFile);
const existing = new Set(fs.readdirSync(backupDir));
console.log(`source rows before: ${JSON.stringify(before)}`);
const output = process.platform === 'win32'
    ? execFileSync('pwsh', ['-NoProfile', '-Command', 'npm run backup:db'], { cwd: project, encoding: 'utf8' })
    : execFileSync('npm', ['run', 'backup:db'], { cwd: project, encoding: 'utf8' });
process.stdout.write(output);
const created = fs.readdirSync(backupDir).filter(name => /^weather-\d{8}-\d{6}\.db$/.test(name) && !existing.has(name));
assert.equal(created.length, 1);
const snapshotRows = count(path.join(backupDir, created[0]));
assert.deepEqual(snapshotRows, before);
assert.deepEqual(count(sourceFile), before);
console.log(`snapshot rows verified: ${JSON.stringify(snapshotRows)}`);
console.log('PASS backup:db in original repository; all five table counts match source');
