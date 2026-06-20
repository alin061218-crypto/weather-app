/**
 * icons.js — SVG 图标系统
 *
 * 所有图标都是 24×24 viewBox 的 SVG，经由函数返回字符串。
 * 风格：线性描边，圆头端点，统一 1.5-2px 描边宽度。
 * 替换以前所有的 emoji 图标。
 *
 * 用法：
 *   import { icon } from './icons.js';
 *   element.innerHTML = icon.weather.clearDay();
 */

export const icon = {};

// ── 辅助：生成 SVG 字符串 ────────────────────────
function svg(body, vb = '0 0 24 24') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
function tiny(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// ── 天气图标 ──────────────────────────────────────
icon.weather = {
  // ☀️ 晴 (白天)
  clearDay() {
    return svg(`
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2"/><path d="M12 21v2"/>
      <path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/>
      <path d="M1 12h2"/><path d="M21 12h2"/>
      <path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>
    `);
  },
  // 🌙 晴 (夜晚)
  clearNight() {
    return svg(`
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
    `);
  },
  // ⛅ 多云
  cloudy() {
    return svg(`
      <path d="M18 10h-1.26A8 8 0 109.74 6.5"/>
      <path d="M18 10a4 4 0 000 8H9a5 5 0 01-1-9.9"/>
    `);
  },
  // 🌫️ 雾
  fog() {
    return svg(`
      <path d="M3 8h18"/><path d="M5 12h14"/><path d="M8 16h10"/>
      <circle cx="10" cy="5" r="1"/><circle cx="15" cy="4" r="1"/>
      <line x1="3" y1="22" x2="18" y2="20"/>
    `);
  },
  // 🌧️ 小雨
  rainLight() {
    return svg(`
      <path d="M18 10h-1.26A8 8 0 109.74 6.5"/>
      <path d="M18 10a4 4 0 000 8H9a5 5 0 01-1-9.9"/>
      <line x1="8" y1="18" x2="8.01" y2="22"/>
      <line x1="12" y1="18" x2="12.01" y2="22"/>
      <line x1="16" y1="18" x2="16.01" y2="22"/>
    `);
  },
  // 🌧️ 大雨
  rainHeavy() {
    return svg(`
      <path d="M18 10h-1.26A8 8 0 109.74 6.5"/>
      <path d="M18 10a4 4 0 000 8H9a5 5 0 01-1-9.9"/>
      <line x1="7" y1="18" x2="7.01" y2="22"/><line x1="11" y1="18" x2="11.01" y2="22"/>
      <line x1="15" y1="18" x2="15.01" y2="22"/><line x1="9" y1="22" x2="9.01" y2="23"/>
      <line x1="13" y1="22" x2="13.01" y2="23"/><line x1="5" y1="22" x2="5.01" y2="23"/>
    `);
  },
  // ❄️ 雪
  snow() {
    return svg(`
      <path d="M18 10h-1.26A8 8 0 109.74 6.5"/>
      <path d="M18 10a4 4 0 000 8H9a5 5 0 01-1-9.9"/>
      <path d="M8 18l2 2"/><path d="M8 22l2-2"/>
      <path d="M12 18l2 2"/><path d="M12 22l2-2"/>
      <path d="M16 18l2 2"/><path d="M16 22l2-2"/>
    `);
  },
  // ⛈️ 雷暴
  storm() {
    return svg(`
      <path d="M18 10h-1.26A8 8 0 109.74 6.5"/>
      <path d="M18 10a4 4 0 000 8H9a5 5 0 01-1-9.9"/>
      <polyline points="13 10 10 16 14 16 11 22"/>
    `);
  },
};

// ── 天气数据指标图标 ──────────────────────────────
icon.stat = {
  feelsLike()  { return tiny('<path d="M17 14a5 5 0 00-10 0h10z"/><circle cx="12" cy="7" r="3"/>'); },
  humidity()   { return tiny('<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>'); },
  wind()       { return tiny('<path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/>'); },
  uv()         { return tiny('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/>'); },
  rainProb()   { return tiny('<path d="M7 16.3c3.3-4.7 6.7-4.7 10 0"/><line x1="10" y1="17" x2="10.01" y2="20"/><line x1="14" y1="17" x2="14.01" y2="20"/>'); },
  pressure()   { return tiny('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>'); },
  sunrise()    { return tiny('<path d="M12 9V2m0 0L8 6m4-4l4 4"/><path d="M5 17a7 7 0 0114 0"/><line x1="3" y1="17" x2="21" y2="17"/>'); },
  sunset()     { return tiny('<path d="M12 15V2m0 0L8 6m4-4l4 4"/><path d="M5 17a7 7 0 0114 0"/><line x1="3" y1="17" x2="21" y2="17"/>'); },
  cloud()      { return tiny('<path d="M18 10h-1.26A8 8 0 109.74 6.5H8a4 4 0 000 8h10z"/>'); },
  visibility() { return tiny('<circle cx="12" cy="12" r="2"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>'); },
  elevation()  { return tiny('<path d="M3 21l9-18 9 18"/>'); },
};

// ── 导航图标 ──────────────────────────────────────
icon.nav = {
  home()  { return tiny('<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>'); },
  chat()  { return tiny('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'); },
  guide() { return tiny('<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>'); },
  user()  { return tiny('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'); },
};

// ── UI 控件图标 ────────────────────────────────────
icon.ui = {
  search() { return tiny('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'); },
  close()  { return tiny('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'); },
  heart()  { return tiny('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>'); },
  heartFill() { return tiny('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="currentColor" stroke="none"/>'); },
  send()   { return tiny('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'); },
  chevronRight() { return tiny('<polyline points="9 18 15 12 9 6"/>'); },
  check()  { return tiny('<polyline points="20 6 9 17 4 12"/>'); },
  alert()  { return tiny('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'); },
  map()    { return tiny('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>'); },
  clothing() { return tiny('<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>'); },
  activity() { return tiny('<circle cx="12" cy="10" r="3"/><path d="M12 4a8 8 0 018 8c0 4.4-8 8-8 8s-8-3.6-8-8a8 8 0 018-8z"/>'); },
  theme()  { return tiny('<circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>'); },
  star()   { return tiny('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'); },
  info()   { return tiny('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'); },
};

// ── 指南图标 ──────────────────────────────────────
icon.guide = {
  food()  { return tiny('<path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>'); },
  travel() { return tiny('<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h2a1 1 0 001-1v-2h-1v-3a2 2 0 00-4 0v3h-1v2a1 1 0 001 1z"/>'); },
  music() { return tiny('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'); },
};

// ── 根据 WMO 天气代码获取对应图标 ─────────────────
export function weatherIcon(code, isDay = true) {
  if (code === 0 || code === 1) return isDay ? icon.weather.clearDay() : icon.weather.clearNight();
  if (code <= 3) return icon.weather.cloudy();
  if (code <= 48) return icon.weather.fog();
  if (code <= 57) return icon.weather.rainLight();
  if (code <= 67) return icon.weather.rainLight();
  if (code <= 77) return icon.weather.snow();
  if (code <= 82) return icon.weather.rainHeavy();
  if (code <= 86) return icon.weather.snow();
  return icon.weather.storm();
}
