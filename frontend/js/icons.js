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
 *   晴夜 → 月牙 + 星星
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

  // 🌙 晴夜 — 月牙 + 两颗星
  clearNight() {
    return wsvg(`
      <path d="M19 13A7 7 0 1111 5a5 5 0 0010 8z" fill="currentColor" stroke="none" opacity="0.15"/>
      <path d="M19 13A7 7 0 1111 5a5 5 0 0010 8z"/>
      <circle cx="15" cy="3" r="1" fill="currentColor" stroke="none" opacity="0.6"/>
      <circle cx="20" cy="8" r="0.7" fill="currentColor" stroke="none" opacity="0.4"/>
    `);
  },

  // 🌤️ 少云 — 太阳被一小朵云挡住部分
  partlyCloudy() {
    return wsvg(`
      <circle cx="10" cy="9" r="3.5"/>
      <path d="M10 4v1.5"/><path d="M10 17.5v1.5"/>
      <path d="M5.5 6.5l1 1"/><path d="M13.5 11.5l1 1"/>
      <path d="M4 10h1"/><path d="M14.5 8h1"/>
      <path d="M18 14a3 3 0 11-1.5-5.6"/>
      <path d="M13 16.5a3.5 3.5 0 018-1.5"/>
      <path d="M16 18h6"/>
      <path d="M16 15.5h6"/>
    `);
  },

  // ⛅ 多云 — 两朵云 + 微露太阳
  cloudy() {
    return wsvg(`
      <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" opacity="0.12"/>
      <circle cx="8" cy="8" r="2.8"/>
      <path d="M8 3.5v1.5"/><path d="M8 14.5v1"/>
      <path d="M18 13a3.5 3.5 0 11-1.5-6.3"/>
      <path d="M12 16.5a4 4 0 019-1.5"/>
      <path d="M16 20h7"/>
      <path d="M14 17h7"/>
    `);
  },

  // ☁️ 阴天 — 一整片大厚云
  overcast() {
    return wsvg(`
      <path d="M18 13a3.5 3.5 0 10-1.5-6.3"/>
      <path d="M8 16a4.5 4.5 0 1111-2"/>
      <path d="M12 19a4.5 4.5 0 1010-1.5"/>
      <path d="M6 20h16"/>
      <path d="M4 17h16"/>
    `);
  },

  // 🌫️ 雾 — 多层横线
  fog() {
    return wsvg(`
      <path d="M4 6h16"/>
      <path d="M2 9.5h18"/>
      <path d="M5 13h15"/>
      <path d="M3 16.5h15"/>
      <path d="M6 20h12"/>
    `);
  },

  // 🌧️ 小雨 — 云 + 3条雨滴
  rainLight() {
    return wsvg(`
      <path d="M18 13a3.5 3.5 0 10-2-6.3"/>
      <path d="M8 16a4.5 4.5 0 119.5-1.8"/>
      <path d="M12 19a4 4 0 109-1.5"/>
      <path d="M5 20h14"/>
      <path d="M9 16v3"/><path d="M12 16.5v3"/><path d="M15 16v3"/>
    `);
  },

  // 🌧️ 大雨 — 云 + 密集雨滴
  rainHeavy() {
    return wsvg(`
      <path d="M18 13a3.5 3.5 0 10-2-6.3"/>
      <path d="M8 16a4.5 4.5 0 119.5-1.8"/>
      <path d="M12 19a4 4 0 109-1.5"/>
      <path d="M4 20h16"/>
      <path d="M7 16v4"/><path d="M10 16v4"/><path d="M13 16v4"/><path d="M16 16v4"/>
      <path d="M8.5 20v2"/><path d="M11.5 20v2"/><path d="M14.5 20v2"/>
    `);
  },

  // ❄️ 雪 — 云 + 雪花
  snow() {
    return wsvg(`
      <path d="M18 13a3.5 3.5 0 10-2-6.3"/>
      <path d="M8 16a4.5 4.5 0 119.5-1.8"/>
      <path d="M12 19a4 4 0 109-1.5"/>
      <path d="M5 20h14"/>
      <circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" opacity="0.5"/>
      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" opacity="0.5"/>
      <circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" opacity="0.5"/>
    `);
  },

  // ⛈️ 雷暴 — 暗云 + 闪电
  storm() {
    return wsvg(`
      <path d="M18 13a3.5 3.5 0 10-2-6.3"/>
      <path d="M8 16a4.5 4.5 0 119.5-1.8"/>
      <path d="M12 19a4 4 0 109-1.5"/>
      <path d="M5 20h14"/>
      <polyline points="13 15 10 19 13 19 10 23" fill="currentColor" stroke="none" opacity="0.2"/>
      <polyline points="13 15 10 19 13 19 10 23"/>
    `);
  },
};

// ── 根据 WMO 天气代码获取对应图标 ─────────────────
export function weatherIcon(code, isDay = true) {
  if (code === 0) return isDay ? icon.weather.clearDay() : icon.weather.clearNight();
  if (code === 1) return isDay ? icon.weather.partlyCloudy() : icon.weather.clearNight();
  if (code === 2) return icon.weather.cloudy();
  if (code === 3) return icon.weather.overcast();
  if (code >= 45 && code <= 48) return icon.weather.fog();
  if ((code >= 51 && code <= 57) || (code >= 80 && code <= 81)) return icon.weather.rainLight();
  if ((code >= 61 && code <= 67) || code === 82) return icon.weather.rainHeavy();
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return icon.weather.snow();
  if (code >= 95) return icon.weather.storm();
  return icon.weather.clearDay();
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
