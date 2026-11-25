// Petites scènes 3D en boucle qui montrent ce que fait chaque carte (comme une vidéo dans la fiche).
import * as THREE from 'three';
import { FX } from './fx.js';
import { animate, tween, ease, wait, all } from './tween.js';
import { makeModel, cueModel, avatarModel, mat } from './models.js';
import { makeCard, battleFace } from './cards.js';
import { KINDS } from '../engine/kinds.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Preview {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50);
    this.camera.position.set(0, 2.4, 4.2);
    this.camera.lookAt(0, 0.45, 0);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#3a3550', 1.5));
    const d = new THREE.DirectionalLight('#fff3dd', 2); d.position.set(-2, 5, 4); this.scene.add(d);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshStandardMaterial({ color: '#145a4a', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.stage = new THREE.Group();
    this.scene.add(this.stage);
    this.fx = new FX(this.scene, this.camera, host);
    this.token = 0;
    this.visible = false;
  }

  resize() {
    const w = this.host.clientWidth || 300, h = this.host.clientHeight || 180;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.visible) return;
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  stop() { this.token++; this.visible = false; this.clear(); this.camera.up.set(0, 1, 0); }
  clear() { for (const c of [...this.stage.children]) this.stage.remove(c); }

  play(kind) {
    this.stop();
    this.visible = true;
    this.resize();
    const tok = ++this.token;
    const verb = KINDS[kind].preview;
    const run = async () => {
      while (tok === this.token) {
        this.clear();
        this.camera.up.set(0, 1, 0);
        try { await (this['v_' + verb] || this.v_idle).call(this, kind); } catch { /* boucle interrompue */ }
        if (tok !== this.token) return;
        await wait(0.6);
      }
    };
    run();
  }

  // ------------------------------------------------------------ accessoires
  add(o, x = 0, y = 0, z = 0) { o.position.set(x, y, z); this.stage.add(o); return o; }
  model(kind, x, z, owner = 0, extra = {}) { return this.add(makeModel(kind, { owner, ...extra }), x, 0, z); }
  card(v, s = 'coeur', x = 1, z = 0) {
    const c = makeCard(battleFace({ r: v, v, s }));
    c.rotation.x = 0.9;
    c.position.set(x, 0.6, z);
    c.scale.setScalar(0.8);
    c.userData.v = v; c.userData.s = s;
    this.stage.add(c);
    return c;
  }
  setCard(c, v) { const t = battleFace({ r: c.userData.v, v, s: c.userData.s }); c.userData.front.material.map = t; c.userData.front.material.emissiveMap = t; c.userData.front.material.needsUpdate = true; }
  arc(o, to, h, d) { const f = o.position.clone(); return animate(d, (k) => { o.position.lerpVectors(f, to, k); o.position.y += Math.sin(Math.PI * k) * h; }, ease.inOutQuad); }
  shrink(o, d = 0.3) { return tween(o.scale, { x: 0.01, y: 0.01, z: 0.01 }, d, ease.inBack); }
  tracer(a, b) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 6), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true }));
    t.position.copy(a).lerp(b, 0.5);
    t.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    this.stage.add(t);
    animate(0.2, (k) => { t.material.opacity = 1 - k; }).then(() => this.stage.remove(t));
  }

  // ------------------------------------------------------------ scènes
  async v_idle(kind) { const m = this.model(kind, 0, 0); await animate(2, (k) => { m.rotation.y = k * Math.PI * 2; }, ease.linear); }

  async v_shoot() {
    const g = this.model('flingue', -1.3, 0); g.rotation.y = 0; g.position.y = -0.2;
    const c = this.card(9, 'pique', 1.1);
    await wait(0.4);
    const muzzle = V(-0.8, 0.45, 0);
    this.fx.burst(muzzle, { n: 20, colors: ['#fff3b0', '#ffba08'], speed: 2, up: 0.5, size: 0.15, life: 0.2, gravity: 0 });
    this.tracer(muzzle, c.position.clone());
    animate(0.2, (k) => (g.rotation.z = Math.sin(k * Math.PI) * 0.5));
    this.fx.shatter(c.position.clone(), ['#fbf8f1', '#d8d1c2'], { n: 14, s: 0.05 });
    this.setCard(c, 6);
    await wait(1.2);
  }
  async v_fish() {
    const rod = this.model('peche', -1.3, 0.3);
    const c = this.card(13, 'carreau', 1.1);
    await wait(0.4);
    await tween(rod.rotation, { z: -0.5 }, 0.2);
    this.fx.water(c.position.clone(), 12);
    await wait(0.3);
    await all(this.arc(c, V(-1.0, 0.9, 0.3), 1, 0.6), tween(c.rotation, { z: Math.PI * 2 }, 0.6));
    await tween(rod.rotation, { z: 0 }, 0.2);
    await wait(0.8);
  }
  async v_strike() {
    const ball = this.add(makeModel('billard'), -1.4, 0, 0.3); ball.children.slice(1).forEach((c) => (c.visible = false));
    const piece = this.model('roi', 1.3, 0, 1);
    const cue = cueModel(); cue.scale.setScalar(0.5); cue.rotation.z = Math.PI / 2; this.add(cue, -1.8, 0.3, 0.3);
    await tween(cue.position, { x: -2.2 }, 0.3);
    await tween(cue.position, { x: -1.7 }, 0.06);
    await tween(ball.position, { x: 1.0, z: 0.05 }, 0.4, ease.outQuad);
    await all(this.arc(piece, V(2.8, -1.5, 0), 0.6, 0.6), tween(piece.rotation, { z: -3 }, 0.6));
    await wait(0.8);
  }
  async v_burn() {
    const l = this.model('briquet', 0.2, 0.6);
    const c = this.card(12, 'trefle', 1.0);
    const fl = l.userData.flame;
    await wait(0.3);
    if (fl) await tween(fl.scale, { x: 1.5, y: 1.5, z: 1.5 }, 0.2);
    for (let i = 0; i < 10; i++) { this.fx.fire(c.position.clone().add(V(0, -0.2, 0)), 10, 0.7); await wait(0.07); }
    await this.shrink(c);
    await wait(0.6);
  }
  async v_splash() {
    const b = this.model('seau', -0.2, 0); b.position.y = 1.2;
    const bomb = this.model('bombe', 0.6, 0);
    await wait(0.3);
    await tween(b.rotation, { z: -2 }, 0.3);
    for (let i = 0; i < 5; i++) { this.fx.water(bomb.position.clone().add(V(0, 0.5, 0)), 10); await wait(0.08); }
    this.fx.burst(bomb.position.clone().add(V(0, 0.5, 0)), { n: 20, color: '#ffffff', speed: 1, up: 2, size: 0.3, life: 0.8, gravity: 1, additive: false });
    await this.shrink(bomb, 0.5);
    await wait(0.6);
  }
  async v_magnet() {
    const m = this.model('aimant', -1.2, 0); m.rotation.z = -Math.PI / 2; m.position.y = 0.5;
    const g = this.model('flingue', 1.2, 0);
    await wait(0.3);
    for (let i = 0; i < 3; i++) { this.fx.ring(g.position.clone().add(V(0, 0.5, 0)), { color: '#d62828', radius: 0.7, dur: 0.3, y: 0.5 }); await wait(0.12); }
    await tween(g.position, { x: -0.6 }, 0.35, ease.inCubic);
    this.fx.sparkles(V(-0.6, 0.5, 0), '#ffffff', 10);
    await wait(0.9);
  }
  async v_cut() {
    const s = this.model('tronco', -0.4, 0.3); s.position.y = 0.3;
    const c = this.card(14, 'coeur', 0.9);
    await wait(0.3);
    for (let i = 0; i < 10; i++) { s.position.x = -0.4 + (Math.random() - 0.5) * 0.08; this.fx.stream(c.position.clone(), V(0, 1, 0), { n: 4, color: '#ffd166', speed: 3, size: 0.08, life: 0.3, gravity: -10 }); await wait(0.06); }
    this.setCard(c, 7);
    await wait(1.2);
  }
  async v_roll() {
    const c = this.card(4, 'carreau', 0.9);
    const d = this.model('de', -1.4, 0.4);
    await wait(0.3);
    await all(this.arc(d, V(0, 0, 0.5), 1, 0.6), tween(d.rotation, { x: 8, z: 6 }, 0.6));
    this.setCard(c, 12);
    this.fx.sparkles(c.position.clone(), '#ffd166', 16);
    await wait(1.2);
  }
  async v_freeze() {
    const h = this.model('sablier', 0, 0);
    await wait(0.4);
    await tween(h.rotation, { z: Math.PI }, 0.5, ease.inOutCubic);
    this.fx.flash('#a2d2ff', 0.5, 0.5);
    this.fx.ring(V(0, 0.1, 0), { color: '#a2d2ff', radius: 3, dur: 0.6 });
    await wait(1.2);
  }
  async v_copy() {
    const m = this.model('photocop', 0, 0);
    const c = this.card(8, 'pique', -1.3);
    await wait(0.3);
    await all(this.arc(c, V(0, 0.6, 0), 0.8, 0.5), this.shrink(c, 0.5));
    const l = m.userData.light;
    if (l) { l.visible = true; await animate(0.6, (k) => (l.position.z = -0.25 + k * 0.5)); l.visible = false; }
    const a = this.card(8, 'pique', 0); a.scale.setScalar(0.01);
    const b = this.card(8, 'pique', 0); b.scale.setScalar(0.01);
    await all(this.arc(a, V(-1.2, 0.6, 0.3), 0.6, 0.4), tween(a.scale, { x: 0.8, y: 0.8, z: 0.8 }, 0.4), this.arc(b, V(1.2, 0.6, 0.3), 0.6, 0.4), tween(b.scale, { x: 0.8, y: 0.8, z: 0.8 }, 0.4));
    await wait(1);
  }
  async v_blow() {
    const f = this.model('ventilo', -1.5, 0); f.rotation.y = 0;
    const ps = [this.model('pion', 0.2, -0.3, 1), this.model('reine', 0.8, 0.3, 1)];
    const bl = f.userData.blades;
    await animate(0.6, (k) => { if (bl) bl.rotation.z += 0.5 * k; }, ease.linear);
    for (let i = 0; i < 10; i++) this.fx.norm.emit(V(-1, 0.5, (Math.random() - 0.5)), V(8, 0, 0), { color: '#e0fbfc', size: 0.1, life: 0.4, gravity: 0, drag: 0 });
    await all(ps.map((p) => all(tween(p.position, { x: 3 }, 0.6, ease.inQuad), tween(p.rotation, { z: -1.5 }, 0.6))));
    await wait(0.6);
  }
  async v_grow() {
    for (let s = 0; s <= 3; s++) {
      this.clear();
      const t = this.model('arbre', 0, 0, 0, { stage: Math.min(s, 3) });
      t.scale.setScalar(0.8); await tween(t.scale, { x: 1, y: 1, z: 1 }, 0.3, ease.outBack);
      await wait(0.35);
    }
    for (let i = 0; i < 3; i++) {
      const c = this.card(11 + i, 'coeur', 0); c.position.set(0, 1, 0); c.scale.setScalar(0.4);
      this.arc(c, V(-1.4 + i * 1.4, 0.7, 0.8), 0.8, 0.5);
      this.fx.sparkles(V(0, 1, 0), '#ffd166', 10);
      await wait(0.15);
    }
    await wait(1);
  }
  async v_fertilize() {
    const c = this.card(7, 'trefle', 0.6);
    const b = this.model('engrais', -0.2, 0); b.position.y = 1.1; b.rotation.z = -1.7;
    await wait(0.3);
    for (let i = 0; i < 6; i++) { this.fx.stream(V(0.05, 1.1, 0), V(0.3, -1, 0), { n: 6, color: '#7f5539', speed: 3, size: 0.1, life: 0.5, gravity: -8, additive: false }); await wait(0.08); }
    this.setCard(c, 10); this.fx.sparkles(c.position.clone(), '#b7e4c7', 20);
    await wait(1.2);
  }
  async v_dig() {
    const mound = this.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8), mat('#5c3d2e', { rough: 1, flat: true })), 0.4, 0, 0); mound.scale.y = 0.35;
    const s = this.model('pelle', -0.3, 0.2);
    for (let i = 0; i < 3; i++) { await tween(s.rotation, { z: -0.8 }, 0.12); this.fx.burst(V(0.4, 0.2, 0), { n: 10, colors: ['#5c3d2e', '#7f5539'], speed: 2, up: 3, size: 0.12, life: 0.5, gravity: -10, additive: false }); await tween(s.rotation, { z: 0.2 }, 0.12); }
    const c = this.card(10, 'pique', 0.4); c.position.y = -0.2;
    await this.arc(c, V(0.4, 0.9, 0.4), 0.5, 0.4);
    this.fx.sparkles(c.position.clone(), '#ffffff', 12);
    await wait(1);
  }
  async v_capture() {
    const q = this.model('reine', -1.2, 0, 0);
    const k = this.model('roi', 1.0, 0, 1);
    await wait(0.4);
    await this.arc(q, V(1.0, 0, 0), 1.2, 0.45);
    this.fx.dust(V(1, 0, 0), 12);
    await all(this.arc(k, V(2.8, -1.5, -0.5), 1.5, 0.7), tween(k.rotation, { x: 4 }, 0.7));
    await wait(0.6);
  }
  async v_boost() {
    const k = this.model('roi', -1.0, 0, 0); k.scale.setScalar(0.01);
    const c = this.card(7, 'trefle', 0.9);
    await wait(0.3);
    await tween(k.scale, { x: 1, y: 1, z: 1 }, 0.4, ease.outBack);
    this.fx.sparkles(V(-1, 0.8, 0), '#ffd166', 16);
    await wait(0.3);
    this.setCard(c, 8);
    this.fx.sparkles(c.position.clone(), '#ffd166', 20);
    await wait(1.2);
  }
  async v_promote() {
    const p = this.model('pion', 0, 1, 0);
    for (let i = 0; i < 2; i++) await this.arc(p, V(0, 0, p.position.z - 0.8), 0.4, 0.35);
    this.fx.sparkles(p.position.clone().add(V(0, 0.5, 0)), '#ffd166', 24);
    await this.shrink(p, 0.2);
    const q = this.model('reine', 0, -0.6, 0); q.scale.setScalar(0.01);
    await tween(q.scale, { x: 1, y: 1, z: 1 }, 0.4, ease.outElastic);
    await wait(1);
  }
  async v_protect() {
    this.model('tour', -0.9, 0.2, 0);
    const c = this.card(10, 'coeur', 0.4);
    await wait(0.3);
    const dome = this.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), new THREE.MeshBasicMaterial({ color: '#adb5bd', transparent: true, opacity: 0.5, depthWrite: false })), c.position.x, 0.5, 0);
    this.tracer(V(2.4, 0.6, 0), V(1.3, 0.6, 0));
    this.fx.burst(V(1.3, 0.6, 0), { n: 16, colors: ['#ffd166', '#ffffff'], speed: 4, up: 1, size: 0.1, life: 0.3 });
    await animate(0.6, (k) => { dome.material.opacity = 0.5 * (1 - k); });
    await wait(0.8);
  }
  async v_reflect() {
    const m = this.model('miroir', 0.9, 0);
    const g = this.model('flingue', -1.4, 0); g.position.y = -0.2;
    await wait(0.3);
    this.tracer(V(-0.9, 0.45, 0), V(0.85, 0.55, 0));
    await wait(0.1);
    this.fx.burst(V(0.85, 0.55, 0), { n: 20, colors: ['#ffffff', '#caf0f8'], speed: 3, up: 1, size: 0.15, life: 0.3 });
    this.tracer(V(0.85, 0.55, 0), V(-1.3, 0.45, 0));
    this.fx.shatter(V(-1.3, 0.4, 0), ['#2b2d42', '#e63946'], { n: 14 });
    g.visible = false;
    await wait(0.4);
    this.fx.shatter(m.position.clone().add(V(0, 0.5, 0)), ['#caf0f8', '#ffffff'], { n: 18, s: 0.05 });
    m.visible = false;
    await wait(1);
  }
  async v_push() {
    const cat = this.model('chat', -0.4, 0);
    const p = this.model('tour', 0.6, 0, 1);
    await wait(0.4);
    await this.arc(cat, V(0.05, 0, 0), 0.4, 0.3);
    await all(this.arc(p, V(2.8, -1.5, 0.2), 0.6, 0.6), tween(p.rotation, { z: -3 }, 0.6));
    await wait(0.8);
  }
  async v_suck() {
    const h = this.model('trounoir', 0, 0);
    const ps = [this.model('pion', -1.3, 0.4, 1), this.model('roi', 1.3, -0.2, 0)];
    await wait(0.3);
    await all(ps.map((p) => animate(0.9, (k) => { p.position.lerp(V(0, 0.4, 0), k * 0.2); p.rotation.y += 0.3; p.scale.setScalar(Math.max(0.01, 1 - k)); }, ease.inQuad)));
    void h;
    await wait(0.8);
  }
  async v_storm() {
    const cl = this.model('orage', 0, 0); cl.position.y = 1.2; cl.scale.setScalar(1.6);
    const g = this.model('flingue', 0.8, 0.4);
    await wait(0.5);
    this.fx.flash('#ffffff', 0.7, 0.3);
    this.tracer(V(0.8, 3, 0.4), V(0.8, 0.4, 0.4));
    this.fx.burst(V(0.8, 0.4, 0.4), { n: 30, colors: ['#fff7ae', '#4cc9f0'], speed: 4, up: 3, size: 0.15, life: 0.4 });
    g.visible = false;
    await wait(1.2);
  }
  async v_crown() {
    const a = this.card(9, 'coeur', -0.7), b = this.card(9, 'pique', 0.7);
    const cr = this.model('couronne', -0.7, 0); cr.position.y = 2.5;
    await tween(cr.position, { y: 1.35 }, 0.5, ease.outBounce);
    this.fx.sparkles(a.position.clone(), '#ffd166', 24);
    await all(this.arc(b, V(-0.7, 0.6, 0.6), 0.5, 0.4), this.shrink(b, 0.4));
    await wait(1);
  }
  async v_trap() {
    this.model('banane', 0.3, 0.2);
    const av = this.add(avatarModel(1), -1.4, 0, 0);
    await wait(0.3);
    await tween(av.position, { x: 0.2 }, 0.5);
    await all(tween(av.rotation, { y: Math.PI * 3, x: -1.4 }, 0.5), tween(av.position, { x: 0.9 }, 0.5));
    await wait(1);
  }
  async v_revive() {
    const av = this.add(avatarModel(0), 0.4, 0, 0);
    this.model('defib', -1, 0.3);
    await tween(av.rotation, { x: 1.4 }, 0.4, ease.outBounce);
    await wait(0.3);
    for (let i = 0; i < 3; i++) { this.fx.burst(V(0.4, 0.5, 0), { n: 14, colors: ['#4cc9f0', '#ffffff'], speed: 3, up: 2, size: 0.12, life: 0.3 }); await wait(0.12); }
    await tween(av.rotation, { x: 0 }, 0.4, ease.outBack);
    await wait(1);
  }
  async v_explode() {
    const b = this.model('bombe', 0, 0);
    const ps = [this.model('pion', -0.9, 0.2, 1), this.model('reine', 0.9, -0.1, 1)];
    for (let i = 0; i < 3; i++) { this.fx.ring(V(0, 0.4, 0), { color: '#e63946', radius: 0.8 + i * 0.4, dur: 0.3, y: 0.4 }); await tween(b.scale, { x: 1.2, y: 1.2, z: 1.2 }, 0.15); await tween(b.scale, { x: 1, y: 1, z: 1 }, 0.15); await wait(0.15); }
    b.visible = false;
    this.fx.explosion(V(0, 0.4, 0), 0.6);
    this.fx.flash('#ffba08', 0.5, 0.3);
    await all(ps.map((p, i) => all(this.arc(p, V(i ? 2.6 : -2.6, -1, 0), 1.5, 0.7), tween(p.rotation, { z: i ? -4 : 4 }, 0.7))));
    await wait(0.6);
  }
  async v_invert() {
    const a = this.card(2, 'coeur', -0.7), b = this.card(13, 'pique', 0.7);
    await wait(0.5);
    await animate(0.8, (k) => { const r = Math.PI * k; this.camera.up.set(Math.sin(r), Math.cos(r), 0); this.camera.lookAt(0, 0.45, 0); }, ease.inOutCubic);
    this.fx.sparkles(a.position.clone(), '#c77dff', 24);
    await all(this.arc(b, V(-0.7, 0.6, 0.6), 0.5, 0.4), this.shrink(b, 0.4));
    await wait(1);
    this.camera.up.set(0, 1, 0); this.camera.lookAt(0, 0.45, 0);
  }
}
