/**
 * atmosphere.js — 3D 天气氛围背景
 *
 * 每个天气有独立场景：晴 多云 阴天 雨 雪 雾 雷暴（含夜晚）
 * v11: 所有场景 delta-time 控速；InstancedMesh 雨水；扁平椭圆云；雪花微尘；雾层柔和
 */

import * as THREE from 'three';

// ── Canvas 纹理 ──────────────────────────────────
function glowTex(inner, outer, s = 64) {
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d'), h = s / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, inner); g.addColorStop(0.25, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// ── 天气代码 → 类型 ──────────────────────────────
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

// ═══════════════════════════════════════════════════
//  晴天/晴天夜间
// ═══════════════════════════════════════════════════
class SunScene {
  constructor(scene, isDay) {
    this.scene = scene; this.group = new THREE.Group(); this.isDay = isDay;
    this.dustData = []; this.starData = [];
    this._build();
  }

  _build() {
    if (!this.isDay) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 32), new THREE.MeshBasicMaterial({ color: '#f5f0e0' }));
      moon.position.set(1.8, 1.4, -2); this.group.add(moon);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), new THREE.MeshBasicMaterial({ color: '#f5f0e0', transparent: true, opacity: 0.08, depthWrite: false }));
      halo.position.copy(moon.position); this.group.add(halo);
      const N = 120, arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        arr[i * 3] = (Math.random() - 0.5) * 12; arr[i * 3 + 1] = Math.random() * 5 + 1; arr[i * 3 + 2] = -1 - Math.random() * 4;
        this.starData.push({ tw: 0.4 + Math.random() * 0.8, ph: Math.random() * Math.PI * 2, sp: 0.8 + Math.random() * 2.5 });
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const sm = new THREE.PointsMaterial({ map: glowTex('#ffffff', 'transparent', 16), color: '#ffffff', size: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 });
      this.stars = new THREE.Points(sg, sm); this.group.add(this.stars);
    } else {
      const sun = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 32), new THREE.MeshBasicMaterial({ color: '#ffe8b0' }));
      sun.position.set(1.5, 1.5, -2); this.group.add(sun);
      for (let s = 0.7; s <= 1.6; s += 0.3) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(s, 32, 32), new THREE.MeshBasicMaterial({ color: '#ffe8b0', transparent: true, opacity: 0.04, depthWrite: false }));
        h.position.copy(sun.position); this.group.add(h);
      }
      const rt = glowTex('#ffe8b0', 'transparent', 32);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.random() * 0.2, len = 1.5 + Math.random() * 2;
        const r = new THREE.Mesh(new THREE.PlaneGeometry(0.05, len), new THREE.MeshBasicMaterial({ map: rt, transparent: true, opacity: 0.2 + Math.random() * 0.15, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        r.position.set(sun.position.x + Math.cos(a) * len / 2, sun.position.y + Math.sin(a) * len / 2, sun.position.z); r.rotation.z = a; this.group.add(r);
      }
    }
    this._addDust(60, '#ffe8b0', 0.22, 0.07);
    this.scene.add(this.group);
  }

  _addDust(N, color, opacity, size) {
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { arr[i * 3] = (Math.random() - 0.5) * 12; arr[i * 3 + 1] = (Math.random() - 0.5) * 8; arr[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ map: glowTex(color, 'transparent', 32), size, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity });
    this.dust = new THREE.Points(g, m);
    for (let i = 0; i < N; i++) this.dustData.push({ bx: arr[i * 3], by: arr[i * 3 + 1], bz: arr[i * 3 + 2], ph: Math.random() * Math.PI * 2, fq: 0.15 + Math.random() * 0.4, amp: 0.25 + Math.random() * 0.8 });
    this.group.add(this.dust);
  }

  update(dt, time, ptr) {
    if (!this.dust) return;
    const arr = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < this.dustData.length; i++) {
      const d = this.dustData[i];
      let px = d.bx + Math.sin(time * d.fq + d.ph) * d.amp, py = d.by + Math.cos(time * d.fq * 0.7 + d.ph) * d.amp;
      if (ptr) { const dx = px - ptr.x * 5; const dy = py - ptr.y * 3; const dist = Math.hypot(dx, dy); if (dist < 2) { const f = (1 - dist / 2) * 0.45; px += dx / (dist + 0.01) * f; py += dy / (dist + 0.01) * f; } }
      arr[i * 3] = px; arr[i * 3 + 1] = py; arr[i * 3 + 2] = d.bz;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    if (this.stars && this.starData.length) {
      for (let i = 0; i < this.starData.length; i++) { const sd = this.starData[i]; this.stars.material.opacity = 0.55 + 0.2 * Math.sin(time * sd.sp + sd.ph); }
    }
  }

  dispose() { this.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } }); this.scene.remove(this.group); }
}

