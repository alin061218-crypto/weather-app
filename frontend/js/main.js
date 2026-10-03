import { Atmosphere } from 'app/atmosphere';
import { icon, weatherIcon } from 'app/icons';
import { API_BASE, CACHE_MAX_AGE, DEFAULT_LOCATION, F, DESC, WX, state } from 'app/config';
import { $, Q, QA, esc, toggle, switchTab, initTabs, initTheme, applyTheme, initUnit } from 'app/ui';
import { fetchJSON, ipLocation, geoSearch, getWeather, getWeatherParams, initApi } from 'app/api';
import { cityCache, COUNTY, loadCities, CITY_GUIDE, getCityGuide, findCity, resolveCity, toPrefectureCity } from 'app/cities';
import { STD_SCALE, tempColor, temperatureFingerprint, TempChart, weatherScene, setWeatherScene } from 'app/visuals';
import { initAccount, checkAuth, updateMeUI, logout, refreshMePage, readLastWeather, sameLocation, readWeatherCache, addFavButton } from 'app/account';



async function searchLocal(q) {
  let s = q;
  for (const sf of ['自治县', '自治州', '县级市', '开发区', '新区', '特区', '地区', '街道', '市', '县', '区', '镇', '乡']) {
    if (s.endsWith(sf)) { s = s.slice(0, -sf.length); break; }
  }
  s = s.toLowerCase().trim();
  if (s.length < 2) return [];
  const scored = [];
  for (const city of await loadCities()) {
    const nl = city.name.toLowerCase();
    let sc = 0;
    if (nl === s) sc = 100;
    else if (nl.startsWith(s)) sc = 80;
    else if (s.startsWith(nl)) sc = 75;
    else if (nl.includes(s)) sc = 60;
    else if (s.includes(nl)) sc = 55;
    else if (s.length >= 2 && nl.length >= 2 && nl.slice(0, 2) === s.slice(0, 2)) sc = 40;
    if (sc > 0) scored.push({ ...city, country: '中国', _s: sc });
  }
  scored.sort((a, b) => b._s - a._s);
  return scored.slice(0, 5).map(({ _s, ...c }) => c);
}

async function doSearch(query) {
  const NOT_CITY = /(机场|航空|车站|高铁|服务区|收费站|隧道|大桥|加油|停车|公墓|陵园)/;
  const nameOK = n => n && !NOT_CITY.test(n) && n.length >= 2;
  let local = [];
  try { local = await searchLocal(query); } catch {}
  if (local.length > 0) return local;
  const qs = [query];
  if (!query.endsWith('市') && !query.endsWith('县') && !query.endsWith('区') && query.length <= 4) qs.push(query + '市');
  if (query.endsWith('市') || query.endsWith('县') || query.endsWith('区')) qs.push(query.slice(0, -1));
  const all = [];
  for (const q of qs) {
    const r = await geoSearch(q);
    for (const c of r) {
      if (!nameOK(c.name)) continue;
      let prio = 0;
      if (q.endsWith('市')) prio += 10;
      if (c.country === '中国') prio += 8;
      if (c.name === q) prio += 4;
      c._prio = prio;
      all.push(c);
    }
  }
  const seen = new Set();
  const uniq = [];
  for (const c of all) {
    const k = c.lat.toFixed(3) + ',' + c.lon.toFixed(3);
    if (!seen.has(k)) { seen.add(k); uniq.push(c); }
  }
  uniq.sort((a, b) => b._prio - a._prio);
  return uniq.slice(0, 5).map(({ _prio, ...c }) => c);
}

