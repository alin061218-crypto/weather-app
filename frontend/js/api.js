import { API_BASE, API, WX_PARAMS, state } from 'app/config';

let weatherParamsPromise = null;

let readWeatherCache;
export function initApi(cacheReader) { readWeatherCache = cacheReader; }


// ═══════════════════════════════════════════════════════════
//  API 请求
// ═══════════════════════════════════════════════════════════
export async function fetchJSON(url, timeout = 5000, opts = {}) {
  const ctrl = new AbortController();
  const cancel = () => ctrl.abort(opts.signal.reason);
  let signal = ctrl.signal;
  if (opts.signal) {
    if (typeof AbortSignal.any === 'function') signal = AbortSignal.any([ctrl.signal, opts.signal]);
    else if (opts.signal.aborted) cancel();
    else opts.signal.addEventListener('abort', cancel, { once: true });
  }
  const t = setTimeout(() => ctrl.abort(), timeout);
  const headers = { ...(opts.headers || {}) };
  if (state.authToken) headers.Authorization = `Bearer ${state.authToken}`;
  if (opts.method) headers['Content-Type'] = 'application/json';
  try {
    let r;
    try {
      r = await fetch(url, { signal, headers, method: opts.method, body: opts.body });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      return { error: e.name === 'AbortError' ? '网络失败：请求超时' : `网络失败：${e.message || '无法连接'}`, kind: 'network' };
    }
    let data;
    try {
      data = await r.json();
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      if (!r.ok) return { error: `HTTP ${r.status}：${r.statusText || '请求失败'}`, kind: 'http', status: r.status };
      return { error: `解析失败：${e.message || '响应不是有效 JSON'}`, kind: 'parse' };
    }
    if (!r.ok) return { error: `HTTP ${r.status}：${data?.error || data?.message || r.statusText || '请求失败'}`, kind: 'http', status: r.status };
    return data;
  } finally {
    clearTimeout(t);
    opts.signal?.removeEventListener('abort', cancel);
  }
}

export async function ipLocation() {
  try {
    const d = await fetchJSON(`${API_BASE}/api/location`, 8000);
    if (!d || d.error || !d.city || !Number.isFinite(Number(d.lat)) || !Number.isFinite(Number(d.lon))) {
      throw new Error(d?.error || '后端定位失败');
    }
    if (d.country === 'United States' || d.country === 'US') throw new Error('后端定位结果不适用');
    return { city: d.city, region: d.region || '', country: d.country || '', lat: Number(d.lat), lon: Number(d.lon) };
  } catch {}
  try {
    const d = await fetchJSON(API.ip, 8000);
    if (!d || d.error || d.country_code !== 'CN' || !d.city || !Number.isFinite(Number(d.latitude)) || !Number.isFinite(Number(d.longitude))) {
      throw new Error(d?.error || '直连定位失败');
    }
    return { city: d.city, region: d.region || '', country: '中国', lat: Number(d.latitude), lon: Number(d.longitude) };
  } catch {
    return null;
  }
}

export async function geoSearch(q) {
  const d = await fetchJSON(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`, 4000);
  if (d && Array.isArray(d)) return d.map(r => ({ name: r.name || '', admin1: r.admin1 || '', country: r.country || '', lat: r.lat, lon: r.lon }));
  const d2 = await fetchJSON(`${API.geo}?name=${encodeURIComponent(q)}&count=5&language=zh&format=json`, 4000);
  if (d2?.error) throw new Error(d2.error);
  return d2?.results?.map(r => ({ name: r.name || '', admin1: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude })) || [];
}

export async function getWeather(lat, lon) {
  const cached = readWeatherCache(lat, lon);
  if (cached) return cached.wx;

  const controller = new AbortController();
  let startDirect;
  const ready = new Promise(resolve => { startDirect = resolve; });
  // Give backend cache hits a head start; failures release the direct fallback immediately.
  const timer = setTimeout(startDirect, 150);
  const backend = fetchJSON(`${API_BASE}/api/weather?lat=${lat}&lon=${lon}`, 10000, { signal: controller.signal }).then(d => {
    if (!d || d.error) throw new Error(d?.error || '后端天气请求失败');
    return d;
  }).catch(error => {
    startDirect();
    throw error;
  });
  const direct = ready.then(() => {
    if (controller.signal.aborted) throw controller.signal.reason;
    return getWeatherParams();
  }).then(params => fetchJSON(
    `${API.wx}?latitude=${lat}&longitude=${lon}&${params}`, 10000, { signal: controller.signal }
  )).then(d => {
    if (!d || d.error) throw new Error(d?.error || '直连天气请求失败');
    return d;
  });
  try {
    return await Promise.any([backend, direct]);
  } catch (error) {
    const messages = error?.errors?.map(e => e?.message).filter(Boolean) || [];
    throw new Error(messages[0] || '天气数据获取失败');
  } finally {
    controller.abort();
    clearTimeout(timer);
    startDirect();
  }
}

export async function getWeatherParams() {
  if (!weatherParamsPromise) {
    weatherParamsPromise = (async () => {
      if (!API_BASE) return WX_PARAMS;
      try {
        const response = await fetch(`${API_BASE}/api/wx-params`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
        const params = (await response.text()).trim();
        if (response.ok && params && params.includes('forecast_days=7') && !params.includes('forecast_hours=')) return params;
      } catch {}
      return WX_PARAMS;
    })();
  }
  return weatherParamsPromise;
}