// ═══════════════════════════════════════════════════
//  多云 / 阴天 —— 扁平椭圆云朵
// ═══════════════════════════════════════════════════
class CloudScene {
  constructor(scene, overcast = false) {
    this.scene = scene; this.overcast = overcast;
    this.group = new THREE.Group(); this.clouds = []; this.dustData = [];
    this._build();
  }

  _build() {
    const defs = this.overcast
      ? [{ x: -1.5, y: 1.2, z: -2, w: 1.3 }, { x: 1.2, y: 1.5, z: -2.3, w: 1.4 }, { x: 0, y: 2.0, z: -1.5, w: 1.0 }, { x: -2.8, y: 1.7, z: -2.8, w: 1.1 }, { x: 2.5, y: 1.0, z: -2.8, w: 1.0 }, { x: -3.5, y: 0.5, z: -2, w: 0.9 }]
      : [{ x: -2.2, y: 1.5, z: -2.2, w: 0.9 }, { x: 1.8, y: 1.3, z: -2.5, w: 1.1 }, { x: -0.3, y: 1.9, z: -1.8, w: 0.7 }, { x: 2.6, y: 0.8, z: -3.0, w: 0.8 }, { x: -3.0, y: 0.9, z: -3.0, w: 0.65 }];
    for (const def of defs) {
      const grp = new THREE.Group();
      const br = 0.45 * def.w, by = 0.25 * def.w, n = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) {
        const rx = br * (0.5 + Math.random() * 1.3), ry = by * (0.5 + Math.random() * 1.0), rz = rx * (0.7 + Math.random() * 0.6);
        const g = new THREE.SphereGeometry(1, 14, 10); g.scale(rx, ry, rz);
        const b = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#eef0f4', transparent: true, opacity: 0.55, depthWrite: false }));
        b.position.set((Math.random() - 0.5) * def.w * 1.8, (Math.random() - 0.5) * def.w * 0.24 - def.w * 0.05, (Math.random() - 0.5) * def.w * 0.4);
        grp.add(b);
      }
      for (let j = 0; j < 3; j++) {
        const g = new THREE.SphereGeometry(1, 10, 8); g.scale(br * 1.1, by * 0.5, br * 0.8);
        const b = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e8ecf1', transparent: true, opacity: 0.45, depthWrite: false }));
        b.position.set((Math.random() - 0.5) * def.w * 1.2, -def.w * 0.15 - Math.random() * 0.15, (Math.random() - 0.5) * def.w * 0.3);
        grp.add(b);
      }
      grp.position.set(def.x, def.y, def.z);
      grp.userData = { bx: def.x, by: def.y, sp: 0.04 + Math.random() * 0.10, ph: Math.random() * Math.PI * 2 };
      this.group.add(grp); this.clouds.push(grp);
    }
    this._addDust(50, '#d0d8e0', 0.28, 0.05);
    this.scene.add(this.group);
  }

  _addDust(N, color, opacity, size) {
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { arr[i * 3] = (Math.random() - 0.5) * 12; arr[i * 3 + 1] = (Math.random() - 0.5) * 8; arr[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex(color, 'transparent', 32), size, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    this.group.add(this.dust);
    for (let i = 0; i < N; i++) this.dustData.push({ bx: arr[i * 3], by: arr[i * 3 + 1], bz: arr[i * 3 + 2], ph: Math.random() * Math.PI * 2, fq: 0.08 + Math.random() * 0.2, amp: 0.25 + Math.random() * 0.7 });
  }

  update(dt, time, ptr) {
    for (const c of this.clouds) c.position.x = c.userData.bx + Math.sin(time * c.userData.sp + c.userData.ph) * 1.2;
    if (this.dust) {
      const arr = this.dust.geometry.attributes.position.array;
      for (let i = 0; i < this.dustData.length; i++) {
        const d = this.dustData[i];
        let px = d.bx + Math.sin(time * d.fq + d.ph) * d.amp, py = d.by + Math.cos(time * d.fq * 0.6 + d.ph) * d.amp;
        if (ptr) { const dx = px - ptr.x * 5; const dy = py - ptr.y * 3; const dist = Math.hypot(dx, dy); if (dist < 2) { const f = (1 - dist / 2) * 0.35; px += dx / (dist + 0.01) * f; py += dy / (dist + 0.01) * f; } }
        arr[i * 3] = px; arr[i * 3 + 1] = py; arr[i * 3 + 2] = d.bz;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() { this.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } }); this.scene.remove(this.group); }
}

// ═══════════════════════════════════════════════════
//  雨 —— InstancedMesh 细杆雨滴
// ═══════════════════════════════════════════════════
class RainScene {
  constructor(scene, storm = false) {
    this.scene = scene; this.group = new THREE.Group(); this.storm = storm;
    this.darkClouds = []; this.dustData = [];
    this._build();
  }

  _build() {
    const N = this.storm ? 220 : 140, Y_SPAN = 9;
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4);
    const mat = new THREE.MeshBasicMaterial({ color: this.storm ? '#8898b0' : '#b0c8e0', transparent: true, opacity: 0.45, depthWrite: false });
    this.instanced = new THREE.InstancedMesh(geo, mat, N); this.data = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 10, y = (Math.random() - 0.5) * Y_SPAN, z = (Math.random() - 0.5) * 4;
      dummy.position.set(x, y, z); dummy.updateMatrix(); this.instanced.setMatrixAt(i, dummy.matrix);
      this.data.push({ y, sp: this.storm ? (4 + Math.random() * 7) : (2 + Math.random() * 4), x });
    }
    this.group.add(this.instanced);
    const cn = this.storm ? 3 : 2;
    for (let i = 0; i < cn; i++) {
      const grp = new THREE.Group();
      for (let j = 0; j < 5; j++) {
        const r = 0.25 + Math.random() * 0.4;
        const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: '#505868', transparent: true, opacity: 0.42, depthWrite: false }));
        b.position.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.4, 0);
        grp.add(b);
      }
      grp.position.set((Math.random() - 0.5) * 6, 2 + Math.random() * 2, -2);
      grp.userData = { sp: 0.03 + Math.random() * 0.06 };
      this.group.add(grp); this.darkClouds.push(grp);
    }
    this._addDust(25, '#a0b0c0', 0.18, 0.06);
    this.scene.add(this.group);
  }

  _addDust(N, color, opacity, size) {
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { arr[i * 3] = (Math.random() - 0.5) * 12; arr[i * 3 + 1] = (Math.random() - 0.5) * 8; arr[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex(color, 'transparent', 32), size, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    this.group.add(this.dust);
    for (let i = 0; i < N; i++) this.dustData.push({ bx: arr[i * 3], by: arr[i * 3 + 1], bz: arr[i * 3 + 2], ph: Math.random() * Math.PI * 2, fq: 0.06 + Math.random() * 0.15, amp: 0.3 + Math.random() * 0.6 });
  }

  update(dt, time, ptr) {
    const dummy = new THREE.Object3D(), Y_SPAN = 9;
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i];
      d.y -= d.sp * dt;
      if (d.y < -Y_SPAN / 2) { d.y = Y_SPAN / 2; d.x = (Math.random() - 0.5) * 10; }
      d.x += 0.15 * dt; if (d.x > 5) d.x = -5;
      dummy.position.set(d.x, d.y, (Math.random() - 0.5) * 4); dummy.updateMatrix();
      this.instanced.setMatrixAt(i, dummy.matrix);
    }
    this.instanced.instanceMatrix.needsUpdate = true;
    for (const c of this.darkClouds) { c.position.x += c.userData.sp * dt * 60; if (c.position.x > 6) c.position.x = -6; }
    if (this.dust && this.dustData.length) {
      const arr = this.dust.geometry.attributes.position.array;
      for (let i = 0; i < this.dustData.length; i++) {
        const d = this.dustData[i];
        arr[i * 3] = d.bx + Math.sin(time * d.fq + d.ph) * d.amp;
        arr[i * 3 + 1] = d.by + Math.cos(time * d.fq * 0.5 + d.ph) * d.amp;
        arr[i * 3 + 2] = d.bz;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() { this.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } }); this.scene.remove(this.group); }
}

