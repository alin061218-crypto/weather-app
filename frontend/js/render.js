import { F, DESC, WX, state } from 'app/config';
import { $, Q, QA, esc, toggle, switchTab } from 'app/ui';
import { icon, weatherIcon } from 'app/icons';
import { temperatureFingerprint, TempChart, setWeatherScene } from 'app/visuals';
import { cityCache, COUNTY, CITY_GUIDE, getCityGuide, resolveCity } from 'app/cities';
import { addFavButton } from 'app/account';

// ═══════════════════════════════════════════════════════════
//  新的建议函数（去掉 emoji，纯文字+SVG 风格）
// ═══════════════════════════════════════════════════════════
export function getClothing(t, code, w) {
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

export function getActivity(t, code, w, daytime) {
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

export function renderWeather(loc, wx) {
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
  if (Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) addFavButton();
}

export function renderAdvice(mid, tid, adv) {
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
export function renderCityGuide(name) {
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
