const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const outputDir = path.resolve(__dirname);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), `Edge not found: ${edge}`);
const mode = process.argv.includes('--via-fallback') ? 'fallback' : 'backend';
const baselineMode = process.argv.includes('--baseline');
const baselineOverrides = new Map();
if (baselineMode) {
  for (const relative of ['index.html', 'css/style.css']) {
    const result = spawnSync('git', ['show', 'HEAD:frontend/' + relative], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
    assert.equal(result.status, 0, 'Could not read baseline frontend/' + relative);
    baselineOverrides.set('/' + relative.replaceAll('\\', '/'), result.stdout);
  }
}

const hours = Array.from({ length: 168 }, (_, i) => {
  const hour = i % 24;
  return 16 + Math.round(8 * Math.sin((hour - 6) / 24 * Math.PI * 2)) + Math.floor(i / 24) % 3;
});
const days = Array.from({ length: 7 }, (_, i) => ({
  time: `2026-10-${String(3 + i).padStart(2, '0')}`,
  temperature_2m_max: 24 + i % 3,
  temperature_2m_min: 14 + i % 2,
  weathercode: [0, 1, 2, 3, 61, 71, 95][i],
  precipitation_probability_max: 8 + i * 3
}));
const weather = {
  current_weather: { temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
  hourly: {
    time: Array.from({ length: 168 }, (_, i) => `2026-10-${String(3 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
    temperature_2m: hours,
    apparent_temperature: hours,
    relativehumidity_2m: hours.map(() => 60),
    cloudcover: hours.map(() => 25),
    uv_index: hours.map(() => 2),
    precipitation_probability: hours.map(() => 10),
    pressure_msl: hours.map(() => 1013),
    visibility: hours.map(() => 10000)
  },
  daily: {
    time: days.map(d => d.time),
    temperature_2m_max: days.map(d => d.temperature_2m_max),
    temperature_2m_min: days.map(d => d.temperature_2m_min),
    weathercode: days.map(d => d.weathercode),
    precipitation_probability_max: days.map(d => d.precipitation_probability_max)
  }
};
const conversationSeed = '[{"role":"user","text":"今天适合出门吗？","time":1791000000000},{"role":"bot","text":"北京今天晴，气温约 22°，风力不大，适合安排户外活动。","time":1791000001000},{"role":"user","text":"需要带伞吗？","time":1791000002000},{"role":"bot","text":"今天降水概率较低，通常不需要带伞。晚些时候出门也可以再看一下最新预报。","time":1791000003000},{"role":"user","text":"明天怎么穿？","time":1791000004000},{"role":"bot","text":"明天体感舒适，长袖或 T 恤搭配长裤都合适。早晚温差略大，可以备一件薄外套。","time":1791000005000}]';

const bootstrap = `<script>
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_, reject) { reject(new Error('GPS disabled')); } } });
const evidenceParams = new URLSearchParams(location.search);
if (evidenceParams.get('auth') === 'logged-in') localStorage.setItem('wx_token', 'evidence-token');
else localStorage.removeItem('wx_token');
if (evidenceParams.get('conversation') === '1') localStorage.setItem('wx_chat', '${conversationSeed}');
else localStorage.removeItem('wx_chat');
const weatherMock = ${JSON.stringify(weather)};
window.__evidenceRequests = { backend: 0, fallback: 0 };
const realFetch = window.fetch.bind(window);
window.fetch = (input, options) => { const u = new URL(String(input), location.href);
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/location') return Promise.resolve(new Response(JSON.stringify({ city:'北京', region:'北京', country:'中国', lat:39.904, lon:116.407 }), { headers:{'Content-Type':'application/json'} }));
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/wx-params') return Promise.resolve(new Response('current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover,apparent_temperature,uv_index,precipitation_probability,pressure_msl,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=7', { headers:{'Content-Type':'text/plain'} }));
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/weather') {
    if (${JSON.stringify(mode)} === 'backend') { window.__evidenceRequests.backend++; return Promise.resolve(new Response(JSON.stringify(weatherMock), { headers:{'Content-Type':'application/json'} })); }
    return Promise.resolve(new Response(JSON.stringify({ error:'backend unavailable' }), { status:503, headers:{'Content-Type':'application/json'} }));
  }
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/me') return Promise.resolve(new Response(JSON.stringify({ user:{ id:1, username:'天气用户' } }), { headers:{'Content-Type':'application/json'} }));
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/favorites') return Promise.resolve(new Response(JSON.stringify([{ id:1, name:'上海', admin1:'上海', country:'中国', lat:31.23, lon:121.47 }, { id:2, name:'杭州', admin1:'浙江', country:'中国', lat:30.27, lon:120.15 }, { id:3, name:'成都', admin1:'四川', country:'中国', lat:30.57, lon:104.07 }]), { headers:{'Content-Type':'application/json'} }));
  if (u.hostname === 'localhost' && u.port === '3001' && u.pathname === '/api/history') return Promise.resolve(new Response(JSON.stringify([{ city:'北京', weather:'晴 22°', lat:39.904, lon:116.407, time:'2026-10-03T08:00:00.000Z' }, { city:'上海', weather:'多云 24°', lat:31.23, lon:121.47, time:'2026-10-02T08:00:00.000Z' }, { city:'杭州', weather:'小雨 20°', lat:30.27, lon:120.15, time:'2026-10-01T08:00:00.000Z' }]), { headers:{'Content-Type':'application/json'} }));
  if (u.hostname === 'api.open-meteo.com' && u.pathname === '/v1/forecast') { window.__evidenceRequests.fallback++; return Promise.resolve(new Response(JSON.stringify(weatherMock), { headers:{'Content-Type':'application/json'} })); }
  return realFetch(input, options);
};
</script>`;

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(frontend, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(frontend + path.sep)) { res.writeHead(403).end(); return; }
  const relative = '/' + path.relative(frontend, file).replaceAll('\\', '/');
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    if (baselineOverrides.has(relative)) content = Buffer.from(baselineOverrides.get(relative));
    if (pathname === '/') {
      content = Buffer.from(String(content).replace(/<script\b[^>]*type=["']module["'][^>]*><\/script>/, bootstrap + '$&'));
    }
    const type = path.extname(file) === '.html' ? 'text/html' : path.extname(file) === '.js' ? 'text/javascript' : path.extname(file) === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(content);
  });
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
}

async function waitForJson(url, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.nextId = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) { const { resolve, reject } = this.pending.get(message.id); this.pending.delete(message.id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); }
    });
  }
  command(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  async evaluate(expression) { const result = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return result.result?.value; }
  close() { this.socket.close(); }
}

async function capture(name, width, url, serverUrl) {
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `task016c-${mode}-${name}-`));
  const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, `${name}: no page target`);
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
    await cdp.command('Page.navigate', { url: `${serverUrl}/?evidence=${name}` });
    await cdp.evaluate(`new Promise(resolve => setTimeout(resolve, 3500))`);
    await cdp.command('Input.dispatchKeyEvent', { type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9, nativeVirtualKeyCode:9 });
    await cdp.command('Input.dispatchKeyEvent', { type:'keyUp', key:'Tab', code:'Tab', windowsVirtualKeyCode:9, nativeVirtualKeyCode:9 });
    await cdp.evaluate(`document.querySelector('.tab-btn')?.focus()`);
    const metrics = await cdp.evaluate(`(() => {
      const chart = document.querySelector('.chart-section');
      const daily = document.querySelector('.daily-section');
      const rows = [...document.querySelectorAll('.day-row')];
      return {
        innerWidth,
        metricCount: rows.length,
        fingerprintBars: rows.map(row => row.querySelectorAll('.temperature-fingerprint-bar').length),
        pointCount: Number(document.querySelector('#temp-chart')?.dataset.pointCount || 0),
        fingerprintCount: document.querySelectorAll('.temperature-fingerprint').length,
        fallbackCount: document.querySelectorAll('.temperature-fingerprint-fallback').length,
        axisStart: document.querySelector('#temp-chart')?.dataset.axisStart,
        axisEnd: document.querySelector('#temp-chart')?.dataset.axisEnd,
        requests: window.__evidenceRequests,
        focusVisible: document.querySelector('.tab-btn')?.matches(':focus-visible'),
        focusOutline: getComputedStyle(document.querySelector('.tab-btn')).outlineStyle,
        navLeft: document.querySelector('.tab-bar')?.getBoundingClientRect().left,
        appLeft: document.querySelector('.app')?.getBoundingClientRect().left,
        chartTop: chart?.offsetTop,
        dailyTop: daily?.offsetTop,
        chartWidth: chart?.getBoundingClientRect().width,
        contentWidth: document.querySelector('.weather-view')?.getBoundingClientRect().width,
        statOverflow: [...document.querySelectorAll('.stat-chip')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim()),
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: innerWidth
      };
    })()`);
    assert.equal(metrics.innerWidth, width, `${name}: innerWidth must equal ${width}`);
    assert.equal(metrics.metricCount, 7, `${name}: expected seven forecast rows`);
    assert.deepEqual(metrics.fingerprintBars, [24, 24, 24, 24, 24, 24, 24], `${name}: every row needs 24 fingerprint bars`);
    assert.equal(metrics.pointCount, 24, `${name}: chart must draw 24 points`);
    assert.equal(metrics.fingerprintCount, 7, `${name}: seven fingerprints required`);
    assert.equal(metrics.fallbackCount, 0, `${name}: fingerprint fallback must be unused`);
    assert.equal(metrics.axisStart, '00:00', `${name}: x axis must start at 00:00`);
    assert.equal(metrics.axisEnd, '23:00', `${name}: x axis must end at 23:00`);
    assert.equal(metrics.focusVisible, true, `${name}: tab focus-visible ring missing`);
    assert.equal(metrics.focusOutline, 'solid', `${name}: tab focus outline style missing`);
    if (width >= 840) assert.ok(Math.abs(metrics.navLeft - metrics.appLeft) <= 2, `${name}: vertical nav is not aligned to app edge`);
    assert.equal(metrics.requests[mode], 1, `${name}: expected ${mode} path was not used`);
    assert.equal(metrics.requests[mode === 'backend' ? 'fallback' : 'backend'], 0, `${name}: unexpected alternate path used`);
    console.log(`${name} metrics: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.chartTop < metrics.dailyTop, `${name}: chart must precede daily forecast`);
    assert.ok(Math.abs(metrics.chartWidth - metrics.contentWidth) <= 2, `${name}: chart must span content width`);
    assert.deepEqual(metrics.statOverflow, [], `${name}: stat chip overflow detected`);
    assert.ok(metrics.bodyScrollWidth <= metrics.viewportWidth + 1, `${name}: body horizontal overflow detected`);
    const image = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(image.data, 'base64'));
    cdp.close();
    return metrics;
  } finally {
    // Edge starts renderer children that survive child.kill(); end the whole tree before removing its profile.
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 7) throw error;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
  }
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverUrl = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  for (const [name, width] of [['compact-375', 375], ['medium-768', 768], ['expanded-1280', 1280]]) results.push({ name, width, ...(await capture(name, width, `${serverUrl}/`, serverUrl)) });
  server.close();
  for (const result of results) console.log(JSON.stringify(result));
  console.log(`PASS: ${mode} path; innerWidth, 24-point chart, seven fingerprints, 00:00–23:00 axis, full-width layout, and body overflow verified at 375 / 768 / 1280px`);
}

