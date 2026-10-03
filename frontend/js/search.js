import { API_BASE, F, DESC, state } from 'app/config';
import { $, QA, esc, toggle } from 'app/ui';
import { fetchJSON, geoSearch, getWeather } from 'app/api';
import { cityCache, loadCities } from 'app/cities';
import { renderWeather } from 'app/render';
import { readWeatherCache } from 'app/account';

export async function searchLocal(q) {
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

export async function doSearch(query) {
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

export function initSearch() {
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

export async function selectCity(c) {
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