// ═══════════════════════════════════════════════════
//  雪 —— 软白雪花 + 朦胧微尘
// ═══════════════════════════════════════════════════
class SnowScene {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); this.dustData = [];
    this._build();
  }

  _build() {
    // 雪花
    const N = 120;
    const arr = new Float32Array(N * 3);
    this.data = [];
    for (let i = 0; i < N; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12; arr[i * 3 + 1] = (Math.random() - 0.5) * 9; arr[i * 3 + 2] = (Math.random() - 0.5) * 5;
      this.data.push({ y: arr[i * 3 + 1], x: arr[i * 3], sp: 0.15 + Math.random() * 0.35, wa: 0.2 + Math.random() * 0.6, wf: 1.0 + Math.random() * 1.5, ph: Math.random() * Math.PI * 2 });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex('#ffffff', 'transparent', 12), color: '#f8f8ff', size: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    this.group.add(this.points);

    // 雪氛微尘（柔和白雾）
    const DN = 20;
    const darr = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) { darr[i * 3] = (Math.random() - 0.5) * 12; darr[i * 3 + 1] = (Math.random() - 0.5) * 8; darr[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(darr, 3));
    this.dustPts = new THREE.Points(dg, new THREE.PointsMaterial({ map: glowTex('#f0f0f8', 'transparent', 32), color: '#e8e8f4', size: 0.35, blending: THREE.NormalBlending, depthWrite: false, transparent: true, opacity: 0.16 }));
    this.group.add(this.dustPts);
    for (let i = 0; i < DN; i++) this.dustData.push({ bx: darr[i * 3], by: darr[i * 3 + 1], bz: darr[i * 3 + 2], ph: Math.random() * Math.PI * 2, fq: 0.05 + Math.random() * 0.12, amp: 0.3 + Math.random() * 0.7 });

    this.scene.add(this.group);
  }

  update(dt, time, ptr) {
    const arr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.data.length; i++) {
      const s = this.data[i];
      s.y -= s.sp * dt;
      if (s.y < -4.5) { s.y = 4.5; s.x = (Math.random() - 0.5) * 12; }
      s.x += Math.sin(time * s.wf + s.ph) * s.wa * dt;
      if (s.x > 6) s.x = -6; if (s.x < -6) s.x = 6;
      arr[i * 3] = s.x; arr[i * 3 + 1] = s.y;
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    if (this.dustPts && this.dustData.length) {
      const darr = this.dustPts.geometry.attributes.position.array;
      for (let i = 0; i < this.dustData.length; i++) {
        const d = this.dustData[i];
        let px = d.bx + Math.sin(time * d.fq + d.ph) * d.amp, py = d.by + Math.cos(time * d.fq * 0.5 + d.ph) * d.amp;
        if (ptr) { const dx = px - ptr.x * 5; const dy = py - ptr.y * 3; const dist = Math.hypot(dx, dy); if (dist < 2) { const f = (1 - dist / 2) * 0.4; px += dx / (dist + 0.01) * f; py += dy / (dist + 0.01) * f; } }
        darr[i * 3] = px; darr[i * 3 + 1] = py; darr[i * 3 + 2] = d.bz;
      }
      this.dustPts.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() { this.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } }); this.scene.remove(this.group); }
}