// ═══════════════════════════════════════════════════════════
//  新的建议函数（去掉 emoji，纯文字+SVG 风格）
// ═══════════════════════════════════════════════════════════
function getClothing(t, code, w) {
  const r = { text: '', tags: [] };
  if (t >= 35) { r.text = '天气炎热，建议轻薄透气的短袖短裤，注意防晒'; r.tags = ['短袖', '短裤', '遮阳帽', '防晒霜']; }
  else if (t >= 28) { r.text = '较热，短袖配短裤或薄长裤最舒适'; r.tags = ['短袖', '薄长裤', '遮阳帽']; }
  else if (t >= 22) { r.text = '体感舒适，T恤衬衫配长裤刚好'; r.tags = ['T恤', '衬衫', '长裤']; }
  else if (t >= 16) { r.text = '稍凉，建议长袖或薄卫衣'; r.tags = ['长袖', '卫衣', '薄外套']; }
  else if (t >= 10) { r.text = '偏凉，卫衣加夹克最合适'; r.tags = ['卫衣', '夹克', '长裤']; }
  else if (t >= 5) { r.text = '有点冷，毛衣配厚外套保暖'; r.tags = ['毛衣', '厚外套']; }
  else if (t >= 0) { r.text = '寒冷天气，厚外套加毛衣围巾'; r.tags = ['棉服', '毛衣', '围巾', '手套']; }
  else if (t >= -10) { r.text = '非常冷，羽绒服全副武装'; r.tags = ['羽绒服', '毛衣', '围巾', '手套']; }
  else { r.text = '极寒天气，最强保暖减少外出'; r.tags = ['厚羽绒服', '多层保暖', '围巾', '手套', '雪地靴']; }
  if (WX.isRain(code)) { r.text += '，记得带伞'; r.tags.push('雨伞'); }
  if (WX.isSnow(code)) { r.tags.push('防滑靴', '厚袜'); }
  if (WX.isStorm(code)) { r.text = '雷暴天气，尽量不要出门'; r.tags.push('雨伞', '雨衣', '远离树木'); }
  if (w > 25) r.tags.push('防风外套');
  r.tags = [...new Set(r.tags)];
  return r;
}

function getActivity(t, code, w, daytime) {
  const r = { text: '', tags: [] };
  if (WX.isStorm(code)) { r.text = '雷暴天气，适合待在室内'; r.tags = ['阅读', '电影', '室内健身', '桌游', '烹饪']; }
  else if (WX.isRain(code)) { r.text = '下雨天，室内活动更合适'; r.tags = ['室内健身', '瑜伽', '游泳', '攀岩', '电影', '逛商场']; }
  else if (WX.isSnow(code)) { r.text = '下雪了，可以玩雪但注意保暖'; r.tags = ['滑雪', '堆雪人', '室内健身', '温泉']; }
  else if (WX.isFog(code)) { r.text = '雾天能见度低，建议室内活动'; r.tags = ['室内健身', '瑜伽', '阅读', '电影']; }
  else if (t > 35) { r.text = '高温天气，避开中午时段外出'; r.tags = ['游泳', '水上乐园', '室内健身', '傍晚散步']; }
  else if (t >= 30) { r.text = '较热，适合水上和早晚运动'; r.tags = ['游泳', '骑行', '晨跑', '公园散步']; }
  else if (t >= 22) { r.text = '天气完美，尽情享受户外运动'; r.tags = ['跑步', '骑行', '徒步', '篮球', '足球', '羽毛球']; }
  else if (t >= 15) { r.text = '不错的天，适合户外运动'; r.tags = ['慢跑', '骑行', '徒步', '摄影']; }
  else if (t >= 5) { r.text = '偏凉，运动前充分热身'; r.tags = ['慢跑', '骑行', '徒步', '摄影']; }
  else { r.text = '较冷，户外运动注意防寒'; r.tags = ['慢跑', '室内健身']; }
  return r;
}

