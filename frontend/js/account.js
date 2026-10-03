import { API_BASE, CACHE_MAX_AGE, state } from 'app/config';

import { $, QA, esc, switchTab } from 'app/ui';

import { fetchJSON } from 'app/api';

let currentUser = null;

let favoritesCache = null;
let favBusy = false;

export function readLastWeather() {
  try {
    const cached = JSON.parse(localStorage.getItem('wx_last') || 'null');
    const lat = Number(cached?.loc?.lat), lon = Number(cached?.loc?.lon);
    if (!cached?.loc || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      ...cached,
      loc: { ...cached.loc, lat, lon },
      ts: Number(cached.ts)
    };
  } catch {
    return null;
  }
}

export function sameLocation(a, b) {
  return !!a && !!b && Math.abs(Number(a.lat) - Number(b.lat)) < 0.01 && Math.abs(Number(a.lon) - Number(b.lon)) < 0.01;
}

export function readWeatherCache(lat, lon) {
  const cached = readLastWeather();
  const age = Date.now() - cached?.ts;
  return cached?.wx?.current_weather && age >= 0 && age < CACHE_MAX_AGE
    && cached.loc.lat.toFixed(2) === Number(lat).toFixed(2) && cached.loc.lon.toFixed(2) === Number(lon).toFixed(2) ? cached : null;
}



// ═══════════════════════════════════════════════════════════
//  用户认证
// ═══════════════════════════════════════════════════════════
export function checkAuth() {
  state.authToken = localStorage.getItem('wx_token') || '';
  if (state.authToken) {
    fetchJSON(`${API_BASE}/api/me`, 3000).then(d => {
      if (d && d.user) { currentUser = d.user; updateMeUI(); loadMeFavorites(); }
      else if (d?.status === 401) logout();
    });
  }
}

export function updateMeUI() {
  if (currentUser) {
    $('me-login-block').classList.add('hidden');
    $('me-logged-block').classList.remove('hidden');
    $('me-username').textContent = currentUser.username;
  } else {
    $('me-login-block').classList.remove('hidden');
    $('me-logged-block').classList.add('hidden');
  }
  updateStarUI();
}

export function logout() {
  localStorage.removeItem('wx_token');
  state.authToken = '';
  currentUser = null;
  favoritesCache = null;
  updateMeUI();
  updateStarUI();
}

export function refreshMePage() {
  if (currentUser) { loadMeFavorites(); loadMeHistory(); }
}

// 登录/注册
let authMode = 'login';

let selectCity;
export function initAccount(onSelectCity) {
  selectCity = onSelectCity;
$('me-toggle').addEventListener('click', (e) => {
  e.preventDefault();
  authMode = authMode === 'login' ? 'register' : 'login';
  $('me-submit').textContent = authMode === 'login' ? '登 录' : '注 册';
  $('me-msg').textContent = '';
});

$('me-submit').addEventListener('click', async () => {
  const u = $('me-user').value.trim();
  const p = $('me-pass').value.trim();
  if (!u || !p) { $('me-msg').textContent = '请填写用户名和密码'; return; }
  if (p.length < 6) { $('me-msg').textContent = '密码至少 6 位'; return; }
  const url = `${API_BASE}${authMode === 'login' ? '/api/login' : '/api/register'}`;
  const d = await fetchJSON(url, 5000, { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
  if (d && d.token) {
    localStorage.setItem('wx_token', d.token);
    state.authToken = d.token;
    currentUser = d.user;
    updateMeUI();
    $('me-user').value = '';
    $('me-pass').value = '';
    $('me-msg').textContent = '';
    refreshMePage();
  } else {
    $('me-msg').textContent = (d && d.error) || '操作失败';
  }
});

$('me-logout').addEventListener('click', () => { logout(); });
$('me-clear-hist').addEventListener('click', async () => {
  if (!confirm('确认清空所有搜索历史？')) return;
  await fetchJSON(`${API_BASE}/api/history`, 3000, { method: 'DELETE' });
  loadMeHistory();
});
}

export async function loadMeFavorites() {
  if (!currentUser) { favoritesCache = null; setMeListState('fav', '请先登录'); return; }
  const user = currentUser;
  const d = await fetchJSON(`${API_BASE}/api/favorites`);
  if (currentUser !== user) return;
  if (!Array.isArray(d)) { setMeListState('fav', '加载失败'); return; }
  favoritesCache = d;
  updateStarUI();
  renderMeFavorites(d);
}

function setMeListState(kind, message = '') {
  const empty = $(`me-${kind}-empty`);
  const list = $(`me-${kind}-list`);
  empty.textContent = message;
  empty.classList.toggle('hidden', !message);
  list.classList.toggle('hidden', !!message);
}

export function renderMeFavorites(d) {
  const list = $('me-fav-list');
  setMeListState('fav', d.length ? '' : '暂无收藏，在天气页搜索城市后点击星标收藏');
  list.innerHTML = d.map(f => `<div class="fav-item"><button type="button" class="fav-item-click" data-lat="${esc(f.lat)}" data-lon="${esc(f.lon)}" data-name="${esc(f.name)}" data-admin1="${esc(f.admin1)}" data-country="${esc(f.country)}"><span class="fav-item-name">${esc(f.name)}</span><span class="fav-item-meta">${esc(f.admin1)} ${esc(f.country)}</span></button><button class="fav-item-del" aria-label="取消收藏${esc(f.name)}" data-id="${esc(f.id)}">&times;</button></div>`).join('');
  QA('.fav-item-click', list).forEach(el => {
    el.addEventListener('click', () => {
      selectCity({ name: el.dataset.name, admin1: el.dataset.admin1, country: el.dataset.country, lat: parseFloat(el.dataset.lat), lon: parseFloat(el.dataset.lon) });
      switchTab('home');
    });
  });
  QA('.fav-item-del', list).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await fetchJSON(`${API_BASE}/api/favorites/${btn.dataset.id}`, 3000, { method: 'DELETE' });
      if (result && !result.error && Array.isArray(favoritesCache)) {
        favoritesCache = favoritesCache.filter(f => String(f.id) !== btn.dataset.id);
        renderMeFavorites(favoritesCache);
        updateStarUI();
      }
    });
  });
}