async function capture015c(spec, serverUrl) {
  const { name, width, tab, auth = 'logged-out', scenario = '' } = spec;
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'task015c-' + name + '-'));
  const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let cdp;
  try {
    await waitForJson('http://127.0.0.1:' + debugPort + '/json/version');
    const targets = await waitForJson('http://127.0.0.1:' + debugPort + '/json/list');
    const page = targets.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, name + ': no page target');
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
    if (scenario === 'map-modal') {
      await cdp.command('Network.enable');
      await cdp.command('Network.setBlockedURLs', { urls: ['*embed.windy.com/*'] });
    }
    const params = new URLSearchParams({ evidence: name, auth });
    if (scenario === 'chat-conversation') params.set('conversation', '1');
    await cdp.command('Page.navigate', { url: serverUrl + '/?' + params.toString() });
    await cdp.evaluate('new Promise(resolve => setTimeout(resolve, 1800))');
    if (tab) {
      await cdp.evaluate('document.querySelectorAll(".tab-btn").forEach(b => { if (b.dataset.tab === ' + JSON.stringify(tab) + ') b.click(); })');
      await cdp.evaluate('new Promise(resolve => setTimeout(resolve, 500))');
    }
    if (scenario === 'guide-empty') {
      await cdp.evaluate('(() => { document.querySelector("#guide-content").classList.add("hidden"); document.querySelector("#guide-empty").classList.remove("hidden"); document.querySelector("#guide-empty-title").textContent = "搜索城市后，这里会展示当地美食与旅行推荐"; document.querySelector("#guide-empty-detail").classList.add("hidden"); document.querySelector("#guide-fallback").classList.add("hidden"); })()');
    }
    if (scenario === 'guide-travel') {
      await cdp.evaluate('document.querySelector(".guide-tab[data-guide=travel]").click()');
      await cdp.evaluate('new Promise(resolve => setTimeout(resolve, 250))');
    }
    if (scenario === 'search-dropdown') {
      await cdp.evaluate('(() => { const input = document.querySelector("#search-input"); input.value = "北京"; input.dispatchEvent(new Event("input", { bubbles: true })); })()');
      await cdp.evaluate('new Promise(resolve => setTimeout(resolve, 700))');
    }
    if (scenario === 'map-modal') {
      await cdp.evaluate('document.querySelector("#map-btn").click()');
      await cdp.evaluate('new Promise(resolve => setTimeout(resolve, 500))');
    }
    if (scenario === 'chat-conversation') {
      await cdp.evaluate('document.querySelector(".chat-quick-btn").click()');
      await cdp.evaluate('new Promise(resolve => setTimeout(resolve, 450))');
    }
    const metrics = await cdp.evaluate('(() => { const active = document.querySelector(".tab-page.active"); const login = document.querySelector("#me-login-block"); const logged = document.querySelector("#me-logged-block"); const form = document.querySelector(".me-form"); const guideEmpty = document.querySelector("#guide-empty"); const guideContent = document.querySelector("#guide-content"); const chatList = document.querySelector(".chat-list"); const activeNav = document.querySelector(".tab-btn.active"); const visible = el => !!(el && el.getClientRects().length); return { innerWidth, bodyScrollWidth: document.body.scrollWidth, viewportWidth: innerWidth, activePage: active && active.id, loginVisible: visible(login), loggedVisible: visible(logged), formWidth: visible(form) ? form.getBoundingClientRect().width : null, loginCardWidth: visible(login) ? login.getBoundingClientRect().width : null, loggedCardWidth: visible(logged) ? logged.getBoundingClientRect().width : null, guideEmptyVisible: visible(guideEmpty), guideEmptyWidth: visible(guideEmpty) ? guideEmpty.getBoundingClientRect().width : null, guideContentVisible: visible(guideContent), guideContentWidth: visible(guideContent) ? guideContent.getBoundingClientRect().width : null, guideItems: document.querySelectorAll("#food-guide .guide-card, #travel-guide .guide-card").length, chatBubbles: document.querySelectorAll(".chat-bubble").length, chatListWidth: visible(chatList) ? chatList.getBoundingClientRect().width : null, chatInputWidth: visible(document.querySelector(".chat-input-row")) ? document.querySelector(".chat-input-row").getBoundingClientRect().width : null, activeNavRect: activeNav && (() => { const r = activeNav.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })(), activeNavIndicator: activeNav && (() => { const p = getComputedStyle(activeNav, "::before"); return { width: p.width, height: p.height, top: p.top, left: p.left, transform: p.transform }; })(), searchItems: document.querySelectorAll("#search-results .search-item").length, mapVisible: !document.querySelector("#map-modal").classList.contains("hidden") }; })()');
    assert.equal(metrics.innerWidth, width, name + ': innerWidth must equal ' + width);
    assert.ok(metrics.bodyScrollWidth <= width, name + ': document.body.scrollWidth exceeds viewport (' + metrics.bodyScrollWidth + ' > ' + width + ')');
    if (tab) assert.equal(metrics.activePage, 'tab-' + tab, name + ': requested tab was not active');
    if (scenario === 'guide-empty') assert.equal(metrics.guideEmptyVisible, true, name + ': guide empty state missing');
    if (tab === 'guide' && scenario !== 'guide-empty') {
      assert.equal(metrics.guideContentVisible, true, name + ': guide content missing');
      assert.ok(metrics.guideItems > 0, name + ': guide has no content cards');
    }
    if (scenario === 'search-dropdown') assert.ok(metrics.searchItems > 0, name + ': search dropdown has no results');
    if (scenario === 'map-modal') assert.equal(metrics.mapVisible, true, name + ': map modal did not open');
    if (scenario === 'chat-conversation') assert.ok(metrics.chatBubbles >= 3, name + ': conversation did not render');
    if (name === 'me-login-1280') assert.ok(metrics.formWidth >= 376 && metrics.formWidth <= 424, name + ': form width outside 400px ±24px');
    console.log(name + ' metrics: ' + JSON.stringify(metrics));
    if (name === 'me-login-1280') {
      const navImage = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(outputDir, 'nav-indicator-1280.png'), Buffer.from(navImage.data, 'base64'));
    }
    await cdp.evaluate('(() => { const nav = document.querySelector(".tab-bar"); if (nav) { nav.style.position = "static"; nav.style.transform = "none"; nav.style.margin = "var(--space-3) auto"; } })()');
    const image = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(outputDir, name + '.png'), Buffer.from(image.data, 'base64'));
    cdp.close();
    return { name, width, ...metrics };
  } finally {
    if (cdp) cdp.close();
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    for (let attempt = 0; attempt < 25; attempt++) {
      try { fs.rmSync(profile, { recursive: true, force: true }); break; }
      catch (error) {
        if (attempt === 24) console.warn('profile cleanup deferred: ' + profile);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
  }
}

async function main015c() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverUrl = 'http://127.0.0.1:' + server.address().port;
  const results = [];
  if (baselineMode) {
    results.push(await capture015c({ name: 'baseline-me-login-1280', width: 1280, tab: 'me' }, serverUrl));
  } else {
    const widths = [375, 768, 1280];
    const states = [
      { name: 'home', tab: 'home' },
      { name: 'chat', tab: 'chat' },
      { name: 'guide-food', tab: 'guide' },
      { name: 'me-login', tab: 'me', auth: 'logged-out' },
      { name: 'me-logged', tab: 'me', auth: 'logged-in' }
    ];
    for (const state of states) {
      for (const width of widths) {
        const name = state.name + '-' + width;
        results.push(await capture015c({ ...state, name, width, auth: state.auth || 'logged-out' }, serverUrl));
      }
    }
    for (const width of widths) results.push(await capture015c({ name: 'guide-travel-' + width, width, tab: 'guide', scenario: 'guide-travel' }, serverUrl));
    for (const width of widths) results.push(await capture015c({ name: 'guide-empty-' + width, width, tab: 'guide', scenario: 'guide-empty' }, serverUrl));
    results.push(await capture015c({ name: 'search-dropdown-1280', width: 1280, tab: 'home', scenario: 'search-dropdown' }, serverUrl));
    results.push(await capture015c({ name: 'map-modal-1280', width: 1280, tab: 'home', scenario: 'map-modal' }, serverUrl));
    results.push(await capture015c({ name: 'chat-conversation-1280', width: 1280, tab: 'chat', scenario: 'chat-conversation' }, serverUrl));
  }
  server.close();
  fs.writeFileSync(path.join(outputDir, 'metrics.json'), JSON.stringify(results, null, 2) + '\n');
  for (const result of results) console.log(JSON.stringify(result));
  const measured = results.find(result => result.name === 'me-login-1280' || result.name === 'baseline-me-login-1280');
  if (measured) console.log('FORM_WIDTH ' + measured.name + ': ' + measured.formWidth + 'px');
  console.log((baselineMode ? 'BASELINE' : 'PASS') + ': ' + results.length + ' screenshots; innerWidth and document.body.scrollWidth verified');
}

main015c().catch(error => { server.close(); console.error(error.stack || error); process.exitCode = 1; });