// ═══════════════════════════════════════════════════════════
//  核心渲染
// ═══════════════════════════════════════════════════════════
function renderWeather(loc, wx) {
  const cur = wx.current_weather;
  const h = wx.hourly;
  const d = wx.daily;
  const hourlyValues = Array.isArray(h?.temperature_2m) ? h.temperature_2m.map(Number).filter(Number.isFinite) : [];
  const fingerprintScale = hourlyValues.length ? { lo: Math.min(...hourlyValues), hi: Math.max(...hourlyValues) } : null;
  const name = resolveCity(loc);
  const isDay = cur.is_day === 1;
  setWeatherScene(cur.weathercode, isDay);

  // 城市和地区
  $('city').textContent = name;
  $('region').textContent = [loc.region || loc.admin1, loc.country, loc.coordinateSource].filter(Boolean).join('，') || '';

  // 天气图标（SVG 替换 emoji）
  $('weather-icon').innerHTML = weatherIcon(cur.weathercode, isDay);

  // 温度
  $('temperature').textContent = state.unit === 'fahrenheit'
    ? F.c2f(cur.temperature) + '°F'
    : Math.round(cur.temperature) + '°';
  $('temperature').setAttribute('aria-label', `当前 ${$('temperature').textContent}，切换到${state.unit === 'celsius' ? '华氏' : '摄氏'}温度`);

  // 描述
  $('weather-desc').textContent = DESC(cur.weathercode);

  // 关键数据横向指标带（SVG 图标替换 emoji）
  const statsEl = $('stats-scroll');
  if (statsEl) {
    const items = [];
    if (h.apparent_temperature?.[0] != null) items.push([icon.stat.feelsLike(), '体感', F.ftemp(h.apparent_temperature[0], state.unit)]);
    if (h.relativehumidity_2m?.[0] != null) items.push([icon.stat.humidity(), '湿度', h.relativehumidity_2m[0] + '%']);
    items.push([icon.stat.wind(), '风速', cur.windspeed + ' km/h']);
    if (h.uv_index?.[0] != null) {
      const uv = h.uv_index[0];
      const lvl = uv <= 2 ? '低' : uv <= 5 ? '中' : uv <= 7 ? '高' : uv <= 10 ? '很高' : '极高';
      items.push([icon.stat.uv(), '紫外线', uv + ' ' + lvl]);
    }
    if (h.precipitation_probability?.[0] != null) items.push([icon.stat.rainProb(), '降雨', h.precipitation_probability[0] + '%']);
    if (h.pressure_msl?.[0] != null) items.push([icon.stat.pressure(), '气压', Math.round(h.pressure_msl[0]) + ' hPa']);
    if (h.cloudcover?.[0] != null) items.push([icon.stat.cloud(), '云量', h.cloudcover[0] + '%']);
    if (h.visibility?.[0] != null) items.push([icon.stat.visibility(), '能见度', (h.visibility[0] / 1000).toFixed(1) + ' km']);

    statsEl.innerHTML = items.map(([ico, label, value]) =>
      `<div class="stat-chip"><span class="stat-chip-icon">${ico}</span><span class="stat-chip-value">${value}</span><span class="stat-chip-label">${label}</span></div>`
    ).join('');
  }

  // 7天预报 — 纯文字：温度在右侧，清爽无杂
  const dailyList = $('daily-list');
  if (dailyList && d?.time) {
    dailyList.innerHTML = '';
    for (let i = 0; i < d.time.length; i++) {
      const lo = Math.round(d.temperature_2m_min[i]);
      const hi = Math.round(d.temperature_2m_max[i]);
      const precip = d.precipitation_probability_max?.[i] || 0;

      const fingerprint = temperatureFingerprint(h.temperature_2m?.slice(i * 24, i * 24 + 24), state.unit, fingerprintScale);
      const dayDiv = document.createElement('button');
      dayDiv.type = 'button';
      dayDiv.className = 'day-row';
      dayDiv.setAttribute('aria-expanded', 'false');
      dayDiv.setAttribute('aria-controls', `day-detail-${i}`);
      dayDiv.innerHTML = `
        <span class="day-name">${F.day(d.time[i])}</span>
        <span class="day-icon-wrap">${weatherIcon(d.weathercode[i], true)}</span>
        <span class="day-desc-text">${DESC(d.weathercode[i])}</span>
        ${fingerprint || '<span class="temperature-fingerprint-fallback">温度指纹暂无</span>'}
        <span class="day-temps-right">
          <span class="day-temp-hi">${F.ftemp(hi, state.unit)}</span>
          <span class="day-temp-sep">/</span>
          <span class="day-temp-lo">${F.ftemp(lo, state.unit)}</span>
          ${precip > 0 ? `<span class="day-precip"> ${precip}%</span>` : ''}
        </span>
      `;
      dailyList.appendChild(dayDiv);
      const detail = document.createElement('p');
      detail.id = `day-detail-${i}`;
      detail.className = 'day-detail hidden';
      detail.textContent = `${d.time[i]} ${DESC(d.weathercode[i])}，最低 ${F.ftemp(lo, state.unit)}，最高 ${F.ftemp(hi, state.unit)}，降雨概率 ${precip}%。`;
      dayDiv.addEventListener('click', () => {
        const expanded = dayDiv.getAttribute('aria-expanded') !== 'true';
        dayDiv.setAttribute('aria-expanded', String(expanded));
        detail.classList.toggle('hidden', !expanded);
      });
      dailyList.appendChild(detail);
    }
  }

  // 建议
  const code = cur.weathercode;
  const temp = cur.temperature;
  const wind = cur.windspeed;
  const daytime = isDay;

  renderAdvice('clothing-main', 'clothing-tags', getClothing(temp, code, wind));
  renderAdvice('activity-main', 'activity-tags', getActivity(temp, code, wind, daytime));
  renderCityGuide(name);

  // 3D 背景切换
  if (state.atmosphere) state.atmosphere.setWeather(code, daytime);

  toggle('weather-card');

  // 温度趋势图
  if (h.time?.length > 0) {
    if (!state.chart) state.chart = new TempChart($('temp-chart'));
    requestAnimationFrame(() => state.chart.update(h, state.unit));
  }
}

