const { assert, sourceFor, start, rainPage, saveJson } = require('./browser.cjs');

async function main() {
  const source = sourceFor('after'), before = sourceFor('before');
  const split = s => [s.slice(0, s.indexOf('class RainScene')), s.slice(s.indexOf('class SnowScene'))];
  assert.deepEqual(split(source), split(before), 'production edits must stay within RainScene');
  const rain = source.slice(source.indexOf('class RainScene'), source.indexOf('class SnowScene'));
  const update = rain.slice(rain.indexOf('  update('), rain.indexOf('  dispose('));
  assert.ok(!update.includes('Math.random'), 'RainScene.update must never randomize positions');
  assert.match(rain, /const d = \{ x, y, z, sp \}/);
  assert.match(update, /position\.set\(d\.x, d\.y, d\.z\)/);
  assert.match(source, /_loop\(\) \{[\s\S]*?const dt = 0\.016;/);
  console.log('PASS code: data={x,y,z,sp}; update has no Math.random; matrix uses d.z; only RainScene changed; global dt=0.016');
  const expected = { drizzle: [45, .9, 1.4, .05], rain: [65, 1.6, 2.4, .13], heavy: [95, 2.4, 3.4, .18], storm: [90, 3, 4.2, .22] };
  const runtime = await start(), reports = [];
  try {
    for (const theme of ['dark', 'light']) {
      for (const [level, spec] of Object.entries(expected)) {
        const { page, context, errors } = await rainPage(runtime, { theme, level });
        const result = await page.evaluate(() => {
          const a = window.__task019Atmosphere, s = a.currentScene, T = window.__task021Three;
          const layers = s.layers.map(l => {
            const matrix = new T.Matrix4(), scale = new T.Vector3(), pos = new T.Vector3(), rot = new T.Quaternion();
            const sizes = [];
            for (let i = 0; i < l.mesh.count; i++) { l.mesh.getMatrixAt(i, matrix); matrix.decompose(pos, rot, scale); sizes.push(scale.x); }
            return { name: l.name, instanced: l.mesh.isInstancedMesh, count: l.mesh.count, opacity: l.mesh.material.opacity, sizes, length: l.mesh.geometry.parameters.height, z: l.data.map(d => d.z), speed: l.data.map(d => d.sp) };
          });
          const reducedSnapshot = JSON.stringify(s.data);
          s.update(.016, 1, null);
          const reducedStopped = JSON.stringify(s.data) === reducedSnapshot;
          s.reducedMotion = false;
          const snapshot = s.data.map(d => ({ ...d }));
          const random = Math.random;
          Math.random = () => { throw new Error('randomness during rain update'); };
          try { for (let i = 0; i <= 1200; i++) s.update(.016, i / 60, null); }
          finally { Math.random = random; }
          const stable = s.data.every((d, i) => d.x === snapshot[i].x && d.z === snapshot[i].z);
          const meshes = s.group.children.filter(c => c.isInstancedMesh).length;
          const materials = new Set(s.layers.map(l => l.mesh.material)).size;
          const disposed = { geometry: 0, material: 0 };
          for (const l of s.layers) {
            l.mesh.geometry.addEventListener('dispose', () => disposed.geometry++);
            l.mesh.material.addEventListener('dispose', () => disposed.material++);
          }
          s.dispose(); a.currentScene = null;
          return { count: snapshot.length, layers, meshes, materials, reducedStopped, stable, disposed };
        });
        assert.equal(result.count, spec[0]);
        assert.equal(result.meshes, 3); assert.equal(result.materials, 3);
        assert.ok(result.reducedStopped); assert.ok(result.stable, 'x/z must survive 20 seconds including wrap');
        assert.deepEqual(result.disposed, { geometry: 3, material: 3 });
        const ratios = [1, .75, .45], sizes = [1.35, 1, .7], ranges = [[.7, 2], [-.7, .7], [-2, -.7]];
        result.layers.forEach((l, i) => {
          assert.equal(l.instanced, true);
          assert.ok(Math.abs(l.opacity / (theme === 'light' ? .13 : .22) - ratios[i]) < 1e-8);
          assert.ok(l.sizes.every(v => Math.abs(v - sizes[i]) < 1e-6), 'actual matrix size');
          assert.equal(l.length, spec[3]);
          assert.ok(l.z.every(v => v >= ranges[i][0] && v <= ranges[i][1]));
          assert.ok(l.speed.every(v => v >= spec[1] && v <= spec[2]));
          assert.ok(Math.abs(l.count / spec[0] - [.25, .45, .3][i]) <= 1 / spec[0] + 1e-12);
        });
        assert.deepEqual(errors, []);
        reports.push({ theme, level, ...result });
        console.log(`PASS ${theme}/${level}: N=${result.count}; layers=${result.layers.map(l => l.count).join('/')}; opacity=1.00/0.75/0.45; size=1.35/1.00/0.70; sp=${spec[1]}-${spec[2]}; length=${spec[3]}; fixed x/z after 20s; reduced motion; dispose=3/3`);
        await context.close();
      }
    }
    saveJson('layers.json', reports);
  } finally { await runtime.close(); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
