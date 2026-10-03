const { assert, fs, path, output, sharp, baseline, start, rainPage, saveJson } = require('./browser.cjs');

async function capture(runtime, version, theme = 'dark', width = 1280, height = 900) {
  const { page, context, errors, sourceHash, viewport } = await rainPage(runtime, { version, theme, width, height });
  const stem = theme === 'dark' && width === 1280 ? `rain-${version}` : `rain-${version}-${theme}-${width}`;
  try {
    await page.screenshot({ path: path.join(output, `${stem}.png`) });
    const policy = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      opacity: Number(getComputedStyle(document.querySelector('#atmosphere')).opacity)
    }));
    const foregroundStyle = await page.addStyleTag({ content: 'html, body { background: transparent !important; transition: none !important; } #atmosphere { visibility: hidden !important; }' });
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('#atmosphere')).visibility === 'hidden');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const foreground = await page.screenshot({ omitBackground: true });
    const foregroundStats = await sharp(foreground).stats();
    assert.equal(foregroundStats.channels[3]?.min, 0, 'DOM foreground must have transparent pixels');
    await foregroundStyle.evaluate(el => el.remove());
    // Copy immediately after each real renderer call, before WebGL discards its buffer.
    const recording = await page.evaluate(() => new Promise(resolve => {
      const a = window.__task019Atmosphere, s = a.currentScene;
      s.reducedMotion = false;
      const render = a.renderer.render;
      const frames = [], samples = [];
      let start, nextSample = 0, renderedFrames = 0;
      a.renderer.render = function (...args) {
        render.apply(this, args);
        const now = performance.now();
        if (start === undefined) start = now;
        renderedFrames++;
        if (now - start < nextSample) return;
        nextSample = (Math.floor((now - start) / (1000 / 60)) + 1) * (1000 / 60);
        const matrix = new window.__task021Three.Matrix4();
        const meshes = s.layers ? s.layers.map(l => l.mesh) : [s.instanced];
        const positions = [];
        for (const mesh of meshes) {
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix);
            const world = new window.__task021Three.Vector3().setFromMatrixPosition(matrix);
            const p = world.clone().project(a.camera);
            positions.push({ x: world.x, y: world.y, z: world.z, px: (p.x + 1) * innerWidth / 2, py: (1 - p.y) * innerHeight / 2 });
          }
        }
        frames.push(a.renderer.domElement.toDataURL('image/png').split(',')[1]);
        samples.push({ ms: now - start, positions });
        if (now - start >= 2000) {
          a.reducedMotion = true;
          a.renderer.render = render;
          resolve({ frames, samples, renderedFrames });
        }
      };
      a.reducedMotion = false;
    }));
    assert.deepEqual(errors, [], 'browser runtime errors');
    assert.ok(recording.samples.at(-1).ms >= 2000, 'continuous capture must last at least two seconds');
    assert.ok(recording.frames.length >= 100, `expected about 120 frames, got ${recording.frames.length}`);
    const frameDir = path.join(output, `${stem}-frames`);
    fs.mkdirSync(frameDir, { recursive: true });
    for (const file of fs.readdirSync(frameDir)) {
      if (/^\d+\.png$/.test(file) && Number(file.slice(0, -4)) >= recording.frames.length) fs.unlinkSync(path.join(frameDir, file));
    }
    const raws = [];
    const visibleLayerSamples = { near: 0, middle: 0, far: 0 };
    if (version === 'after') {
      for (const frame of recording.samples) {
        frame.positions.forEach((p, i) => {
          if (p.px > 0 && p.px < width && p.py > 0 && p.py < height) visibleLayerSamples[i < 16 ? 'near' : i < 45 ? 'middle' : 'far']++;
        });
      }
      assert.ok(Object.values(visibleLayerSamples).every(n => n > 0), `every depth layer must be visible: ${JSON.stringify(visibleLayerSamples)}`);
    }
    let nonblank = 0;
    for (let i = 0; i < recording.frames.length; i++) {
      const { data, info } = await sharp(Buffer.from(recording.frames[i], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let pixels = 0;
      for (let j = 3; j < data.length; j += 4) {
        if (data[j] > 0) pixels++;
        data[j] = Math.round(data[j] * policy.opacity);
      }
      if (pixels > 50) nonblank++;
      const image = sharp({ create: { width, height, channels: 4, background: policy.background } }).composite([
        { input: data, raw: { width: info.width, height: info.height, channels: 4 } },
        { input: foreground }
      ]);
      const png = await image.png().toBuffer();
      fs.writeFileSync(path.join(frameDir, `${String(i).padStart(3, '0')}.png`), png);
      const gifWidth = Math.min(960, width);
      raws.push(await sharp(png).resize(gifWidth, Math.round(height * gifWidth / width)).removeAlpha().raw().toBuffer());
    }
    assert.equal(nonblank, recording.frames.length, 'every captured WebGL frame must be nonblank');
    const gifWidth = Math.min(960, width), gifHeight = Math.round(height * gifWidth / width);
    // Quantize cumulative time, so GIF's 10 ms units do not slow a 60 Hz clip.
    const delay = recording.samples.map((s, i) => i === recording.samples.length - 1 ? 20 : Math.round(recording.samples[i + 1].ms / 10) * 10 - Math.round(s.ms / 10) * 10);
    await sharp(Buffer.concat(raws), { raw: { width: gifWidth, height: gifHeight * raws.length, channels: 3, pageHeight: gifHeight } })
      .gif({ delay, loop: 0, effort: 3, colours: 128, dither: 0 }).toFile(path.join(output, `${stem}.gif`));
    const gif = await sharp(path.join(output, `${stem}.gif`), { animated: true }).metadata();
    assert.equal(gif.pages, recording.frames.length, 'GIF must retain every frame');
    const indices = [0, 1, 2, 3, Math.round(raws.length / 3), Math.round(raws.length * 2 / 3), raws.length - 2, raws.length - 1];
    const thumbs = [];
    for (let i = 0; i < indices.length; i++) {
      const input = await sharp(path.join(frameDir, `${String(indices[i]).padStart(3, '0')}.png`)).resize(480, Math.round(height * 480 / width)).png().toBuffer();
      thumbs.push({ input, left: i % 4 * 480, top: Math.floor(i / 4) * Math.round(height * 480 / width) });
    }
    await sharp({ create: { width: 1920, height: Math.round(height * 480 / width) * 2, channels: 3, background: policy.background } }).composite(thumbs).png().toFile(path.join(output, `${stem}-sequence.png`));
    const report = { version, baseline: version === 'before' ? baseline.commit : undefined, sourceHash, viewport, policy, frames: recording.frames.length, renderedFrames: recording.renderedFrames, capture: 'Real RAF rendering, sampled at 60 Hz; full-page PNG = native WebGL + static transparent DOM screenshot + computed body background.', durationMs: recording.samples.at(-1).ms, gifDurationMs: gif.delay.reduce((a, b) => a + b, 0), nonblank, visibleLayerSamples: version === 'after' ? visibleLayerSamples : undefined, sequenceIndices: indices, samples: recording.samples };
    saveJson(`${stem}-trajectory.json`, report);
    console.log(`PASS ${stem}: ${report.frames} consecutive 60 Hz samples / ${report.durationMs.toFixed(1)} ms (${report.renderedFrames} real RAF renders); nonblank=${nonblank}; GIF pages=${gif.pages}`);
    return report;
  } finally { await context.close(); }
}

async function main() {
  const runtime = await start();
  try {
    const versions = process.argv.includes('--before') ? ['before'] : ['before', 'after'];
    for (const version of versions) await capture(runtime, version);
    if (!process.argv.includes('--before')) {
      await capture(runtime, 'after', 'light');
      await capture(runtime, 'after', 'dark', 375, 812);
      await capture(runtime, 'after', 'light', 375, 812);
    }
  } finally { await runtime.close(); }
}

if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { capture };