function renderAdvice(mid, tid, adv) {
  const mel = $(mid);
  const tel = $(tid);
  if (mel) mel.textContent = adv.text;
  if (tel) {
    tel.innerHTML = adv.tags.map(t => `<button type="button" class="advice-chip" aria-label="咨询${esc(t)}建议">${esc(t)}</button>`).join('');
    QA('.advice-chip', tel).forEach(btn => btn.addEventListener('click', () => {
      switchTab('chat');
      $('chat-input').value = `${mid === 'clothing-main' ? '怎么穿' : '运动出门'}：${btn.textContent}`;
      $('chat-input').focus();
    }));
  }
}

// 城市指南（纯文字/圆点装饰，无 emoji）
function renderCityGuide(name) {
  const cleanName = String(name || '').replace(/[市州县区]$/, '');
  const directGuide = CITY_GUIDE[name] || CITY_GUIDE[cleanName];
  const g = directGuide || getCityGuide(name);
  const empty = $('guide-empty');
  const content = $('guide-content');
  const emptyTitle = $('guide-empty-title');
  const emptyDetail = $('guide-empty-detail');
  const fallbackEl = $('guide-fallback');
  if (!directGuide) {
    if (empty) empty.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    const selected = Boolean(state.city && name);
    if (emptyTitle) emptyTitle.textContent = selected ? `${name} 的指南正在补充中` : '搜索城市后，这里会展示当地美食与旅行推荐';
    if (emptyDetail) {
      emptyDetail.textContent = selected ? '本地指南尚未收录，先看看所属地级市的推荐。' : '';
      emptyDetail.classList.toggle('hidden', !selected);
    }
    const record = (cityCache || []).find(city => city.name === name || city.name.replace(/[市州县区]$/, '') === String(name).replace(/[市州县区]$/, ''));
    const parent = record?.parent || COUNTY[name] || COUNTY[cleanName];
    const parentGuide = parent && CITY_GUIDE[parent];
    if (fallbackEl) {
      fallbackEl.textContent = parentGuide ? `所属地级市：${parent}。推荐：${parentGuide.travel.split(',').slice(0, 3).join('、')}` : '';
      fallbackEl.classList.toggle('hidden', !parentGuide);
    }
    return;
  }
  if (empty) empty.classList.add('hidden');
  if (content) content.classList.remove('hidden');
  if (fallbackEl) fallbackEl.classList.add('hidden');

  const foodEl = $('food-guide');
  const travelEl = $('travel-guide');

  if (foodEl) foodEl.innerHTML = g.food.split(',').map(f =>
    `<div class="guide-card"><span class="guide-card-marker"></span><span class="guide-card-text">${f.trim()}</span></div>`
  ).join('');

  if (travelEl) travelEl.innerHTML = g.travel.split(',').map(t =>
    `<div class="guide-card"><span class="guide-card-marker"></span><span class="guide-card-text">${t.trim()}</span></div>`
  ).join('');

  // 重置 guide tab
  QA('.guide-tab').forEach(btn => btn.classList.remove('active'));
  const foodTab = Q('.guide-tab[data-guide="food"]');
  if (foodTab) foodTab.classList.add('active');
  if (foodEl) foodEl.classList.remove('hidden');
  if (travelEl) travelEl.classList.add('hidden');
}

