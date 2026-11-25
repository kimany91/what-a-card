// Rejoue chaque événement du moteur en animation 3D.
import * as THREE from 'three';
import { tween, animate, ease, wait, freezeFrame, all } from './tween.js';
import { sfx, buzz } from './audio.js';
import { cueModel, boltGeo, mat, makeModel, OWNER } from './models.js';
import { battleFace, makeCard } from './cards.js';
import { CARD_TILT } from './world.js';
import { KINDS } from '../engine/kinds.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TILT = 0.62;

export class Animator {
  constructor(world, ui) {
    this.W = world; this.fx = world.fx; this.ui = ui;
    this.lastBurst = null;
  }

  async play(ev) {
    const fn = this['on_' + ev.type];
    if (fn) await fn.call(this, ev);
  }

  // ------------------------------------------------------------ outils
  m(id) { return this.W.models.get(id); }
  pos(obj) { return obj.getWorldPosition(V()); }
  arc(obj, to, h = 1.2, dur = 0.5, easing = ease.inOutQuad) {
    const from = obj.position.clone();
    return animate(dur, (k) => {
      obj.position.lerpVectors(from, to, k);
      obj.position.y += Math.sin(Math.PI * k) * h;
    }, easing);
  }
  spin(obj, axis, turns, dur, easing = ease.outCubic) {
    const s = obj.rotation[axis];
    return animate(dur, (k) => { obj.rotation[axis] = s + turns * Math.PI * 2 * k; }, easing);
  }
  scaleTo(obj, s, dur = 0.3, easing = ease.outBack) { return tween(obj.scale, { x: s, y: s, z: s }, dur, easing); }
  squash(obj, base = null, amt = 0.25, dur = 0.35) {
    const b = base ?? obj.scale.x;
    return animate(dur, (k) => {
      const w = Math.sin(k * Math.PI * 3) * (1 - k) * amt;
      obj.scale.set(b * (1 + w), b * (1 - w), b * (1 + w));
    }, ease.linear).then(() => obj.scale.setScalar(b));
  }
  jitter(obj, amt, dur) {
    const base = obj.position.clone();
    return animate(dur, () => { obj.position.set(base.x + (Math.random() - 0.5) * amt, base.y + (Math.random() - 0.5) * amt, base.z + (Math.random() - 0.5) * amt); }, ease.linear)
      .then(() => obj.position.copy(base));
  }
  faceTowards(obj, target, offset = 0) {
    const d = target.clone().sub(obj.position);
    obj.rotation.y = Math.atan2(-d.z, d.x) + offset;
  }
  colorsOf(m) {
    const cs = new Set();
    m.obj.userData.model?.traverse((o) => { if (o.material?.color) cs.add('#' + o.material.color.getHexString()); });
    return cs.size ? [...cs] : ['#888'];
  }
  async goHome(m, dur = 0.4) {
    if (m.temp) {
      const at = this.pos(m.obj);
      this.fx.burst(at, { n: 18, color: '#ffffff', speed: 1.5, up: 1.5, size: 0.22, life: 0.5, gravity: 0, additive: false });
      await this.scaleTo(m.obj, 0.01, 0.25, ease.inBack);
      this.W.scene.remove(m.obj);
      return;
    }
    const t = this.W.entTarget(m);
    const ry = m.zone === 'side' && m.owner !== this.W.me ? Math.PI : 0;
    await all(
      this.arc(m.obj, t.pos, 0.6, dur),
      tween(m.obj.rotation, { x: 0, y: ry, z: 0 }, dur),
      this.scaleTo(m.obj, t.scale, dur, ease.outQuad),
    );
    m.busy = false;
  }
  lift(m, to, dur = 0.35, scale = 1) {
    m.busy = true;
    return all(this.arc(m.obj, to, 0.8, dur, ease.outCubic), this.scaleTo(m.obj, scale, dur));
  }
  targetPos(t) { return this.W.posForTarget(t); }
  near(from, to, dist) { return from.clone().add(to.clone().sub(from).normalize().multiplyScalar(dist)); }
  callout(m, text) { return this.fx.pop(this.pos(m.obj).add(V(0, 1.4, 0)), text, 'call', 0.9); }

  // ------------------------------------------------------------ tour
  async on_round(ev) { sfx('round'); this.ui.onRound(ev.round); }

  async on_turn() {}
  async on_drawTurn() {}
  async on_actionTurn() {}
  async on_pass(ev) { sfx('tap'); await this.fx.pop(this.W.avatars[ev.p].position.clone().add(V(0, 1.9, 0)), 'PASSE', 'muted', 0.8); }
  async on_resolve() { await wait(0.15); }

  // ------------------------------------------------------------ apparitions
  async on_spawn(ev) {
    const W = this.W, e = ev.ent;
    if (e.zone === 'board') await W.showBoard(true);
    const from = this.lastBurst ? this.lastBurst.clone() : W.launchPos(ev.p);
    this.lastBurst = null;
    const m = W.addEnt(e, { at: from, scale: 0.01 });
    m.busy = true;
    const t = W.entTarget(m);
    W.relayout(0.3, m);
    sfx('spawn');
    await all(this.arc(m.obj, t.pos, 1.4, 0.55, ease.inOutQuad), this.scaleTo(m.obj, t.scale * 1.25, 0.5, ease.outQuad), this.spin(m.obj, 'y', 1, 0.55));
    m.obj.rotation.y = m.zone === 'side' && m.owner !== W.me ? Math.PI : 0;
    sfx('slam'); buzz(15);
    this.fx.dust(t.pos.clone().setY(0.05), 12);
    this.fx.ring(t.pos, { color: OWNER[m.owner].ring, radius: 1.4, dur: 0.4 });
    this.fx.sparkles(t.pos.clone().add(V(0, 0.4, 0)), KINDS[m.kind].color, 18);
    if (m.kind === 'chat') sfx('meow');
    if (m.kind === 'trounoir') { sfx('suck'); this.fx.flash('#5a189a', 0.4, 0.4); this.fx.shake(0.4); }
    if (m.kind === 'reine' || m.kind === 'roi') this.pillar(t.pos, '#ffd166');
    await this.scaleTo(m.obj, t.scale, 0.35, ease.outElastic);
    m.busy = false;
  }

