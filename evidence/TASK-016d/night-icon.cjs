const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend/js');
const iconsPath = path.join(frontend, 'icons.js');
const asModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

function counterexample() {
  const original = fs.readFileSync(iconsPath);
  const source = original.toString('utf8');
  const nightFunction = /clearNight\(\)\s*\{[\s\S]*?\n  \}/;
  assert.ok(nightFunction.test(source), 'clearNight must be present for the counterexample');
  let result;
  try {
    fs.writeFileSync(iconsPath, source.replace(nightFunction,
      'clearNight() { return icon.weather.clearDay(); }'));
    console.log('COUNTEREXAMPLE: temporarily reverted clearNight to the 2026-10-06 sun');
    result = spawnSync(process.execPath, [__filename], {
      encoding: 'utf8', timeout: 10000, windowsHide: true
    });
  } finally {
    fs.writeFileSync(iconsPath, original);
    assert.deepEqual(fs.readFileSync(iconsPath), original, 'icons.js must be restored byte-for-byte');
    console.log('RESTORED: icons.js matches its original bytes');
  }
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.notEqual(result.status, null, 'counterexample child must exit normally');
  console.log(`COUNTEREXAMPLE_EXIT=${result.status}`);
  process.exitCode = result.status;
}

async function main() {
  if (process.argv.includes('--counterexample')) return counterexample();
  const { icon, weatherIcon } = await import(asModule(fs.readFileSync(iconsPath, 'utf8')));
  const night = icon.weather.clearNight();
  assert.notEqual(night, icon.weather.clearDay(),
    'clearNight() must use the reference moon and stars, not fall back to the daytime sun');
  assert.match(night, /<g fill="currentColor" stroke="none">/, 'moon and stars must have solid fill and no outline');
  assert.equal([...night.matchAll(/<path\b/g)].length, 3, 'night icon must have one moon and two stars');
  assert.doesNotMatch(night, /\bopacity=|<circle\b|<image\b/, 'use opaque vector shapes, without dots or raster images');
  assert.equal(weatherIcon(0, false), night, 'clear nighttime weather must use the moon icon');
  assert.equal(weatherIcon(1, false), night, 'existing nighttime code 1 mapping must remain');
  assert.equal(weatherIcon(0, true), icon.weather.clearDay(), 'daytime clear weather must still use the sun');
  const visuals = fs.readFileSync(path.join(frontend, 'visuals.js'), 'utf8');
  const configImport = "import { F } from 'app/config';";
  assert.ok(visuals.startsWith(configImport), 'visuals.js browser import must be recognized');
  // Execute the actual module, omitting only its unused browser config import.
  const { weatherScene } = await import(asModule(visuals.slice(configImport.length)));
  assert.equal(weatherScene(0, false), 'clear-night', 'nighttime scene must remain clear-night');
  console.log('PASS: nighttime uses a solid moon and two stars; daytime retains the sun');
  console.log("PASS: weatherScene(0, false) === 'clear-night'");
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