// Guide tab 切换事件
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('guide-tab')) {
    QA('.guide-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    const foodEl = $('food-guide');
    const travelEl = $('travel-guide');
    if (foodEl) foodEl.classList.toggle('hidden', e.target.dataset.guide !== 'food');
    if (travelEl) travelEl.classList.toggle('hidden', e.target.dataset.guide !== 'travel');
  }
});

// ═══════════════════════════════════════════════════════════
//  搜索 & 主流程
// ═══════════════════════════════════════════════════════════
async function discoverLocation(citiesPromise) {
  const loc = await ipLocation();
  await citiesPromise;
  if (loc) {
    const cn = toPrefectureCity(loc.city);
    return { ...loc, city: cn || loc.city };
  }
  try {
    const pos = await new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('浏览器不支持定位'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 300000 });
    });
    const name = findCity(pos.coords.latitude, pos.coords.longitude);
    return { city: name || '当前位置', region: '', country: '中国', lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}

async function init() {
  const generation = ++state.weatherGeneration;
  toggle('loading');
  const last = readLastWeather();
  const hasLastLocation = !!last?.loc;
  let activeLocation = hasLastLocation ? last.loc : DEFAULT_LOCATION;
  let displayed = false;

  // City data and location discovery start together. A saved city skips location entirely.
  const citiesPromise = loadCities().catch(() => []);
  const locationPromise = hasLastLocation ? Promise.resolve(null) : discoverLocation(citiesPromise);

  if (last?.wx && Date.now() - last.ts >= 0 && Date.now() - last.ts <= CACHE_MAX_AGE) {
    state.city = activeLocation;
    state.weather = last.wx;
    renderWeather(activeLocation, last.wx);
    displayed = true;
  }

  const showError = error => {
    if (generation !== state.weatherGeneration || displayed) return;
    $('error-msg').textContent = error?.message || '天气数据获取失败';
    toggle('error-card');
  };

  const loadWeather = async loc => {
    try {
      const cachedTimestamp = readWeatherCache(loc.lat, loc.lon)?.ts;
      const wx = await getWeather(loc.lat, loc.lon);
      if (generation !== state.weatherGeneration || !sameLocation(loc, activeLocation)) return;
      state.city = loc;
      state.weather = wx;
      localStorage.setItem('wx_last', JSON.stringify({ loc, wx, ts: cachedTimestamp ?? Date.now() }));
      renderWeather(loc, wx);
      displayed = true;
    } catch (error) {
      if (sameLocation(loc, activeLocation)) showError(error);
    }
  };

  // Fetch the saved/default city's weather immediately; location is only a background refinement.
  void loadWeather(activeLocation);

  if (!hasLastLocation) {
    locationPromise.then(loc => {
      if (!loc || generation !== state.weatherGeneration || sameLocation(loc, activeLocation)) return;
      activeLocation = loc;
      void loadWeather(loc);
    });
  }
}

