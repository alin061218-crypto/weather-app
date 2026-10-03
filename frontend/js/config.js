export const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3001' : '';


export const API = {
  ip: 'https://ipapi.co/json/',
  geo: 'https://geocoding-api.open-meteo.com/v1/search',
  wx: 'https://api.open-meteo.com/v1/forecast'
};

// Canonical contract lives in server.js WEATHER_PARAMS and /api/wx-params.
// Keep this emergency copy synchronized for a backend that is completely unreachable.
export const WX_PARAMS = 'current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover,apparent_temperature,uv_index,precipitation_probability,pressure_msl,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=7';

export const state = {
  authToken: localStorage.getItem('wx_token') || '',
  atmosphere: null,
  weatherGeneration: 0,
  city: null,
  weather: null,
  unit: localStorage.getItem('wx_unit') || 'celsius',
  chart: null,
  currentTab: 'home',
  theme: localStorage.getItem('wx_theme') || 'dark',
};

export const CACHE_MAX_AGE = 30 * 60 * 1000;
export const DEFAULT_LOCATION = { city: '北京', region: '北京', country: '中国', lat: 39.904, lon: 116.407 };

// ═══════════════════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════════════════
export const F = {
  c2f: c => Math.round(c * 9 / 5 + 32),
  ftemp: (v, u) => u === 'fahrenheit' ? F.c2f(v) + '°F' : Math.round(v) + '°',
  fdelta: (v, u) => u === 'fahrenheit' ? Math.round(v * 9 / 5) + '°F' : Math.round(v) + '°',
  time: s => (s || '').split('T')[1]?.slice(0, 5) || '',
  day: s => {
    const d = new Date(s + 'T12:00:00'), t = new Date();
    t.setHours(12, 0, 0, 0);
    const diff = Math.round((d - t) / 864e5);
    return diff === 0 ? '今天' : diff === 1 ? '明天' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  },
  debounce: (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
};

// ═══════════════════════════════════════════════════════════
//  天气代码 → 描述
// ═══════════════════════════════════════════════════════════
export const DESC = c => {
  if (c === 0) return '晴';
  return ({
    1: '少云', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
    51: '小毛毛雨', 53: '毛毛雨', 55: '浓毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '小阵雨', 81: '阵雨', 82: '强阵雨', 85: '小阵雪', 86: '阵雪',
    95: '雷暴', 96: '雷暴伴冰雹', 99: '强雷暴伴冰雹'
  })[c] || '未知';
};

export const WX = {
  isRain: c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82),
  isSnow: c => (c >= 71 && c <= 77) || (c >= 85 && c <= 86),
  isStorm: c => c >= 95,
  isFog: c => c >= 45 && c <= 48,
  isClear: c => c <= 1,
};
