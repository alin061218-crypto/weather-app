const { assert, fs, path, start, seed, clear } = require('./runtime.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function waitLoaded(page) {
  await page.waitForFunction(() => document.querySelector('#refresh') && !document.querySelector('#refresh').disabled && document.querySelector('#user-count').textContent !== '—');
  assert.equal(await page.locator('#error').textContent(), '');
}
async function refresh(page) { await page.locator('#refresh').click(); await waitLoaded(page); }
async function metrics(page, width) {
  const result = await page.evaluate(() => ({ innerWidth, clientWidth: document.documentElement.clientWidth, bodyScrollWidth: document.body.scrollWidth }));
  assert.equal(result.innerWidth, width, 'innerWidth must equal the requested screenshot width');
  assert.ok(result.bodyScrollWidth <= result.clientWidth + 1, `body overflow: ${JSON.stringify(result)}`);
  return result;
}
async function capture(page, file, width) {
  const height = await page.evaluate(() => Math.max(innerHeight, document.body.scrollHeight));
  // Capture the entire page with the requested width, including the scrollbar gutter.
  // Playwright fullPage otherwise crops the PNG to documentElement.clientWidth.
  const session = await page.context().newCDPSession(page);
  let png;
  try {
    const result = await session.send('Page.captureScreenshot', { format: 'png',
      clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: true });
    png = Buffer.from(result.data, 'base64');
    fs.writeFileSync(path.join(__dirname, file), png);
  } finally { await session.detach(); }
  // Preserve the requested image width as well as the real browser viewport width.
  assert.equal(png.readUInt32BE(16), width, 'PNG width must match the screenshot tier');
  assert.equal(png.readUInt32BE(20), height, 'PNG must include the full page height');
  return { imageWidth: png.readUInt32BE(16), imageHeight: png.readUInt32BE(20) };
}
async function main() {
  const runtime = await start();
  let browser;
  try {
    const fixture = seed(runtime.db);
    // Playwright normally adds this switch; explicitly remove it so scrollbars stay visible.
    browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
    const context = await browser.newContext({ viewport: { width: 375, height: 1100 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(runtime.url + '/admin');
    await page.keyboard.press('Tab');
    const loginFocus = await page.locator('#admin-username').evaluate(el => ({ focused: el === document.activeElement, visible: el.matches(':focus-visible'), width: getComputedStyle(el).outlineWidth }));
    assert.deepEqual(loginFocus, { focused: true, visible: true, width: '2px' });
    const loginMetrics = await metrics(page, 375);
    const loginColors = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, primary: getComputedStyle(document.querySelector('button')).backgroundColor }));
    assert.deepEqual(loginColors, { background: 'rgb(10, 14, 23)', primary: 'rgb(91, 156, 245)' });
    await capture(page, 'login-375.png', 375);
    console.log(`PASS: login palette / keyboard focus / viewport = ${JSON.stringify(loginMetrics)}`);
    await page.locator('[name=username]').fill(runtime.username);
    await page.locator('[name=password]').fill(runtime.password);
    await Promise.all([page.waitForNavigation(), page.locator('button[type=submit]').click()]);
    await waitLoaded(page);
    const cookies = await context.cookies();
    const cookie = cookies.find(item => item.name === 'admin_token');
    assert.ok(cookie?.httpOnly && cookie.path === '/admin');
    const stats = await runtime.api('/admin/api/stats');
    const results = [];
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.reload(); await waitLoaded(page);
      await page.keyboard.press('Tab');
      const data = await page.evaluate(() => {
        const band = document.querySelector('.metrics'), style = getComputedStyle(band);
        const charts = [...document.querySelectorAll('canvas')].map(canvas => {
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let primaryPixels = 0, lowAlphaPixels = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] === 91 && pixels[i + 1] === 156 && pixels[i + 2] === 245 && pixels[i + 3] > 200) primaryPixels++;
            if (pixels[i + 3] >= 20 && pixels[i + 3] <= 30) lowAlphaPixels++;
          }
          return { id: canvas.id, role: canvas.getAttribute('role'), label: canvas.getAttribute('aria-label'), primaryPixels, lowAlphaPixels };
        });
        const focus = document.activeElement, focusStyle = getComputedStyle(focus);
        return {
          counts: ['user-count', 'favorite-count', 'history-count', 'cache-count'].map(id => Number(document.getElementById(id).textContent)),
          totals: ['users-total', 'favorites-total', 'history-total'].map(id => document.getElementById(id).textContent),
          rows: ['users', 'favorites', 'history'].map(id => document.querySelectorAll('#' + id + ' tr').length),
          metricWidths: [...band.children].map(el => el.getBoundingClientRect().width),
          band: { top: style.borderTopWidth, bottom: style.borderBottomWidth, left: style.borderLeftWidth, right: style.borderRightWidth, radius: style.borderRadius, shadow: style.boxShadow },
          charts, days: chartStats.days, cities: [...document.querySelectorAll('#city-labels li')].map(li => ({ city: li.querySelector('.city-name').textContent, n: Number(li.querySelector('.city-count').textContent) })),
          dates: [...document.querySelectorAll('#date-labels span')].map(el => el.textContent), summary: document.querySelector('#trend-summary').textContent,
          allScoped: [...document.querySelectorAll('th')].every(th => th.scope === 'col'),
          focus: { id: focus.id, visible: focus.matches(':focus-visible'), outline: focusStyle.outlineStyle, width: focusStyle.outlineWidth, offset: focusStyle.outlineOffset },
          externalAssets: [...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(el => el.src || el.href)
        };
      });
      assert.deepEqual(data.counts, [fixture.users.length, fixture.favorites.length, fixture.history.length, fixture.cache.length]);
      assert.deepEqual(data.totals, ['共 70 条', '共 85 条', '共 392 条']);
      assert.deepEqual(data.rows, [50, 50, 30]);
      assert.ok(Math.max(...data.metricWidths) - Math.min(...data.metricWidths) < 1);
      assert.deepEqual(data.band, { top: '1px', bottom: '1px', left: '0px', right: '0px', radius: '0px', shadow: 'none' });
      assert.deepEqual(data.days, stats.byDay.slice().reverse());
      assert.deepEqual(data.cities, stats.byCity);
      assert.deepEqual([data.dates[0], data.dates.at(-1)], [stats.byDay.at(-1).d.slice(5), stats.byDay[0].d.slice(5)]);
      const total = stats.byDay.reduce((sum, day) => sum + day.n, 0), peak = Math.max(...stats.byDay.map(day => day.n));
      assert.equal(data.summary, `总计 ${total} 次、峰值 ${peak} 次`);
      assert.ok(data.allScoped); assert.deepEqual(data.externalAssets, []);
      assert.deepEqual(data.focus, { id: 'refresh', visible: true, outline: 'solid', width: '2px', offset: '2px' });
      data.charts.forEach(chart => { assert.equal(chart.role, 'img'); assert.match(chart.label, /查询趋势|热门城市/); assert.ok(chart.primaryPixels > 30); });
      assert.ok(data.charts[0].lowAlphaPixels > 100);
      const result = { width, ...(await metrics(page, width)), rows: data.rows, counts: data.counts, trend: `${data.dates[0]} → ${data.dates.at(-1)}`, summary: data.summary, chartsDrawn: true, focusVisible: true };
      Object.assign(result, await capture(page, `admin-${width}.png`, width));
      results.push(result);
      console.log(`PASS: admin-${width}.png ${JSON.stringify(result)}`);
    }
    // Exactly 40 time-increasing rows: verify all 30 visible rows, including the newest first.
    runtime.db.exec('DELETE FROM history');
    const insertHistory = runtime.db.prepare('INSERT INTO history VALUES (?, ?, ?, 30, 110, ?, ?)');
    for (let i = 0; i < 40; i++) insertHistory.run(`latest-${String(i).padStart(6, '0')}`, fixture.users[0].id, `回归城市${i}`, '晴', new Date(Date.UTC(2026, 9, 3, 0, i)).toISOString());
    await refresh(page);
    const visibleCities = await page.locator('#history tr td:nth-child(2)').allTextContents();
    assert.deepEqual(visibleCities, Array.from({ length: 30 }, (_, i) => `回归城市${39 - i}`));
    assert.equal(await page.locator('#history-count').textContent(), '40');
    console.log('PASS: P1-23 / 40 increasing history rows → 30 visible, newest first (39 … 10)');
    // Exercise real ordinary-user write paths, then ensure payloads stay text in tables/charts.
    const registration = await fetch(runtime.url + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'xss回归用户', password: 'fixture-password-123' }) });
    assert.equal(registration.status, 200);
    const ordinary = await registration.json();
    const favoritePayload = '<img src=x onerror=window.__task017Xss=1>', historyPayload = '<svg/onload=window.__task017Xss=2>';
    for (const [endpoint, body] of [
      ['/api/favorites', { name: favoritePayload, admin1: '<script>window.__task017Xss=3</script>', country: '中国', lat: 30, lon: 110 }],
      ['/api/history', { city: historyPayload, weather: '<img src=x>', lat: 30, lon: 110 }]
    ]) {
      const response = await fetch(runtime.url + endpoint, { method: 'POST', headers: { Authorization: `Bearer ${ordinary.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 200);
    }
    runtime.db.prepare('UPDATE users SET username = ? WHERE id = ?').run('"/><img src=x onerror=window.__task017Xss=4>', ordinary.user.id);
    await refresh(page);
    const xss = await page.evaluate(() => ({ executed: window.__task017Xss || 0,
      favorite: document.querySelector('#favorites tr td:nth-child(2)').textContent,
      history: document.querySelector('#history tr td:nth-child(2)').textContent,
      username: document.querySelector('#users input').value,
      injected: document.querySelectorAll('#users img,#favorites img,#favorites script,#history svg,#city-labels svg').length,
      cityLabel: [...document.querySelectorAll('.city-name')].some(el => el.textContent.startsWith('<svg/')) }));
    assert.equal(xss.executed, 0); assert.equal(xss.injected, 0);
    assert.equal(xss.favorite, favoritePayload); assert.equal(xss.history, historyPayload); assert.equal(xss.cityLabel, true);
    assert.equal(xss.username, '"/><img src=x onerror=window.__task017Xss=4>');
    const html = await (await fetch(runtime.url + '/admin', { headers: { Authorization: `Bearer ${runtime.token}` } })).text();
    assert.ok(!html.includes(favoritePayload) && !html.includes(historyPayload)); assert.doesNotMatch(html, /\$2[aby]\$/);
    console.log('PASS: stored-XSS regression (ordinary-user favorites/history, legacy username, chart labels); 0 injected elements / 0 executed payloads; fixed HTML contains no DB values or password hashes');
    // Existing edits/deletes must still refresh both the tables and COUNT(*) metrics.
    const edit = page.locator('#users input').first();
    await edit.fill('修改后用户'); await edit.press('Tab');
    await page.waitForFunction(() => document.querySelector('#users input').value === '修改后用户' && !document.querySelector('#refresh').disabled);
    assert.equal(runtime.db.prepare('SELECT username FROM users WHERE id = ?').get(ordinary.user.id).username, '修改后用户');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#favorites button').first().click();
    await page.waitForFunction(() => document.querySelector('#favorite-count').textContent === '85');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#history button').first().click();
    await page.waitForFunction(() => document.querySelector('#history-count').textContent === '40');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#users button').first().click();
    await page.waitForFunction(() => document.querySelector('#user-count').textContent === '70');
    console.log('PASS: username edit and favorite/history/user deletion refresh the real counts');
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#clear-cache').click();
    assert.equal(runtime.db.prepare('SELECT COUNT(*) n FROM cache').get().n, 7);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#clear-cache').click();
    await page.waitForFunction(() => document.querySelector('#cache-count').textContent === '0');
    assert.equal(runtime.db.prepare('SELECT COUNT(*) n FROM cache').get().n, 0);
    console.log('PASS: clear-cache confirmation cancel preserves 7 rows; accept clears cache and updates count to 0');
    clear(runtime.db); await refresh(page);
    assert.equal(await page.locator('#trend-summary').textContent(), '总计 0 次、峰值 0 次');
    assert.deepEqual(await page.locator('.stat-num').allTextContents(), ['0', '0', '0', '0']);
    await page.setViewportSize({ width: 375, height: 1100 }); await metrics(page, 375);
    assert.deepEqual(await page.locator('tbody').allTextContents(), ['暂无用户', '暂无收藏', '暂无记录']);
    console.log('PASS: empty database renders zero counts / empty tables / empty charts without overflow');
    await page.locator('#logout').click(); await page.waitForSelector('#loginForm');
    assert.ok(!(await context.cookies()).some(item => item.name === 'admin_token'));
    const revoked = await context.request.get(runtime.url + '/admin/api/stats', { headers: { Authorization: `Bearer ${cookie.value}` } });
    assert.equal(revoked.status(), 401);
    assert.deepEqual(errors, []);
    console.log('PASS: UI logout clears the HttpOnly cookie and revokes the session; 0 browser errors');
    fs.writeFileSync(path.join(__dirname, 'screenshots.json'), JSON.stringify({ login: loginMetrics, admin: results, browserErrors: errors, regression: { latest30: true, storedXss: true, crud: true, cacheConfirm: true, empty: true, logout: true } }, null, 2) + '\n');
    await context.close();
  } finally { if (browser) await browser.close(); await runtime.close(); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
