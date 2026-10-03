// CDP measurement for the reported light-theme clear-night regression.
const { assert, start, pageFor, cdpEvaluate } = require('./browser.cjs');

function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${label}\t${detail}`);
  assert.ok(ok, `${label}: ${detail}`);
}

async function main() {
  const runtime = await start();
  try {
    const { page, context, errors } = await pageFor(runtime, 1280, 'clear-night', 'light');
    const result = await cdpEvaluate(page, `(() => {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      const rgba = value => {
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
        const p = ctx.getImageData(0, 0, 1, 1).data; return [p[0], p[1], p[2], p[3] / 255];
      };
      const linear = channel => { const v = channel / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
      const lum = rgb => linear(rgb[0]) * .2126 + linear(rgb[1]) * .7152 + linear(rgb[2]) * .0722;
      const composite = (fg, bg) => fg.map((v, i) => i < 3 ? v * fg[3] + bg[i] * (1 - fg[3]) : 1);
      const body = getComputedStyle(document.body), sceneCss = body.getPropertyValue('--scene-bg').trim();
      const scene = rgba(sceneCss), sceneRgb = scene.slice(0, 3), sceneLum = lum(sceneRgb);
      const background = el => {
        const parsed = rgba(getComputedStyle(el).backgroundColor);
        const rgb = parsed[3] < 1 ? composite(parsed, sceneRgb) : parsed;
        return { css: getComputedStyle(el).backgroundColor, rgb, luminance: lum(rgb) };
      };
      const moon = window.__task019Atmosphere.currentScene.group.children.find(child => child.isMesh && child.position.x === 1.8);
      const moonColor = '#' + moon.material.color.getHexString();
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        weather: document.body.getAttribute('data-weather'),
        sceneBg: sceneCss,
        sceneLuminance: sceneLum,
        chart: background(document.querySelector('.chart-section')),
        stats: background(document.querySelector('.stats-scroll')),
        moonColor,
        moonLuminance: lum(rgba(moonColor)),
        atmosphereOpacity: getComputedStyle(document.querySelector('#atmosphere')).opacity
      };
    })()`);
    console.log(JSON.stringify(result, null, 2));
    check('light clear-night scene background is light', result.sceneLuminance > 0.8, `luminance=${result.sceneLuminance.toFixed(3)}`);
    check('chart background matches scene', Math.abs(result.chart.luminance - result.sceneLuminance) <= 0.12, `delta=${Math.abs(result.chart.luminance - result.sceneLuminance).toFixed(3)}`);
    check('stats background matches scene', Math.abs(result.stats.luminance - result.sceneLuminance) <= 0.12, `delta=${Math.abs(result.stats.luminance - result.sceneLuminance).toFixed(3)}`);
    check('light clear-night moon material is bright', result.moonLuminance > 0.55, `${result.moonColor} luminance=${result.moonLuminance.toFixed(3)}`);
    check('global light atmosphere policy is explicit', result.atmosphereOpacity === '0.35', `opacity=${result.atmosphereOpacity}`);
    check('CDP page has no runtime errors', errors.length === 0, JSON.stringify(errors));
    await context.close();
  } finally {
    await runtime.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
