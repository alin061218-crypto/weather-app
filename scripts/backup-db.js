const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.resolve(__dirname, '..');
const dbDir = path.resolve(process.env.DB_DIR || path.join(projectRoot, 'data', 'db'));
const dbFile = path.join(dbDir, 'weather.db');
const backupDir = path.join(projectRoot, 'backups');
const filePattern = /^weather-\d{8}-\d{6}\.db$/;

function timestamp(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function nextSnapshotPath() {
    let date = new Date();
    let name = `weather-${timestamp(date)}.db`;
    while (fs.existsSync(path.join(backupDir, name))) {
        date = new Date(date.getTime() + 1000);
        name = `weather-${timestamp(date)}.db`;
    }
    return path.join(backupDir, name);
}

function countRows(db, table) {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(dbFile)) throw new Error(`数据库不存在：${dbFile}`);

const snapshot = nextSnapshotPath();
const source = new Database(dbFile);
try {
    const escaped = snapshot.replaceAll("'", "''");
    source.exec(`VACUUM INTO '${escaped}'`);
} finally {
    source.close();
}

const snapshotDb = new Database(snapshot, { readonly: true });
const counts = Object.fromEntries(['users', 'favorites', 'history', 'feedback'].map(table => [table, countRows(snapshotDb, table)]));
snapshotDb.close();

const files = fs.readdirSync(backupDir).filter(name => filePattern.test(name)).sort().reverse();
const removed = files.slice(10);
for (const name of removed) fs.unlinkSync(path.join(backupDir, name));

console.log(`PASS backup snapshot: ${snapshot}`);
console.log(`size=${fs.statSync(snapshot).size} B`);
console.log(`users=${counts.users} favorites=${counts.favorites} history=${counts.history} feedback=${counts.feedback}`);
console.log(`retention kept=${Math.min(files.length, 10)} removed=${removed.length}`);
