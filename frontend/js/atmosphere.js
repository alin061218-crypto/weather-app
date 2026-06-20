/**
 * atmosphere.js — 3D 天气氛围背景
 *
 * 用 Three.js 在页面背后创建一层会「呼吸」的粒子大气层。
 * 粒子会根据当前天气（晴/雨/雪/雾/雷暴）变化形态、颜色和运动方式。
 * 鼠标/手指移动时，附近的粒子会被轻轻推开——像扰动了一团雾气。
 *
 * 用法：
 *   import { Atmosphere } from './atmosphere.js';
 *   const atm = new Atmosphere(document.getElementById('atmosphere'));
 *   atm.setWeather('clear', true);   // 晴天，白天
 *   atm.setWeather('rain', false);   // 雨天，夜晚
 */

import * as THREE from 'three';

// ── 天气对应的粒子参数 ──────────────────────────────
const WEATHER_PRESETS = {
  clear: {
    count: 100,
    colorIn: '#f5e6c8',   // 暖金
    colorOut: 'transparent',
    size: [0.04, 0.14],
    speed: 0.25,
    rise: true,
    riseSpeed: 0.12,
    drift: 0.3,
    spread: { x: 10, y: 8, z: 6 },
    fogColor: '#1a1410',
    fogDensity: 0.018,
  },
  cloudy: {
    count: 140,
    colorIn: '#d8dce3',
    colorOut: 'transparent',
    size: [0.06, 0.20],
    speed: 0.12,
    rise: false,
    drift: 0.5,
    spread: { x: 10, y: 6, z: 8 },
    fogColor: '#1a1a20',
    fogDensity: 0.025,
  },
  rain: {
    count: 220,
    colorIn: '#a0b8d0',
    colorOut: 'transparent',
    size: [0.015, 0.04],
    speed: 1.5,
    fall: true,
    streak: true,
    spread: { x: 8, y: 12, z: 5 },
    fogColor: '#101820',
    fogDensity: 0.030,
  },
  snow: {
    count: 140,
    colorIn: '#f0f0f8',
    colorOut: 'transparent',
    size: [0.02, 0.07],
    speed: 0.25,
    fall: true,
    wobble: 0.7,
    spread: { x: 10, y: 8, z: 6 },
    fogColor: '#1a1c24',
    fogDensity: 0.022,
  },
  fog: {
    count: 40,
    colorIn: '#c8ced6',
    colorOut: 'transparent',
    size: [0.4, 1.2],
    speed: 0.06,
    rise: false,
    drift: 0.2,
    spread: { x: 14, y: 6, z: 10 },
    fogColor: '#181c22',
    fogDensity: 0.040,
  },
  storm: {
    count: 280,
    colorIn: '#708090',
    colorOut: 'transparent',
    size: [0.012, 0.035],
    speed: 2.0,
    fall: true,
    streak: true,
    lightning: true,
    spread: { x: 7, y: 14, z: 4 },
    fogColor: '#080810',
    fogDensity: 0.035,
  },
};

