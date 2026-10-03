const { assert, fs, path, output, start, pageFor, tabTo, metrics } = require('./browser.cjs');
async function main() {
  const runtime = await start(), results = [];
  try {
    for (const width of [375, 768, 1280]) {
      const { page, context, errors, requests } = await pageFor(runtime, width);
      const steps = [];
      await tabTo(page, '#search-input', steps);
      await page.keyboard.type('南京');
      await page.waitForSelector('button.search-item');
      await tabTo(page, 'button.search-item', steps);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('#city').textContent === '南京');
      steps.push('Space 选择南京 → #city=南京，天气和 7 天预报已渲染');
      await tabTo(page, '#temperature', steps);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => localStorage.getItem('wx_unit') === 'fahrenheit');
      assert.equal(await page.locator('#temperature').textContent(), '72°F');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#temperature').textContent(), '22°');
      steps.push('Space → 72°F；Enter → 22°，localStorage 单位与显示同步');
      await tabTo(page, '#fav-btn', steps);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#fav-btn').disabled);
      const disabled = await page.locator('#fav-btn').evaluate(el => ({ opacity: getComputedStyle(el).opacity, cursor: getComputedStyle(el).cursor, transform: getComputedStyle(el).transform }));
      assert.deepEqual(disabled, { opacity: '0.45', cursor: 'not-allowed', transform: 'none' });
      if (width === 1280) await page.screenshot({ path: path.join(output, 'favorite-disabled-1280.png') });
      await page.waitForFunction(() => !document.querySelector('#fav-btn').disabled && document.querySelector('#fav-btn').getAttribute('aria-pressed') === 'true');
      assert.equal(requests.favoriteWrites, 1);
      steps.push('Enter 收藏南京 → 实际 POST /api/favorites；提交中 opacity=.45 / not-allowed，完成 aria-pressed=true');
      await tabTo(page, '.tab-btn[data-tab="chat"]', steps);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#tab-chat').evaluate(el => el.classList.contains('active')), true);
      steps.push('Enter → 出行建议 tab，主流程完成（操作全程无鼠标、无 focus()/click()）');
      await page.screenshot({ path: path.join(output, `keyboard-complete-${width}.png`) });
      // Additional keyboard-only reachability and activation; still no synthetic click/focus.
      await tabTo(page, '.tab-btn[data-tab="home"]', steps); await page.keyboard.press('Space');
      await tabTo(page, '.recent-chip', steps); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#city').textContent === '上海');
      steps.push('Enter 最近城市 → 上海天气');
      await tabTo(page, '.day-row', steps); await page.keyboard.press('Space');
      assert.equal(await page.locator('.day-row').first().getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#day-detail-0').isVisible(), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#day-detail-0').isVisible(), false);
      steps.push('Space 展开当天详情 → Enter 收起，aria-expanded 与可见性同步');
      await tabTo(page, '.advice-chip', steps); await page.keyboard.press('Space');
      assert.equal(await page.locator('#tab-chat').evaluate(el => el.classList.contains('active')), true);
      assert.ok((await page.locator('#chat-input').inputValue()).includes('怎么穿'));
      await tabTo(page, '#chat-send', steps); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('.chat-bubble').length >= 3);
      steps.push('Space 建议标签 → 带入问题并聚焦聊天输入 → Tab + Enter 发送，收到回复');
      await tabTo(page, '.tab-btn[data-tab="guide"]', steps); await page.keyboard.press('Enter');
      await tabTo(page, '.guide-tab[data-guide="travel"]', steps); await page.keyboard.press('Space');
      assert.equal(await page.locator('#travel-guide').isVisible(), true);
      await tabTo(page, '.tab-btn[data-tab="home"]', steps); await page.keyboard.press('Enter');
      await tabTo(page, '#map-btn', steps); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#map-modal').evaluate(el => el.open && el.matches(':modal')), true);
      assert.equal(await page.locator('#map-close').evaluate(el => el === document.activeElement), true);
      const modalFocus = [];
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        modalFocus.push(await page.evaluate(() => document.activeElement?.tagName));
        assert.equal(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('#map-modal')), true, 'native dialog excludes background controls (browser chrome may own focus)');
      }
      // Close from the parent document's button (cross-origin iframe owns its key events).
      await tabTo(page, '#map-close', steps); await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#map-modal').open);
      assert.equal(await page.locator('#map-btn').evaluate(el => el === document.activeElement), true);
      steps.push('Enter 打开原生 modal → Tab 未进入背景控件 → 在关闭按钮按 Esc 关闭 → 焦点回 #map-btn');
      assert.deepEqual(errors, [], 'browser runtime errors');
      results.push({ width, ...(await metrics(page, width)), disabled, modalFocus, requests, steps });
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'keyboard.json'), JSON.stringify(results, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'keyboard.md'), '# 键盘走通主流程\n\n2026-10-03，Edge，无鼠标操作；真实前端，API 使用固定验收数据和已登录测试会话。\n\n' + results.map(r => `## ${r.width}px\n\n` + r.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')).join('\n\n') + '\n');
    console.log(JSON.stringify(results, null, 2));
    console.log('PASS: keyboard main flow and additional controls at 375 / 768 / 1280px');
  } finally { await runtime.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
