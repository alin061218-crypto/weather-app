/**
 * icons.js — SVG 天气图标系统（v9 重设计）
 *
 * 每个图标都具有清晰可辨的天气特征：
 *   晴 → 大圆太阳 + 放射光芒
 *   少云 → 太阳 + 一小朵云
 *   多云 → 两朵重叠云
 *   阴天 → 一整片厚云
 *   雾 → 多条横线
 *   小雨 → 云 + 稀疏雨滴
 *   大雨 → 云 + 密集雨滴
 *   雪 → 云 + 雪花
 *   雷暴 → 云 + 闪电
 *   晴（夜间）→ 实心月牙 + 两颗四芒星
 */

export const icon = {};

// ── 辅助 ──────────────────────────────────────────
function wsvg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
function tiny(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// ── 天气图标 ──────────────────────────────────────
icon.weather = {
  // ☀️ 晴天 — 大圆太阳 + 8道放射光线
  clearDay() {
    return wsvg(`
      <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" opacity="0.25"/>
      <circle cx="12" cy="12" r="4.5"/>
      <path d="M12 1.5v1.5"/><path d="M12 21v1.5"/>
      <path d="M4.93 4.93l1.06 1.06"/><path d="M18.01 18.01l1.06 1.06"/>
      <path d="M1.5 12h1.5"/><path d="M21 12h1.5"/>
      <path d="M4.93 19.07l1.06-1.06"/><path d="M18.01 5.99l1.06-1.06"/>
    `);
  },

  // 🌙 晴（夜间）— 2026-10-18 作者参考图：实心月牙 + 大小四芒星
  clearNight() {
    return wsvg(`
      <g fill="currentColor" stroke="none">
        <path d="M9.1 5.4C3.3 7 1.2 13.5 4.2 18.6C7.4 24 15.9 24 19.4 16.6C12.7 19.1 6.3 12.9 9.1 5.4Z"/>
        <path d="M14.1 1.2C14.5 3.2 14.8 3.5 16.8 3.9C14.8 4.3 14.5 4.6 14.1 6.6C13.7 4.6 13.4 4.3 11.4 3.9C13.4 3.5 13.7 3.2 14.1 1.2Z"/>
        <path d="M19 5.5C19.5 8.4 19.7 8.7 22.5 9.2C19.7 9.7 19.5 10 19 12.9C18.5 10 18.3 9.7 15.5 9.2C18.3 8.7 18.5 8.4 19 5.5Z"/>
      </g>
    `);
  },

  // 🌤️ 少云 — 太阳被一小朵云挡住部分
  partlyCloudy() {
    return wsvg(`
      <circle cx="9" cy="8" r="3.5"/>
      <path d="M9 2.5v1.3"/><path d="M9 12.2v1.3"/>
      <path d="M3.5 8h1.3"/><path d="M13.2 8h1.3"/>
      <path d="M5.1 4.1l.9.9"/><path d="M12 4.1l-.9.9"/>
      <path d="M14 18h6.2a2.8 2.8 0 000-5.6h-.3a4.4 4.4 0 00-8.3-.8A3.2 3.2 0 0014 18z" fill="currentColor" fill-opacity=".16"/>
    `);
  },

  // ⛅ 多云 — 两朵叠云
  cloudy() {
    return wsvg(`
      <path d="M5 15h8.5a3.2 3.2 0 000-6.4h-.3a4.2 4.2 0 00-7.8.8A3.1 3.1 0 005 15z" fill="currentColor" fill-opacity=".12"/>
      <path d="M9 20h10.2a3.8 3.8 0 000-7.6h-.4a5.5 5.5 0 00-10.4-1A4.5 4.5 0 009 20z" fill="currentColor" fill-opacity=".16"/>
    `);
  },

  // ☁️ 阴天 — 双层大云
  overcast() {
    return wsvg(`
      <path d="M5 18.5h14a4.5 4.5 0 000-9h-.5a6.4 6.4 0 00-12.1-1.1A5.2 5.2 0 005 18.5z" fill="currentColor" fill-opacity=".2"/>
      <path d="M3 20.5h18"/>
    `);
  },

  // 🌫️ 雾 — 层叠横线 + 虚化圆
  fog() {
    return wsvg(`
      <circle cx="7" cy="8" r="1.2" opacity="0.35" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="12" r="1.4" opacity="0.3" fill="currentColor" stroke="none"/>
      <path d="M3 8h14"/>
      <path d="M3 11.5h16"/>
      <path d="M4 15h13"/>
      <path d="M3 18.5h12"/>
    `);
  },

  // 🌧️ 毛毛雨 — 云 + 稀疏短雨滴
  rainLight() {
    return wsvg(`
      <path d="M5 14.5h14a4 4 0 000-8h-.4a5.8 5.8 0 00-10.9-1A4.7 4.7 0 005 14.5z" fill="currentColor" fill-opacity=".18"/>
      <path d="M9 17v3"/><path d="M15 17v3"/>
    `);
  },

  // 🌧️ 大雨 — 云 + 密集长雨滴
  rainHeavy() {
    return wsvg(`
      <path d="M4 14.5h16a4.5 4.5 0 000-9h-.5a6.4 6.4 0 00-12.1-1.1A5.2 5.2 0 004 14.5z" fill="currentColor" fill-opacity=".2"/>
      <path d="M7 17v4"/><path d="M11 16v5"/><path d="M15 17v4"/><path d="M19 16v5"/>
    `);
  },

  // ❄️ 雪 — 云 + 点状雪花
  snow() {
    return wsvg(`
      <path d="M4 14.5h16a4.5 4.5 0 000-9h-.5a6.4 6.4 0 00-12.1-1.1A5.2 5.2 0 004 14.5z" fill="currentColor" fill-opacity=".18"/>
      <path d="M8 17v4M6.5 18.5h3M7 17.5l2 2M9 17.5l-2 2"/>
      <path d="M16 17v4M14.5 18.5h3M15 17.5l2 2M17 17.5l-2 2"/>
    `);
  },

  // ⛈️ 雷暴 — 云 + 利落闪电折线
  storm() {
    return wsvg(`
      <path d="M4 14.5h16a4.5 4.5 0 000-9h-.5a6.4 6.4 0 00-12.1-1.1A5.2 5.2 0 004 14.5z" fill="currentColor" fill-opacity=".2"/>
      <path d="M13 14l-4 6h3l-1 4 5-7h-3z" fill="currentColor" stroke="none"/>
    `);
  },
};

// WMO 4677: all codes used by Open-Meteo, kept explicit so every code has a visual contract.
export const WMO_ICON_MAP = {
  0: 'clearDay', 1: 'partlyCloudy', 2: 'cloudy', 3: 'overcast',
  45: 'fog', 48: 'fog',
  51: 'rainLight', 53: 'rainLight', 55: 'rainLight', 56: 'rainLight', 57: 'rainLight',
  61: 'rainLight', 63: 'rainHeavy', 65: 'rainHeavy', 66: 'rainLight', 67: 'rainHeavy',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow', 80: 'rainLight', 81: 'rainHeavy', 82: 'rainHeavy',
  85: 'snow', 86: 'snow', 95: 'storm', 96: 'storm', 99: 'storm',
};

// ── 根据 WMO 天气代码获取对应图标 ─────────────────
export function weatherIcon(code, isDay = true) {
  if (code === 0 && !isDay) return icon.weather.clearNight();
  if (code === 1 && !isDay) return icon.weather.clearNight();
  const name = WMO_ICON_MAP[code] || 'clearDay';
  return icon.weather[name]();
}

// ── 数据指标图标 ──────────────────────────────────
icon.stat = {
  feelsLike()  { return tiny('<path d="M17 14a5 5 0 00-10 0h10z"/><circle cx="12" cy="7" r="3"/>'); },
  humidity()   { return tiny('<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/><circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none" opacity="0.4"/>'); },
  wind()       { return tiny('<path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/>'); },
  uv()         { return tiny('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/>'); },
  rainProb()   { return tiny('<path d="M8 12a3.5 3.5 0 117-1"/><path d="M8 20h10"/><line x1="10" y1="15" x2="10" y2="19"/><line x1="13" y1="15" x2="13" y2="19"/>'); },
  pressure()   { return tiny('<circle cx="12" cy="12" r="8"/><polyline points="12 7 12 12 15 15"/>'); },
  cloud()      { return tiny('<path d="M16 16a4 4 0 10-8-1.5"/><path d="M10 18a4 4 0 108.5-2"/><path d="M6 20h12"/>'); },
  visibility() { return tiny('<circle cx="12" cy="12" r="3"/><path d="M1 12s3.5-8 11-8 11 8 11 8-3.5 8-11 8-11-8-11-8z"/>'); },
};
