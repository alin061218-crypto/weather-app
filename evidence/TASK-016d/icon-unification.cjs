const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend/js');
const iconsPath = path.join(frontend, 'icons.js');
const asModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

function runCounterexample() {
  const original = fs.readFileSync(iconsPath);
  const source = original.toString('utf8');
  const unifiedFunction = /clearNight\(\)\s*\{\s*return icon\.weather\.clearDay\(\);\s*\}/;
  assert.ok(unifiedFunction.test(source), 'counterexample must start from the unified clearNight()');
  const crescentFunction = `clearNight() {
    return wsvg('<path d="M17.66 6.34A8 8 0 1 0 17.66 17.66L18.95 14.95A7 7 0 1 1 18.95 5.05z"/><path d="M15.5 2.6l.45 1.2 1.2.45-1.2.45-.45 1.2-.45-1.2-1.2-.45 1.2-.45z" fill="currentColor" stroke="none"/>');
  }`;
  let result;
  try {
    fs.writeFileSync(iconsPath, source.replace(unifiedFunction, crescentFunction));
    console.log('COUNTEREXAMPLE: temporarily restored a crescent in frontend/js/icons.js');
    result = spawnSync(process.execPath, [__filename], {
      encoding: 'utf8', timeout: 10000, windowsHide: true
    });
  } finally {
    fs.writeFileSync(iconsPath, original);
    assert.deepEqual(fs.readFileSync(iconsPath), original, 'icons.js must be restored byte-for-byte');
    console.log('RESTORED: frontend/js/icons.js matches the original bytes');
  }
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.notEqual(result.status, null, 'counterexample child must exit normally');
  console.log(`COUNTEREXAMPLE_EXIT=${result.status}`);
  // Propagate the actual guard result: if it stops detecting the crescent, this
  // command exits 0, so the recorded expectation of exit 1 will no longer hold.
  process.exitCode = result.status;
}

async function main() {
  if (process.argv.includes('--counterexample')) return runCounterexample();

  const { icon } = await import(asModule(fs.readFileSync(iconsPath, 'utf8')));
  const visuals = fs.readFileSync(path.join(frontend, 'visuals.js'), 'utf8');
  const configImport = "import { F } from 'app/config';";
  assert.ok(visuals.startsWith(configImport), 'visuals.js browser import must be recognized');
  // weatherScene does not use F or the DOM. Omit only the browser import and
  // execute the real exported module; its scene implementation is not copied.
  const { weatherScene } = await import(asModule(visuals.slice(configImport.length)));
  assert.equal(weatherScene(0, false), 'clear-night', 'nighttime clear weather must retain its scene');
  console.log("PASS: weatherScene(0, false) === 'clear-night'");
  assert.equal(icon.weather.clearNight(), icon.weather.clearDay(),
    'clearNight() must return exactly the same SVG as clearDay()');
  console.log('PASS: icon.weather.clearNight() === icon.weather.clearDay()');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
