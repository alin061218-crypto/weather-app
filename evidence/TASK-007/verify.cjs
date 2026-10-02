const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const mainPath = path.join(root, 'frontend/js/main.js');
const citiesPath = path.join(root, 'frontend/data/cities.json');
const source = fs.readFileSync(mainPath, 'utf8');
const historical = execFileSync('git', ['show', '32b8f1f:frontend/js/main.js'], { cwd: root, encoding: 'utf8' });
const dbSource = historical.match(/const DB = \[[\s\S]*?\n\];/)[0];
const countySource = historical.match(/const COUNTY = \{[\s\S]*?\n\};/)[0];
const { DB, COUNTY: historicalCounty } = new Function(`${dbSource}\n${countySource}\nreturn { DB, COUNTY }`)();
const oldRows = DB.filter(Boolean);

assert.equal(oldRows.length, 689, 'historical DB row count');
assert.equal(Object.keys(historicalCounty).length, 375, 'historical COUNTY count');
assert.ok(fs.existsSync(citiesPath), 'frontend/data/cities.json must exist');

const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
assert.ok(Array.isArray(cities), 'cities.json must be a JSON array');
assert.ok(cities.length >= 690, `expected at least 690 cities, got ${cities.length}`);
const byName = new Map(cities.map(city => [city.name, city]));
assert.equal(byName.size, cities.length, 'city names must be unique');

for (const [name, admin1, lat, lon] of oldRows) {
  const city = byName.get(name);
  assert.ok(city, `missing historical city ${name}`);
  assert.equal(city.admin1, admin1, `${name} province changed`);
  assert.equal(city.lat, lat, `${name} latitude changed`);
  assert.equal(city.lon, lon, `${name} longitude changed`);
}
for (const [name, parent] of Object.entries(historicalCounty)) {
  const city = byName.get(name);
  assert.ok(city, `missing COUNTY name ${name}`);
  assert.equal(city.parent, parent, `${name} parent changed`);
}
for (const city of cities) {
  assert.equal(typeof city.name, 'string', 'city name type');
  assert.equal(typeof city.admin1, 'string', `${city.name} admin1 type`);
  assert.ok(Number.isFinite(city.lat) && Number.isFinite(city.lon), `${city.name} needs finite coordinates`);
}
assert.equal(byName.get('贵德').coordinateSource, '所属地级市坐标', 'fallback source must be explicit');

const dataStart = source.indexOf('//  本地城市数据库');
const dataEnd = source.indexOf('//  新的建议函数');
assert.ok(dataStart >= 0 && dataEnd > dataStart, 'city code section markers');
const cityCode = source.slice(dataStart, dataEnd);
assert.doesNotMatch(cityCode, /Math\.random\(\)/, 'city coordinates must not use randomness');
assert.doesNotMatch(cityCode, /略|more cities from original|\/\/ \.\.\. more/, 'placeholder comments must be removed');
assert.match(source, /loc\.coordinateSource/, 'weather UI must explain fallback coordinates');

function makeRuntime(fetchMock, globals = {}) {
  return vm.runInNewContext(`(function () { ${cityCode}\nreturn { loadCities, doSearch, countyCount: () => Object.keys(COUNTY).length }; })()`, {
    fetch: fetchMock,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    ...globals,
  });
}

(async () => {
  let fetchCount = 0;
  const runtime = makeRuntime(async url => {
    assert.match(String(url), /\/data\/cities\.json$/);
    fetchCount++;
    return { ok: true, json: async () => cities };
  });
  const [first, second] = await Promise.all([runtime.doSearch('义乌'), runtime.doSearch('义乌')]);
  assert.equal(first[0].name, '义乌');
  assert.equal(first[0].lat, second[0].lat, '义乌 latitude changed between loads');
  assert.equal(first[0].lon, second[0].lon, '义乌 longitude changed between loads');
  assert.equal(first[0].lat, byName.get('义乌').lat);
  assert.equal(first[0].lon, byName.get('义乌').lon);
  assert.equal(fetchCount, 1, 'concurrent and repeated searches should fetch once');
  assert.equal(runtime.countyCount(), 375, 'runtime COUNTY mapping count');

  const fallback = await runtime.doSearch('贵德');
  assert.equal(fallback[0].coordinateSource, '所属地级市坐标');
  assert.equal(fallback[0].parent, '海南藏族自治州');

  let attempts = 0;
  const retryRuntime = makeRuntime(async () => {
    attempts++;
    if (attempts === 1) throw new Error('temporary network failure');
    return { ok: true, json: async () => cities };
  });
  await assert.rejects(retryRuntime.loadCities(), /temporary network failure/);
  await retryRuntime.loadCities();
  assert.equal(attempts, 2, 'failed city load should be retryable');

  let sawAbortSignal = false;
  const hangingRuntime = makeRuntime((_, options = {}) => new Promise((resolve, reject) => {
    sawAbortSignal = !!options.signal;
    options.signal?.addEventListener('abort', () => reject(new Error('city request aborted')));
  }), { setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout: () => {} });
  await assert.rejects(Promise.race([
    hangingRuntime.loadCities(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('city request stayed pending')), 100)),
  ]), /city request aborted/);
  assert.ok(sawAbortSignal, 'city fetch must use an abort signal');

  console.log(`PASS: ${cities.length} cities; 689 historical rows unchanged; 375 COUNTY mappings; 义乌 coordinates stable; one fetch; fallback labeled; retry and timeout work`);
})().catch(error => { console.error(error); process.exitCode = 1; });
