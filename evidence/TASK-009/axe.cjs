// Production frontend, deterministic API fixture, axe injected and run via CDP.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axe = require('axe-core');
const { start, pageFor } = require('../TASK-015e/browser.cjs');

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function main() {
  const runtime = await start();
  const summary = [];
  try {
    for (const width of [375, 768, 1280]) {
      for (const theme of ['dark', 'light']) {
        const { page, context, errors } = await pageFor(runtime, width, { loggedIn: false });
        try {
          if (theme === 'light') await page.locator('#theme-btn').click();
          assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
          assert.equal(await page.locator('body').getAttribute('data-weather'), 'clear-day');
          assert.equal(await page.evaluate(() => innerWidth), width);
          const cdp = await context.newCDPSession(page);
          try {
            await evaluate(cdp, axe.source);
            async function audit(state) {
              // Audit settled styles, including theme/nav color transitions.
              await page.evaluate(async () => {
                await new Promise(requestAnimationFrame);
                const finite = document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
                await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
                await new Promise(requestAnimationFrame);
              });
              const raw = await evaluate(cdp, 'axe.run(document, { resultTypes: ["violations", "incomplete", "passes", "inapplicable"] })');
              const file = `axe-${width}-${theme}-${state}.json`;
              fs.writeFileSync(path.join(__dirname, file), JSON.stringify(raw, null, 2) + '\n');
              const counts = Object.fromEntries(['critical', 'serious', 'moderate', 'minor'].map(impact => [impact, raw.violations.filter(v => v.impact === impact).length]));
              summary.push({ width, height: 1100, theme, scene: 'clear-day', state, file, counts,
                violations: raw.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, helpUrl: v.helpUrl,
                  nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) })),
                incomplete: raw.incomplete.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) })) });
              console.log(`${width} ${theme} ${state}: ${JSON.stringify(counts)}`);
            }
            await audit('home');
            for (const tab of ['chat', 'guide', 'me']) {
              await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
              await audit(tab);
            }
            await page.locator('#feedback-open').click();
            await page.locator('#feedback-dialog').waitFor({ state: 'visible' });
            await audit('feedback');
            await page.locator('#feedback-close').click();
            await page.locator('#tab-me [data-open="privacy"]').click();
            await audit('privacy');
            await page.locator('#privacy-close').click();
            await page.locator('.tab-btn[data-tab="home"]').click();
            await page.locator('#map-btn').click();
            await page.locator('#map-modal').waitFor({ state: 'visible' });
            await audit('map');
            await page.keyboard.press('Escape');
            await page.locator('#map-modal').waitFor({ state: 'hidden' });
            const review = await page.evaluate(() => ({
              mapControl: document.getElementById(document.querySelector('#map-btn').getAttribute('aria-controls'))?.id,
              lifeIndicesText: document.querySelector('#life-indices').textContent.trim(),
              atmosphere: { text: document.querySelector('#atmosphere').textContent.trim(),
                focusable: document.querySelectorAll('#atmosphere :is(button, a, input, select, textarea, [tabindex])').length,
                pointerEvents: getComputedStyle(document.querySelector('#atmosphere')).pointerEvents }
            }));
            assert.equal(review.mapControl, 'map-modal');
            assert.ok(review.lifeIndicesText.length > 0);
            assert.equal(review.atmosphere.text, '');
            assert.equal(review.atmosphere.focusable, 0);
            assert.equal(review.atmosphere.pointerEvents, 'none');
            fs.writeFileSync(path.join(__dirname, `manual-review-${width}-${theme}.json`), JSON.stringify(review, null, 2) + '\n');
            assert.deepEqual(errors, [], 'production page must load without JS errors');
          } finally { await cdp.detach(); }
        } finally { await context.close(); }
      }
    }
  } finally {
    await runtime.close();
    fs.writeFileSync(path.join(__dirname, 'axe-summary.json'), JSON.stringify({ axeVersion: axe.version, representativeScene: 'clear-day', runs: summary }, null, 2) + '\n');
  }
  const blocking = summary.flatMap(run => run.violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${run.width}/${run.theme}/${run.state}: ${v.id}`));
  assert.deepEqual(blocking, [], 'axe critical/serious violations require triage and correction');
  console.log(`PASS: ${summary.length} axe audits, 0 critical / 0 serious; raw JSON and full violation lists saved`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
