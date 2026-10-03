// Bidirectional visual evidence: seven weather scenes in both themes.
const { assert, fs, path, output, scenes, start, pageFor, metrics } = require('./browser.cjs');

async function main() {
  const runtime = await start();
  const results = [];
  const width = 1280;
  try {
    for (const theme of ['light', 'dark']) {
      for (const scene of Object.keys(scenes)) {
        const { page, context, errors, requests } = await pageFor(runtime, width, scene, theme);
        const result = await metrics(page, width);
        assert.equal(result.theme, theme, `${theme}/${scene}: theme mismatch`);
        assert.equal(result.weather, scene, `${theme}/${scene}: weather scene mismatch`);
        const button = await page.locator('#theme-btn').evaluate(el => ({
          text: el.textContent.trim(), title: el.title, aria: el.getAttribute('aria-label'),
          focus: getComputedStyle(el).outlineStyle
        }));
        assert.equal(button.text, '◐', `${theme}/${scene}: theme icon must be contrast symbol`);
        assert.equal(button.aria, '切换浅色或暗黑主题', `${theme}/${scene}: theme aria-label mismatch`);
        assert.equal(button.title, '切换浅色或暗黑主题', `${theme}/${scene}: theme title mismatch`);
        await page.locator('#theme-btn').focus();
        assert.equal(await page.locator('#theme-btn').evaluate(el => el.matches(':focus-visible')), true, `${theme}/${scene}: theme focus-visible missing`);
        assert.equal(await page.locator('#theme-btn').evaluate(el => getComputedStyle(el).outlineStyle), 'solid', `${theme}/${scene}: theme focus outline missing`);
        assert.deepEqual(errors, [], `${theme}/${scene}: page errors`);
        assert.equal(requests.weather, 1, `${theme}/${scene}: fixture weather request count`);
        const filename = `${theme}-${scene}.png`;
        await page.screenshot({ path: path.join(output, filename), fullPage: true });
        results.push({ theme, scene, width, ...result, screenshot: filename });
        console.log(`PASS\t${theme}\t${scene}\t${filename}\tinnerWidth=${result.innerWidth}\tbodyScrollWidth=${result.bodyScrollWidth}`);
        await context.close();
      }
    }
    fs.writeFileSync(path.join(output, 'screenshots.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(`PASS: ${results.length} screenshots; 7 scenes × light/dark at ${width}px with exact viewport and no body overflow`);
  } finally {
    await runtime.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
