const { assert, start, rainPage, saveJson } = require('./browser.cjs');

async function measure(runtime, version, width, height) {
  const { page, context, errors } = await rainPage(runtime, { version, width, height });
  try {
    return await page.evaluate(({ version }) => {
      const a = window.__task019Atmosphere, T = window.__task021Three, C = a.currentScene.constructor;
      const hero = document.querySelector('.weather-hero').getBoundingClientRect();
      const textRanges = [...document.querySelector('.weather-hero').querySelectorAll('.hero-region, .hero-city, .hero-temp, .hero-desc, .weather-meta p')].map(el => {
        const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect();
      });
      const text = { left: Math.min(...textRanges.map(r => r.left)) - 24, right: Math.max(...textRanges.map(r => r.right)) + 24, top: Math.min(...textRanges.map(r => r.top)) - 24, bottom: Math.max(...textRanges.map(r => r.bottom)) + 24 };
      const report = { version, viewport: [innerWidth, innerHeight], hero: { left: hero.left, right: hero.right, top: hero.top, bottom: hero.bottom }, text, count: 0, center: 0, upperCenter: 0, lowerCenter: 0, textCount: 0, maxCenterRatio: 0, lifecycleCount: 0, lifecycleCenter: 0, lifecycleText: 0 };
      const classify = (s, lifecycle) => {
        const meshes = s.layers ? s.layers.map(l => l.mesh) : [s.instanced];
        let center = 0;
        const matrix = new T.Matrix4();
        for (const mesh of meshes) {
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix);
            const world = new T.Vector3().setFromMatrixPosition(matrix), p = world.clone().project(a.camera);
            const px = (p.x + 1) * innerWidth / 2, py = (1 - p.y) * innerHeight / 2;
            const inCenter = Math.abs(world.x) < 1.2;
            const inText = px >= text.left && px <= text.right && py >= text.top && py <= text.bottom;
            if (lifecycle) { report.lifecycleCount++; report.lifecycleCenter += Number(inCenter); report.lifecycleText += Number(inText); }
            else { report.count++; report.center += Number(inCenter); report.textCount += Number(inText); if (inCenter) { center++; if (world.y > 0) report.upperCenter++; else report.lowerCenter++; } }
          }
        }
        if (!lifecycle) report.maxCenterRatio = Math.max(report.maxCenterRatio, center / s.data.length);
      };
      for (let seed = 1; seed <= 100; seed++) {
        a.currentScene.dispose();
        let state = seed;
        const random = Math.random;
        Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
        try { a.currentScene = new C(a.scene); } finally { Math.random = random; }
        const s = a.currentScene;
        classify(s, false);
        if (version === 'after' && seed <= 20) {
          s.reducedMotion = false;
          for (let frame = 0; frame <= 720; frame++) {
            s.update(.016, frame / 60, null);
            if (frame % 15 === 0) classify(s, true);
          }
        }
      }
      report.centerRatio = report.center / report.count;
      report.textRatio = report.textCount / report.count;
      report.lifecycleCenterRatio = report.lifecycleCenter / report.lifecycleCount;
      report.lifecycleTextRatio = report.lifecycleText / report.lifecycleCount;
      return report;
    }, { version });
  } finally { assert.deepEqual(errors, []); await context.close(); }
}

async function main() {
  const runtime = await start(), reports = [];
  try {
    for (const [width, height] of [[375, 812], [768, 1024], [1280, 900]]) {
      const before = await measure(runtime, 'before', width, height), after = await measure(runtime, 'after', width, height);
      assert.ok(after.centerRatio <= .25); assert.ok(after.maxCenterRatio <= .25);
      assert.ok(after.lifecycleCenterRatio <= .25, 'center mask must survive recycling');
      assert.ok(after.textRatio <= before.textRatio * .5, 'projected text band must be significantly emptier');
      assert.ok(after.lifecycleTextRatio <= before.textRatio * .5, `text band must stay sparse during two complete falls: ${after.lifecycleTextRatio} vs baseline ${before.textRatio}; ${JSON.stringify(after)}`);
      assert.ok(after.upperCenter < after.lowerCenter, 'upper text area must receive stronger rejection');
      reports.push({ before, after });
      const pct = n => (n * 100).toFixed(2) + '%';
      console.log(`PASS ${width}x${height}, 100 seeds: |x|<1.2 ${pct(before.centerRatio)} -> ${pct(after.centerRatio)} (max seed ${pct(after.maxCenterRatio)} <=25%); text ${pct(before.textRatio)} -> ${pct(after.textRatio)}; 12s lifecycle center=${pct(after.lifecycleCenterRatio)}, text=${pct(after.lifecycleTextRatio)}; upper/lower center=${after.upperCenter}/${after.lowerCenter}`);
    }
    saveJson('rain-mask.json', reports);
  } finally { await runtime.close(); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