function initSearch() {
  const inp = $('search-input');
  const clr = $('search-clear');
  const res = $('search-results');
  const recentEl = $('recent-list');
  const rsec = $('recent-section');
  let last = [];
  let searchGeneration = 0;

  function showSearchMessage(message) {
    res.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'search-item search-message';
    li.textContent = message;
    res.appendChild(li);
    res.classList.remove('hidden');
  }

  const search = F.debounce(async (q, generation) => {
    if (generation !== searchGeneration) return;
    if (q.length < 2) { res.classList.add('hidden'); last = []; return; }
    let found;
    try { found = await doSearch(q); }
    catch (e) {
      if (generation !== searchGeneration) return;
      last = [];
      showSearchMessage(e.message || '搜索失败');
      return;
    }
    if (generation !== searchGeneration) return;
    last = found;
    res.innerHTML = '';
    res.classList.remove('hidden');
    if (!last.length) { showSearchMessage('未找到相关城市，请检查名称'); return; }
    for (const c of last) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-item';
      button.innerHTML = `<span class="si-name">${esc(c.name)}</span><span class="si-meta">${esc([c.admin1, c.country, c.coordinateSource].filter(Boolean).join('，'))}</span>`;
      button.addEventListener('click', () => {
        searchGeneration++;
        selectCity(c);
        res.classList.add('hidden');
        inp.focus();
      });
      li.appendChild(button);
      res.appendChild(li);
    }
  }, 250);

  inp.addEventListener('input', () => {
    const generation = ++searchGeneration;
    last = [];
    clr.classList.toggle('hidden', !inp.value);
    if (inp.value.trim().length < 2) res.classList.add('hidden');
    search(inp.value.trim(), generation);
  });

  inp.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const generation = ++searchGeneration;
    const q = inp.value.trim();
    if (!q) return;
    if (last.length) { selectCity(last[0]); res.classList.add('hidden'); }
    else {
      try {
        const r = await doSearch(q);
        if (generation !== searchGeneration) return;
        if (r.length) selectCity(r[0]);
        else showSearchMessage('未找到相关城市，请检查名称');
      } catch (err) {
        if (generation === searchGeneration) showSearchMessage(err.message || '搜索失败');
      }
    }
  });

  clr.addEventListener('click', () => {
    searchGeneration++;
    last = [];
    inp.value = '';
    clr.classList.add('hidden');
    res.classList.add('hidden');
    inp.focus();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) res.classList.add('hidden');
  });

  function loadRecent() { try { return JSON.parse(localStorage.getItem('wx_recent') || '[]'); } catch { return []; } }
  function renderRecent() {
    const rc = loadRecent();
    if (!rc.length) { rsec.classList.add('hidden'); return; }
    rsec.classList.remove('hidden');
    recentEl.innerHTML = rc.map(c => `<button type="button" class="recent-chip">${esc(c.name)}</button>`).join('');
    QA('.recent-chip', recentEl).forEach((el, i) => {
      el.addEventListener('click', () => selectCity(rc[i]));
    });
  }
  $('clear-recent').addEventListener('click', () => {
    localStorage.removeItem('wx_recent');
    renderRecent();
  });
  renderRecent();
}

async function selectCity(c) {
  const generation = ++state.weatherGeneration;
  const inp = $('search-input');
  inp.value = c.name;
  $('search-clear').classList.remove('hidden');
  const canonical = (cityCache || []).find(city => city.name === c.name && city.admin1 === c.admin1)
    || (cityCache || []).find(city => city.name === c.name);
  if (canonical) c = { ...c, ...canonical };
  const coordinateSource = c.coordinateSource || '';

  try {
    const recent = JSON.parse(localStorage.getItem('wx_recent') || '[]');
    const filtered = recent.filter(x => !(x.name === c.name && x.admin1 === c.admin1));
    filtered.unshift({ name: c.name, admin1: c.admin1, country: c.country, lat: c.lat, lon: c.lon, coordinateSource });
    localStorage.setItem('wx_recent', JSON.stringify(filtered.slice(0, 5)));
  } catch {}

  const loc = { city: c.name, region: c.admin1 || '', country: c.country || '', lat: c.lat, lon: c.lon, coordinateSource };
  try {
    const cachedTimestamp = readWeatherCache(c.lat, c.lon)?.ts;
    const wx = await getWeather(c.lat, c.lon);
    if (generation !== state.weatherGeneration) return;
    state.city = loc;
    state.weather = wx;
    localStorage.setItem('wx_last', JSON.stringify({ loc, wx, ts: cachedTimestamp ?? Date.now() }));
    renderWeather(loc, wx);
    toggle('weather-card');
    if (state.authToken) {
      fetchJSON(`${API_BASE}/api/history`, 3000, {
        method: 'POST',
        body: JSON.stringify({ city: c.name, lat: c.lat, lon: c.lon, weather: DESC(wx.current_weather?.weathercode || 0) })
      });
    }
  } catch (e) {
    if (generation !== state.weatherGeneration) return;
    $('error-msg').textContent = e.message;
    toggle('error-card');
  }
}