  pillar(pos, color) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.position.copy(pos).setY(3);
    this.W.scene.add(g);
    return animate(0.8, (k) => { g.material.opacity = 0.6 * (1 - k); g.scale.set(1 - k * 0.7, 1, 1 - k * 0.7); }).then(() => this.W.scene.remove(g));
  }

  // ------------------------------------------------------------ destructions
  async on_destroy(ev) {
    const W = this.W, m = this.m(ev.id);
    if (!m) return;
    if (m.fellOff) { W.removeEnt(ev.id); W.relayout(0.3); return; }
    m.busy = true;
    const o = m.obj, p = this.pos(o).add(V(0, 0.3, 0));
    const cols = this.colorsOf(m);
    const c = ev.cause;
    if (c === 'capture' || c === 'blast') {
      const away = p.clone().sub(V(0, 0, 0)).setY(0).normalize().multiplyScalar(c === 'blast' ? 7 : 5);
      sfx(c === 'blast' ? 'shot' : 'slam');
      this.fx.shatter(p, cols, { n: 12 });
      await all(this.arc(o, p.clone().add(away).setY(-3), c === 'blast' ? 5 : 3, 0.8, ease.linear), this.spin(o, 'x', 3, 0.8, ease.linear), this.spin(o, 'z', 2, 0.8, ease.linear));
    } else if (c === 'fall' || c === 'cat' || c === 'wind') {
      const dir = c === 'wind' ? V(0, 0, -this.W.zs(this.W.me) * (ev.owner === this.W.me ? 1 : 1)) : p.clone().setY(0);
      if (c === 'wind') dir.set(0, 0, o.position.z > 0 ? 1 : -1);
      if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
      dir.normalize();
      const edge = p.clone().add(dir.clone().multiplyScalar(c === 'wind' ? 2.5 : 2.2)).setY(0.3);
      if (c === 'cat') sfx('meow');
      sfx('whoosh');
      await all(tween(o.position, { x: edge.x, z: edge.z }, 0.35, ease.inQuad), this.spin(o, 'z', 0.5, 0.35));
      const drop = edge.clone().add(dir.clone().multiplyScalar(1.5)).setY(-4);
      sfx('slip');
      await all(this.arc(o, drop, 0.8, 0.6, ease.inQuad), this.spin(o, 'x', 2, 0.6));
      this.fx.pop(edge.clone().setY(0.8), 'TOMBÉ !', 'bad', 0.9);
    } else if (c === 'shot' || c === 'slip') {
      sfx('shot'); buzz(40);
      this.fx.shatter(p, cols, { n: 26, speed: 5 });
      this.fx.burst(p, { n: 30, colors: ['#fff3b0', '#ffba08'], speed: 5, up: 2, size: 0.25, life: 0.4 });
      this.fx.shake(0.4);
      o.visible = false;
      await wait(0.25);
    } else if (c === 'burn') {
      sfx('fire');
      for (let i = 0; i < 8; i++) { this.fx.fire(p.clone().add(V(0, -0.2, 0)), 18, 1); await wait(0.07); }
      this.fx.burst(p, { n: 25, color: '#555', speed: 1.5, up: 2, size: 0.3, life: 1, gravity: -1, additive: false });
      await all(this.scaleTo(o, 0.01, 0.35, ease.inBack));
    } else if (c === 'cut') {
      sfx('saw');
      this.fx.shatter(p, ['#d4a373', '#7f5539', ...cols], { n: 30, speed: 4, s: 0.07 });
      await all(tween(o.scale, { x: o.scale.x * 1.6, y: 0.05 }, 0.3, ease.inQuad));
    } else if (c === 'hole') {
      const hole = [...W.models.values()].find((x) => x.kind === 'trounoir');
      const hp = hole ? this.pos(hole.obj).add(V(0, 0.45, 0)) : V(0, 0.5, 0);
      sfx('suck');
      const from = o.position.clone();
      await animate(0.8, (k) => {
        const a = k * Math.PI * 4, r = (1 - k) * from.distanceTo(hp);
        const base = from.clone().lerp(hp, k);
        o.position.set(base.x + Math.cos(a) * r * 0.3, base.y + k * 0.4, base.z + Math.sin(a) * r * 0.3);
        o.scale.setScalar(Math.max(0.01, (1 - k) * 0.9));
        o.rotation.y += 0.3;
      }, ease.inQuad);
      this.fx.burst(hp, { n: 20, color: '#c77dff', speed: 1.5, up: 1, size: 0.2 });
    } else if (c === 'wash' || c === 'defused' || c === 'flee') {
      if (c === 'defused') this.fx.burst(p, { n: 30, color: '#ffffff', speed: 1, up: 3, size: 0.4, life: 1, gravity: 2, additive: false });
      if (c === 'flee') { sfx('meow'); await this.arc(o, p.clone().add(V(2.5, 0, 2.5 * (o.position.z > 0 ? 1 : -1))).setY(-3), 2, 0.7); }
      else await all(this.scaleTo(o, 0.01, 0.4, ease.inBack), tween(o.position, { y: o.position.y - 0.2 }, 0.4));
      this.fx.pop(p.clone().add(V(0, 0.6, 0)), c === 'defused' ? 'DÉSAMORCÉE' : c === 'flee' ? 'FUITE !' : 'EMPORTÉE', 'water', 0.9);
    } else if (c === 'broken') {
      sfx('glass'); buzz(30);
      this.fx.shatter(p, ['#caf0f8', '#90e0ef', '#ffffff', '#d4a373'], { n: 30, speed: 4, s: 0.06 });
      o.visible = false;
      await wait(0.2);
    } else if (c === 'short') {
      sfx('zap');
      this.fx.burst(p, { n: 40, colors: ['#4cc9f0', '#ffffff'], speed: 4, up: 3, size: 0.15, life: 0.4 });
      this.fx.pop(p.clone().add(V(0, 0.7, 0)), 'COURT-CIRCUIT', 'bad', 1);
      await this.scaleTo(o, 0.01, 0.4, ease.inBack);
    } else if (c === 'collapse') {
      sfx('suck'); this.fx.flash('#3c096c', 0.5, 0.4);
      await this.scaleTo(o, 1.6, 0.25, ease.outQuad);
      await this.scaleTo(o, 0.01, 0.2, ease.inQuad);
      this.fx.ring(p, { color: '#c77dff', radius: 5, dur: 0.6 });
      this.fx.shake(0.8);
    } else if (c === 'harvest') {
      this.fx.burst(p, { n: 30, colors: ['#52b788', '#2d6a4f', '#ffd166'], speed: 2, up: 3, size: 0.2, life: 1, additive: false });
      await this.scaleTo(o, 0.01, 0.5, ease.inBack);
    } else if (c === 'revive') {
      await this.scaleTo(o, 0.01, 0.3, ease.inBack);
    } else {
      this.fx.burst(p, { n: 20, color: '#ced4da', speed: 1.5, up: 1.5, size: 0.3, life: 0.6, gravity: 0, additive: false });
      sfx('plop');
      await this.scaleTo(o, 0.01, 0.3, ease.inBack);
    }
    W.removeEnt(ev.id);
    W.relayout(0.3);
    if (![...W.models.values()].some((x) => x.zone === 'board')) W.showBoard(false);
  }

  async on_explode(ev) {
    const W = this.W;
    let p;
    if (ev.side != null) p = W.slotPos(ev.side, 2, 6).add(V(0, 0.4, 0));
    else {
      const m = this.m(ev.id);
      p = m ? this.pos(m.obj).add(V(0, 0.4, 0)) : W.cellPos(ev.x, ev.y).add(V(0, 0.4, 0));
      if (m) {
        m.busy = true;
        await all(this.scaleTo(m.obj, 1.6, 0.25, ease.inQuad), this.jitter(m.obj, 0.1, 0.25));
        W.removeEnt(ev.id);
      }
    }
    sfx('boom'); buzz(150);
    freezeFrame(0.09);
    this.fx.explosion(p, 1.2);
    this.fx.flash('#ffba08', 0.75, 0.45);
    this.fx.shake(1.2);
    W.punch(1);
    this.fx.banner('BOUM !', 'boom', 0.9);
    await wait(0.35);
  }

  // ------------------------------------------------------------ déplacements / propriétaires
  async on_move(ev) {
    const m = this.m(ev.id);
    if (!m) return;
    m.x = ev.x; m.y = ev.y;
    const t = this.W.entTarget(m);
    if (ev.cause === 'chess') {
      m.busy = true;
      sfx('whoosh');
      await all(this.arc(m.obj, t.pos, 1.4, 0.42, ease.inOutCubic), this.spin(m.obj, 'y', 1, 0.42));
      sfx('slam'); buzz(ev.cap ? 60 : 20);
      this.fx.dust(t.pos, ev.cap ? 18 : 8);
      if (ev.cap) { this.fx.shake(0.6); this.W.punch(0.6); this.fx.ring(t.pos, { color: '#ffd166', radius: 1.8, dur: 0.35 }); }
      await this.squash(m.obj, null, 0.25, 0.3);
      m.busy = false;
      return;
    }
    if (ev.cause === 'push') sfx('whoosh');
    await tween(m.obj.position, { x: t.pos.x, z: t.pos.z, y: t.pos.y }, ev.cause === 'wind' ? 0.25 : 0.35, ease.outQuad);
    if (ev.cause === 'push') this.fx.pop(t.pos.clone().add(V(0, 0.9, 0)), 'RATÉ', 'muted', 0.8);
  }

  async on_owner(ev) {
    const W = this.W, m = this.m(ev.id);
    if (!m) return;
    m.busy = true;
    m.owner = ev.owner;
    if (ev.cause === 'magnet') {
      const mag = [...W.models.values()].find((x) => x.kind === 'aimant' && x.owner === ev.owner && x.obj.userData.magnetActive);
      if (mag) {
        const to = this.pos(mag.obj).add(V(0, 0.3, 0));
        await all(tween(m.obj.position, { x: to.x, y: to.y, z: to.z }, 0.35, ease.inCubic), this.spin(m.obj, 'y', 2, 0.35));
        sfx('clink'); this.fx.sparkles(to, '#ffffff', 12); this.fx.shake(0.2);
      }
    }
    W.rebuildEnt(m);
    m.obj.userData.model.visible = true;
    const t = W.entTarget(m);
    sfx('whoosh');
    W.relayout(0.35, m);
    await all(this.arc(m.obj, t.pos, 1.5, 0.55), this.scaleTo(m.obj, t.scale, 0.55), tween(m.obj.rotation, { y: ev.owner === W.me ? 0 : Math.PI }, 0.55));
    sfx('slam');
    this.fx.ring(t.pos, { color: OWNER[ev.owner].ring, radius: 1.3, dur: 0.35 });
    this.fx.pop(t.pos.clone().add(V(0, 1, 0)), ev.cause === 'fish' ? 'PÊCHÉ !' : 'ATTIRÉ !', ev.owner === W.me ? 'good' : 'bad', 0.9);
    m.busy = false;
  }

  // ------------------------------------------------------------ actions
  async on_use(ev) {
    if (ev.p === this.W.me && this.skipUse) return;
    const W = this.W;
    const from = this.lastBurst ? this.lastBurst.clone() : W.launchPos(ev.p);
    this.lastBurst = null;
    const obj = new THREE.Group();
    const model = makeModel(ev.kind);
    obj.add(model); obj.userData.model = model;
    obj.position.copy(from); obj.scale.setScalar(0.01);
    W.scene.add(obj);
    const m = { id: 'tmp', kind: ev.kind, owner: ev.p, obj, temp: true, busy: true };
    sfx('spawn');
    await this.scaleTo(obj, 1, 0.3, ease.outBack);
    const fn = this['use_' + ev.kind];
    if (ev.blocked) {
      await this.lift(m, this.near(this.pos(m.obj), this.targetPos(ev.tgt), 1.2).setY(1.2), 0.35, 1);
      this.goHome(m);
      return;
    }
    if (fn) await fn.call(this, ev, m); else this.goHome(m);
  }

  async use_flingue(ev, m) {
    const o = m.obj, target = this.targetPos(ev.tgt);
    const home = this.pos(o);
    const aim = this.near(home, target, Math.min(1.8, home.distanceTo(target) * 0.4)).setY(1.3);
    this.callout(m, 'PAN !');
    await this.lift(m, aim, 0.35, 1.25);
    this.faceTowards(o, target);
    const gun = o.userData.model.userData.gun;
    await wait(0.18);
    const dir = target.clone().sub(aim).normalize();
    const muzzle = aim.clone().add(dir.clone().multiplyScalar(0.7)).add(V(0, 0.55, 0));
    sfx('shot'); buzz(60);
    freezeFrame(0.06);
    this.fx.flash('#fff3b0', 0.55, 0.18);
    this.fx.shake(0.7); this.W.punch(0.8);
    this.fx.burst(muzzle, { n: 25, colors: ['#fff3b0', '#ffba08', '#ffffff'], speed: 3, up: 1, size: 0.3, life: 0.25, gravity: 0 });
    this.tracer(muzzle, target);
    this.fx.stream(target, dir.clone().multiplyScalar(-1).add(V(0, 1, 0)), { n: 25, color: '#ffd166', speed: 5, size: 0.15, life: 0.4, gravity: -10 });
    if (gun) animate(0.25, (k) => { gun.rotation.z = 0.1 + Math.sin(k * Math.PI) * 0.6; });
    await wait(0.2);
    this.goHome(m, 0.45);
  }
  tracer(a, b) {
    const len = a.distanceTo(b);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, blending: THREE.AdditiveBlending }));
    t.position.copy(a).lerp(b, 0.5);
    t.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    this.W.scene.add(t);
    animate(0.2, (k) => { t.material.opacity = 1 - k; t.scale.x = t.scale.z = 1 + k * 2; }).then(() => this.W.scene.remove(t));
  }

  async use_peche(ev, m) {
    const o = m.obj, target = this.targetPos(ev.tgt);
    const home = this.pos(o);
    const stand = this.near(home, target, 0.6).setY(0.6);
    await this.lift(m, stand, 0.3, 1.2);
    this.faceTowards(o, target, Math.PI / 2);
    this.callout(m, 'LANCER !');
    await tween(o.rotation, { x: -0.6 }, 0.2, ease.outQuad);
    sfx('whoosh');
    const tip = () => this.pos(o).add(V(0, 1.6, 0));
    const pts = 24;
    const geo = new THREE.BufferGeometry().setFromPoints(new Array(pts).fill(0).map(() => V()));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff' }));
    const hook = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#ef233c'));
    this.W.scene.add(line, hook);
    const setLine = (end, sag) => {
      const a = tip();
      const arr = geo.attributes.position.array;
      for (let i = 0; i < pts; i++) {
        const k = i / (pts - 1);
        const p = a.clone().lerp(end, k); p.y -= Math.sin(Math.PI * k) * sag;
        arr.set([p.x, p.y, p.z], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      hook.position.copy(end);
    };
    tween(o.rotation, { x: 0.5 }, 0.25, ease.outBack);
    const start = tip();
    await animate(0.5, (k) => {
      const e = start.clone().lerp(target, k); e.y += Math.sin(Math.PI * k) * 2;
      setLine(e, 0.3 * k);
    }, ease.outQuad);
    sfx('plop');
    this.fx.water(target, 18);
    await animate(0.35, (k) => setLine(target.clone().add(V(0, Math.sin(k * 20) * 0.08, 0)), 0.2), ease.linear);
    if (!ev.ok) {
      sfx('reel');
      await animate(0.35, (k) => setLine(target.clone().lerp(tip(), k), 0.2 * (1 - k)));
    } else {
      sfx('reel');
    }
    this.W.scene.remove(line, hook);
    this.goHome(m, 0.4);
  }

  async use_briquet(ev, m) {
    const o = m.obj, target = this.targetPos(ev.tgt);
    const over = target.clone().add(V(0.25, 0.7, 0.2));
    await this.lift(m, over, 0.4, 1.3);
    const flame = o.userData.model.userData.flame;
    sfx('click');
    if (flame) await this.scaleTo(flame, 1.5, 0.2);
    this.callout(m, 'FEU !');
    sfx('fire'); buzz(20);
    for (let i = 0; i < 6; i++) { this.fx.fire(target.clone().add(V(0, -0.1, 0)), 14, 0.8); await wait(0.06); }
    if (flame) this.scaleTo(flame, 0.0001, 0.2, ease.inQuad);
    this.goHome(m, 0.45);
  }

  async use_seau(ev, m) {
    const o = m.obj, target = this.targetPos(ev.tgt);
    const over = target.clone().add(V(-0.45, 1.1, 0));
    await this.lift(m, over, 0.4, 1.3);
    this.callout(m, 'SPLASH !');
    await tween(o.rotation, { z: -2.1 }, 0.25, ease.inQuad);
    sfx('splash'); buzz(30);
    for (let i = 0; i < 5; i++) { this.fx.stream(this.pos(o).add(V(0.3, 0.2, 0)), V(0.5, -1, 0), { n: 14, color: '#48cae4', speed: 4, size: 0.18, life: 0.4, gravity: -12, additive: false }); await wait(0.05); }
    this.fx.water(target, 40);
    this.fx.ring(target, { color: '#90e0ef', radius: 1.4, dur: 0.4 });
    await wait(0.15);
    this.goHome(m, 0.45);
  }

  async use_aimant(ev, m) {
    const o = m.obj, target = this.targetPos(ev.tgt);
    const stand = this.near(this.pos(o), target, 1).setY(0.9);
    await this.lift(m, stand, 0.35, 1.3);
    this.faceTowards(o, target, -Math.PI / 2);
    o.userData.magnetActive = true;
    this.callout(m, 'ATTRACTION');
    sfx('magnet');
    for (let i = 0; i < 4; i++) {
      this.fx.ring(target.clone(), { color: '#d62828', radius: 1, dur: 0.3, y: target.y });
      this.squash(o, 1.3, 0.12, 0.15);
      await wait(0.12);
    }
    const t = this.m(ev.tgt.id);
    if (t) await this.jitter(t.obj, 0.12, 0.25);
    setTimeout(() => { o.userData.magnetActive = false; this.goHome(m, 0.45); }, 900);
  }

  async use_tronco(ev, m) {
    const o = m.obj, target = this.targetPos(ev.tgt);
    const at = target.clone().add(V(-0.55, 0.15, 0.1));
    await this.lift(m, at, 0.35, 1.2);
    this.callout(m, 'VRRRR !');
    sfx('saw'); buzz(80);
    const j = this.jitter(o, 0.08, 0.6);
    for (let i = 0; i < 8; i++) { this.fx.stream(target, V(Math.random() - 0.5, 1, Math.random() - 0.5), { n: 6, color: i % 2 ? '#ffd166' : '#d4a373', speed: 4, size: 0.12, life: 0.4, gravity: -12 }); await wait(0.07); }
    await j;
    this.fx.shake(0.3);
    this.goHome(m, 0.45);
  }

  async use_de(ev, m) {
    const o = m.obj, W = this.W;
    const to = W.cardPos(ev.p).add(V(0.9, 0.3, ev.p === W.me ? -0.6 : 0.6));
    m.busy = true;
    this.callout(m, 'LANCER');
    sfx('dice');
    const die = o.userData.model.userData.die;
    await all(this.arc(o, to, 1.5, 0.6, ease.outQuad), this.scaleTo(o, 1.4, 0.6), die ? this.spin(die, 'x', 3, 0.6) : null, die ? this.spin(die, 'z', 2, 0.6) : null);
    sfx('slam');
    this.fx.dust(to.clone().setY(0.05), 8);
    this.fx.pop(to.clone().add(V(0, 1.1, 0)), String(ev.roll), 'big', 1);
    await wait(0.3);
    this.goHome(m, 0.45);
  }

  async use_sablier(ev, m) {
    const o = m.obj;
    await this.lift(m, this.pos(o).add(V(0, 1.2, 0)), 0.3, 1.5);
    this.callout(m, 'STOP !');
    sfx('freeze'); buzz(40);
    await this.spin(o, 'z', 0.5, 0.5, ease.inOutCubic);
    this.fx.flash('#a2d2ff', 0.55, 0.6);
    this.fx.ring(this.pos(o).setY(0.1), { color: '#a2d2ff', radius: 6, dur: 0.7 });
    this.fx.banner('TEMPS FIGÉ', 'ice', 1.1);
    await wait(0.4);
    this.goHome(m, 0.45);
  }

  async use_photocop(ev, m) {
    const W = this.W, o = m.obj;
    const spot = V(-1.6, 1.1, W.zs(ev.p) * 2.2);
    await this.lift(m, spot, 0.45, 1.6);
    o.rotation.y = 0.35;
    const lid = o.userData.model.userData.lid, light = o.userData.model.userData.light;
    sfx('click');
    if (lid) await tween(lid.rotation, { x: -1.3 }, 0.25, ease.outBack);
    // le modèle de la cible s'envole dans la machine
    let ghost = null;
    const t = ev.tgt;
    if (t.t === 'ent') { const tm = this.m(t.id); if (tm) { ghost = tm.obj.clone(); ghost.position.copy(tm.obj.position); } }
    else if (t.t === 'card' && W.cards[t.p]) { ghost = W.cards[t.p].clone(); }
    if (ghost) {
      ghost.userData = {};
      W.scene.add(ghost);
      sfx('whoosh');
      const inside = this.pos(o).add(V(0, 0.55, 0));
      await all(this.arc(ghost, inside, 1.2, 0.45), tween(ghost.rotation, { x: 0, y: 0, z: 0 }, 0.45), this.scaleTo(ghost, 0.7, 0.45, ease.inQuad));
      await all(tween(ghost.position, { y: inside.y - 0.3 }, 0.2), this.scaleTo(ghost, 0.01, 0.2, ease.inQuad));
      W.scene.remove(ghost);
    }
    if (lid) await tween(lid.rotation, { x: 0 }, 0.18, ease.inQuad);
    this.callout(m, 'COPIE…');
    sfx('copier'); buzz(30);
    if (light) {
      light.visible = true;
      await animate(0.9, (k) => { light.position.z = -0.25 + Math.sin(k * Math.PI * 2) * 0.25 + 0.25 * k; }, ease.linear);
      light.visible = false;
    }
    await this.jitter(o, 0.04, 0.15);
    const out = this.pos(o).add(V(-0.7, 0.4, 0));
    this.fx.burst(out, { n: 30, colors: ['#b9fbc0', '#ffffff'], speed: 2, up: 2, size: 0.2 });
    sfx('sparkle');
    this.lastBurst = out;
    if (t.t === 'card') {
      const mine = W.cards[ev.p];
      if (mine) {
        const flyer = W.cards[t.p] ? W.cards[t.p].clone() : null;
        if (flyer) {
          flyer.userData = {};
          flyer.position.copy(out); flyer.scale.setScalar(0.5);
          W.scene.add(flyer);
          await all(this.arc(flyer, mine.position.clone(), 1, 0.4), this.scaleTo(flyer, 1, 0.4), tween(flyer.rotation, { x: TILT }, 0.4));
          W.scene.remove(flyer);
        }
      }
    }
  }

  async use_ventilo(ev, m) {
    const W = this.W, o = m.obj;
    const side = W.zs(ev.p);
    const spot = V(0, 0.2, side * 2.85);
    await this.lift(m, spot, 0.4, 1.6);
    o.rotation.y = side > 0 ? 0 : Math.PI;
    this.callout(m, 'TEMPÊTE !');
    m.spin = 40;
    sfx('wind'); buzz(60);
    for (let i = 0; i < 14; i++) {
      for (let k = 0; k < 6; k++) {
        this.fx.norm.emit(V((Math.random() - 0.5) * 5, 0.3 + Math.random() * 1.2, side * 2.6), V((Math.random() - 0.5), 0, -side * (9 + Math.random() * 4)), { color: '#e0fbfc', size: 0.12, life: 0.7, gravity: 0, drag: 0 });
      }
      await wait(0.05);
    }
    this.fx.shake(0.4);
    setTimeout(() => { m.spin = 1.5; this.goHome(m, 0.5); }, 700);
  }

  async use_engrais(ev, m) {
    const o = m.obj, target = this.targetPos(ev.tgt);
    const over = target.clone().add(V(-0.3, 1.1, 0));
    await this.lift(m, over, 0.4, 1.3);
    await tween(o.rotation, { z: -1.8 }, 0.25);
    this.callout(m, 'POUSSE !');
    sfx('grow');
    for (let i = 0; i < 6; i++) { this.fx.stream(this.pos(o).add(V(0.25, 0, 0)), V(0.3, -1, 0), { n: 10, color: i % 2 ? '#7f5539' : '#52b788', speed: 3, size: 0.12, life: 0.5, gravity: -8, additive: false }); await wait(0.06); }
    this.fx.sparkles(target, '#b7e4c7', 30);
    this.goHome(m, 0.45);
  }

  async use_pelle(ev, m) {
    const W = this.W, o = m.obj;
    const g = W.grave.position.clone();
    await this.lift(m, g.clone().add(V(0.2, 0.6, 0)), 0.4, 1.4);
    this.callout(m, 'ON CREUSE');
    for (let i = 0; i < 3; i++) {
      sfx('dig');
      await tween(o.rotation, { z: -0.9 }, 0.12, ease.inQuad);
      this.fx.burst(g.clone().add(V(0, 0.2, 0)), { n: 14, colors: ['#5c3d2e', '#7f5539'], speed: 2, up: 3, size: 0.18, life: 0.6, gravity: -10, additive: false });
      this.fx.shake(0.15);
      await tween(o.rotation, { z: 0.2 }, 0.14, ease.outQuad);
    }
    this.lastBurst = g.clone().add(V(0, 0.5, 0));
    this.goHome(m, 0.45);
  }

  // ------------------------------------------------------------ cartes
  async on_cardMod(ev) {
    const W = this.W, c = W.cards[ev.p];
    if (!c) return;
    const d = c.userData.data;
    d.v = ev.to;
    if (ev.cause === 'copy') { d.r = ev.card.r; d.s = ev.card.s; }
    if (ev.cause === 'wet') d.wet = 3;
    W.refreshCardFace(ev.p);
    this.fx.sparkles(c.position.clone(), ev.to >= ev.from ? '#ffd166' : '#c77dff', 16);
    const delta = ev.to - ev.from;
    const txt = ev.cause === 'cut' ? '÷2' : ev.cause === 'dice' || ev.cause === 'copy' ? '= ' + ev.to : (delta > 0 ? '+' : '') + delta;
    const at = c.position.clone().add(V(0, 0.9, 0));
    const good = delta >= 0;
    if (ev.cause === 'shot') { this.fx.shatter(c.position.clone(), ['#fbf6ea', '#d9cdb4'], { n: 14, s: 0.06 }); }
    if (ev.cause === 'cut') { this.fx.shatter(c.position.clone(), ['#fbf6ea'], { n: 18, s: 0.07 }); }
    sfx(good ? 'coin' : 'lose');
    this.fx.pop(at, txt, good ? 'good big' : 'bad big', 1);
    await this.squash(c, 1, 0.3, 0.35);
  }

  async on_cardGone(ev) {
    const W = this.W, c = W.cards[ev.p];
    if (!c) return;
    W.cards[ev.p] = null;
    if (ev.cause === 'fish') {
      const to = W.deckPos(ev.to).add(V(0, 0.3, 0));
      sfx('reel');
      await all(this.arc(c, to, 2, 0.6), tween(c.rotation, { x: 0, z: Math.PI * 3 }, 0.6), this.scaleTo(c, 0.6, 0.6));
      sfx('slam');
      this.fx.pop(to.clone().add(V(0, 0.8, 0)), 'PÊCHÉE !', ev.to === W.me ? 'good' : 'bad', 0.9);
    } else {
      const at = c.position.clone();
      sfx('fire');
      for (let i = 0; i < 6; i++) { this.fx.fire(at.clone().add(V(0, -0.3, 0)), 16, 1); await wait(0.06); }
      await all(this.scaleTo(c, 0.01, 0.35, ease.inBack), tween(c.rotation, { x: 0 }, 0.35));
      this.fx.burst(at, { n: 30, color: '#3d3d3d', speed: 1, up: 2, size: 0.25, life: 1.2, gravity: 0.5, additive: false });
      this.fx.pop(at.clone().add(V(0, 0.9, 0)), 'BRÛLÉE !', 'bad big', 1);
    }
    W.scene.remove(c);
  }

  // ------------------------------------------------------------ joueurs
  ghostify(p, on) {
    const a = this.W.avatars[p];
    if (!a.userData.cloned) { a.traverse((o) => { if (o.material) o.material = o.material.clone(); }); a.userData.cloned = true; }
    a.traverse((o) => { if (o.material) { o.material.transparent = on; o.material.opacity = on ? 0.35 : 1; o.material.depthWrite = !on; } });
    this.W.ghost[p] = on;
  }

  async on_kill(ev) {
    const W = this.W, a = W.avatars[ev.p], inner = a.userData.inner;
    a.userData.busy = true;
    buzz(ev.p === W.me ? 200 : 60);
    this.fx.flash('#d00000', ev.p === W.me ? 0.55 : 0.3, 0.4);
    this.fx.shake(0.8);
    const hit = a.position.clone().add(V(0, 0.9, 0));
    this.fx.burst(hit, { n: 30, colors: ['#e63946', '#ff8fa3'], speed: 3, up: 2, size: 0.2, life: 0.6, additive: false });
    sfx('lose');
    await all(tween(inner.rotation, { x: (ev.p === W.me ? 1 : -1) * 1.45 }, 0.35, ease.outBounce), tween(inner.position, { y: 0 }, 0.3));
    if (ev.saved) { a.userData.busy = false; return; }
    this.fx.banner(ev.p === W.me ? 'TU ES MORT' : `${this.ui.name(ev.p).toUpperCase()} EST MORT`, 'dead', 1.2);
    sfx('ghost');
    await wait(0.3);
    this.ghostify(ev.p, true);
    await tween(inner.rotation, { x: 0 }, 0.5, ease.outBack);
    a.userData.busy = false;
  }

  async on_revive(ev) {
    const W = this.W, a = W.avatars[ev.p], inner = a.userData.inner;
    a.userData.busy = true;
    if (ev.cause === 'defib') {
      sfx('zap'); buzz(80);
      for (let i = 0; i < 3; i++) { this.fx.burst(a.position.clone().add(V(0, 0.8, 0)), { n: 20, colors: ['#4cc9f0', '#ffffff'], speed: 3, up: 2, size: 0.15, life: 0.3 }); this.fx.flash('#4cc9f0', 0.25, 0.15); await wait(0.12); }
      this.fx.pop(a.position.clone().add(V(0, 2, 0)), 'RÉANIMÉ !', 'good big', 1.1);
    } else {
      this.pillar(a.position.clone(), '#ffffff');
      this.fx.sparkles(a.position.clone().add(V(0, 0.8, 0)), '#ffffff', 30);
      if (ev.loss) this.ui.bumpPts(ev.p, -ev.loss);
    }
    sfx('revive');
    this.ghostify(ev.p, false);
    await all(tween(inner.rotation, { x: 0 }, 0.4, ease.outBack), tween(inner.position, { y: 0 }, 0.3));
    a.userData.busy = false;
  }

  async on_lightning(ev) {
    const W = this.W, a = W.avatars[ev.p];
    const top = a.position.clone().add(V(0.3, 9, 0)), bot = a.position.clone().add(V(0, 0.8, 0));
    const pts = [top];
    for (let i = 1; i < 8; i++) pts.push(top.clone().lerp(bot, i / 8).add(V((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)));
    pts.push(bot);
    const bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 40, 0.07, 6), new THREE.MeshBasicMaterial({ color: '#fff7ae', transparent: true, blending: THREE.AdditiveBlending }));
    W.scene.add(bolt);
    sfx('thunder'); buzz(120);
    freezeFrame(0.08);
    this.fx.flash('#ffffff', 0.9, 0.5);
    this.fx.shake(1);
    this.fx.burst(bot, { n: 50, colors: ['#fff7ae', '#4cc9f0'], speed: 5, up: 3, size: 0.2, life: 0.5 });
    await animate(0.4, (k) => { bolt.material.opacity = k < 0.5 ? (Math.random() > 0.3 ? 1 : 0.2) : 1 - k; });
    W.scene.remove(bolt);
  }

  // ------------------------------------------------------------ monde
  async on_global(ev) {
    const W = this.W;
    if (ev.kind === 'orage') {
      if (ev.on && !W.globalObjs.orage) {
        const cl = new THREE.Group();
        const m = mat('#495057', { rough: 1, flat: true });
        for (let i = 0; i < 14; i++) {
          const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.7, 1), m);
          s.position.set((Math.random() - 0.5) * 6, 5 + Math.random() * 0.8, (Math.random() - 0.5) * 9);
          cl.add(s);
        }
        cl.scale.setScalar(0.01);
        W.scene.add(cl); W.globalObjs.orage = cl;
        sfx('thunder');
        this.fx.flash('#ffffff', 0.6, 0.3);
        this.fx.banner('ORAGE !', 'storm', 1.2);
        await all(this.scaleTo(cl, 1, 0.8, ease.outCubic), tween(W.hemi, { intensity: 0.45 }, 0.8), tween(W.sun, { intensity: 1.0 }, 0.8));
      } else if (!ev.on && W.globalObjs.orage) {
        const cl = W.globalObjs.orage; W.globalObjs.orage = null;
        await all(tween(cl.position, { x: 12 }, 0.8, ease.inQuad), tween(W.hemi, { intensity: 0.9 }, 0.8), tween(W.sun, { intensity: 2.4 }, 0.8));
        W.scene.remove(cl);
      }
    } else if (ev.kind === 'envers') {
      if (ev.on) {
        sfx('whoosh');
        this.fx.flash('#c77dff', 0.5, 0.5);
        this.fx.banner('MONDE À L’ENVERS', 'envers', 1.4);
        await animate(1.1, (k) => { W.camRoll = Math.PI * 2 * k; }, ease.inOutCubic);
        W.camRoll = 0;
        W.rim.color.set('#c77dff'); W.rim2.color.set('#c77dff');
      } else {
        W.rim.color.set('#ff3d71'); W.rim2.color.set('#ffc93c');
        this.fx.pop(V(0, 1.5, 0), 'RETOUR À LA NORMALE', 'muted', 1);
      }
    }
    this.ui.refreshGlobals?.();
  }

  async on_tick(ev) {
    const m = this.m(ev.id);
    if (!m) return;
    m.timer = ev.timer;
    if (m.kind === 'bombe') {
      sfx('tick');
      this.fx.ring(this.pos(m.obj), { color: '#e63946', radius: 1 + (3 - ev.timer) * 0.6, dur: 0.4 });
      await this.squash(m.obj, null, 0.3, 0.3);
    }
  }
  async on_suck() {}
  async on_catPush(ev) {
    const cat = this.m(ev.id), t = this.m(ev.target);
    if (!cat || !t) return;
    cat.busy = true;
    const home = cat.obj.position.clone();
    const to = t.obj.position.clone().lerp(home, 0.35);
    await this.arc(cat.obj, to, 0.6, 0.35);
    this.faceTowards(cat.obj, t.obj.position);
    sfx('meow');
    await this.squash(cat.obj, null, 0.25, 0.2);
    this.arc(cat.obj, home, 0.6, 0.4).then(() => { cat.busy = false; });
  }

  async on_grow(ev) {
    const m = this.m(ev.id);
    if (!m) return;
    m.stage = ev.stage;
    this.W.rebuildEnt(m);
    sfx('grow');
    this.fx.burst(this.pos(m.obj).add(V(0, 0.6, 0)), { n: 16, colors: ['#52b788', '#95d5b2'], speed: 1.5, up: 2, size: 0.18, life: 0.7, additive: false });
    await this.squash(m.obj, null, 0.35, 0.4);
  }

  async on_fruit(ev) {
    const W = this.W, m = this.m(ev.id);
    const from = m ? this.pos(m.obj).add(V(0, 1, 0)) : V(0, 1, 0);
    this.fx.banner('RÉCOLTE !', 'gold', 1);
    for (const card of ev.cards) {
      const c = makeCard(battleFace(card), battleBack());
      c.position.copy(from); c.scale.setScalar(0.4);
      W.scene.add(c);
      sfx('coin');
      this.fx.sparkles(from, '#ffd166', 14);
      await all(this.arc(c, W.deckPos(ev.p).add(V(0, 0.3, 0)), 1.8, 0.45), this.scaleTo(c, 0.9, 0.45), this.spin(c, 'y', 1, 0.45));
      W.scene.remove(c);
      this.squash(W.decks[ev.p], 1, 0.2, 0.2);
    }
  }

  async on_promote(ev) {
    const m = this.m(ev.id);
    if (!m) return;
    m.kind = 'reine';
    this.pillar(this.pos(m.obj), '#ffd166');
    sfx('sparkle');
    await this.scaleTo(m.obj, 0.01, 0.2, ease.inBack);
    this.W.rebuildEnt(m);
    await this.scaleTo(m.obj, 0.9, 0.45, ease.outElastic);
    this.fx.pop(this.pos(m.obj).add(V(0, 1.3, 0)), 'PROMOTION !', 'gold', 1);
  }

  async on_slip(ev) {
    const W = this.W;
    const ban = this.m(ev.banana);
    const at = ban ? this.pos(ban.obj) : W.avatarPos(ev.p);
    sfx('slip'); buzz(50);
    const a = W.avatars[ev.p];
    this.spin(a.userData.inner, 'y', 2, 0.6);
    if (ban) { await all(this.arc(ban.obj, at.clone().add(V(0, 0, W.zs(ev.p) * 1.5)).setY(-3), 2, 0.6), this.spin(ban.obj, 'x', 3, 0.6)); W.removeEnt(ev.banana); }
    this.fx.pop(at.clone().add(V(0, 1.2, 0)), 'GLISSADE !', 'bad big', 1);
  }
  async on_dodge(ev) {
    const ban = this.m(ev.banana);
    if (ban) { this.fx.burst(this.pos(ban.obj), { n: 10, color: '#ffe66d', speed: 1, up: 1, size: 0.2, additive: false }); await this.scaleTo(ban.obj, 0.01, 0.25, ease.inBack); this.W.removeEnt(ev.banana); }
    this.fx.pop(this.W.avatars[ev.p].position.clone().add(V(0, 2, 0)), 'ÉVITÉ', 'good', 0.8);
  }
  async on_reflect(ev) {
    const m = this.m(ev.mirror);
    if (!m) return;
    m.busy = true;
    sfx('clink');
    this.fx.flash('#e0fbfc', 0.5, 0.25);
    const p = this.pos(m.obj).add(V(0, 0.6, 0));
    this.fx.burst(p, { n: 30, colors: ['#ffffff', '#caf0f8'], speed: 4, up: 1, size: 0.25, life: 0.4 });
    await this.scaleTo(m.obj, 1.4, 0.15);
    this.fx.pop(p.clone().add(V(0, 0.8, 0)), 'RENVOYÉ !', 'big', 1);
    await wait(0.25);
  }
  async on_block(ev) {
    const c = this.W.cards[ev.p];
    if (!c) return;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: '#adb5bd', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    dome.position.copy(c.position);
    this.W.scene.add(dome);
    sfx('clink'); this.fx.shake(0.3);
    this.fx.pop(c.position.clone().add(V(0, 1, 0)), 'BLOQUÉ PAR LA TOUR', 'muted big', 1);
    await animate(0.6, (k) => { dome.material.opacity = 0.5 * (1 - k); dome.scale.setScalar(0.6 + k * 0.6); });
    this.W.scene.remove(dome);
  }
  async on_jam(ev) {
    const m = this.m(ev.id);
    if (!m) return;
    await this.lift(m, this.pos(m.obj).add(V(0, 1, 0)), 0.3, 1.2);
    sfx('click'); await wait(0.15); sfx('click');
    this.fx.burst(this.pos(m.obj).add(V(0, 0.5, 0)), { n: 14, color: '#adb5bd', speed: 0.6, up: 1.5, size: 0.3, life: 0.8, gravity: 1, additive: false });
    this.fx.pop(this.pos(m.obj).add(V(0, 1, 0)), 'ENRAYÉ', 'water big', 1);
    await wait(0.3);
    this.goHome(m);
  }
  async on_miss(ev) {
    const at = ev.tgt ? this.targetPos(ev.tgt) : (this.m(ev.id) ? this.pos(this.m(ev.id).obj) : V());
    sfx('lose');
    await this.fx.pop(at.clone().add(V(0, 0.9, 0)), 'RATÉ', 'muted big', 0.8);
  }
  async on_fizzle(ev) {
    const at = this.targetPos(ev.tgt);
    this.fx.burst(at, { n: 18, color: '#ffffff', speed: 0.8, up: 2, size: 0.35, life: 0.8, gravity: 1.5, additive: false });
    await this.fx.pop(at.clone().add(V(0, 0.9, 0)), 'TROP MOUILLÉ', 'water big', 0.9);
  }
  async on_ricochet(ev) {
    const m = this.m(ev.id);
    const at = m ? this.pos(m.obj).add(V(0, 0.6, 0)) : V();
    sfx('clink');
    this.fx.burst(at, { n: 20, colors: ['#ffd166', '#ffffff'], speed: 5, up: 2, size: 0.12, life: 0.3 });
    await this.fx.pop(at.clone().add(V(0, 0.6, 0)), 'RICOCHET', 'muted', 0.8);
  }
  async on_uses(ev) { const m = this.m(ev.id); if (m) m.uses = ev.uses; }
  async on_wet(ev) {
    const m = this.m(ev.id);
    if (!m) return;
    m.wet = 3;
    this.fx.water(this.pos(m.obj).add(V(0, 0.5, 0)), 15);
  }
  async on_malheur(ev) {
    this.W.mal[ev.p] = 3;
    sfx('ghost');
    await this.fx.pop(this.W.avatars[ev.p].position.clone().add(V(0, 2, 0)), '7 ANS DE MALHEUR', 'curse big', 1.1);
  }
  async on_frozen() {
    sfx('freeze');
    this.fx.flash('#a2d2ff', 0.5, 0.6);
    await this.fx.banner('TEMPS FIGÉ', 'ice', 1);
  }
  async on_popup(ev) { await this.fx.pop(V(0, 1.2, 0), ev.word, 'muted', 0.9); }

  // ------------------------------------------------------------ résultat du pli
  async on_result(ev) {
    const W = this.W, r = ev.res;
    const cs = W.cards;
    for (const p of [0, 1]) if (cs[p] && r.v[p] != null) this.fx.pop(cs[p].position.clone().add(V(0, 1.2, 0)), String(r.v[p]), 'huge ' + (p === W.me ? 'me' : 'opp'), 1.1);
    await wait(0.45);
    if (r.kind === 'void') {
      sfx('suck');
      await all(cs.filter(Boolean).map((c) => all(tween(c.position, { x: 0, y: 0.6, z: 0 }, 0.6, ease.inCubic), this.scaleTo(c, 0.01, 0.6, ease.inCubic), this.spin(c, 'y', 3, 0.6))));
      this.fx.banner('AVALÉES', 'envers', 1);
    } else if (r.winner == null) {
      sfx('bataille'); buzz(80);
      this.fx.shake(0.7); W.punch(0.8);
      this.fx.banner('BATAILLE !', 'bataille', 1.3);
      const pot = W.potPos();
      await all(cs.filter(Boolean).map((c, i) => all(this.arc(c, pot.clone().add(V(0, 0.05 + i * 0.03 + W.potGroup.children.length * 0.03, 0)), 1, 0.5), tween(c.rotation, { x: 0, z: Math.PI, y: (Math.random() - 0.5) * 0.6 }, 0.5))));
      for (const c of cs) if (c) { W.scene.remove(c); c.scale.setScalar(0.8); c.position.copy(pot).setY(0.03 + W.potGroup.children.length * 0.03); W.potGroup.add(c); }
    } else {
      const w = r.winner, l = 1 - w;
      const wc = cs[w], lc = cs[l];
      if (wc && lc) {
        const above = lc.position.clone().add(V(0, 1.2, 0));
        await all(this.arc(wc, above, 0.8, 0.28, ease.outCubic), this.spin(wc, 'z', 1, 0.28));
        await tween(wc.position, { x: lc.position.x, y: lc.position.y + 0.1, z: lc.position.z }, 0.1, ease.inQuad);
        sfx('slam'); buzz(70); freezeFrame(0.07);
        this.fx.shake(0.7); W.punch(0.7);
        this.fx.burst(lc.position, { n: 40, colors: w === W.me ? ['#ffc93c', '#ffffff'] : ['#ff3d71', '#ffffff'], speed: 5, up: 3, size: 0.25, life: 0.6 });
        this.fx.ring(lc.position.clone().setY(0.05), { color: w === W.me ? '#ffc93c' : '#ff3d71', radius: 3, dur: 0.4 });
      } else if (wc) {
        await this.squash(wc, 1, 0.4, 0.35);
      }
      this.fx.banner(w === W.me ? 'PLI GAGNÉ' : 'PLI PERDU', w === W.me ? 'win' : 'lose', 1.05);
      sfx(w === W.me ? 'win' : 'lose');
      const deck = W.deckPos(w).add(V(0, 0.4, 0));
      const pot = [...W.potGroup.children];
      for (const c of pot) { W.potGroup.remove(c); W.scene.add(c); }
      await all([...cs.filter(Boolean), ...pot].map((c, i) => wait(i * 0.05).then(() => all(this.arc(c, deck, 1.4, 0.45), tween(c.rotation, { x: 0, z: Math.PI, y: 0 }, 0.45), this.scaleTo(c, 0.95, 0.45)))));
      for (const c of [...cs, ...pot]) if (c) W.scene.remove(c);
      this.squash(W.decks[w], 1, 0.3, 0.3);
    }
    W.cards = [null, null];
  }

  async on_pts(ev) {
    const W = this.W;
    this.ui.bumpPts(ev.p, ev.delta);
    if (ev.cause === 'mate') { this.fx.banner('ÉCHEC ET MAT', 'mate', 1.2); sfx('bataille'); this.fx.shake(0.6); }
    if (ev.delta > 0) { sfx('coin'); if (ev.cause === 'win') this.ui.streak?.(ev.p); }
    else if (ev.delta < 0) sfx('lose');
    await wait(ev.cause === 'win' ? 0.35 : 0.2);
    void W;
  }
  async on_bataille() {}
  async on_void() {}
  async on_over() {}

  // ------------------------------------------------------------ pioche
  // Révèle une carte piochée. swipe(card, setFlip) : geste du joueur (sinon retournement automatique).
  async revealDraw(ev, swipe = null) {
    const W = this.W, p = ev.p, me = p === W.me;
    W.deckGlow = null;
    const c = ev.card ? W.makeBattleCard(ev.card, p) : W.makeObjectCard(ev.obj);
    const deck = W.decks[p];
    c.position.copy(W.deckPos(p)).setY((deck.userData.count ?? 26) * 0.012 + 0.03);
    c.quaternion.setFromEuler(new THREE.Euler(0, 0, Math.PI));
    if (ev.card) deck.userData.set(Math.max(0, (deck.userData.count ?? 26) - 1));
    sfx('whoosh'); buzz(10);
    const dist = me ? 6.8 : 8.5, up = me ? 0.3 : 1.8;
    const to = W.revealPoint(dist, up);
    const q0 = c.quaternion.clone(), q1 = W.cameraQuat(Math.PI);
    const from = c.position.clone();
    await animate(me ? 0.45 : 0.35, (k) => {
      c.position.lerpVectors(from, to, k); c.position.y += Math.sin(Math.PI * k) * 0.8;
      c.quaternion.slerpQuaternions(q0, q1, k);
      c.scale.setScalar(1 + k * (me ? 0.25 : 0.05));
    }, ease.outCubic);
    const rays = this.rays(ev);
    const setFlip = (theta, glow = 0) => {
      W.faceCamera(c, theta);
      c.position.copy(to);
      const j = glow * 0.03;
      c.position.x += (Math.random() - 0.5) * j; c.position.y += (Math.random() - 0.5) * j;
      if (rays) { rays.position.copy(to).addScaledVector(W.camera.getWorldDirection(V()), 0.4); rays.quaternion.copy(W.camera.quaternion); rays.material.opacity = Math.min(0.9, glow * 0.9); }
    };
    setFlip(Math.PI);
    if (swipe) await swipe(c, setFlip);
    else {
      await wait(0.2);
      await animate(0.32, (k) => setFlip(Math.PI * (1 - k), k), ease.inOutCubic);
    }
    setFlip(0, 1);
    await this.revealJuice(ev, c, to, rays);
    await wait(me ? 0.45 : 0.4);
    if (rays) animate(0.3, (k) => { rays.material.opacity = 0.9 * (1 - k); }).then(() => W.scene.remove(rays));
    if (ev.card) {
      W.cards[p] = c;
      const slot = W.cardPos(p);
      const qa = c.quaternion.clone(), qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(CARD_TILT, 0, 0));
      const pa = c.position.clone(), sa = c.scale.x;
      sfx('whoosh');
      await animate(0.38, (k) => {
        c.position.lerpVectors(pa, slot, k); c.position.y += Math.sin(Math.PI * k) * 0.6;
        c.quaternion.slerpQuaternions(qa, qb, k);
        c.scale.setScalar(sa + (1 - sa) * k);
      }, ease.inOutQuad);
      c.userData.revealed = true;
      sfx('slam'); buzz(25);
      this.fx.dust(slot.clone().setY(0.05), 12);
      this.fx.shake(0.25);
      await this.squash(c, 1, 0.2, 0.25);
    } else {
      const dest = me ? W.revealPoint(4, -3.2) : W.revealPoint(7, 4.5);
      sfx('whoosh');
      await all(tween(c.position, { x: dest.x, y: dest.y, z: dest.z }, 0.35, ease.inQuad), this.scaleTo(c, 0.4, 0.35, ease.inQuad));
      W.scene.remove(c);
      sfx('tap');
    }
  }

  rays(ev) {
    const big = !ev.card || ev.card.r >= 11 || ev.card.gold;
    if (!big) return null;
    if (!this.raysTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const g = cv.getContext('2d');
      g.translate(128, 128);
      for (let i = 0; i < 16; i++) {
        g.rotate(Math.PI / 8);
        const gr = g.createLinearGradient(0, 0, 0, -128);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(-6, 0); g.lineTo(-18, -128); g.lineTo(18, -128); g.lineTo(6, 0); g.fill();
      }
      this.raysTex = new THREE.CanvasTexture(cv);
    }
    const color = !ev.card ? KINDS[ev.obj].color : ev.card.r === 14 ? '#ff4fd8' : '#ffd166';
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: this.raysTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.renderOrder = -1;
    this.W.scene.add(m);
    const spin = () => { if (m.parent) { m.rotateZ(0.02); requestAnimationFrame(spin); } };
    spin();
    return m;
  }

  async revealJuice(ev, c, at, rays) {
    const me = ev.p === this.W.me;
    const r = ev.card?.r ?? 0;
    if (!ev.card) {
      const col = KINDS[ev.obj].color;
      sfx('sparkle'); sfx('spawn'); buzz(me ? 60 : 20);
      freezeFrame(0.06);
      this.fx.burst(at, { n: 70, colors: [col, '#ffffff', '#fff3b0'], speed: 5, up: 3, size: 0.25, life: 0.8, gravity: -3 });
      this.fx.flash(col, 0.35, 0.3);
      this.fx.pop(at.clone().add(V(0, -1.3, 0)), KINDS[ev.obj].name.toUpperCase(), 'gold big', 1);
      this.ui.discover?.(ev.obj, at);
    } else if (r === 14 || ev.card.gold) {
      sfx('victory'); buzz(me ? 120 : 30);
      freezeFrame(0.1);
      this.fx.burst(at, { n: 120, colors: ['#ff4fd8', '#ffd166', '#4cc9f0', '#7ae582', '#ffffff'], speed: 7, up: 4, size: 0.3, life: 1, gravity: -4 });
      this.fx.flash('#ffffff', 0.6, 0.35);
      this.fx.shake(0.7); this.W.punch(0.8);
      this.fx.pop(at.clone().add(V(0, -1.3, 0)), r === 14 ? 'AS !' : 'CARTE EN OR', 'gold huge', 1.1);
    } else if (r >= 11) {
      sfx('win'); buzz(me ? 60 : 20);
      this.fx.burst(at, { n: 60, colors: ['#ffd166', '#ffffff'], speed: 5, up: 3, size: 0.25, life: 0.8, gravity: -4 });
      this.fx.flash('#ffd166', 0.3, 0.25);
      this.fx.shake(0.35);
    } else {
      sfx(r >= 8 ? 'coin' : 'flip'); buzz(me ? 25 : 10);
      this.fx.burst(at, { n: r >= 8 ? 30 : 14, color: '#ffffff', speed: 3, up: 2, size: 0.18, life: 0.5, gravity: -4 });
    }
    await this.squash(c, c.scale.x, 0.18, 0.25);
  }

  async on_draw(ev) { await this.revealDraw(ev, null); }

  // ------------------------------------------------------------ main
  async on_toHand(ev) { this.ui.handAdd?.(ev.p, ev.card, ev.from); if (ev.from !== 'draw') await wait(0.35); }
  async on_discard(ev) { this.ui.handRemove?.(ev.p, ev.hid, 'discard'); sfx('fire'); await wait(0.3); }
  async on_steal(ev) {
    this.ui.handRemove?.(ev.from, ev.hid, 'steal');
    sfx(ev.cause === 'magnet' ? 'magnet' : 'reel');
    const W = this.W;
    const c = W.makeObjectCard(ev.kind);
    const a = ev.from === W.me ? W.revealPoint(4.5, -2.6) : W.revealPoint(7, 3.8);
    const b = ev.to === W.me ? W.revealPoint(4.5, -2.6) : W.revealPoint(7, 3.8);
    c.position.copy(a); W.faceCamera(c, 0); c.scale.setScalar(0.6);
    const mid = W.revealPoint(5, 0);
    await all(tween(c.position, { x: mid.x, y: mid.y, z: mid.z }, 0.35, ease.outCubic), this.scaleTo(c, 1, 0.35));
    this.fx.pop(mid.clone().add(V(0, -1.2, 0)), 'VOLÉE !', ev.to === W.me ? 'good big' : 'bad big', 0.9);
    await wait(0.4);
    await all(tween(c.position, { x: b.x, y: b.y, z: b.z }, 0.3, ease.inQuad), this.scaleTo(c, 0.4, 0.3));
    W.scene.remove(c);
  }

  // Carte jouée : elle s'affiche en grand (surtout celles du bot), puis se transforme.
  async on_play(ev) {
    const W = this.W, me = ev.p === W.me;
    this.ui.handRemove?.(ev.p, ev.hid, 'play');
    if (me && this.skipUse) { this.lastBurst = this.skipFrom || null; return; }
    const c = W.makeObjectCard(ev.kind);
    const start = me ? W.revealPoint(4.5, -2.6) : W.revealPoint(7, 3.8);
    const show = W.revealPoint(me ? 5.5 : 5, me ? 0.4 : 0.6);
    c.position.copy(start); W.faceCamera(c, me ? 0 : Math.PI); c.scale.setScalar(0.5);
    sfx('whoosh');
    const q0 = c.quaternion.clone(), q1 = W.cameraQuat(0);
    await animate(0.35, (k) => { c.position.lerpVectors(start, show, k); c.quaternion.slerpQuaternions(q0, q1, k); c.scale.setScalar(0.5 + 0.6 * k); }, ease.outCubic);
    sfx('flip');
    if (!me) this.fx.pop(show.clone().add(V(0, -1.3, 0)), KINDS[ev.kind].name.toUpperCase(), 'opp big', 0.9);
    await wait(me ? 0.25 : 0.75);
    const land = W.launchPos(ev.p);
    await all(tween(c.position, { x: land.x, y: land.y, z: land.z }, 0.3, ease.inQuad), this.scaleTo(c, 0.3, 0.3, ease.inQuad));
    W.scene.remove(c);
    this.fx.burst(land, { n: 40, colors: [KINDS[ev.kind].color, '#ffffff'], speed: 3, up: 2, size: 0.25, life: 0.6, gravity: -2 });
    this.fx.ring(land.clone().setY(0.05), { color: KINDS[ev.kind].color, radius: 1.5, dur: 0.35 });
    sfx('sparkle');
    this.lastBurst = land;
  }

  // ------------------------------------------------------------ billard : rejoue la simulation physique
  async on_billiard(ev) {
    const W = this.W, me = ev.p === W.me;
    const ball = new THREE.Group();
    const bm = makeModel('billard'); bm.children.slice(1).forEach((c) => c.visible = false);
    bm.position.y = -0.04;
    ball.add(bm);
    const toWorld = (x, y) => W.cellPos(x, y);
    ball.position.copy(toWorld(ev.start.x, ev.start.y));
    W.scene.add(ball);
    if (!me || !this.skipUse) {
      ball.scale.setScalar(0.01);
      await this.scaleTo(ball, 1, 0.3);
      const cue = cueModel();
      const dir = toWorld(ev.start.x + Math.cos(ev.angle), ev.start.y + Math.sin(ev.angle)).sub(ball.position).normalize();
      cue.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
      cue.scale.setScalar(0.6);
      W.scene.add(cue);
      const tip = (d) => ball.position.clone().setY(0.3).sub(dir.clone().multiplyScalar(1.34 + d));
      await animate(0.4, (k) => cue.position.copy(tip(0.3 + k * 0.6)), ease.outQuad);
      await animate(0.07, (k) => cue.position.copy(tip(0.9 - k * 0.9)), ease.inQuad);
      W.scene.remove(cue);
    }
    sfx('clink'); buzz(40);
    this.fx.burst(ball.position.clone().setY(0.3), { n: 14, color: '#ffffff', speed: 2, up: 1, size: 0.15, life: 0.3 });
    const fallenAt = new Map(ev.fallen.map((f) => [f.id, f]));
    const objs = new Map();
    for (const m of W.models.values()) if (m.zone === 'board') { objs.set(m.id, m); m.busy = true; }
    let last = {};
    const frames = ev.frames;
    const dur = frames.length ? frames[frames.length - 1].t : 0.1;
    let fi = 0;
    const dropped = new Set();
    await animate(dur, (k) => {
      const t = k * dur;
      while (fi < frames.length - 1 && frames[fi + 1].t <= t) fi++;
      const f = frames[fi];
      for (const [id, pos] of Object.entries(f)) {
        if (id === 't') continue;
        const wp = toWorld(pos[0], pos[1]);
        if (id === 'ball') { const prev = last.ball; ball.position.set(wp.x, wp.y, wp.z); if (prev) bm.rotation.x += Math.hypot(wp.x - prev.x, wp.z - prev.z) * 3; last.ball = wp.clone(); continue; }
        const m = objs.get(+id);
        if (m && !dropped.has(m.id)) { if (last[id] && last[id].distanceTo(wp) > 0.02) m.obj.rotation.z = (Math.random() - 0.5) * 0.2; m.obj.position.set(wp.x, wp.y, wp.z); last[id] = wp.clone(); }
      }
      for (const [id, fall] of fallenAt) {
        if (t < fall.t || dropped.has(id === 'ball' ? 'ball' : +id)) continue;
        const o = id === 'ball' ? ball : objs.get(+id)?.obj;
        if (!o) continue;
        dropped.add(id === 'ball' ? 'ball' : +id);
        const v = toWorld(fall.x + fall.vx * 0.3, fall.y + fall.vy * 0.3).sub(toWorld(fall.x, fall.y));
        const end = o.position.clone().add(v.multiplyScalar(2)).setY(-4);
        sfx('slip');
        if (id !== 'ball') { this.fx.pop(o.position.clone().setY(1), 'TOMBÉ !', 'bad', 0.9); buzz(40); }
        this.arc(o, end, 0.5, 0.6, ease.inQuad);
        this.spin(o, 'x', 2, 0.6);
      }
    }, ease.linear);
    for (const [id, m] of objs) {
      m.obj.rotation.z = 0;
      if (dropped.has(id)) { m.fellOff = true; continue; }
      const sn = ev.snaps[id];
      if (sn) { m.x = sn.x; m.y = sn.y; tween(m.obj.position, (({ x, y, z }) => ({ x, y, z }))(W.cellPos(sn.x, sn.y)), 0.25, ease.outQuad); }
      m.busy = false;
    }
    if (!dropped.has('ball')) await all(this.scaleTo(ball, 0.01, 0.3, ease.inBack));
    else await wait(0.4);
    W.scene.remove(ball);
  }
}

