import { API_BASE, CACHE_MAX_AGE, state } from 'app/config';
import { fetchJSON } from 'app/api';

const cache = new Map();
let pending = null;

// US AQI thresholds, explicitly labelled in the UI; these are not China AQI.
export function aqiLevel(value) {
  if (!Number.isFinite(value) || value < 0) return '暂无';
  return value <= 50 ? '优' : value <= 100 ? '良' : value <= 150 ? '轻度污染'
    : value <= 200 ? '中度污染' : value <= 300 ? '重度污染' : '严重污染';
}

export function loadAirQuality(loc, wx, onUpdate) {
  const key = `${Number(loc.lat).toFixed(2)},${Number(loc.lon).toFixed(2)}`;
  const generation = state.weatherGeneration;
  if (pending && (pending.key !== key || pending.generation !== generation)) {
    pending.controller.abort();
    pending = null;
  }
  const saved = cache.get(key);
  if (saved && Date.now() - saved.ts < CACHE_MAX_AGE) {
    wx.air = saved.data;
    onUpdate();
    return;
  }
  if (!pending) {
    const controller = new AbortController();
    const request = { key, generation, controller };
    pending = request;
    request.promise = fetchJSON(`${API_BASE}/api/air?lat=${loc.lat}&lon=${loc.lon}`, 9000, { signal: controller.signal })
      .then(data => {
        const valid = Number.isFinite(data?.current?.us_aqi) && data.current.us_aqi >= 0 ? data : null;
        if (valid && !controller.signal.aborted && generation === state.weatherGeneration) cache.set(key, { data: valid, ts: Date.now() });
        return valid;
      }).catch(() => null)
      .finally(() => { if (pending === request) pending = null; });
  }
  const request = pending;
  // A warm-cache boot may render two parsed copies of the same forecast. Both
  // subscribe to the single request; only the active weather object may update UI.
  void request.promise.then(data => {
    if (request.controller.signal.aborted || generation !== state.weatherGeneration || state.weather !== wx) return;
    wx.air = data;
    wx.airStatus = data ? 'ready' : 'unavailable';
    onUpdate();
  });
}
