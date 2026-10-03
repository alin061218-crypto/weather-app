import { F } from 'app/config';

// QX/T 180—2013 4.1.1: fixed absolute scale, with a long cold-color arc.
export const STD_SCALE = [
  [-30, '#80419d'], [-25, '#6968d3'], [-20, '#0694f0'], [-15, '#00c0ea'],
  [-10, '#00e4c5'], [-5, '#6cf987'], [0, '#efff2d'], [5, '#fde700'],
  [10, '#ffcf00'], [15, '#ffb500'], [20, '#ff9a00'], [25, '#ff7e00'],
  [30, '#ff6100'], [35, '#ff4100'], [40, '#fe130c']
];
const hexRgb = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16));
const rgbHex = rgb => '#' + rgb.map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('');
export function tempColor(temp) {
  if (temp <= STD_SCALE[0][0]) return STD_SCALE[0][1];
  if (temp >= STD_SCALE.at(-1)[0]) return STD_SCALE.at(-1)[1];
  for (let i = 0; i < STD_SCALE.length - 1; i++) {
    const [t0, c0] = STD_SCALE[i], [t1, c1] = STD_SCALE[i + 1];
    if (temp >= t0 && temp <= t1) {
      const factor = (temp - t0) / (t1 - t0);
      const a = hexRgb(c0), b = hexRgb(c1);
      return rgbHex(a.map((channel, index) => channel + (b[index] - channel) * factor));
    }
  }
  return STD_SCALE[0][1];
}

export function temperatureFingerprint(hours, unit, scale) {
  if (!Array.isArray(hours) || hours.length !== 24) return '';
  const values = hours.map(Number);
  if (values.some(value => !Number.isFinite(value))) return '';
  const lo = Math.min(...values), hi = Math.max(...values);
  const scaleLo = Number.isFinite(scale?.lo) ? scale.lo : lo;
  const scaleHi = Number.isFinite(scale?.hi) ? scale.hi : hi;
  const span = Math.max(scaleHi - scaleLo, 1);
  const medianValues = [...values].sort((a, b) => a - b);
  const median = (medianValues[11] + medianValues[12]) / 2;
  const bars = values.map(value => `<i class="temperature-fingerprint-bar" style="height:${Math.max(3, ((value - scaleLo) / span) * 48).toFixed(1)}px;background:${tempColor(value)}" aria-hidden="true"></i>`).join('');
  return `<span class="temperature-fingerprint" aria-label="24 小时温度指纹"><span class="temperature-fingerprint-bars">${bars}</span><span class="temperature-fingerprint-axis" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></span></span>` +
    `<span class="temperature-fingerprint-meta"><b>${F.ftemp(lo, unit)}</b> ~ <b>${F.ftemp(hi, unit)}</b><small>中位 ${F.ftemp(median, unit)} · 温差 ${F.fdelta(hi - lo, unit)}</small></span>`;
}