// 拦截 renderWeather 加收藏按钮
const _origRW = renderWeather;
renderWeather = function (loc, wx) {
  _origRW(loc, wx);
  if (Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) addFavButton();
};

// ═══════════════════════════════════════════════════════════
//  AI 出行建议
// ═══════════════════════════════════════════════════════════
function generateReply(question, city, wx) {
  const q = question.toLowerCase().trim();
  if (!city || !wx) return '请先在天气页面搜索一个城市，我才能帮你分析哦。';

  const cur = wx.current_weather;
  const code = cur.weathercode;
  const temp = cur.temperature;
  const wind = cur.windspeed;
  const h = wx.hourly;
  const d = wx.daily;
  const desc = DESC(code);
  const uv = h.uv_index?.[0] || 0;
  const humidity = h.relativehumidity_2m?.[0];
  const precip = h.precipitation_probability?.[0] || 0;

  if (q.includes('出门') || (q.includes('适合') && q.includes('出去'))) {
    if (WX.isStorm(code)) return `${city}当前有雷暴，绝对不建议出门！温度 ${temp}°C，风速 ${wind} km/h。建议待在室内，远离门窗。`;
    if (WX.isRain(code)) return `${city}正在下雨，温度 ${temp}°C。如果要出门，记得带伞、穿防水鞋。降雨概率 ${precip}%。`;
    if (WX.isSnow(code)) return `${city}正在下雪，温度 ${temp}°C。出门注意防滑保暖。如果风不大雪不重，冬日出行也别有趣味。`;
    if (temp > 35) return `${city}当前高温 ${temp}°C，不太适合长时间外出！紫外线强度 ${uv}。建议避开 11:00–15:00，等傍晚再出门。`;
    if (temp >= 22 && temp <= 30) return `${city}天气很棒！温度 ${temp}°C，${desc}，非常适合出门活动。`;
    if (temp >= 5 && temp < 22) return `${city}温度 ${temp}°C，${desc}。可以出门，建议根据温度适当添衣。`;
    if (temp < 5) return `${city}比较冷，温度 ${temp}°C。出门记得穿暖和，戴好围巾手套。`;
    return `当前${city}温度 ${temp}°C，${desc}，综合来看出门问题不大。`;
  }

  if (q.includes('伞') || q.includes('雨伞') || q.includes('带伞')) {
    if (WX.isRain(code) || precip > 30) return `${city}当前${desc}，降雨概率 ${precip}%，建议带伞。未来几天最高降雨概率 ${Math.max(...(d.precipitation_probability_max || [0]))}%。`;
    if (WX.isStorm(code)) return `${city}有雷暴，必须带伞！而且最好穿防水鞋和衣服。`;
    return `${city}当前${desc}，降雨概率仅 ${precip}%，不太需要带伞。`;
  }

  if (q.includes('穿') || q.includes('衣服')) {
    const cloth = getClothing(temp, code, wind);
    return `${city}温度 ${temp}°C，${desc}。\n\n建议：${cloth.text}\n推荐搭配：${cloth.tags.join('、')}\n${wind > 20 ? `风较大（${wind} km/h），注意防风。` : ''}${WX.isRain(code) ? '记得带伞！' : ''}`;
  }

  if (q.includes('明天') || q.includes('未来') || q.includes('预报') || q.includes('趋势')) {
    if (!d || !d.time) return '暂无预报数据。';
    let reply = `${city} 未来趋势\n\n`;
    for (let i = 0; i < Math.min(5, d.time.length); i++) {
      const hi = d.temperature_2m_max[i], lo = d.temperature_2m_min[i], dp = d.precipitation_probability_max?.[i] || 0;
      reply += `${F.day(d.time[i])}：${DESC(d.weathercode[i])} ${Math.round(lo)}°~${Math.round(hi)}° ${dp > 0 ? dp + '%' : ''}\n`;
    }
    return reply;
  }

  if (q.includes('运动') || q.includes('跑步') || q.includes('锻炼') || q.includes('健身')) {
    const act = getActivity(temp, code, wind, cur.is_day === 1);
    return `${city}温度 ${temp}°C，${desc}。\n\n${act.text}\n推荐：${act.tags.join('、')}`;
  }

  // 默认回复
  return `当前：${city}\n温度：${temp}°C\n天气：${desc}\n湿度：${humidity}%\n风速：${wind} km/h\n紫外线：${uv}\n降雨概率：${precip}%\n\n可以问我：今天适合出门吗、需要带伞吗、明天怎么穿、未来几天趋势`;
}

