const { performance } = require('node:perf_hooks');

const base = process.env.WEATHER_URL || 'http://localhost:3001';
async function timed(path, options) {
  const start = performance.now();
  const response = await fetch(base + path, options);
  const body = await response.arrayBuffer();
  return { status: response.status, ms: +(performance.now() - start).toFixed(1), bytes: body.byteLength };
}

(async () => {
  const location = [await timed('/api/location'), await timed('/api/location')];
  if (location[1].status === 200 && location[1].ms >= 50) {
    throw new Error(`location cache miss or slow hit: ${JSON.stringify(location)}`);
  }
  const weather = await timed('/api/weather?lat=39.904&lon=116.407');
  const page = await timed('/index.html');
  const result = { locationFirst: location[0], locationSecond: location[1], weather, index: page, cold: process.argv.includes('--cold') };
  console.log(JSON.stringify(result, null, 2));
  console.log(`PASS: /api/location second request ${location[1].ms}ms (<50ms cache hit)`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
