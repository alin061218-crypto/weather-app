import { state } from 'app/config';

const $ = id => document.getElementById(id);
export const Q = (sel, el) => (el || document).querySelector(sel);
export const QA = (sel, el) => [...(el || document).querySelectorAll(sel)];
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export function toggle(id) {
  ['loading', 'weather-card', 'error-card'].forEach(x => {
    const el = $(x);
    if (el) el.classList.toggle('hidden', el.id !== id);
  });
}


let tabActions;

export function switchTab(tab) {
  state.currentTab = tab;
  QA('.tab-page').forEach(p => p.classList.remove('active'));
  QA('.tab-btn').forEach(b => b.classList.remove('active'));
  const page = $(`tab-${tab}`);
  if (page) page.classList.add('active');
  const btn = Q(`.tab-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  if (tab === 'me') tabActions.refreshMePage();
  if (tab === 'guide' && state.city) tabActions.renderCityGuide(state.city.city);
  if (tab === 'home' && state.chart) {
    requestAnimationFrame(() => state.chart._draw());
  }
}

export function initTabs(actions) {
  tabActions = actions;
QA('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
}

export function initTheme() {
  const btn = $('theme-btn');
  applyTheme(state.theme);
  btn.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('wx_theme', state.theme);
    applyTheme(state.theme);
  });
}

export function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = mode === 'dark' ? '#080a0c' : '#fdfdfb';
  }
}

// ═══════════════════════════════════════════════════════════
//  单位切换 (°C / °F)
// ═══════════════════════════════════════════════════════════
export function initUnit(renderWeather) {
  // 原生按钮同时支持点击、Enter 与 Space。
  $('temperature').addEventListener('click', () => {
    state.unit = state.unit === 'celsius' ? 'fahrenheit' : 'celsius';
    localStorage.setItem('wx_unit', state.unit);
    if (state.weather) renderWeather(state.city, state.weather);
  });
  $('temperature').title = '点击切换 °C / °F';
}
