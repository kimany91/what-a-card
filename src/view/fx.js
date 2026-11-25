// Effets : particules, débris, ondes de choc, tremblement de caméra, flashs et textes flottants.
import * as THREE from 'three';
import { animate, ease } from './tween.js';

const MAXP = 2500;
const MAXD = 400;

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class Particles {
  constructor(scene, additive) {
    this.n = MAXP;
    this.pos = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 3);
    this.size = new Float32Array(MAXP);
    this.alpha = new Float32Array(MAXP);
    this.vel = new Float32Array(MAXP * 3);
    this.life = new Float32Array(MAXP);
    this.max = new Float32Array(MAXP);
    this.grav = new Float32Array(MAXP);
    this.s0 = new Float32Array(MAXP);
    this.drag = new Float32Array(MAXP);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTexture() }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC,t.a*vA); if(gl_FragColor.a<0.01) discard; }`,
      transparent: true, depthWrite: false, vertexColors: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
    scene.add(this.points);
  }
  emit(p, v, { color, size = 0.2, life = 0.8, gravity = -6, drag = 1.5 }) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.s0[i] = size; this.size[i] = size;
    this.life[i] = life; this.max[i] = life; this.grav[i] = gravity; this.drag[i] = drag; this.alpha[i] = 1;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.alpha[i] = Math.min(1, k * 2.2);
      this.size[i] = this.s0[i] * (0.4 + 0.6 * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = g.attributes.alpha.needsUpdate = true;
  }
}

class Debris {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAXD);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.items = [];
    for (let i = 0; i < MAXD; i++) {
      this.items.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0 });
      this.mesh.setColorAt(i, new THREE.Color('#fff'));
    }
    this.cursor = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sv = new THREE.Vector3();
    scene.add(this.mesh);
  }
  emit(p, v, color, s = 0.08, life = 1.6) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % MAXD;
    const it = this.items[i];
    it.life = life; it.max = life; it.p.copy(p); it.v.copy(v); it.s = s;
    it.w.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    this.mesh.setColorAt(i, new THREE.Color(color));
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < MAXD; i++) {
      const it = this.items[i];
      if (it.life > 0) {
        it.life -= dt;
        it.v.y -= 14 * dt;
        it.p.addScaledVector(it.v, dt);
        if (it.p.y < it.s / 2) { it.p.y = it.s / 2; it.v.y *= -0.35; it.v.x *= 0.7; it.v.z *= 0.7; it.w.multiplyScalar(0.7); }
        it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
      }
      const sc = it.life > 0 ? it.s * Math.min(1, it.life / 0.4) : 0;
      this.q.setFromEuler(it.r);
      this.m.compose(it.p, this.q, this.sv.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class FX {
  constructor(scene, camera, overlay) {
    this.scene = scene; this.camera = camera; this.overlay = overlay;
    this.add = new Particles(scene, true);
    this.norm = new Particles(scene, false);
    this.debris = new Debris(scene);
    this.shakeAmt = 0;
    this.shakeOffset = new THREE.Vector3();
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'flash';
    overlay.appendChild(this.flashEl);
  }
  update(dt) {
    this.add.update(dt); this.norm.update(dt); this.debris.update(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    const s = this.shakeAmt * this.shakeAmt;
    this.shakeOffset.set(rnd(-1, 1) * s * 0.35, rnd(-1, 1) * s * 0.25, rnd(-1, 1) * s * 0.35);
  }
  shake(a = 0.5) { this.shakeAmt = Math.min(1.4, Math.max(this.shakeAmt, a)); }

  flash(color = '#fff', strength = 0.7, dur = 0.35) {
    const el = this.flashEl;
    el.style.background = color;
    return animate(dur, (k) => { el.style.opacity = String(strength * (1 - k)); }, ease.outQuad);
  }

  burst(pos, { n = 30, color = '#ffd166', colors = null, speed = 4, up = 3, size = 0.25, life = 0.8, gravity = -8, additive = true, spread = 1, drag = 1.5 } = {}) {
    const sys = additive ? this.add : this.norm;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed * spread;
      sys.emit(pos, V(Math.cos(a) * r, up * (0.4 + Math.random()), Math.sin(a) * r),
        { color: colors ? colors[i % colors.length] : color, size: size * rnd(0.6, 1.4), life: life * rnd(0.6, 1.2), gravity, drag });
    }
  }
  stream(from, dir, { n = 20, color = '#fff', speed = 6, jitter = 0.6, size = 0.2, life = 0.6, gravity = -2, additive = true } = {}) {
    const sys = additive ? this.add : this.norm;
    for (let i = 0; i < n; i++) {
      const v = dir.clone().normalize().multiplyScalar(speed * rnd(0.7, 1.2)).add(V(rnd(-jitter, jitter), rnd(-jitter, jitter), rnd(-jitter, jitter)));
      sys.emit(from, v, { color, size: size * rnd(0.6, 1.3), life: life * rnd(0.7, 1.2), gravity });
    }
  }
  shatter(pos, colors, { n = 24, speed = 5, s = 0.09 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(1, speed);
      this.debris.emit(pos.clone().add(V(rnd(-0.2, 0.2), rnd(0, 0.4), rnd(-0.2, 0.2))), V(Math.cos(a) * r, rnd(3, 8), Math.sin(a) * r), colors[i % colors.length], s * rnd(0.6, 1.5));
    }
  }
  ring(pos, { color = '#fff', radius = 2.5, dur = 0.5, y = 0.05 } = {}) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y = y; m.renderOrder = 18;
    this.scene.add(m);
    return animate(dur, (k) => { const s = 0.1 + radius * k; m.scale.set(s, s, s); m.material.opacity = 1 - k; }, ease.outCubic)
      .then(() => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  }
  dust(pos, n = 14) { this.burst(pos, { n, color: '#cdbfa6', speed: 2.5, up: 0.8, size: 0.35, life: 0.6, gravity: 0.5, additive: false, drag: 4 }); }
  sparkles(pos, color = '#fff3b0', n = 24) { this.burst(pos, { n, color, speed: 2.5, up: 4, size: 0.18, life: 1, gravity: -3 }); }
  fire(pos, n = 30, scale = 1) {
    this.burst(pos, { n, colors: ['#ffba08', '#f48c06', '#e85d04', '#dc2f02', '#ffea00'], speed: 0.8 * scale, up: 3.5 * scale, size: 0.35 * scale, life: 0.7, gravity: 3, drag: 2 });
    this.burst(pos.clone().add(V(0, 0.4, 0)), { n: Math.floor(n / 3), color: '#3d3d3d', speed: 0.5, up: 2, size: 0.5 * scale, life: 1.2, gravity: 1, additive: false, drag: 2 });
  }
  water(pos, n = 40) { this.burst(pos, { n, colors: ['#48cae4', '#90e0ef', '#caf0f8', '#0096c7'], speed: 3, up: 4, size: 0.2, life: 0.9, gravity: -12, additive: false }); }
  explosion(pos, big = 1) {
    this.burst(pos, { n: 80 * big, colors: ['#fff3b0', '#ffba08', '#f48c06', '#e85d04', '#dc2f02'], speed: 7 * big, up: 6 * big, size: 0.6, life: 0.9, gravity: -2, drag: 3 });
    this.burst(pos, { n: 40 * big, colors: ['#2b2d42', '#4a4e69', '#22223b'], speed: 3 * big, up: 3, size: 0.9, life: 1.6, gravity: 1.5, additive: false, drag: 2.5 });
    this.shatter(pos, ['#2b2d42', '#6c757d', '#e85d04'], { n: 30 * big, speed: 7 });
    this.ring(pos, { color: '#ffd166', radius: 4 * big, dur: 0.5 });
  }

  // Texte flottant ancré sur un point 3D.
  pop(pos3, text, cls = '', dur = 1.1) {
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    this.overlay.appendChild(el);
    const p = pos3.clone();
    const W = this.overlay.clientWidth;
    const half = () => el.offsetWidth / 2 + 8;
    const proj = () => {
      const v = p.clone().project(this.camera);
      const x = (v.x * 0.5 + 0.5) * W;
      return [Math.min(W - half(), Math.max(half(), x)), (-v.y * 0.5 + 0.5) * this.overlay.clientHeight];
    };
    return animate(dur, (k) => {
      const [x, y] = proj();
      const s = k < 0.18 ? ease.outBack(k / 0.18) : 1;
      el.style.transform = `translate(${x}px, ${y - k * 50}px) translate(-50%, -50%) scale(${s})`;
      el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }, ease.linear).then(() => el.remove());
  }

  // Gros titre au centre de l'écran.
  banner(text, cls = '', dur = 1.3) {
    const el = document.createElement('div');
    el.className = 'banner ' + cls;
    el.innerHTML = `<span>${text}</span>`;
    const W = this.overlay.clientWidth;
    const size = Math.min(cls.includes('boom') ? 86 : 64, (W * 0.84) / (text.length * 0.7 + 1));
    el.style.setProperty('--bs', size.toFixed(1) + 'px');
    this.overlay.appendChild(el);
    return animate(dur, (k) => {
      let s, o;
      if (k < 0.15) { s = 2.4 - 1.4 * ease.outBack(k / 0.15); o = k / 0.15; }
      else if (k < 0.8) { s = 1 + (k - 0.15) * 0.08; o = 1; }
      else { s = 1.05 + (k - 0.8) * 2; o = 1 - (k - 0.8) / 0.2; }
      el.style.transform = `translate(-50%, -50%) scale(${s}) rotate(${-4 + k * 2}deg)`;
      el.style.opacity = String(o);
    }, ease.linear).then(() => el.remove());
  }
}