// ── 工具：生成发光纹理 ────────────────────────────────
function makeGlowTexture(innerColor, outerColor, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.25, innerColor);
  gradient.addColorStop(1, outerColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ── 主类 ─────────────────────────────────────────────
export class Atmosphere {
  constructor(container) {
    if (!container) return;

    this.container = container;
    this.particles = [];       // 粒子数据（不在几何体里，我们手动管）
    this.currentWeather = 'clear';
    this.targetPreset = WEATHER_PRESETS.clear;
    this.isDay = true;

    // 鼠标/触摸位置（归一化到 [-1, 1]）
    this.pointer = new THREE.Vector2(9999, 9999);
    this.pointerTarget = new THREE.Vector2(9999, 9999);
    this.pointerStrength = 0;

    // 闪电状态
    this.lightningFlash = 0;
    this.lightningCooldown = 0;

    this._init();
    this._bindEvents();
    this._animate();
  }

  // ── 初始化 Three.js ──────────────────────────────
  _init() {
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 场景
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#1a1410', 0.018);

    // 相机
    this.camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 30);
    this.camera.position.z = 5;
    this.camera.lookAt(0, 0, 0);

    // 生成发光纹理
    this.glowTex = makeGlowTexture('#ffffff', 'transparent', 128);

    // 创建粒子系统
    this._buildParticles(WEATHER_PRESETS.clear);

    // 环境光粒子（始终存在的微小亮点）
    this._buildAmbientDust();
  }

  // ── 构建粒子 ────────────────────────────────────
  _buildParticles(preset) {
    // 清理旧粒子
    if (this.pointsMesh) {
      this.scene.remove(this.pointsMesh);
      if (this.pointsMesh.geometry) this.pointsMesh.geometry.dispose();
      if (this.pointsMesh.material) this.pointsMesh.material.dispose();
    }

    const count = preset.count;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const { spread } = preset;

    this.particles = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * spread.x;
      const y = (Math.random() - 0.5) * spread.y;
      const z = (Math.random() - 0.5) * spread.z;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const [minSize, maxSize] = preset.size;
      sizes[i] = minSize + Math.random() * (maxSize - minSize);

      this.particles.push({
        baseX: x,
        baseY: y,
        baseZ: z,
        x, y, z,
        size: sizes[i],
        // 每个粒子用不同的相位和频率，产生自然的「散乱」运动
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseZ: Math.random() * Math.PI * 2,
        freqX: 0.3 + Math.random() * 0.7,
        freqY: 0.3 + Math.random() * 0.7,
        freqZ: 0.2 + Math.random() * 0.5,
        ampX: 0.3 + Math.random() * 1.2,
        ampY: 0.3 + Math.random() * 1.2,
        ampZ: 0.2 + Math.random() * 0.8,
        speedMul: 0.6 + Math.random() * 0.8,
        // 雨滴/雪花的竖直下落
        fallY: (Math.random() - 0.5) * spread.y,
      });
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      map: this.glowTex,
      color: new THREE.Color(preset.colorIn),
      size: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      opacity: 0.7,
    });

    this.pointsMesh = new THREE.Points(geom, mat);
    this.scene.add(this.pointsMesh);
  }

  // ── 环境微尘（始终存在、极慢飘动的小亮点） ──────
  _buildAmbientDust() {
    const count = 60;
    const positions = new Float32Array(count * 3);
    this.dustParticles = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;

      this.dustParticles.push({
        baseX: positions[i * 3],
        baseY: positions[i * 3 + 1],
        baseZ: positions[i * 3 + 2],
        phase: Math.random() * Math.PI * 2,
        freq: 0.1 + Math.random() * 0.3,
        amp: 0.2 + Math.random() * 0.6,
      });
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      map: this.glowTex,
      color: new THREE.Color('#ffffff'),
      size: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.25,
    });

    this.dustMesh = new THREE.Points(geom, mat);
    this.scene.add(this.dustMesh);
  }

  // ── 切换天气 ────────────────────────────────────
  setWeather(weatherCode, isDay) {
    this.isDay = isDay;

    // 把天气代码映射到预设类型
    let type = 'clear';
    if (weatherCode === 0 || weatherCode === 1) type = 'clear';
    else if (weatherCode === 2 || weatherCode === 3) type = 'cloudy';
    else if (weatherCode >= 45 && weatherCode <= 48) type = 'fog';
    else if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) type = 'rain';
    else if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) type = 'snow';
    else if (weatherCode >= 95) type = 'storm';

    if (type !== this.currentWeather) {
      this.currentWeather = type;
      this.targetPreset = WEATHER_PRESETS[type];
      this._buildParticles(this.targetPreset);
    }
  }

  // ── 事件绑定 ────────────────────────────────────
  _bindEvents() {
    // 鼠标移动
    window.addEventListener('mousemove', (e) => {
      this.pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerTarget.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.pointerStrength = 1;
    });

    // 触摸移动
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.pointerTarget.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        this.pointerTarget.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
        this.pointerStrength = 1;
      }
    }, { passive: true });

    // 触摸/鼠标离开
    window.addEventListener('mouseleave', () => { this.pointerStrength = 0; });
    window.addEventListener('touchend', () => { this.pointerStrength = 0; });

    // 窗口大小变化
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(W, H);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
  }

  // ── 动画循环 ────────────────────────────────────
  _animate() {
    requestAnimationFrame(() => this._animate());

    const time = performance.now() * 0.001; // 秒为单位
    const preset = this.targetPreset;

    // 鼠标平滑跟随
    this.pointer.lerp(this.pointerTarget, 0.05);
    if (this.pointerStrength > 0.01 && this.pointerTarget.x === 9999) {
      this.pointerStrength *= 0.95;
    }

    // 鼠标在 3D 空间的投影位置（用于粒子排斥）
    const mouseX = this.pointer.x * 6;
    const mouseY = this.pointer.y * 4;
    const mouseInfluence = 2.5; // 影响半径

    // ── 更新天气粒子 ──
    if (this.pointsMesh) {
      const positions = this.pointsMesh.geometry.attributes.position.array;
      const spread = preset.spread;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        let px = p.baseX;
        let py = p.baseY;
        let pz = p.baseZ;

        // 有机浮动（Lissajous 风格）
        const t = time * preset.speed * p.speedMul;
        px += Math.sin(t * p.freqX + p.phaseX) * p.ampX;
        py += Math.cos(t * p.freqY + p.phaseY) * p.ampY;
        pz += Math.sin(t * p.freqZ + p.phaseZ) * p.ampZ;

        // 上升/下落
        if (preset.rise) {
          py += t * preset.riseSpeed;
          // 从底部循环回来
          while (py > spread.y / 2 + 2) py -= spread.y + 4;
          while (py < -spread.y / 2 - 2) py += spread.y + 4;
          p.baseY = py;
        }

        if (preset.fall) {
          const fallSpeed = preset.speed * p.speedMul * 3;
          py = p.fallY - (t * fallSpeed % (spread.y + 6)) + spread.y / 2 + 3;
        }

        // 水平漂移
        if (preset.drift) {
          px += Math.sin(t * 0.4 + p.phaseX) * preset.drift;
        }

        // 雪花摇摆
        if (preset.wobble) {
          px += Math.sin(t * 2.5 + p.phaseZ) * preset.wobble;
          pz += Math.cos(t * 2.1 + p.phaseX) * preset.wobble * 0.6;
        }

        // ── 鼠标排斥 ──
        if (this.pointerStrength > 0.01) {
          const dx = px - mouseX;
          const dy = py - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouseInfluence) {
            const force = (1 - dist / mouseInfluence) * this.pointerStrength * 0.8;
            px += (dx / (dist + 0.01)) * force;
            py += (dy / (dist + 0.01)) * force;
          }
        }

        // 边界钳制
        px = Math.max(-spread.x / 2 - 2, Math.min(spread.x / 2 + 2, px));
        py = Math.max(-spread.y / 2 - 3, Math.min(spread.y / 2 + 3, py));
        pz = Math.max(-spread.z / 2 - 2, Math.min(spread.z / 2 + 2, pz));

        p.x = px;
        p.y = py;
        p.z = pz;

        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;
      }

      this.pointsMesh.geometry.attributes.position.needsUpdate = true;

      // 粒子颜色渐变过渡
      const targetColor = new THREE.Color(preset.colorIn);
      this.pointsMesh.material.color.lerp(targetColor, 0.02);
      this.pointsMesh.material.opacity += (0.7 - this.pointsMesh.material.opacity) * 0.02;
    }

    // ── 更新环境微尘 ──
    if (this.dustMesh) {
      const dpos = this.dustMesh.geometry.attributes.position.array;
      for (let i = 0; i < this.dustParticles.length; i++) {
        const d = this.dustParticles[i];
        dpos[i * 3] = d.baseX + Math.sin(time * d.freq + d.phase) * d.amp;
        dpos[i * 3 + 1] = d.baseY + Math.cos(time * d.freq * 1.3 + d.phase) * d.amp;
        dpos[i * 3 + 2] = d.baseZ + Math.sin(time * d.freq * 0.7 + d.phase) * d.amp * 0.5;

        // 鼠标微弱影响微尘
        if (this.pointerStrength > 0.01) {
          const dx = dpos[i * 3] - mouseX;
          const dy = dpos[i * 3 + 1] - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouseInfluence * 1.5) {
            const force = (1 - dist / (mouseInfluence * 1.5)) * this.pointerStrength * 0.3;
            dpos[i * 3] += (dx / (dist + 0.01)) * force;
            dpos[i * 3 + 1] += (dy / (dist + 0.01)) * force;
          }
        }
      }
      this.dustMesh.geometry.attributes.position.needsUpdate = true;
    }

    // ── 闪电 ──
    if (preset.lightning) {
      this.lightningCooldown -= 0.016; // ~60fps
      this.lightningFlash *= 0.85;

      if (this.lightningCooldown <= 0 && Math.random() < 0.008) {
        this.lightningFlash = 0.4 + Math.random() * 0.4;
        this.lightningCooldown = 2 + Math.random() * 5;
        // 闪电后可能跟第二次弱闪
        if (Math.random() < 0.3) {
          setTimeout(() => { this.lightningFlash = 0.15 + Math.random() * 0.15; }, 80 + Math.random() * 120);
        }
      }

      // 闪电照亮场景
      if (this.lightningFlash > 0.005) {
        this.scene.background = new THREE.Color(
          `rgb(${Math.floor(30 + this.lightningFlash * 255)},${Math.floor(30 + this.lightningFlash * 255)},${Math.floor(40 + this.lightningFlash * 255)})`
        );
      } else {
        this.scene.background = null;
      }
    } else {
      this.scene.background = null;
    }

    // 场景雾色渐变
    const targetFog = new THREE.Color(preset.fogColor);
    if (this.scene.fog && this.scene.fog.color) {
      this.scene.fog.color.lerp(targetFog, 0.02);
      this.scene.fog.density += (preset.fogDensity - this.scene.fog.density) * 0.02;
    }

    // 相机微动（呼吸感）
    this.camera.position.x += (Math.sin(time * 0.3) * 0.08 - this.camera.position.x) * 0.01;
    this.camera.position.y += (Math.cos(time * 0.25) * 0.06 - this.camera.position.y) * 0.01;

    this.renderer.render(this.scene, this.camera);
  }

  // ── 销毁 ────────────────────────────────────────
  destroy() {
    if (this.pointsMesh) {
      this.scene.remove(this.pointsMesh);
      this.pointsMesh.geometry.dispose();
      this.pointsMesh.material.dispose();
    }
    if (this.dustMesh) {
      this.scene.remove(this.dustMesh);
      this.dustMesh.geometry.dispose();
      this.dustMesh.material.dispose();
    }
    if (this.glowTex) this.glowTex.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    this.particles = [];
    this.dustParticles = [];
  }
}
