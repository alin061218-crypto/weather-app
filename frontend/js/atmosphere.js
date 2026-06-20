/**
 * atmosphere.js — 3D 天气氛围背景（v9 重写）
 *
 * 每种天气类型有独立的 3D 场景：
 *   晴天 → 太阳 + 光线 + 暖色微尘
 *   多云 → 太阳 + 飘动云朵 + 微尘
 *   阴天 → 厚云层
 *   雨天 → 下落雨滴 + 阴云
 *   雪天 → 飘落雪花
 *   雾天 → 弥漫大颗粒雾气
 *   雷暴 → 暴雨 + 闪电
 *   夜晚 → 月亮 + 星星
 *
 * 用法：
 *   import { Atmosphere } from './atmosphere.js';
 *   const atm = new Atmosphere(document.getElementById('atmosphere'));
 *   atm.setWeather(code, isDay);
 */

import * as THREE from 'three';

// ── 创建 Canvas 纹理 ──────────────────────────────
function makeGlowTexture(innerColor, outerColor, size = 128) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, innerColor);
  g.addColorStop(0.3, innerColor);
  g.addColorStop(1, outerColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function makeStreakTexture(inner, outer, w = 8, h = 64) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, outer);
  g.addColorStop(0.3, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(c);
}

// ── 天气代码映射 ──────────────────────────────────
function codeToType(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'cloudy';
  if (code === 3) return 'overcast';
  if (code >= 45 && code <= 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
  if (code >= 95) return 'storm';
  return 'clear';
}

// ── 场景对象类 ────────────────────────────────────

class SunScene {
  constructor(scene, isDay) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.isDay = isDay;
    this._build();
  }

  _build() {
    if (!this.isDay) {
      // 月亮 + 星星
      const moonGeo = new THREE.SphereGeometry(0.35, 32, 32);
      const moonMat = new THREE.MeshBasicMaterial({ color: '#f5f0e0' });
      const moon = new THREE.Mesh(moonGeo, moonMat);
      moon.position.set(1.8, 1.4, -2);
      this.group.add(moon);

      // 月晕
      const haloGeo = new THREE.SphereGeometry(0.55, 32, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: '#f5f0e0',
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(moon.position);
      this.group.add(halo);

      // 星星（散布在上半区）
      const starCount = 120;
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        starPos[i * 3] = (Math.random() - 0.5) * 12;
        starPos[i * 3 + 1] = Math.random() * 5 + 1;
        starPos[i * 3 + 2] = -1 - Math.random() * 4;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starTex = makeGlowTexture('#ffffff', 'transparent', 32);
      const starMat = new THREE.PointsMaterial({
        map: starTex,
        color: '#ffffff',
        size: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.7,
      });
      this.stars = new THREE.Points(starGeo, starMat);
      this.group.add(this.stars);
    } else {
      // 太阳
      const sunGeo = new THREE.SphereGeometry(0.45, 32, 32);
      const sunMat = new THREE.MeshBasicMaterial({ color: '#ffe8b0' });
      const sun = new THREE.Mesh(sunGeo, sunMat);
      sun.position.set(1.5, 1.5, -2);
      this.group.add(sun);

      // 日晕（多层）
      for (let s = 0.7; s <= 1.6; s += 0.3) {
        const g = new THREE.SphereGeometry(s, 32, 32);
        const m = new THREE.MeshBasicMaterial({
          color: '#ffe8b0',
          transparent: true,
          opacity: 0.04,
          depthWrite: false,
        });
        const h = new THREE.Mesh(g, m);
        h.position.copy(sun.position);
        this.group.add(h);
      }

      // 光线（长条 sprite 围绕太阳）
      const rayTex = makeGlowTexture('#ffe8b0', 'transparent', 64);
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.2;
        const len = 1.8 + Math.random() * 2.5;
        const rayGeo = new THREE.PlaneGeometry(0.06, len);
        const rayMat = new THREE.MeshBasicMaterial({
          map: rayTex,
          transparent: true,
          opacity: 0.25 + Math.random() * 0.2,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        const ray = new THREE.Mesh(rayGeo, rayMat);
        ray.position.copy(sun.position);
        ray.position.x += Math.cos(angle) * len / 2;
        ray.position.y += Math.sin(angle) * len / 2;
        ray.rotation.z = angle;
        ray.userData = { angle, length: len, baseX: sun.position.x, baseY: sun.position.y };
        this.group.add(ray);
      }

      this.sunPos = sun.position.clone();
    }

    // 环境微尘（暖色调，慢速）
    this._addDust(60, '#ffe8b0', 0.25, 0.08);
    this.scene.add(this.group);
  }

  _addDust(count, color, opacity, size) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = makeGlowTexture(color, 'transparent', 32);
    const mat = new THREE.PointsMaterial({
      map: tex,
      size,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dustData = [];
    for (let i = 0; i < count; i++) {
      this.dustData.push({
        baseX: pos[i * 3],
        baseY: pos[i * 3 + 1],
        baseZ: pos[i * 3 + 2],
        phase: Math.random() * Math.PI * 2,
        freq: 0.15 + Math.random() * 0.4,
        amp: 0.3 + Math.random() * 1.0,
      });
    }
    this.group.add(this.dust);
  }

  update(time, pointer) {
    if (this.dust && this.dustData) {
      const posArr = this.dust.geometry.attributes.position.array;
      for (let i = 0; i < this.dustData.length; i++) {
        const d = this.dustData[i];
        let px = d.baseX + Math.sin(time * d.freq + d.phase) * d.amp;
        let py = d.baseY + Math.cos(time * d.freq * 0.7 + d.phase) * d.amp;
        let pz = d.baseZ;

        // 鼠标排斥
        if (pointer) {
          const dx = px - pointer.x * 5;
          const dy = py - pointer.y * 3;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 2) {
            const f = (1 - dist / 2) * 0.5;
            px += (dx / (dist + 0.01)) * f;
            py += (dy / (dist + 0.01)) * f;
          }
        }

        posArr[i * 3] = px;
        posArr[i * 3 + 1] = py;
        posArr[i * 3 + 2] = pz;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.group.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
    this.scene.remove(this.group);
  }
}

// ── 阴云场景 ──────────────────────────────────────
class CloudScene {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.clouds = [];
    this._build();
  }

  _build() {
    // 几朵大云
    const cloudDefs = [
      { x: -2, y: 1.6, z: -2, scale: 0.9 },
      { x: 1.8, y: 1.2, z: -2.5, scale: 1.1 },
      { x: -0.5, y: 2.0, z: -1.8, scale: 0.75 },
      { x: 2.5, y: 0.7, z: -3, scale: 0.85 },
      { x: -3, y: 0.8, z: -3, scale: 0.7 },
    ];

    for (const def of cloudDefs) {
      const cloudGroup = new THREE.Group();
      const blobCount = 5 + Math.floor(Math.random() * 6);
      for (let j = 0; j < blobCount; j++) {
        const r = 0.2 + Math.random() * 0.5;
        const g = new THREE.SphereGeometry(r, 12, 10);
        const m = new THREE.MeshBasicMaterial({
          color: '#d8dce3',
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        });
        const blob = new THREE.Mesh(g, m);
        blob.position.set(
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.3,
        );
        cloudGroup.add(blob);
      }
      cloudGroup.position.set(def.x, def.y, def.z);
      cloudGroup.scale.setScalar(def.scale);
      cloudGroup.userData = {
        baseX: def.x,
        baseY: def.y,
        speed: 0.08 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
      };
      this.group.add(cloudGroup);
      this.clouds.push(cloudGroup);
    }

    // 微尘
    this._addDust(50, '#d0d8e0', 0.3, 0.06);
    this.scene.add(this.group);
  }

  _addDust(count, color, opacity, size) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = makeGlowTexture(color, 'transparent', 32);
    const mat = new THREE.PointsMaterial({
      map: tex,
      size,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dustData = [];
    for (let i = 0; i < count; i++) {
      this.dustData.push({
        baseX: pos[i * 3], baseY: pos[i * 3 + 1], baseZ: pos[i * 3 + 2],
        phase: Math.random() * Math.PI * 2,
        freq: 0.1 + Math.random() * 0.3,
        amp: 0.3 + Math.random() * 0.8,
      });
    }
    this.group.add(this.dust);
  }

  update(time, pointer) {
    // 云朵横向飘动
    for (const c of this.clouds) {
      c.position.x = c.userData.baseX + Math.sin(time * c.userData.speed + c.userData.phase) * 1.5;
      c.position.y = c.userData.baseY + Math.cos(time * c.userData.speed * 0.5) * 0.3;
    }

    // 微尘
    if (this.dust && this.dustData) {
      const posArr = this.dust.geometry.attributes.position.array;
      for (let i = 0; i < this.dustData.length; i++) {
        const d = this.dustData[i];
        let px = d.baseX + Math.sin(time * d.freq + d.phase) * d.amp;
        let py = d.baseY + Math.cos(time * d.freq * 0.7 + d.phase) * d.amp;
        if (pointer) {
          const dx = px - pointer.x * 5, dy = py - pointer.y * 3;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 2) {
            const f = (1 - dist / 2) * 0.4;
            px += (dx / (dist + 0.01)) * f;
            py += (dy / (dist + 0.01)) * f;
          }
        }
        posArr[i * 3] = px; posArr[i * 3 + 1] = py; posArr[i * 3 + 2] = d.baseZ;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.group.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
    this.scene.remove(this.group);
  }
}

// ── 雨场景 ────────────────────────────────────────
class RainScene {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this._build();
  }

  _build() {
    const count = 280;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.rainData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      this.rainData.push({
        y: pos[i * 3 + 1],
        speed: 2.5 + Math.random() * 5,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = makeStreakTexture('#b0c8e0', 'transparent', 4, 48);
    const mat = new THREE.PointsMaterial({
      map: tex,
      color: '#a0c0e0',
      size: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.55,
    });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);

    // 几朵暗云
    for (let i = 0; i < 3; i++) {
      const cg = new THREE.Group();
      for (let j = 0; j < 6; j++) {
        const r = 0.3 + Math.random() * 0.5;
        const g = new THREE.SphereGeometry(r, 10, 8);
        const m = new THREE.MeshBasicMaterial({
          color: '#505868',
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        });
        const b = new THREE.Mesh(g, m);
        b.position.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.4, 0);
        cg.add(b);
      }
      cg.position.set((Math.random() - 0.5) * 6, 2 + Math.random() * 2, -2);
      cg.userData = { speed: 0.05 + Math.random() * 0.1, phase: Math.random() * Math.PI * 2 };
      this.group.add(cg);
      if (!this.darkClouds) this.darkClouds = [];
      this.darkClouds.push(cg);
    }

    this.scene.add(this.group);
  }

  update(time, pointer) {
    const posArr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.rainData.length; i++) {
      const r = this.rainData[i];
      r.y -= r.speed * 0.016;
      if (r.y < -5) { r.y = 5; posArr[i * 3] = (Math.random() - 0.5) * 10; }
      posArr[i * 3 + 1] = r.y;

      // 微风偏移
      posArr[i * 3] += 0.003;
      if (posArr[i * 3] > 5) posArr[i * 3] = -5;
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    if (this.darkClouds) {
      for (const c of this.darkClouds) {
        c.position.x += c.userData.speed * 0.016;
        if (c.position.x > 6) c.position.x = -6;
      }
    }
  }

  dispose() {
    this.group.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
    this.scene.remove(this.group);
  }
}

// ── 雪场景 ────────────────────────────────────────
class SnowScene {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this._build();
  }

  _build() {
    const count = 160;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.snowData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
      this.snowData.push({
        y: pos[i * 3 + 1],
        x: pos[i * 3],
        speed: 0.3 + Math.random() * 0.8,
        wobbleAmp: 0.3 + Math.random() * 1.0,
        wobbleFreq: 1.5 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = makeGlowTexture('#ffffff', 'transparent', 24);
    const mat = new THREE.PointsMaterial({
      map: tex,
      color: '#f8f8ff',
      size: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.6,
    });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);
    this.scene.add(this.group);
  }

  update(time, pointer) {
    const posArr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.snowData.length; i++) {
      const s = this.snowData[i];
      s.y -= s.speed * 0.016;
      if (s.y < -4.5) { s.y = 4.5; s.x = (Math.random() - 0.5) * 12; }
      s.x += Math.sin(time * s.wobbleFreq + s.phase) * s.wobbleAmp * 0.01;
      if (s.x > 6) s.x = -6;
      if (s.x < -6) s.x = 6;
      posArr[i * 3] = s.x;
      posArr[i * 3 + 1] = s.y;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.group.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
    this.scene.remove(this.group);
  }
}

// ── 雾场景 ────────────────────────────────────────
class FogScene {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this._build();
  }

  _build() {
    const count = 35;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.fogData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
      this.fogData.push({
        baseX: pos[i * 3], baseY: pos[i * 3 + 1], baseZ: pos[i * 3 + 2],
        phase: Math.random() * Math.PI * 2,
        freq: 0.05 + Math.random() * 0.15,
        amp: 0.5 + Math.random() * 2,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = makeGlowTexture('#d8dce3', 'transparent', 128);
    const mat = new THREE.PointsMaterial({
      map: tex,
      color: '#c8ced6',
      size: 1.8,
      blending: THREE.NormalBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.28,
    });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);
    this.scene.add(this.group);
  }

  update(time, pointer) {
    const posArr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.fogData.length; i++) {
      const f = this.fogData[i];
      let px = f.baseX + Math.sin(time * f.freq + f.phase) * f.amp;
      let py = f.baseY + Math.cos(time * f.freq * 0.6 + f.phase) * f.amp * 0.6;
      if (pointer) {
        const dx = px - pointer.x * 5, dy = py - pointer.y * 3;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 3) {
          const force = (1 - dist / 3) * 1.0;
          px += (dx / (dist + 0.01)) * force;
          py += (dy / (dist + 0.01)) * force;
        }
      }
      posArr[i * 3] = px; posArr[i * 3 + 1] = py; posArr[i * 3 + 2] = f.baseZ;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.group.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
    this.scene.remove(this.group);
  }
}

// ── 雷暴场景 ──────────────────────────────────────
class StormScene {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.lightningFlash = 0;
    this.lightningCooldown = 0;
    this._build();
  }

  _build() {
    // 暴雨
    const count = 350;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.rainData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      this.rainData.push({ y: pos[i * 3 + 1], speed: 3 + Math.random() * 8 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = makeStreakTexture('#8898b0', 'transparent', 4, 48);
    const mat = new THREE.PointsMaterial({
      map: tex, color: '#8898b0', size: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7,
    });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);

    // 乌云
    for (let i = 0; i < 4; i++) {
      const cg = new THREE.Group();
      for (let j = 0; j < 7; j++) {
        const r = 0.35 + Math.random() * 0.6;
        const g = new THREE.SphereGeometry(r, 10, 8);
        const m = new THREE.MeshBasicMaterial({ color: '#383848', transparent: true, opacity: 0.6, depthWrite: false });
        const b = new THREE.Mesh(g, m);
        b.position.set((Math.random() - 0.5) * 1.8, (Math.random() - 0.5) * 0.5, 0);
        cg.add(b);
      }
      cg.position.set((Math.random() - 0.5) * 6, 1.5 + Math.random() * 2.5, -2);
      cg.userData = { speed: 0.08 + Math.random() * 0.15 };
      this.group.add(cg);
      if (!this.darkClouds) this.darkClouds = [];
      this.darkClouds.push(cg);
    }

    this.scene.add(this.group);
  }

  update(time, pointer) {
    // 雨
    const posArr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.rainData.length; i++) {
      const r = this.rainData[i];
      r.y -= r.speed * 0.016;
      if (r.y < -5) { r.y = 5; posArr[i * 3] = (Math.random() - 0.5) * 10; }
      posArr[i * 3 + 1] = r.y;
      posArr[i * 3] += 0.006;
      if (posArr[i * 3] > 5) posArr[i * 3] = -5;
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    // 云
    if (this.darkClouds) {
      for (const c of this.darkClouds) {
        c.position.x += c.userData.speed * 0.016;
        if (c.position.x > 6) c.position.x = -6;
      }
    }

    // 闪电
    this.lightningCooldown -= 0.016;
    this.lightningFlash *= 0.82;
    if (this.lightningCooldown <= 0 && Math.random() < 0.012) {
      this.lightningFlash = 0.3 + Math.random() * 0.5;
      this.lightningCooldown = 2 + Math.random() * 6;
      if (Math.random() < 0.35) {
        setTimeout(() => { this.lightningFlash = 0.12 + Math.random() * 0.15; }, 60 + Math.random() * 100);
      }
    }
  }

  dispose() {
    this.group.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
    this.scene.remove(this.group);
  }
}

// ── 主 Atmosphere 类 ──────────────────────────────
export class Atmosphere {
  constructor(container) {
    if (!container) return;
    this.container = container;
    this.currentType = null;
    this.currentScene = null;

    this.pointer = new THREE.Vector2(9999, 9999);
    this.pointerTarget = new THREE.Vector2(9999, 9999);
    this.pointerActive = false;

    this._init();
    this._bindEvents();
    this._animate();
  }

  _init() {
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 20);
    this.camera.position.z = 5;
    this.camera.lookAt(0, 0, 0);
  }

  setWeather(code, isDay) {
    const type = codeToType(code) + (isDay ? '' : '-night');

    // 夜间晴/多云/阴场覆切换
    let sceneKey;
    if (!isDay && (type.startsWith('clear') || type.startsWith('cloudy') || type.startsWith('overcast'))) {
      sceneKey = 'clear-night';
    } else if (type.startsWith('clear')) {
      sceneKey = 'clear-day';
    } else if (type.startsWith('cloudy')) {
      sceneKey = 'cloudy';
    } else if (type.startsWith('overcast')) {
      sceneKey = 'cloudy'; // 阴天用多云场景但云更多
    } else {
      sceneKey = type;
    }

    if (sceneKey === this.currentType) return;
    this.currentType = sceneKey;

    // 清除旧场景
    if (this.currentScene) {
      this.currentScene.dispose();
      this.currentScene = null;
    }

    // 创建新场景
    switch (sceneKey) {
      case 'clear-day':
      case 'clear-night':
        this.currentScene = new SunScene(this.scene, sceneKey === 'clear-day');
        break;
      case 'cloudy':
        this.currentScene = new CloudScene(this.scene);
        break;
      case 'rain':
        this.currentScene = new RainScene(this.scene);
        break;
      case 'snow':
        this.currentScene = new SnowScene(this.scene);
        break;
      case 'fog':
        this.currentScene = new FogScene(this.scene);
        break;
      case 'storm':
        this.currentScene = new StormScene(this.scene);
        break;
      default:
        this.currentScene = new SunScene(this.scene, true);
    }
  }

  _bindEvents() {
    window.addEventListener('mousemove', (e) => {
      this.pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerTarget.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.pointerActive = true;
    });
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.pointerTarget.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        this.pointerTarget.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
        this.pointerActive = true;
      }
    }, { passive: true });
    window.addEventListener('mouseleave', () => { this.pointerActive = false; });
    window.addEventListener('touchend', () => { this.pointerActive = false; });
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(W, H);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const time = performance.now() * 0.001;

    // 鼠标平滑
    this.pointer.lerp(this.pointerTarget, 0.06);
    if (!this.pointerActive) this.pointerTarget.set(9999, 9999);
    const ptr = this.pointerActive ? this.pointer : null;

    // 更新当前场景
    if (this.currentScene && this.currentScene.update) {
      this.currentScene.update(time, ptr);
    }

    // 闪电照亮（雷暴场景）
    if (this.currentScene && this.currentScene.lightningFlash !== undefined) {
      const flash = this.currentScene.lightningFlash;
      if (flash > 0.003) {
        this.scene.background = new THREE.Color(
          `rgb(${Math.floor(20+flash*255)},${Math.floor(20+flash*255)},${Math.floor(30+flash*255)})`
        );
      } else {
        this.scene.background = null;
      }
    } else {
      this.scene.background = null;
    }

    // 相机微动（呼吸感）
    this.camera.position.x += (Math.sin(time * 0.3) * 0.06 - this.camera.position.x) * 0.01;
    this.camera.position.y += (Math.cos(time * 0.22) * 0.05 - this.camera.position.y) * 0.01;

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.currentScene) this.currentScene.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
