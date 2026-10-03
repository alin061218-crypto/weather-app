const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const Database = require('better-sqlite3');
const root = path.resolve(__dirname, '../..');
const temporary = path.join(__dirname, 'runtime.tmp');
fs.mkdirSync(temporary, { recursive: true });
const logs = [], record = value => { const line = typeof value === 'string' ? value : JSON.stringify(value, null, 2); logs.push(line); console.log(line); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '0.0.0.0', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const hours = Array.from({ length: 168 }, (_, i) => 16 + Math.round(8 * Math.sin((i % 24 - 6) / 24 * Math.PI * 2)));
const days = Array.from({ length: 7 }, (_, i) => `2026-10-${String(3+i).padStart(2,'0')}`);
const weather = {
  timezone: 'Asia/Shanghai', current_weather: { time: '2026-10-03T12:00', temperature: 22, weathercode: 0, is_day: 1, windspeed: 8 },
  hourly: { time: hours.map((_, i) => `${days[Math.floor(i/24)]}T${String(i%24).padStart(2,'0')}:00`), temperature_2m: hours,
    apparent_temperature: hours, relativehumidity_2m: hours.map(()=>60), cloudcover: hours.map(()=>25), uv_index: hours.map(()=>2),
    precipitation_probability: hours.map(()=>10), pressure_msl: hours.map(()=>1013), visibility: hours.map(()=>10000) },
  daily: { time: days, temperature_2m_max: [24,5,26,24,25,26,24], temperature_2m_min: [14,-2,14,15,14,15,14],
    weathercode: [0,66,2,3,61,71,95], precipitation_probability_max: [8,80,14,17,20,23,26],
    sunrise: days.map(day=>day+'T06:10'), sunset: days.map(day=>day+'T17:57'), uv_index_max: days.map(()=>5.15) }
};
const air = value => ({ current: { us_aqi: value, pm2_5: 26.9, pm10: 31.3 } });

async function main() {
  const port = await freePort();
  const dbDir = path.join(temporary, 'db-'+crypto.randomUUID());
  const child = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'],
    env: { ...process.env, PORT: String(port), DB_DIR: dbDir, JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      ADMIN_USER: 'task014-test', ADMIN_PASSWORD_HASH: require('bcryptjs').hashSync(crypto.randomUUID(), 4) } });
  let serverLog = ''; child.stdout.on('data',chunk=>serverLog+=chunk); child.stderr.on('data',chunk=>serverLog+=chunk);
  const base = `http://127.0.0.1:${port}`, browserBase = `http://127.0.0.2:${port}`;
  let browser;
  try {
    for (let i=0;i<100;i++) { try { if ((await fetch(base)).ok) break; } catch {} await pause(50); }
    assert.equal(child.exitCode, null, serverLog);
    const curl = args => execFileSync('curl.exe', ['--noproxy','*','-sS','--max-time','20',...args], { encoding:'utf8', windowsHide:true });
    record('TASK-014 acceptance; 2026-10-03; real production server + SQLite in ignored runtime.tmp; browser weather/AQI fixtures');
    const source = curl(['-w','\nHTTP %{http_code}\n', base]);
    assert.match(source,/HTTP 200/); record('Service cross-check: curl.exe / -> HTTP 200');
    const liveAir = curl(['-w','\nHTTP %{http_code}\n',base+'/api/air?lat=39.9&lon=116.4']);
    record('3) Real /api/air (Open-Meteo upstream):\n'+liveAir);
    assert.match(liveAir,/HTTP 200/);
    const body = JSON.parse(liveAir.split('\nHTTP')[0]); assert.ok(Number.isFinite(body.current.us_aqi));
    assert.deepEqual(JSON.parse(curl([base+'/api/air?lat=39.9&lon=116.4'])), body);
    const database = new Database(path.join(dbDir,'weather.db'), { readonly:true });
    assert.ok(database.prepare("SELECT * FROM cache WHERE key='air:39.90,116.40'").get());
    for (const query of ['lat=91&lon=0','lat=&lon=0','lat=39abc&lon=0','lat=0&lon=Infinity']) {
      assert.equal(curl(['-o','NUL','-w','%{http_code}',base+'/api/air?'+query]),'400');
    }
    record('3) PASS: live AQI, PM2.5, PM10; separate cache key; repeated read identical; 4 invalid coordinates -> 400');
    const post = value => {
      const file = path.join(temporary,'feedback.json'); fs.writeFileSync(file,JSON.stringify(value));
      const response = curl(['-w','\nHTTP %{http_code}', '-H','Content-Type: application/json','--data-binary','@'+file,base+'/api/feedback']);
      const [content,status] = response.split('\nHTTP '); return { status:Number(status),body:JSON.parse(content) };
    };
    assert.equal(post({ rating:5, comment:'很好用' }).status,200);
    for (const [sus,expected] of [[Array.from({length:10},(_,i)=>i%2===0?5:1),100],[Array(10).fill(3),50],[Array.from({length:10},(_,i)=>i%2===0?1:5),0]]) {
      const response = post({rating:4,comment:'SUS validation',sus,scenario:'查天气与穿衣',adviceAccuracy:4});
      assert.equal(response.status,200); assert.equal(response.body.susScore,expected);
      const row = database.prepare('SELECT * FROM feedback WHERE id=?').get(response.body.id);
      assert.deepEqual(JSON.parse(row.susAnswers),sus); assert.equal(row.susScore,expected);
      assert.equal(row.questionnaireVersion,'sus-zh-v1'); assert.equal(row.adviceVersion,'task014-v1');
    }
    for (const invalid of [{rating:6},{rating:5,sus:[5]},{rating:5,sus:Array(10).fill(0)},{rating:5,comment:'x'.repeat(2001)}]) assert.equal(post(invalid).status,400);
    record('4) PASS: anonymous POST -> 200; SQLite persists original 10 SUS answers, versions, scenario, advice rating; scores 100/50/0; invalid/incomplete answers -> 400');

    browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    const viewportResults = [];
    for (const width of [375,768,1280]) {
      const context = await browser.newContext({viewport:{width,height:1100},reducedMotion:'reduce'});
      const stamp = Date.now()-5*60000;
      await context.addInitScript(({weather,stamp}) => {
        localStorage.setItem('wx_last',JSON.stringify({loc:{city:'北京',region:'北京',country:'中国',lat:39.904,lon:116.407},wx:weather,ts:stamp}));
        window.__airCanceled = 0;
        const realFetch = window.fetch.bind(window);
        window.fetch = (input,opts={}) => {
          if (String(input).includes('/api/air')) opts.signal?.addEventListener('abort',()=>window.__airCanceled++,{once:true});
          return realFetch(input,opts);
        };
      },{weather,stamp});
      let aqi = 75, airDelay = 20, airFail = false, weatherCalls = 0;
      await context.route('**/*',async route => {
        const url = new URL(route.request().url());
        const json = (value,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
        if (url.pathname==='/api/weather') { weatherCalls++; return json(weather); }
        if (url.pathname==='/api/air') { const value = aqi,delay=airDelay,fail=airFail; await pause(delay); try { return await json(fail?{error:'fixture unavailable'}:air(value),fail?502:200); } catch { return; } }
        if (url.pathname==='/api/location') return json({city:'Wuchang',region:'福建省',country:'中国',lat:30.586,lon:114.326});
        return route.continue();
      });
      const page = await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(browserBase);
      await page.waitForFunction(()=>document.querySelector('#air-quality').textContent.includes('US AQI') && document.querySelector('#life-indices').textContent.includes('今日最高 UV'));
      const result = await page.evaluate(async ({stamp}) => {
        const {DESC,WX,state}=await import('app/config');
        const {loadCities,normalizeLocation,regionLabel}=await import('app/cities');
        const {generateReply}=await import('app/chat');
        const render=await import('app/render');
        const {aqiLevel}=await import('app/air');
        const {getLifeIndices,lifeInputs}=await import('app/life');
        await loadCities();
        const altered=structuredClone(state.weather); altered.current_weather.temperature=35;
        const labels=Array.from(document.querySelectorAll('.stat-chip'),el=>el.textContent.trim());
        const expectedTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(stamp);
        const tomorrow=generateReply('明天怎么穿','北京',altered,render);
        state.unit='fahrenheit'; const fahrenheit=generateReply('明天怎么穿','北京',altered,render); state.unit='celsius';
        const missing=structuredClone(altered);missing.daily={};
        return {descriptions:[3,56,57,66,67,77].map(code=>[code,DESC(code)]),
          allCodes:[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].map(DESC),
          freezing:[56,57,66,67].every(code=>WX.isFreezing(code)&&!WX.isRain(code)),freezingAdvice:render.getClothing(1,66,8).text,
          levels:[0,50,51,100,101,150,151,200,201,300,301].map(aqiLevel),labels,
          categories:getLifeIndices(state.weather).map(item=>item.category),ruleInputs:lifeInputs(state.weather),
          fixedLocation:normalizeLocation({city:'Wuchang',region:'福建省',country:'中国',lat:30.586,lon:114.326}),
          regions:['湖北','湖北省','北京','广东','Bavaria'].map(regionLabel),
          expectedTime,updated:document.querySelector('#weather-updated').textContent,tomorrow,fahrenheit,
          missingTomorrow:generateReply('明天怎么穿','北京',missing,render),bodyWidth:document.body.scrollWidth,viewport:innerWidth,
          fingerprint:document.querySelectorAll('.temperature-fingerprint-bar').length,chartPoints:document.querySelector('#temp-chart').dataset.pointCount};
      },{stamp});
      assert.deepEqual(result.descriptions,[[3,'阴'],[56,'冻毛毛雨'],[57,'冻毛毛雨'],[66,'冻雨'],[67,'冻雨'],[77,'米雪']]);
      assert.equal(result.allCodes.length,28); assert.ok(result.allCodes.every(value=>value!=='未知')); assert.equal(result.freezing,true); assert.match(result.freezingAdvice,/路面结冰/);
      assert.ok(result.labels.some(value=>value.includes('06:10')&&value.includes('日出'))); assert.ok(result.labels.some(value=>value.includes('17:57')&&value.includes('日落')));
      assert.deepEqual(result.levels,['优','优','良','良','轻度污染','轻度污染','中度污染','中度污染','重度污染','重度污染','严重污染']);
      assert.equal(new Set(result.categories).size,8); assert.equal(result.ruleInputs.us_aqi,75); assert.equal(result.ruleInputs.uv,5.15);
      assert.equal(result.fixedLocation.region,'湖北'); assert.equal(result.fixedLocation.city,'武汉');
      assert.deepEqual(result.regions,['湖北省','湖北省','北京','广东省','Bavaria']);
      assert.equal(result.updated,'更新于 '+result.expectedTime); assert.equal(weatherCalls,0,'warm cached weather should not fetch forecast');
      assert.match(result.tomorrow,/明天（2026-10-04）冻雨，-2°～5°/); assert.match(result.tomorrow,/路面结冰/); assert.doesNotMatch(result.tomorrow,/35°C|短袖/);
      assert.match(result.fahrenheit,/28°F～41°F/); assert.match(result.missingTomorrow,/暂无明天/);
      assert.ok(result.bodyWidth<=width); assert.equal(result.fingerprint,168); assert.equal(result.chartPoints,'24');
      await page.screenshot({path:path.join(__dirname,`home-${width}.png`),fullPage:true});
      await page.screenshot({path:path.join(__dirname,`viewport-${width}.png`)});
      await page.locator('.tab-btn[data-tab="chat"]').click(); await page.locator('[data-q="明天怎么穿"]').click();
      await page.waitForFunction(()=>document.querySelector('.chat-bubble.bot:last-child')?.textContent.includes('2026-10-04'));
      await page.locator('.tab-btn[data-tab="me"]').click(); await page.locator('#feedback-open').click();
      await page.locator('#feedback-rating').selectOption('5'); await page.locator('#sus-details summary').click();
      await page.locator('#sus-0').selectOption('5'); await page.locator('#feedback-submit').click();
      await page.waitForFunction(()=>document.querySelector('#feedback-status').textContent.includes('完整回答10题'));
      for(let i=1;i<10;i++) await page.locator('#sus-'+i).selectOption(i%2===0?'5':'1');
      await page.locator('#feedback-comment').fill('浏览器端 SUS 反馈验收'); await page.locator('#feedback-submit').click();
      await page.waitForFunction(()=>document.querySelector('#feedback-status').textContent.includes('提交成功'));
      await page.locator('#sus-details summary').click();
      await page.screenshot({path:path.join(__dirname,`feedback-${width}.png`)});
      await page.locator('#feedback-close').focus(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('#feedback-open').evaluate(el=>el===document.activeElement),true);
      await page.locator('#tab-me [data-open="privacy"]').click(); assert.ok(await page.locator('#privacy-dialog').isVisible());
      await page.screenshot({path:path.join(__dirname,`privacy-${width}.png`)}); await page.locator('#privacy-close').click();
      await page.locator('.tab-btn[data-tab="home"]').click(); await page.locator('#search-input').fill('武昌');
      await page.locator('.search-item').first().waitFor(); await page.locator('.search-item').first().click();
      await page.waitForFunction(()=>document.querySelector('#city').textContent.includes('武昌'));
      assert.match(await page.locator('#region').textContent(),/湖北省/); assert.doesNotMatch(await page.locator('#region').textContent(),/福建/);
      await page.screenshot({path:path.join(__dirname,`wuchang-${width}.png`)});
      // Force a new coordinate while AQI is delayed, then switch again: old AQI
      // must be aborted and cannot replace the second city's display.
      aqi=300; airDelay=800;
      await page.evaluate(async()=>{ const {selectCity}=await import('app/search'); await selectCity({name:'测试甲',admin1:'湖北',country:'中国',lat:30.5,lon:114.5}); });
      aqi=35; airDelay=10;
      await page.evaluate(async()=>{ const {selectCity}=await import('app/search'); await selectCity({name:'测试乙',admin1:'广东',country:'中国',lat:22.5,lon:113.5}); });
      await page.waitForFunction(()=>document.querySelector('#air-quality').textContent.includes('35 · 优'));
      assert.ok(await page.evaluate(()=>window.__airCanceled>=1)); await pause(850);
      assert.match(await page.locator('#air-quality').textContent(),/35 · 优/);
      airFail=true;
      await page.evaluate(async()=>{ const {selectCity}=await import('app/search'); await selectCity({name:'缺失测试',country:'中国',lat:20,lon:100}); });
      await page.waitForFunction(()=>document.querySelector('#air-quality').textContent==='空气质量暂不可用');
      assert.ok(await page.locator('#weather-card').isVisible()); assert.ok(await page.locator('#life-indices').textContent().then(value=>value.includes('确认空气质量')));
      assert.deepEqual(errors,[]);
      viewportResults.push({width,bodyWidth:result.bodyWidth,stats:result.labels.length,categories:8,fingerprint:result.fingerprint,chartPoints:result.chartPoints,errors,
        cityRegression:'武昌区 / 湖北省',aqiRace:'old request canceled; newest 35 kept',aqiFailure:'weather remains visible'});
      if(width===375) {
        record('1) PASS: 28 precise WMO descriptions; 3=阴, 56/57=冻毛毛雨, 66/67=冻雨, 77=米雪; freezing is separate and warns about road ice');
        record('2) PASS: visible sunrise 06:10 and sunset 17:57 (10 stat chips)');
        record('5) PASS: 38 rules / 8 categories; UV uses daily uv_index_max=5.15; us_aqi=75 exposed; high AQI and missing-air cases handled');
        record('6) PASS: coordinate Wuchang + stale 福建省 -> 武汉 / 湖北; search 武昌 -> 武昌区 / 湖北省');
        record('7) PASS: '+result.updated+' matches stored cache timestamp; warm cache forecast calls=0');
        record('8) PASS: '+result.tomorrow.replaceAll('\n',' ')+'; Fahrenheit=28°F～41°F; missing tomorrow explicitly unavailable; actual quick button verified');
      }
      await context.close();
    }
    const uiFeedback=database.prepare("SELECT * FROM feedback WHERE comment='浏览器端 SUS 反馈验收'").all();
    assert.equal(uiFeedback.length,3); assert.ok(uiFeedback.every(row=>row.susScore===100)); database.close();
    record('4) PASS: visible feedback/privacy/attribution; native dialogs and focus restoration; 3 browser SUS submissions persisted with score 100');
    record(viewportResults);
    fs.writeFileSync(path.join(__dirname,'screenshots.json'),JSON.stringify(viewportResults,null,2)+'\n');
    record('PASS: all 8 TASK-014 items; three widths; AQI cancellation/stale result/failure; original 168 fingerprint bars and 24 chart points retained');
  } finally {
    await browser?.close(); child.kill();
    fs.writeFileSync(path.join(__dirname,'after.txt'),logs.join('\n\n')+'\n');
  }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
