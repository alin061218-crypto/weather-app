const { assert, fs, path, output, start, pageFor, tabTo, metrics } = require('./browser.cjs');
async function main() {
  const runtime = await start(), results = [];
  try {
    for (const width of [375, 768, 1280]) {
      const { page, context, errors } = await pageFor(runtime, width, { loggedIn: false });
      const capture = async name => {
        const result = { name, ...(await metrics(page, width)) };
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
        results.push(result); return result;
      };
      const home = await capture('home');
      Object.assign(home, await page.evaluate(() => ({
        stats: document.querySelectorAll('.stat-chip').length,
        rows: document.querySelectorAll('.day-row').length,
        bars: [...document.querySelectorAll('.day-row')].map(el => el.querySelectorAll('.temperature-fingerprint-bar').length),
        chartPoints: document.querySelector('#temp-chart').dataset.pointCount,
        axis: [document.querySelector('#temp-chart').dataset.axisStart, document.querySelector('#temp-chart').dataset.axisEnd],
        tabFont: getComputedStyle(document.querySelector('.tab-btn-label')).fontSize,
        tabIcon: getComputedStyle(document.querySelector('.tab-btn-icon svg')).width,
        tempFont: getComputedStyle(document.querySelector('#temperature')).fontSize,
        tempTracking: getComputedStyle(document.querySelector('#temperature')).letterSpacing,
        statOverflow: [...document.querySelectorAll('.stat-chip')].filter(e => e.scrollWidth > e.clientWidth + 1).length
      })));
      assert.equal(home.stats, 8); assert.equal(home.rows, 7); assert.deepEqual(home.bars, [24,24,24,24,24,24,24]);
      assert.equal(home.chartPoints, '24'); assert.deepEqual(home.axis, ['00:00', '23:00']); assert.equal(home.statOverflow, 0);
      assert.equal(home.tabIcon, `${width < 600 ? 22 : width < 840 ? 24 : 26}px`);
      // Full forecast asset supplements the viewport captures without changing fixed navigation.
      await page.locator('.daily-section').screenshot({ path: path.join(output, `daily-${width}.png`) });
      await tabTo(page, '#map-btn'); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#map-modal').open);
      const map = await capture('map-modal');
      Object.assign(map, await page.locator('.map-modal-box').evaluate(el => {
        const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width };
      }));
      assert.ok(map.left >= 20 - 1 && map.right <= width - 20 + 1, 'modal box inside overlay content area');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#map-modal').open);
      await tabTo(page, '.tab-btn[data-tab="chat"]'); await page.keyboard.press('Enter');
      const chat = await capture('chat');
      chat.maxHeight = await page.locator('.chat-list').evaluate(el => getComputedStyle(el).maxHeight);
      assert.equal(chat.maxHeight, `${1100 * (width < 600 ? .45 : width < 840 ? .55 : .65)}px`);
      await tabTo(page, '.tab-btn[data-tab="me"]'); await page.keyboard.press('Enter');
      const login = await capture('me-login');
      Object.assign(login, await page.evaluate(() => {
        const page = document.querySelector('#tab-me').getBoundingClientRect();
        const card = document.querySelector('#me-login-block').getBoundingClientRect();
        return { top: card.top, bottom: card.bottom, pageTop: page.top, pageBottom: page.bottom,
          centerDelta: (card.top + card.bottom - page.top - page.bottom) / 2,
          viewportCenterDelta: (card.top + card.bottom - innerHeight) / 2,
          listMaxHeight: getComputedStyle(document.querySelector('.me-list')).maxHeight,
          formWidth: document.querySelector('.me-form').getBoundingClientRect().width };
      }));
      assert.ok(Math.abs(login.centerDelta) <= 1, `login must be vertically centered: ${JSON.stringify(login)}`);
      assert.ok(login.formWidth <= 400, 'login stays form width');
      if (width === 1280) assert.ok(Math.abs(login.viewportCenterDelta) <= 20, '1280x1100 form centered in viewport');
      assert.deepEqual(errors, []);
      await context.close();
    }
    // Confirm emergency weather path preserves the accepted chart/fingerprint contract.
    const { page, context, requests, errors } = await pageFor(runtime, 375, { fallback: true });
    assert.equal(requests.direct, 1); assert.equal(requests.weather, 1);
    assert.equal(await page.locator('#temp-chart').getAttribute('data-point-count'), '24');
    assert.equal(await page.locator('.temperature-fingerprint-bar').count(), 168);
    assert.deepEqual(errors, []); await context.close();
    fs.writeFileSync(path.join(output, 'screenshots.json'), JSON.stringify({ results, fallback: requests }, null, 2) + '\n');
    console.log(JSON.stringify(results, null, 2));
    console.log('PASS: exact viewport/body overflow, map bounds, login centering, tab sizing, list tiers and chart/fingerprint regression');
  } finally { await runtime.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
