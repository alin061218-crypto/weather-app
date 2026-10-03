const { assert, fs, path, output, sourceFor, saveJson } = require('./browser.cjs');
const { createHash } = require('node:crypto');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function measure(filename) {
  const clip = JSON.parse(fs.readFileSync(path.join(output, filename), 'utf8'));
  const speeds = [], tracks = [];
  let depthJump = 0, maxDepthJump = 0, comparisons = 0;
  for (let drop = 0; drop < clip.samples[0].positions.length; drop++) {
    let segment = [], best = [];
    for (let frame = 0; frame < clip.samples.length; frame++) {
      const sample = clip.samples[frame], p = sample.positions[drop];
      if (frame) {
        const prev = clip.samples[frame - 1].positions[drop], dz = Math.abs(prev.z - p.z);
        maxDepthJump = Math.max(maxDepthJump, dz); depthJump += dz; comparisons++;
      }
      const visible = p.px > 24 && p.px < clip.viewport.width - 24 && p.py > 24 && p.py < clip.viewport.height - 24;
      const continuous = !segment.length || p.y <= segment.at(-1).p.y;
      if (!visible || !continuous) {
        if (segment.length > best.length) best = segment;
        segment = [];
      }
      if (visible) segment.push({ ms: sample.ms, p, frame });
    }
    if (segment.length > best.length) best = segment;
    if (best.length < 2) continue;
    const first = best[0], last = best.at(-1), seconds = (last.ms - first.ms) / 1000;
    if (seconds < .5) continue;
    const speed = (last.p.py - first.p.py) / seconds;
    if (speed <= 0) continue;
    speeds.push(speed);
    tracks.push({ drop, layer: clip.version === 'before' ? 'unlayered' : drop < 16 ? 'near' : drop < 45 ? 'middle' : 'far', startFrame: first.frame, endFrame: last.frame, startMs: first.ms, endMs: last.ms, startPxY: first.p.py, endPxY: last.p.py, deltaPx: last.p.py - first.p.py, seconds, pxPerSecond: speed });
  }
  const perLayer = ['near', 'middle', 'far'].map(layer => {
    const values = tracks.filter(t => t.layer === layer).map(t => t.pxPerSecond);
    return { layer, count: values.length, min: values.length ? Math.min(...values) : null, median: values.length ? median(values) : null, max: values.length ? Math.max(...values) : null };
  });
  return { filename, version: clip.version, sourceHash: clip.sourceHash, durationMs: clip.durationMs, capturedFrames: clip.frames, renderedFrames: clip.renderedFrames, viewport: clip.viewport, trackCount: tracks.length, medianPxPerSecond: speeds.length ? median(speeds) : null, meanDepthJump: depthJump / comparisons, maxDepthJump, perLayer, tracks };
}

const before = measure('rain-before-trajectory.json'), after = measure('rain-after-trajectory.json');
assert.equal(after.sourceHash, createHash('sha256').update(sourceFor('after')).digest('hex'), 'clip must match the current source');
assert.ok(after.trackCount >= 3, 'must measure multiple visible trajectories');
assert.ok(after.medianPxPerSecond >= 250 && after.medianPxPerSecond <= 450, `visible median ${after.medianPxPerSecond} px/s`);
assert.ok(before.meanDepthJump > .5, 'baseline clip must reproduce depth flicker');
assert.equal(after.maxDepthJump, 0, 'every recorded drop must keep its depth');
const middle = after.tracks.filter(t => t.layer === 'middle' && t.pxPerSecond >= 250 && t.pxPerSecond <= 450).sort((a, b) => b.seconds - a.seconds)[0];
assert.ok(middle, 'a visible middle-layer rain segment must meet the pixel-speed target');
saveJson('speed.json', { method: 'Actual Three.js instance positions projected by the active browser camera after each native RAF render. Displacement divided by performance.now() elapsed seconds. Wrapped/offscreen segments excluded.', before, after, measuredSegment: middle });
console.log(`PASS depth jitter: mean delta-z/frame ${before.meanDepthJump.toFixed(3)} -> ${after.meanDepthJump.toFixed(3)}; after max=${after.maxDepthJump}`);
console.log(`PASS visible rain median=${after.medianPxPerSecond.toFixed(1)} px/s, n=${after.trackCount}, target=250-450 px/s`);
console.log(`PASS measured drop #${middle.drop}: frame ${middle.startFrame}->${middle.endFrame}, y=${middle.startPxY.toFixed(1)}->${middle.endPxY.toFixed(1)} px; ${middle.deltaPx.toFixed(1)} px / ${middle.seconds.toFixed(3)} s = ${middle.pxPerSecond.toFixed(1)} px/s`);
console.log('INFO perspective layer speeds:', JSON.stringify(after.perLayer));