export async function loadMeHistory() {
  const list = $('me-hist-list');
  if (!currentUser) { setMeListState('hist', '请先登录'); return; }
  const d = await fetchJSON(`${API_BASE}/api/history`);
  if (!d || d.error) { setMeListState('hist', '加载失败'); return; }
  setMeListState('hist', d.length ? '' : '暂无记录');
  list.innerHTML = d.map(h => `<div class="fav-item"><button type="button" class="fav-item-click" data-lat="${esc(h.lat)}" data-lon="${esc(h.lon)}" data-name="${esc(h.city)}"><span class="fav-item-name">${esc(h.city)}</span><span class="fav-item-meta">${esc(h.weather)} · ${esc(new Date(h.time).toLocaleString())}</span></button></div>`).join('');
  QA('.fav-item-click', list).forEach(el => {
    el.addEventListener('click', () => {
      selectCity({ name: el.dataset.name, lat: parseFloat(el.dataset.lat), lon: parseFloat(el.dataset.lon) });
      switchTab('home');
    });
  });
}

export function favoriteMatchesCity(fav, loc) {
  if (fav.name && loc.city && fav.name === loc.city && (!fav.admin1 || !loc.region || fav.admin1 === loc.region)) return true;
  return Math.abs(fav.lat - loc.lat) < 0.01 && Math.abs(fav.lon - loc.lon) < 0.01;
}

// 收藏星标
export async function onFavClick(e) {
  e.stopPropagation();
  if (!currentUser) { switchTab('me'); return; }
  if (favBusy || !state.city) return;
  favBusy = true;
  const btn = $('fav-btn');
  const user = currentUser;
  btn.disabled = true;
  try {
    if (!Array.isArray(favoritesCache)) await loadMeFavorites();
    if (currentUser !== user || !Array.isArray(favoritesCache)) return;
    const loc = state.city;
    const fav = favoritesCache.find(f => favoriteMatchesCity(f, loc));
    const d = fav
      ? await fetchJSON(`${API_BASE}/api/favorites/${fav.id}`, 3000, { method: 'DELETE' })
      : await fetchJSON(`${API_BASE}/api/favorites`, 3000, {
        method: 'POST',
        body: JSON.stringify({ name: loc.city || loc.name, admin1: loc.region || loc.admin1 || '', country: loc.country || '', lat: loc.lat, lon: loc.lon })
      });
    if (currentUser !== user || !d || d.error) return;
    if (fav) favoritesCache = favoritesCache.filter(f => f.id !== fav.id);
    else favoritesCache.unshift(d);
    renderMeFavorites(favoritesCache);
    updateStarUI();
  } finally {
    favBusy = false;
    btn.disabled = false;
  }
}

export function addFavButton() {
  const btn = $('fav-btn');
  if (!btn) return;
  btn.removeEventListener('click', onFavClick);
  btn.addEventListener('click', onFavClick);
  updateStarUI();
}

export function updateStarUI() {
  const btn = $('fav-btn');
  if (!btn || !state.city) return;
  const active = !!currentUser && Array.isArray(favoritesCache) && favoritesCache.some(f => favoriteMatchesCity(f, state.city));
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', String(active));
  btn.setAttribute('aria-label', `${active ? '取消收藏' : '收藏'}${state.city.city || '当前城市'}`);
}