function initChat() {
  const input = $('chat-input');
  const sendBtn = $('chat-send');
  const list = $('chat-list');

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    const avatarIcon = role === 'bot'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    div.innerHTML = `<div class="chat-avatar">${avatarIcon}</div><div class="chat-text">${esc(text).replace(/\n/g, '<br>')}</div>`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  }

  function handleSend() {
    const q = input.value.trim();
    if (!q) return;
    addMsg('user', q);
    const reply = generateReply(q, state.city?.city, state.weather);
    setTimeout(() => addMsg('bot', reply), 300);
    input.value = '';
    try {
      const hist = JSON.parse(localStorage.getItem('wx_chat') || '[]');
      hist.push({ role: 'user', text: q, time: Date.now() }, { role: 'bot', text: reply, time: Date.now() });
      if (hist.length > 40) hist.splice(0, hist.length - 40);
      localStorage.setItem('wx_chat', JSON.stringify(hist));
    } catch {}
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });

  QA('.chat-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q;
      addMsg('user', q);
      const reply = generateReply(q, state.city?.city, state.weather);
      setTimeout(() => addMsg('bot', reply), 300);
    });
  });

  // 恢复聊天
  try {
    const hist = JSON.parse(localStorage.getItem('wx_chat') || '[]');
    if (hist.length) {
      const firstBot = Q('.chat-bubble.bot', list);
      if (firstBot) firstBot.remove();
      for (const m of hist.slice(-10)) addMsg(m.role, m.text);
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════
//  天气地图
// ═══════════════════════════════════════════════════════════
function initMap() {
  const modal = $('map-modal');
  const container = $('map-container');
  const btn = $('map-btn');
  const frame = document.createElement('iframe');
  frame.title = '天气地图';
  frame.allow = 'geolocation';
  frame.style.cssText = 'width:100%;height:100%;border:none;position:absolute;top:0;left:0';
  frame.src = 'about:blank';
  container.style.position = 'relative';
  container.style.minHeight = '60vh';
  container.appendChild(frame);

  btn.addEventListener('click', () => {
    const lat = state.city?.lat ?? 39.9;
    const lon = state.city?.lon ?? 116.4;
    const url = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=7&overlay=wind&product=ecmwf&lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&detail=true&message=true`;
    if (frame.getAttribute('src') !== url) frame.src = url;
    modal.classList.remove('hidden');
    modal.showModal();
    $('map-close').focus();
  });

  const closeMap = () => modal.close();
  modal.addEventListener('close', () => {
    modal.classList.add('hidden');
    btn.focus();
  });
  modal.addEventListener('cancel', (e) => { e.preventDefault(); closeMap(); });
  $('map-close').addEventListener('click', closeMap);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeMap(); });
}

// ═══════════════════════════════════════════════════════════
//  启动
// ═══════════════════════════════════════════════════════════
initApi(readWeatherCache);
initTabs({ refreshMePage, renderCityGuide });
initAccount(selectCity);
$('retry-btn').addEventListener('click', init);

document.addEventListener('DOMContentLoaded', () => {
  // Three.js 3D 大气层
  const atmContainer = $('atmosphere');
  if (atmContainer) {
    state.atmosphere = new Atmosphere(atmContainer);
  }

  initSearch();
  initTheme();
  initUnit(renderWeather);
  initMap();
  initChat();
  init();
  checkAuth();
  updateMeUI();
});