// ═══════════════════════════════════════════════════
//  雾 —— 大颗粒漫射光团
// ═══════════════════════════════════════════════════
class FogScene {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group();
    this._build();
  }

  _build() {
    const N = 30;
    const arr = new Float32Array(N * 3);
    this.data = [];
    for (let i = 0; i < N; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 14; arr[i * 3 + 1] = (Math.random() - 0.5) * 8; arr[i * 3 + 2] = (Math.random() - 0.5) * 6;
      this.data.push({ bx: arr[i * 3], by: arr[i * 3 + 1], bz: arr[i * 3 + 2], ph: Math.random() * Math.PI * 2, fq: 0.04 + Math.random() * 0.10, amp: 0.4 + Math.random() * 1.6 });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ map: glowTex('#d8dce3', 'transparent', 64), color: '#c8ced6', size: 1.6, blending: THREE.NormalBlending, depthWrite: false, transparent: true, opacity: 0.22 });
    this.points = new THREE.Points(g, m); this.group.add(this.points);
    this.scene.add(this.group);
  }

  update(dt, time, ptr) {
    const arr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.data.length; i++) {
      const f = this.data[i];
      let px = f.bx + Math.sin(time * f.fq + f.ph) * f.amp, py = f.by + Math.cos(time * f.fq * 0.5 + f.ph) * f.amp * 0.5;
      if (ptr) { const dx = px - ptr.x * 5; const dy = py - ptr.y * 3; const dist = Math.hypot(dx, dy); if (dist < 3) { const fo = (1 - dist / 3) * 0.9; px += dx / (dist + 0.01) * fo; py += dy / (dist + 0.01) * fo; } }
      arr[i * 3] = px; arr[i * 3 + 1] = py; arr[i * 3 + 2] = f.bz;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() { this.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } }); this.scene.remove(this.group); }
}

// ═══════════════════════════════════════════════════
//  雷暴 (= RainScene + 闪电)
// ═══════════════════════════════════════════════════
class StormScene extends RainScene {
  constructor(scene) { super(scene, true); this.lightningFlash = 0; this.lightningCooldown = 0; }

