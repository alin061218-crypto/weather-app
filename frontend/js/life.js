import { WX } from 'app/config';

let rules = [];
let loading = null;
export const LIFE_CATEGORIES = ['穿衣', '活动', '紫外线', '洗车', '晾晒', '运动', '感冒', '过敏'];

export function loadLifeRules() {
  if (!loading) loading = fetch('/data/advice-rules.json')
    .then(response => { if (!response.ok) throw new Error('生活指数加载失败'); return response.json(); })
    .then(data => { rules = data; return rules; })
    .catch(() => { loading = null; return []; });
  return loading;
}

export function lifeInputs(wx) {
  const cur = wx.current_weather;
  const h = wx.hourly || {}, d = wx.daily || {};
  // Use the hour corresponding to current_weather.time, rather than midnight.
  const hour = Math.max(0, (h.time || []).findIndex(time => time.slice(0, 13) === cur.time?.slice(0, 13)));
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return { temperature: number(cur.temperature), wind: number(cur.windspeed), code: cur.weathercode,
    uv: number(d.uv_index_max?.[0]), humidity: number(h.relativehumidity_2m?.[hour]),
    precipitation: number(d.precipitation_probability_max?.[0]),
    range: number(d.temperature_2m_max?.[0] - d.temperature_2m_min?.[0]),
    us_aqi: number(wx.air?.current?.us_aqi), wet: WX.isRain(cur.weathercode) || WX.isSnow(cur.weathercode),
    freezing: WX.isFreezing(cur.weathercode), storm: WX.isStorm(cur.weathercode), fog: WX.isFog(cur.weathercode) };
}

function matches(conditions, input) {
  return Object.entries(conditions).every(([field, expected]) => {
    const actual = input[field];
    if (actual == null) return false;
    if (typeof expected !== 'object') return actual === expected;
    return (expected.min == null || actual >= expected.min) && (expected.max == null || actual <= expected.max);
  });
}

// TASK-014 exposes the shared data and a simple per-category lookup. Weighted
// scoring, conflict resolution and legacy comparison remain TASK-013's work.
export function getLifeIndices(wx) {
  const input = lifeInputs(wx);
  return LIFE_CATEGORIES.map(category => {
    const rule = rules.filter(rule => rule.category === category && matches(rule.conditions, input))
      .sort((a, b) => b.priority - a.priority)[0];
    return rule ? { ...rule } : { category, level: '暂无', text: '相关气象数据暂缺，请稍后查看。', tags: [] };
  });
}
