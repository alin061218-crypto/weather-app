const assert = require('node:assert/strict');

const base = process.env.WEATHER_URL || 'http://localhost:3001';
async function read(path) {
  const response = await fetch(base + path, { headers: { 'accept-encoding': 'gzip' } });
  return { response, body: Buffer.from(await response.arrayBuffer()) };
}

(async () => {
  const html = await read('/index.html');
  const cities = await read('/data/cities.json');
  const page = String(html.body);
  const jsPath = page.match(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']*main\.js[^"']*)["']/i)?.[1];
  const cssPath = page.match(/<link\b[^>]*href=["']([^"']*style\.css[^"']*)["']/i)?.[1];
  assert.ok(jsPath && cssPath, 'index.html must expose JS/CSS URLs');
  const js = await read(jsPath);
  const css = await read(cssPath);
  const three = await read('/vendor/three.module.js');
  const cache = value => value || '';
  assert.equal(html.response.status, 200);
  assert.match(cache(html.response.headers.get('cache-control')), /no-cache/);
  assert.match(cache(cities.response.headers.get('cache-control')), /max-age=86400/);
  assert.match(cache(js.response.headers.get('cache-control')), /immutable/);
  assert.match(cache(css.response.headers.get('cache-control')), /immutable/);
  assert.equal(three.response.status, 200);
  assert.equal(three.response.headers.get('content-encoding'), 'gzip');
  assert.match(cache(three.response.headers.get('cache-control')), /(?:max-age=31536000|immutable)/);
  const compressedBytes = Number(three.response.headers.get('content-length') || three.body.length);
  assert.ok(compressedBytes < 400000, `gzip payload too large: ${compressedBytes}`);
  console.log(JSON.stringify({
    index: { cacheControl: html.response.headers.get('cache-control') },
    cities: { cacheControl: cities.response.headers.get('cache-control') },
    js: { cacheControl: js.response.headers.get('cache-control') },
    css: { cacheControl: css.response.headers.get('cache-control') },
    three: { encoding: three.response.headers.get('content-encoding'), compressedBytes, cacheControl: three.response.headers.get('cache-control') }
  }, null, 2));
  console.log('PASS: TASK-018 static cache headers and gzip verified');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