  update(dt, time, ptr) {
    super.update(dt, time, ptr);
    this.lightningCooldown -= dt;
    this.lightningFlash *= 0.82;
    if (this.lightningCooldown <= 0 && Math.random() < 0.008) {
      this.lightningFlash = 0.25 + Math.random() * 0.45;
      this.lightningCooldown = 2 + Math.random() * 5;
      if (Math.random() < 0.3) setTimeout(() => { this.lightningFlash = 0.10 + Math.random() * 0.12; }, 80 + Math.random() * 100);
    }
  }
}

// ═══════════════════════════════════════════════════
//  主 Atmosphere 入口
// ═══════════════════════════════════════════════════
export class Atmosphere {
  constructor(el) {
    if (!el) return;
    this.el = el; this.scene = null; this.currentType = null; this.currentScene = null;
    this.ptr = new THREE.Vector2(9999, 9999); this.ptrTgt = new THREE.Vector2(9999, 9999); this.ptrOn = false;
    this._init(); this._bind(); this._loop();
  }

  _init() {
    const W = this.el.clientWidth || innerWidth, H = this.el.clientHeight || innerHeight;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(W, H); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 20);
    this.camera.position.z = 5;
  }

  setWeather(code, isDay) {
    const type = codeToType(code);
    let key;
    if (!isDay && (type === 'clear' || type === 'cloudy' || type === 'overcast')) key = 'clear-night';
    else if (type === 'clear') key = 'clear-day';
    else if (type === 'overcast') key = 'overcast';
    else key = type;

    if (key === this.currentType) return;
    this.currentType = key;
    if (this.currentScene) { this.currentScene.dispose(); this.currentScene = null; }

    switch (key) {
      case 'clear-day':  this.currentScene = new SunScene(this.scene, true); break;
      case 'clear-night': this.currentScene = new SunScene(this.scene, false); break;
      case 'cloudy':     this.currentScene = new CloudScene(this.scene, false); break;
      case 'overcast':   this.currentScene = new CloudScene(this.scene, true); break;
      case 'rain':       this.currentScene = new RainScene(this.scene, false); break;
      case 'snow':       this.currentScene = new SnowScene(this.scene); break;
      case 'fog':        this.currentScene = new FogScene(this.scene); break;
      case 'storm':      this.currentScene = new StormScene(this.scene); break;
      default:           this.currentScene = new SunScene(this.scene, true);
    }
  }

  _bind() {
    window.addEventListener('mousemove', e => { this.ptrTgt.x = (e.clientX / innerWidth) * 2 - 1; this.ptrTgt.y = -(e.clientY / innerHeight) * 2 + 1; this.ptrOn = true; });
    window.addEventListener('touchmove', e => { if (e.touches.length > 0) { this.ptrTgt.x = (e.touches[0].clientX / innerWidth) * 2 - 1; this.ptrTgt.y = -(e.touches[0].clientY / innerHeight) * 2 + 1; this.ptrOn = true; } }, { passive: true });
    window.addEventListener('mouseleave', () => { this.ptrOn = false; });
    window.addEventListener('touchend', () => { this.ptrOn = false; });
    window.addEventListener('resize', () => {
      const W = this.el.clientWidth || innerWidth, H = this.el.clientHeight || innerHeight;
      this.renderer.setSize(W, H); this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
    });
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, 0.016);
    const time = performance.now() * 0.001;
    this.ptr.lerp(this.ptrTgt, 0.06);
    if (!this.ptrOn) this.ptrTgt.set(9999, 9999);
    const ptr = this.ptrOn ? this.ptr : null;
    if (this.currentScene?.update) this.currentScene.update(dt, time, ptr);

    if (this.currentScene?.lightningFlash !== undefined) {
      const f = this.currentScene.lightningFlash;
      if (f > 0.003) this.scene.background = new THREE.Color(`rgb(${Math.floor(25 + f * 255)},${Math.floor(25 + f * 255)},${Math.floor(35 + f * 255)})`);
      else this.scene.background = null;
    } else { this.scene.background = null; }

    this.camera.position.x += (Math.sin(time * 0.28) * 0.05 - this.camera.position.x) * 0.008;
    this.camera.position.y += (Math.cos(time * 0.20) * 0.04 - this.camera.position.y) * 0.008;
    this.renderer.render(this.scene, this.camera);
  }

  destroy() { if (this.currentScene) this.currentScene.dispose(); this.renderer.dispose(); this.el.removeChild(this.renderer.domElement); }
}
