// Run the real server with a disposable SQLite database and generated test credentials.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const root = path.resolve(__dirname, '../..');

async function freePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weather-task017-'));
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  const username = 'task017_admin', password = crypto.randomBytes(20).toString('hex');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DB_DIR: dir,
      JWT_SECRET: crypto.randomBytes(32).toString('hex'), ADMIN_USER: username,
      ADMIN_PASSWORD_HASH: bcrypt.hashSync(password, 4) }
  });
  let logs = '', db;
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const closed = once(child, 'exit');
  async function close() {
    if (db?.open) db.close();
    if (child.exitCode === null) child.kill();
    await closed;
    // Only delete the exact disposable directory produced above.
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('weather-task017-'));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Test server exited: ${logs}`);
      try { ready = (await fetch(url + '/admin/api/stats')).status === 401; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Server readiness timeout: ${logs}`);
    db = new Database(path.join(dir, 'weather.db'));
    db.pragma('foreign_keys = ON');
    const login = await fetch(url + '/api/admin-login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    async function api(endpoint, method = 'GET', body) {
      const response = await fetch(url + endpoint, { method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body) });
      assert.ok(response.ok, `${method} ${endpoint}: ${response.status}`);
      return response.json();
    }
    return { url, username, password, token, db, api, close };
  } catch (error) { await close(); throw error; }
}

function clear(db) {
  db.exec('DELETE FROM history; DELETE FROM favorites; DELETE FROM users; DELETE FROM cache;');
}
function seed(db) {
  clear(db);
  const users = [], favorites = [], history = [], cache = [];
  const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '苏州', '重庆', '长沙'];
  const provinces = ['北京', '上海', '广东', '浙江', '四川', '湖北', '江苏', '陕西', '重庆', '湖南', '山东', '福建', '云南', '安徽'];
  const weighted = cities.flatMap((city, i) => Array(Math.max(1, 12 - i)).fill(city));
  for (let i = 0; i < 70; i++) users.push({ id: `fixture-user-${String(i).padStart(6, '0')}`,
    username: `验收用户_${i}`, createdAt: new Date(Date.UTC(2026, 9, 3, 0, i)).toISOString() });
  for (let i = 0; i < 85; i++) favorites.push({ id: `fixture-fav-${String(i).padStart(6, '0')}`,
    userId: users[i % users.length].id, name: cities[i % cities.length],
    admin1: i % 17 === 0 ? '' : provinces[i % provinces.length], country: '中国',
    lat: 30 + i / 100, lon: 110 + i / 100, createdAt: new Date(Date.UTC(2026, 9, 3, 1, i)).toISOString() });
  for (let day = 0; day < 28; day++) {
    for (let hour = 0; hour < 5 + day % 7 * 3; hour++) {
      const i = history.length;
      history.push({ id: `fixture-hist-${String(i).padStart(6, '0')}`, userId: users[i % users.length].id,
        city: weighted[i * 11 % weighted.length], lat: 30, lon: 110, weather: '晴 · 22°C',
        time: new Date(Date.UTC(2026, 8, 6 + day, hour)).toISOString() });
    }
  }
  for (let i = 0; i < 7; i++) cache.push({ key: `fixture:${i}`, data: '{}', time: Date.now() });
  const insertUsers = db.prepare('INSERT INTO users VALUES (@id, @username, ?, @createdAt)');
  const insertFavorites = db.prepare('INSERT INTO favorites VALUES (@id, @userId, @name, @admin1, @country, @lat, @lon, @createdAt)');
  const insertHistory = db.prepare('INSERT INTO history VALUES (@id, @userId, @city, @lat, @lon, @weather, @time)');
  const insertCache = db.prepare('INSERT INTO cache VALUES (@key, @data, @time)');
  db.transaction(() => {
    users.forEach(user => insertUsers.run(user, 'not-a-real-password'));
    favorites.forEach(favorite => insertFavorites.run(favorite));
    history.forEach(item => insertHistory.run(item));
    cache.forEach(item => insertCache.run(item));
  })();
  return { users, favorites, history, cache };
}

module.exports = { assert, fs, path, root, start, seed, clear };
