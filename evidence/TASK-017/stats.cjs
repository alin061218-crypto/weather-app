const { assert, fs, path, root, start, seed } = require('./runtime.cjs');

async function main() {
  const runtime = await start();
  try {
    const { db, api, url } = runtime;
    const fixture = seed(db);
    for (const endpoint of ['/admin/api/stats', '/admin/api/overview']) {
      assert.equal((await fetch(url + endpoint)).status, 401);
      assert.equal((await fetch(url + endpoint, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    }
    console.log('PASS: stats / overview reject unauthenticated and invalid-token requests (401)');
    const expectedIndexes = {
      idx_history_city: ['history', 'city'], idx_history_time: ['history', 'time'],
      idx_history_user: ['history', 'userId'], idx_favorites_user: ['favorites', 'userId'],
      idx_favorites_admin1: ['favorites', 'admin1']
    };
    for (const [name, [table, column]] of Object.entries(expectedIndexes)) {
      assert.ok(db.pragma(`index_list(${table})`).some(index => index.name === name));
      assert.deepEqual(db.pragma(`index_info(${name})`).map(index => index.name), [column]);
    }
    console.log('PASS: SQLite contains all 5 required indexes, with the correct indexed columns');
    const stats = await api('/admin/api/stats'), overview = await api('/admin/api/overview');
    const counts = Object.fromEntries(Object.entries(fixture).map(([key, rows]) => [key, rows.length]));
    assert.deepEqual(stats.counts, counts);
    assert.deepEqual([overview.users.length, overview.favorites.length, overview.history.length], [50, 50, 100]);
    assert.ok(overview.users.every(user => !Object.hasOwn(user, 'password')));
    assert.equal(overview.cacheCount, counts.cache);
    assert.equal(overview.history[0].id, fixture.history.at(-1).id);
    console.log(`PASS: real COUNT(*) totals = ${JSON.stringify(counts)}; overview row counts = 50 / 50 / 100; no password column`);
    function grouped(rows, key) {
      const map = new Map();
      rows.forEach(row => { const value = key(row); map.set(value, (map.get(value) || 0) + 1); });
      return map;
    }
    const cityCounts = grouped(fixture.history, row => row.city);
    const provinceCounts = grouped(fixture.favorites.filter(row => row.admin1 !== ''), row => row.admin1);
    for (const [rows, source, field, max] of [
      [stats.byCity, cityCounts, 'city', 10], [stats.byProvince, provinceCounts, 'admin1', 10]
    ]) {
      assert.equal(rows.length, max);
      const expectedCounts = [...source.values()].sort((a, b) => b - a).slice(0, max);
      assert.deepEqual(rows.map(row => row.n), expectedCounts);
      rows.forEach(row => assert.equal(row.n, source.get(row[field])));
    }
    const dayCounts = grouped(fixture.history, row => row.time.slice(0, 10));
    assert.deepEqual(stats.byDay, [...dayCounts.keys()].sort().reverse().slice(0, 14).map(d => ({ d, n: dayCounts.get(d) })));
    console.log(`PASS: byCity=${stats.byCity.length}, byDay=${stats.byDay.length} (DESC), byProvince=${stats.byProvince.length}; all aggregates match fixtures`);
    const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const staticCounts = {
      oldHistorySlice: (source.match(/slice\(-30\)/g) || []).length,
      limitedQueries: (source.match(/(?:userAll|favAll|histAll):[^\n]*LIMIT/g) || []).length,
      indexes: (source.match(/CREATE INDEX IF NOT EXISTS/g) || []).length,
      statsReferences: (source.match(/\/admin\/api\/stats/g) || []).length,
      oldColors: (source.match(/#e8b86d|#1a1a2e/gi) || []).length,
      innerHTML: (source.match(/innerHTML/g) || []).length
    };
    assert.deepEqual(staticCounts, { oldHistorySlice: 0, limitedQueries: 3, indexes: 5, statsReferences: 2, oldColors: 0, innerHTML: 0 });
    assert.ok(source.includes('所有数据库值由客户端以 textContent 渲染'));
    assert.ok(source.includes('值镜像自 frontend/css/style.css 的 :root，改动请同步'));
    assert.match(fs.readFileSync(path.join(root, 'frontend/css/style.css'), 'utf8'), /--primary:\s*#5b9cf5/);
    console.log(`PASS: source acceptance counts = ${JSON.stringify(staticCounts)}; XSS comment retained; primary matches style.css`);
    await api('/admin/logout', 'POST');
    assert.equal((await fetch(url + '/admin/api/stats', { headers: { Authorization: `Bearer ${runtime.token}` } })).status, 401);
    console.log('PASS: logout invalidates the administrator token');
  } finally { await runtime.close(); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