export function weatherScene(code, isDay) {
  if (code === 0 || code === 1) return isDay ? 'clear-day' : 'clear-night';
  if (code === 2 || code === 3) return 'cloudy';
  if (code >= 45 && code <= 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
  if (code >= 95) return 'storm';
  return 'overcast';
}

export function setWeatherScene(code, isDay) {
  document.body.dataset.weather = weatherScene(code, isDay);
}

// ═══════════════════════════════════════════════════════════
//  温度趋势图 (Canvas)
// ═══════════════════════════════════════════════════════════
export class TempChart {
  constructor(cvs) {
    this.cvs = cvs;
    this.ctx = cvs.getContext('2d');
    this.tip = null;
    this._createTip();
    this._onResize = () => this._draw();
    window.addEventListener('resize', this._onResize);
    this._resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this._draw())
      : null;
    if (this._resizeObserver && this.cvs.parentElement) this._resizeObserver.observe(this.cvs.parentElement);
  }

  update(h, unit) {
    this.data = {
      ...h,
      time: Array.isArray(h?.time) ? h.time.slice(0, 24) : [],
      temperature_2m: Array.isArray(h?.temperature_2m) ? h.temperature_2m.slice(0, 24) : []
    };
    this.unit = unit;
    this._draw();
  }

  _createTip() {
    this.tip = document.createElement('div');
    this.tip.className = 'chart-tip hidden';
    this.cvs.parentElement.appendChild(this.tip);
    this.cvs.addEventListener('mousemove', e => this._onMove(e));
    this.cvs.addEventListener('mouseleave', () => this.tip.classList.add('hidden'));
  }

  _onMove(e) {
    if (!this.data) return;
    const r = this.cvs.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const t = (this.data.time || []).slice(0, 24);
    const tmp = (this.data.temperature_2m || []).slice(0, 24);
    const pointCount = Math.min(t.length, tmp.length, 24);
    const idx = Math.round((mx - 40) / (r.width - 56) * (pointCount - 1));
    if (pointCount < 2 || idx < 0 || idx >= pointCount) { this.tip.classList.add('hidden'); return; }
    this.tip.classList.remove('hidden');
    this.tip.textContent = F.time(t[idx]) + '  ' + F.ftemp(tmp[idx], this.unit);
    const desiredLeft = 40 + idx / (tmp.length - 1) * (r.width - 56) - this.tip.offsetWidth / 2;
    const maxLeft = Math.max(0, r.width - this.tip.offsetWidth);
    this.tip.style.left = Math.max(0, Math.min(desiredLeft, maxLeft)) + 'px';
    this.tip.style.top = (r.height * 0.1) + 'px';
  }

  _draw() {
    if (!this.data) return;
    const time = (this.data.time || []).slice(0, 24);
    const temps = (this.data.temperature_2m || []).slice(0, 24);
    this.pointCount = Math.min(time.length, temps.length, 24);
    this.cvs.dataset.pointCount = String(this.pointCount);
    this.cvs.dataset.axisStart = F.time(time[0]);
    this.cvs.dataset.axisEnd = F.time(time[this.pointCount - 1]);
    if (this.pointCount < 2) return;
    const W = this.cvs.clientWidth, H = this.cvs.clientHeight;
    if (W < 10 || H < 10) return;
    const dpr = devicePixelRatio || 1;
    this.cvs.width = W * dpr;
    this.cvs.height = H * dpr;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { t: 16, r: 16, b: 28, l: 40 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    if (pw < 0 || ph < 0) return;

    let min = Math.min(...temps) - 2;
    let max = Math.max(...temps) + 2;
    const range = max - min || 5;

    const xf = i => pad.l + (i / (temps.length - 1)) * pw;
    const yf = v => pad.t + ph - ((v - min) / range) * ph;

    // 读 CSS 变量确定主题色
    const cs = getComputedStyle(document.documentElement);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    // 背景网格
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ph / 4) * i;
      const val = max - (range / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();

      ctx.fillStyle = cs.getPropertyValue('--ink-secondary').trim() || (isDark ? '#c3cbd8' : '#3f4a5c');
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(F.ftemp(Math.round(val), this.unit), pad.l - 6, y + 4);
    }

    // 时间标签
    const axisIndexes = [...new Set([0, 6, 12, 18, temps.length - 1].filter(i => i >= 0 && i < temps.length))];
    ctx.textAlign = 'center';
    ctx.fillStyle = cs.getPropertyValue('--ink-secondary').trim() || (isDark ? '#c3cbd8' : '#3f4a5c');
    ctx.font = '12px system-ui, sans-serif';
    for (const i of axisIndexes) {
      ctx.fillText(F.time(time[i]), xf(i), pad.t + ph + 15);
    }

    // 面积填充
    const primaryColor = cs.getPropertyValue('--primary').trim() || '#5b9cf5';
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
    grad.addColorStop(0, primaryColor);
    grad.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.moveTo(xf(0), yf(temps[0]));
    for (let i = 1; i < temps.length; i++) {
      const xc = (xf(i - 1) + xf(i)) / 2;
      ctx.bezierCurveTo(xc, yf(temps[i - 1]), xc, yf(temps[i]), xf(i), yf(temps[i]));
    }
    ctx.lineTo(xf(temps.length - 1), pad.t + ph);
    ctx.lineTo(xf(0), pad.t + ph);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // 线条
    ctx.beginPath();
    ctx.moveTo(xf(0), yf(temps[0]));
    for (let i = 1; i < temps.length; i++) {
      const xc = (xf(i - 1) + xf(i)) / 2;
      ctx.bezierCurveTo(xc, yf(temps[i - 1]), xc, yf(temps[i]), xf(i), yf(temps[i]));
    }
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 数据点
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < temps.length; i++) {
      ctx.beginPath();
      ctx.arc(xf(i), yf(temps[i]), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
    }
    ctx.restore();
  }
}
