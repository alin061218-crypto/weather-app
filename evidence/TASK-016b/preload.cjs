// Adapt historical evidence in memory; production files and old evidence stay unchanged.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const original = Module._extensions['.cjs'] || Module._extensions['.js'];
const output = process.env.TASK016B_OUTPUT_DIR;
Module._extensions['.cjs'] = (module, filename) => {
  const task016c = /[\\/]TASK-016c[\\/](fingerprint|screenshots)\.cjs$/.test(filename);
  const keyboard = /[\\/]TASK-015e[\\/]keyboard\.cjs$/.test(filename);
  const task018b = /[\\/]TASK-018b[\\/](race|latency)\.cjs$/.test(filename);
  if (!task016c && !keyboard && !task018b) return original(module, filename);
  let source = fs.readFileSync(filename, 'utf8');
  if (task016c) {
    source = source.replaceAll('js/main.js?v=13', '/js/main.js');
    source = source.replaceAll("metrics.requests[mode === 'backend' ? 'fallback' : 'backend'], 1", "metrics.requests[mode === 'backend' ? 'fallback' : 'backend'], mode === 'backend' ? 0 : 1");
    if (output) source = source.replace('const outputDir = path.resolve(__dirname);', `const outputDir = ${JSON.stringify(path.resolve(output))};`);
    source = source.replace("const image = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });", `
    await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const layout = await cdp.command('Page.getLayoutMetrics');
    const content = layout.cssContentSize;
    const navBottom = await cdp.evaluate("document.querySelector('.tab-bar').getBoundingClientRect().bottom + scrollY");
    const image = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: content.width, height: Math.ceil(Math.max(content.height, navBottom)), scale: 1 } });`);
  }
  if (task018b) {
    // Page.navigate returns before parsing/bootstrap; do not mistake unstyled HTML
    // for a rendered weather view. latency.cjs still measures from its original start.
    source = source.replace('const result = await cdp.evaluate(', `
    let bootstrapReady = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      bootstrapReady = await cdp.evaluate("Boolean(window.__evidence) && document.readyState !== 'loading'");
      if (bootstrapReady) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(bootstrapReady, 'mock bootstrap did not become ready');
    const result = await cdp.evaluate(`);
  }
  if (keyboard && output) {
    const helper = require(path.join(path.dirname(filename), 'browser.cjs'));
    helper.output = path.resolve(output);
  }
  module._compile(source, filename);
};
