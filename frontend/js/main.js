import { Atmosphere } from 'app/atmosphere';
import { DEFAULT_LOCATION, CACHE_MAX_AGE, state } from 'app/config';
import { $, toggle, initTabs, initTheme, initUnit } from 'app/ui';
import { initApi, ipLocation, getWeather } from 'app/api';
import { loadCities, findCity, toPrefectureCity } from 'app/cities';
import { initAccount, checkAuth, updateMeUI, refreshMePage, readLastWeather, readWeatherCache, sameLocation } from 'app/account';
import { renderWeather, renderCityGuide, getClothing, getActivity } from 'app/render';
import { initSearch, selectCity } from 'app/search';
import { initChat } from 'app/chat';

// ═══════════════════════════════════════════════════════════
//  搜索 & 主流程
// ═══════════════════════════════════════════════════════════
export async function discoverLocation(citiesPromise) {
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

export async function init() {
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

// ═══════════════════════════════════════════════════════════
//  天气地图
// ═══════════════════════════════════════════════════════════
export function initMap() {
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
  initChat({ getClothing, getActivity });
  init();
  checkAuth();
  updateMeUI();
});
