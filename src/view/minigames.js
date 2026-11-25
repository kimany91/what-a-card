// Mini-jeux : chaque objet se manipule avec un vrai geste (viser, mouliner, frotter, tirer la corde…).
import * as THREE from 'three';
import { animate, tween, ease, wait, freezeFrame, all } from './tween.js';
import { sfx, buzz } from './audio.js';
import { makeModel, cueModel, mat } from './models.js';
import { CELL } from './world.js';
import { tgtKey } from '../engine/engine.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const $ = (id) => document.getElementById(id);

export class Minigames {
  constructor(world, anim) {
    this.W = world; this.A = anim; this.fx = world.fx;
    this.layer = $('mg');
    this.hintEl = $('mgHint');
    this.gaugeEl = $('mgGauge');
    this.reelEl = $('mgReel');
    this.crossEl = $('mgCross');
    this.btnEl = $('mgBtn');
    this.handlers = null;
    const ev = (name) => (e) => { if (this.handlers?.[name]) { e.preventDefault(); this.handlers[name](e); } };
    this.layer.addEventListener('pointerdown', ev('down'));
    this.layer.addEventListener('pointermove', ev('move'));
    this.layer.addEventListener('pointerup', ev('up'));
    this.layer.addEventListener('pointercancel', ev('up'));
  }

  // ------------------------------------------------------------ couche de gestes
  open(hint) { this.layer.hidden = false; this.hint(hint); this.gauge(null); this.reelEl.hidden = true; this.crossEl.hidden = true; this.btnEl.hidden = true; }
  close() { this.layer.hidden = true; this.handlers = null; }
  hint(t) { this.hintEl.textContent = t || ''; this.hintEl.classList.remove('pulse'); void this.hintEl.offsetWidth; this.hintEl.classList.add('pulse'); }
  gauge(v, danger = false) {
    if (v == null) { this.gaugeEl.hidden = true; return; }
    this.gaugeEl.hidden = false;
    this.gaugeEl.firstElementChild.style.width = Math.max(0, Math.min(1, v)) * 100 + '%';
    this.gaugeEl.classList.toggle('danger', danger);
  }
  swipes(count, onEach) {
    return new Promise((res) => {
      let start = null, n = 0;
      this.handlers = {
        down: (e) => { start = { x: e.clientX, y: e.clientY, t: performance.now() }; },
        up: (e) => {
          if (!start) return;
          const dy = e.clientY - start.y, dx = e.clientX - start.x;
          start = null;
          if (Math.hypot(dx, dy) < 40) return;
          n++;
          const done = onEach(n, { dx, dy }) === true || n >= count;
          if (done) { this.handlers = null; res(); }
        },
      };
    });
  }
  hold(duration, onProgress) {
    return new Promise((res) => {
      let v = 0, down = false, last = performance.now();
      const tick = () => {
        const now = performance.now(), dt = (now - last) / 1000; last = now;
        v = Math.max(0, Math.min(1, v + (down ? dt / duration : -dt / (duration * 1.5))));
        onProgress(v, down);
        this.gauge(v);
        if (v >= 1) { this.handlers = null; this.gauge(null); res(); return; }
        requestAnimationFrame(tick);
      };
      this.handlers = { down: () => { down = true; }, up: () => { down = false; } };
      requestAnimationFrame(tick);
    });
  }
  mash(count, onTap) {
    return new Promise((res) => {
      let n = 0;
      this.gauge(0);
      this.handlers = {
        down: () => {
          n++; onTap(n); this.gauge(n / count);
          if (n >= count) { this.handlers = null; this.gauge(null); res(); }
        },
      };
    });
  }
  // Mouvement circulaire du doigt autour du centre du moulinet : renvoie l'angle parcouru.
  crank(onDelta) {
    return new Promise((res) => {
      this.reelEl.hidden = false;
      let lastA = null;
      const center = () => { const r = this.reelEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      this.handlers = {
        down: (e) => { const c = center(); lastA = Math.atan2(e.clientY - c.y, e.clientX - c.x); },
        move: (e) => {
          if (lastA == null) return;
          const c = center();
          const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
          let d = a - lastA;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          lastA = a;
          this.reelEl.style.setProperty('--rot', (parseFloat(this.reelEl.style.getPropertyValue('--rot') || '0') + (d * 180) / Math.PI) + 'deg');
          if (onDelta(Math.abs(d)) === true) { this.handlers = null; this.reelEl.hidden = true; res(); }
        },
        up: () => { lastA = null; },
      };
      this._crankDone = () => { this.handlers = null; this.reelEl.hidden = true; res(); };
    });
  }
  button(label, cls = '') {
    return new Promise((res) => {
      this.btnEl.hidden = false;
      this.btnEl.className = 'btn big mg-btn ' + cls;
      this.btnEl.textContent = label;
      this.btnEl.onclick = (e) => { e.stopPropagation(); this.btnEl.hidden = true; res(); };
    });
  }

  // Outil tenu en main : modèle 3D qui apparaît près de ta zone.
  async tool(kind, at) {
    const o = new THREE.Group();
    const m = makeModel(kind);
    o.add(m); o.userData.model = m;
    o.position.copy(this.W.launchPos(this.W.me));
    o.scale.setScalar(0.01);
    this.W.scene.add(o);
    sfx('spawn');
    await all(this.A.scaleTo(o, 1.3, 0.3), this.A.arc(o, at, 0.8, 0.4, ease.outCubic));
    return o;
  }
  async dropTool(o) {
    this.fx.burst(o.position.clone(), { n: 16, color: '#ffffff', speed: 1.5, up: 1.5, size: 0.2, life: 0.5, gravity: 0, additive: false });
    await this.A.scaleTo(o, 0.01, 0.25, ease.inBack);
    this.W.scene.remove(o);
  }

  // ------------------------------------------------------------ point d'entrée
  // a : action déjà choisie (cible touchée), acts : toutes les actions de cette carte.
  async run(kind, a, acts) {
    const fn = this['mg_' + kind];
    if (!fn) return { a, aim: null };
    this.A.skipUse = true;
    this.active = true;
    try { return await fn.call(this, a, acts); }
    finally { this.close(); this.active = false; }
  }

  // ------------------------------------------------------------ Flingue : vue subjective
  async mg_flingue(_a, acts) {
    const W = this.W, me = W.me, zs = W.zs(me);
    const eye = V(0.5, 3.4, zs * 6.2), look = V(0, 0.6, -zs * 2.6);
    this.open('GLISSE POUR VISER, PUIS APPUIE SUR TIRER');
    await W.setPov(eye, look, 52, 0.6);
    const gun = new THREE.Group();
    const gm = makeModel('flingue'); gm.position.set(0, -0.5, 0); gm.scale.setScalar(0.55);
    gun.add(gm);
    W.scene.add(gun);
    this.crossEl.hidden = false;
    let yaw = 0, pitch = 0, alive = true, t = 0;
    const base = look.clone();
    const update = () => {
      if (!alive) return;
      t += 0.016;
      const swayX = Math.sin(t * 1.7) * 0.18 + Math.sin(t * 3.1) * 0.08, swayY = Math.cos(t * 1.3) * 0.12 + Math.sin(t * 2.6) * 0.06;
      W.pov.target.copy(base).add(V(yaw + swayX, pitch + swayY, 0));
      const cam = W.camera;
      const fwd = cam.getWorldDirection(V());
      const right = V(1, 0, 0).applyQuaternion(cam.quaternion), up = V(0, 1, 0).applyQuaternion(cam.quaternion);
      gun.position.copy(cam.position).addScaledVector(fwd, 1.1).addScaledVector(right, 0.16).addScaledVector(up, -0.36);
      gun.quaternion.copy(cam.quaternion);
      gun.rotateY(Math.PI / 2 + 0.08);
      requestAnimationFrame(update);
    };
    update();
    let last = null;
    this.handlers = {
      down: (e) => { last = { x: e.clientX, y: e.clientY }; },
      move: (e) => {
        if (!last) return;
        yaw += (e.clientX - last.x) * 0.012; pitch -= (e.clientY - last.y) * 0.012;
        yaw = Math.max(-4, Math.min(4, yaw)); pitch = Math.max(-1.5, Math.min(2.5, pitch));
        last = { x: e.clientX, y: e.clientY };
      },
      up: () => { last = null; },
    };
    await this.button('TIRER', 'fire');
    this.handlers = null;
    // tir : ce qui est sous le viseur
    const cam = W.camera;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), cam);
    const pick = this.rayPick(ray);
    const hitPoint = pick?.point || cam.position.clone().addScaledVector(ray.ray.direction, 12);
    const match = pick ? acts.find((x) => tgtKey(x.tgt) === tgtKey(pick.tgt)) : null;
    const muzzle = gun.position.clone().addScaledVector(cam.getWorldDirection(V()), 0.6).add(V(0, 0.05, 0));
    sfx('shot'); buzz(90); freezeFrame(0.07);
    this.fx.flash('#fff3b0', 0.6, 0.2); this.fx.shake(0.8);
    this.fx.burst(muzzle, { n: 25, colors: ['#fff3b0', '#ffba08'], speed: 2.5, up: 0.5, size: 0.2, life: 0.2, gravity: 0 });
    this.A.tracer(muzzle, hitPoint);
    this.fx.burst(hitPoint, { n: 25, colors: ['#ffd166', '#ffffff'], speed: 4, up: 2, size: 0.15, life: 0.4 });
    animate(0.2, (k) => gm.rotation.z = Math.sin(k * Math.PI) * 0.5);
    if (!match) this.fx.pop(hitPoint.clone().add(V(0, 0.5, 0)), 'RATÉ', 'muted big', 0.9);
    await wait(0.45);
    alive = false;
    W.scene.remove(gun);
    this.crossEl.hidden = true;
    this.close();
    await W.clearPov(0.5);
    return { a: match || acts.find((x) => x.tgt.t === 'miss'), aim: null };
  }

  rayPick(ray) {
    const W = this.W;
    const roots = [...[...W.models.values()].map((m) => m.obj), ...W.cards.filter(Boolean), ...W.avatars];
    for (const h of ray.intersectObjects(roots, true)) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return { tgt: o.userData.pick, point: h.point };
    }
    return null;
  }

  // ------------------------------------------------------------ Billard : pose la boule, vise, tire la queue
  async mg_billard(_a, acts) {
    const W = this.W;
    W.markCells(acts.map((x) => x.tgt));
    this.open('TOUCHE UNE CASE POUR POSER TA BOULE');
    const cell = await new Promise((res) => {
      this.handlers = {
        up: (e) => {
          const c = W.pickCell(e.clientX, e.clientY);
          if (c && acts.some((x) => x.tgt.x === c.x && x.tgt.y === c.y)) { this.handlers = null; res(c); }
        },
      };
    });
    W.clearCells();
    const action = acts.find((x) => x.tgt.x === cell.x && x.tgt.y === cell.y);
    const ballPos = W.cellPos(cell.x, cell.y);
    const ball = new THREE.Group();
    const bm = makeModel('billard'); bm.children.slice(1).forEach((c) => (c.visible = false)); bm.position.y = -0.04;
    ball.add(bm); ball.position.copy(ballPos); ball.scale.setScalar(0.01);
    W.scene.add(ball);
    sfx('clink');
    await this.A.scaleTo(ball, 1, 0.3);
    // angle initial : vers la pièce adverse la plus proche
    const enemies = [...W.models.values()].filter((m) => m.zone === 'board' && m.owner !== W.me);
    let ang = -Math.PI / 2 * W.zs(W.me);
    if (enemies.length) {
      const n = enemies.sort((a, b) => a.obj.position.distanceTo(ballPos) - b.obj.position.distanceTo(ballPos))[0];
      ang = Math.atan2(n.obj.position.z - ballPos.z, n.obj.position.x - ballPos.x);
    }
    const cue = cueModel(); cue.scale.setScalar(0.6); W.scene.add(cue);
    const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 3.2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    guide.rotation.x = -Math.PI / 2; W.scene.add(guide);
    let power = 0;
    const place = () => {
      const dir = V(Math.cos(ang), 0, Math.sin(ang));
      W.pov.pos.copy(ballPos).addScaledVector(dir, -3.2).setY(2.3);
      W.pov.target.copy(ballPos).addScaledVector(dir, 2.4).setY(0);
      cue.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
      cue.position.copy(ballPos).setY(0.3).addScaledVector(dir, -(1.34 + 0.3 + power * 0.9));
      guide.position.copy(ballPos).addScaledVector(dir, 1.75).setY(0.11);
      guide.rotation.z = -ang + Math.PI / 2;
    };
    W.pov = { pos: V(), target: V(), fov: 50 };
    W.povK = 0;
    place();
    await tween(W, { povK: 1 }, 0.6, ease.inOutCubic);
    this.hint('GLISSE SUR LE CÔTÉ POUR VISER · TIRE LA QUEUE VERS LE BAS ET LÂCHE POUR FRAPPER');
    await new Promise((res) => {
      let last = null, start = null, mode = null;
      this.handlers = {
        down: (e) => { last = { x: e.clientX, y: e.clientY }; start = { ...last }; mode = null; },
        move: (e) => {
          if (!last) return;
          if (!mode) {
            const dx = e.clientX - start.x, dy = e.clientY - start.y;
            if (Math.hypot(dx, dy) > 12) mode = dy > Math.abs(dx) ? 'pull' : 'aim';
          }
          if (mode === 'aim') ang += (e.clientX - last.x) * 0.006 * W.zs(W.me);
          if (mode === 'pull') { power = Math.max(0, Math.min(1, (e.clientY - start.y) / 220)); this.gauge(power, power > 0.85); }
          last = { x: e.clientX, y: e.clientY };
          place();
        },
        up: () => {
          if (!last) return;
          last = null;
          if (mode === 'pull' && power > 0.15) { this.handlers = null; res(); }
          else { power = 0; this.gauge(null); place(); }
        },
      };
    });
    this.gauge(null);
    this.hint('');
    const dir = V(Math.cos(ang), 0, Math.sin(ang));
    const back0 = 1.34 + 0.3 + power * 0.9;
    await animate(0.07, (k) => cue.position.copy(ballPos).setY(0.3).addScaledVector(dir, -(back0 - (back0 - 1.34) * k)), ease.inQuad);
    W.scene.remove(cue, guide, ball);
    // angle en coordonnées de l'échiquier
    const by = W.me === 0 ? dir.z : -dir.z;
    const aim = { angle: Math.atan2(by, dir.x), power };
    this.keepPov = true;
    return { a: action, aim };
  }

  // ------------------------------------------------------------ Pêche : lancer puis mouliner (la ligne peut casser)
  async mg_peche(a, acts) {
    const W = this.W, A = this.A;
    const target = a.tgt.t === 'hand' ? W.revealPoint(7, 3.2) : W.posForTarget(a.tgt);
    const stand = W.launchPos(W.me).add(V(0.8, 0.2, -0.3));
    const rod = await this.tool('peche', stand);
    A.faceTowards(rod, target, Math.PI / 2);
    this.open('');
    const geo = new THREE.BufferGeometry().setFromPoints(new Array(24).fill(0).map(() => V()));
    const lineMat = new THREE.LineBasicMaterial({ color: '#ffffff' });
    const line = new THREE.Line(geo, lineMat);
    const hook = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mat('#ef233c'));
    W.scene.add(line, hook);
    const tip = () => rod.position.clone().add(V(0, 1.9, 0));
    const setLine = (end, sag) => {
      const s0 = tip(), arr = geo.attributes.position.array;
      for (let i = 0; i < 24; i++) { const k = i / 23; const p = s0.clone().lerp(end, k); p.y -= Math.sin(Math.PI * k) * sag; arr.set([p.x, p.y, p.z], i * 3); }
      geo.attributes.position.needsUpdate = true; hook.position.copy(end);
    };
    sfx('whoosh');
    await tween(rod.rotation, { x: -0.7 }, 0.18);
    tween(rod.rotation, { x: 0.4 }, 0.25, ease.outBack);
    const s0 = tip();
    await animate(0.5, (k) => { const e = s0.clone().lerp(target, k); e.y += Math.sin(Math.PI * k) * 2.2; setLine(e, 0.3 * k); }, ease.outQuad);
    sfx('plop'); this.fx.water(target, 20);
    // combat : la tension suit la vitesse réelle du moulinet (tours par seconde), pas le nombre de mouvements
    this.hint('MOULINE EN CERCLE · RESTE HORS DU ROUGE');
    let progress = 0, tension = 0, over = 0, tug = 0, tugT = 0, done = null, time = 0;
    let spun = 0, omega = 0, last = performance.now(), nextTug = 1.5 + Math.random() * 1.5, idle = 0;
    const hist = [];
    const targetObj = W.objectForTarget(a.tgt);
    const home = targetObj ? targetObj.position.clone() : null;
    const ticker = () => {
      if (done) return;
      const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
      time += dt;
      // vitesse angulaire mesurée sur les 0,3 dernières secondes (rad/s)
      hist.push([now, spun]);
      while (hist.length > 2 && now - hist[0][0] > 300) hist.shift();
      omega = hist.length > 1 ? (spun - hist[0][1]) / Math.max(0.05, (now - hist[0][0]) / 1000) : 0;
      idle = omega < 1 ? idle + dt : 0;
      // le poisson tire de temps en temps : une vague douce d'environ 1 s
      nextTug -= dt;
      if (nextTug <= 0) { tugT = 1; nextTug = 2 + Math.random() * 2; buzz(40); sfx('plop'); this.fx.pop(hook.position.clone().add(V(0, 0.7, 0)), 'IL TIRE !', 'bad', 0.8); }
      tugT = Math.max(0, tugT - dt);
      tug = Math.sin(tugT * Math.PI) * 0.45;
      const want = Math.min(1.4, omega / 15 + tug);
      tension += (want - tension) * Math.min(1, dt * 4);
      if (tension > 1) over += dt; else over = Math.max(0, over - dt * 1.5);
      progress += Math.max(0, omega) * dt / 42 * (tension > 1 ? 0.25 : 1);
      this.gauge(Math.min(1, tension), tension > 0.8);
      this.hint(tension > 1 ? 'TROP FORT ! RALENTIS' : tension > 0.8 ? 'ATTENTION…' : 'MOULINE EN CERCLE · RESTE HORS DU ROUGE');
      lineMat.color.set(tension > 1 && Math.floor(time * 10) % 2 ? '#ff3d71' : tension > 0.8 ? '#ff8fa3' : '#ffffff');
      const end = target.clone().lerp(tip(), Math.min(1, progress) * 0.85);
      end.y += Math.sin(time * 18) * 0.04 * (1 + tug * 4);
      setLine(end, 0.3 * (1 - Math.min(1, tension)));
      if (targetObj && a.tgt.t !== 'card') { targetObj.position.copy(home.clone().lerp(tip(), Math.min(1, progress) * 0.3)); targetObj.rotation.z = Math.sin(time * 20) * 0.08 * (1 + tug * 3); }
      if (progress >= 1) done = 'ok';
      else if (over > 0.9) done = 'break';
      else if (idle > 4) done = 'lost';
      if (done) this._crankDone?.();
      else requestAnimationFrame(ticker);
    };
    requestAnimationFrame(ticker);
    await this.crank((d) => {
      spun += d;
      if (d > 0.05 && Math.random() < 0.25) sfx('tick');
      return !!done;
    });
    this.gauge(null);
    if (targetObj && home) { targetObj.position.copy(home); targetObj.rotation.z = 0; }
    let result;
    if (done === 'ok') {
      sfx('win'); buzz(60);
      this.fx.pop(hook.position.clone().add(V(0, 0.6, 0)), 'ATTRAPÉ !', 'good big', 0.9);
      result = a;
    } else {
      sfx(done === 'break' ? 'glass' : 'lose'); buzz(120);
      this.fx.pop(hook.position.clone().add(V(0, 0.6, 0)), done === 'break' ? 'LIGNE CASSÉE !' : 'ÇA S’EST DÉCROCHÉ', 'bad big', 1);
      this.fx.shake(0.4);
      result = acts.find((x) => x.tgt.t === 'miss');
    }
    await wait(0.4);
    W.scene.remove(line, hook);
    await this.dropTool(rod);
    return { a: result, aim: null };
  }

  // ------------------------------------------------------------ outils simples, mais au geste
  async near(a, dy = 0.7) {
    const p = this.W.posForTarget(a.tgt);
    return p.add(V(0.35, dy, 0.25 * this.W.zs(this.W.me)));
  }

  async mg_briquet(a) {
    const at = await this.near(a, 0.6);
    const t = this.W.posForTarget(a.tgt);
    const o = await this.tool('briquet', at);
    const flame = o.userData.model.userData.flame;
    this.open('FROTTE LA MOLETTE ↓');
    let lit = false;
    await this.swipes(6, (n) => {
      sfx('click'); buzz(15);
      this.fx.burst(o.position.clone().add(V(0, 0.9, 0)), { n: 12, colors: ['#ffd166', '#ffffff'], speed: 2, up: 1, size: 0.08, life: 0.3 });
      this.A.jitter(o, 0.06, 0.12);
      if (n >= 2 && (Math.random() < 0.45 || n >= 4)) { lit = true; return true; }
      return false;
    });
    if (flame) this.A.scaleTo(flame, 1.6, 0.25);
    sfx('fire');
    this.hint('MAINTIENS POUR BRÛLER');
    await this.hold(1.1, (v, down) => { if (down && Math.random() < 0.6) this.fx.fire(t.clone().add(V(0, -0.1, 0)), Math.floor(4 + v * 10), 0.6 + v * 0.6); });
    void lit;
    await this.dropTool(o);
    return { a, aim: null };
  }

  async mg_tronco(a) {
    const t = this.W.posForTarget(a.tgt);
    const o = await this.tool('tronco', t.clone().add(V(-0.6, 0.3, 0.1)));
    this.open('TIRE LA CORDE ↓');
    const need = 1 + Math.floor(Math.random() * 3);
    await this.swipes(need, (n) => {
      sfx(n >= need ? 'saw' : 'click'); buzz(n >= need ? 80 : 30);
      this.fx.burst(o.position.clone(), { n: 8, color: '#adb5bd', speed: 1, up: 1.5, size: 0.3, life: 0.6, gravity: 1, additive: false });
      this.A.jitter(o, 0.12, 0.2);
      if (n < need) this.fx.pop(o.position.clone().add(V(0, 1, 0)), 'PFFT…', 'muted', 0.6);
    });
    this.hint('MAINTIENS POUR COUPER');
    await this.hold(1.0, (v, down) => {
      if (!down) return;
      o.position.x += (Math.random() - 0.5) * 0.04;
      if (Math.random() < 0.5) this.fx.stream(t, V(Math.random() - 0.5, 1, Math.random() - 0.5), { n: 3, color: Math.random() < 0.5 ? '#ffd166' : '#d4a373', speed: 4, size: 0.1, life: 0.4, gravity: -12 });
      if (Math.random() < 0.08) sfx('saw');
    });
    await this.dropTool(o);
    return { a, aim: null };
  }

  async mg_seau(a) {
    const t = this.W.posForTarget(a.tgt);
    const o = await this.tool('seau', t.clone().add(V(-0.5, 1.1, 0)));
    this.open('MAINTIENS POUR VERSER');
    let poured = false;
    await this.hold(0.8, (v, down) => {
      o.rotation.z = -v * 2.1;
      if (down && v > 0.4) {
        if (!poured) { poured = true; sfx('splash'); }
        this.fx.stream(o.position.clone().add(V(0.3, 0.2, 0)), V(0.5, -1, 0), { n: 5, color: '#48cae4', speed: 4, size: 0.16, life: 0.4, gravity: -12, additive: false });
      }
    });
    this.fx.water(t, 40); sfx('splash'); buzz(40);
    await this.dropTool(o);
    return { a, aim: null };
  }

  async mg_aimant(a) {
    const t = a.tgt.t === 'hand' ? this.W.revealPoint(7, 3.2) : this.W.posForTarget(a.tgt);
    const o = await this.tool('aimant', this.W.launchPos(this.W.me).add(V(0, 0.6, -0.8)));
    this.A.faceTowards(o, t, -Math.PI / 2);
    this.open('MAINTIENS POUR ATTIRER');
    sfx('magnet');
    await this.hold(1.0, (v, down) => {
      if (!down) return;
      o.scale.setScalar(1.3 + Math.sin(performance.now() / 40) * 0.05 * (1 + v));
      if (Math.random() < 0.15) this.fx.ring(t.clone(), { color: '#d62828', radius: 0.8, dur: 0.3, y: t.y });
    });
    await this.dropTool(o);
    return { a, aim: null };
  }

  async mg_engrais(a) {
    const t = this.W.posForTarget(a.tgt);
    const o = await this.tool('engrais', t.clone().add(V(-0.3, 1.1, 0)));
    o.rotation.z = -1.6;
    this.open('SECOUE ! TAPE VITE');
    await this.mash(7, () => {
      sfx('tap'); buzz(10);
      this.A.jitter(o, 0.15, 0.1);
      this.fx.stream(o.position.clone().add(V(0.25, 0, 0)), V(0.3, -1, 0), { n: 8, color: Math.random() < 0.5 ? '#7f5539' : '#52b788', speed: 3, size: 0.12, life: 0.5, gravity: -8, additive: false });
    });
    sfx('grow'); this.fx.sparkles(t, '#b7e4c7', 30);
    await this.dropTool(o);
    return { a, aim: null };
  }

  async mg_photocop(a) {
    const o = await this.tool('photocop', V(-1.6, 1.1, this.W.zs(this.W.me) * 2.2));
    o.rotation.y = 0.35;
    this.skipFrom = o.position.clone().add(V(-0.7, 0.4, 0));
    this.A.skipFrom = this.skipFrom;
    const lid = o.userData.model.userData.lid, light = o.userData.model.userData.light;
    const W = this.W;
    let ghost = W.objectForTarget(a.tgt)?.clone();
    if (lid) await tween(lid.rotation, { x: -1.3 }, 0.25, ease.outBack);
    if (ghost) {
      ghost.userData = {};
      W.scene.add(ghost);
      const inside = o.position.clone().add(V(0, 0.55, 0));
      await all(this.A.arc(ghost, inside, 1.2, 0.45), this.A.scaleTo(ghost, 0.5, 0.45, ease.inQuad));
      W.scene.remove(ghost);
    }
    if (lid) await tween(lid.rotation, { x: 0 }, 0.15);
    this.open('');
    await this.button('COPIER');
    sfx('copier'); buzz(40);
    if (light) { light.visible = true; await animate(0.9, (k) => { light.position.z = -0.25 + Math.sin(k * Math.PI * 2) * 0.25 + 0.25 * k; }); light.visible = false; }
    await this.A.jitter(o, 0.05, 0.15);
    this.dropTool(o);
    return { a, aim: null };
  }

  async mg_pelle(a) {
    const g = this.W.grave.position.clone();
    const o = await this.tool('pelle', g.clone().add(V(0.2, 0.6, 0)));
    this.open('CREUSE ! TAPE VITE');
    await this.mash(6, () => {
      sfx('dig'); buzz(20);
      tween(o.rotation, { z: -0.9 }, 0.06).then(() => tween(o.rotation, { z: 0.2 }, 0.08));
      this.fx.burst(g.clone().add(V(0, 0.2, 0)), { n: 12, colors: ['#5c3d2e', '#7f5539'], speed: 2, up: 3, size: 0.16, life: 0.6, gravity: -10, additive: false });
      this.fx.shake(0.12);
    });
    await this.dropTool(o);
    return { a, aim: null };
  }

  async mg_de(a) {
    const W = this.W;
    const o = await this.tool('de', W.launchPos(W.me).add(V(0.6, 0.3, -0.4)));
    this.open('LANCE LE DÉ : GLISSE VITE');
    await this.swipes(1, () => {});
    sfx('dice');
    const to = W.cardPos(W.me).add(V(1.0, 0.25, -0.5 * W.zs(W.me)));
    const die = o.userData.model.userData.die;
    await all(this.A.arc(o, to, 1.6, 0.6, ease.outQuad), die ? this.A.spin(die, 'x', 4, 0.6) : null, die ? this.A.spin(die, 'z', 3, 0.6) : null);
    sfx('slam'); this.fx.dust(to.clone().setY(0.05), 8);
    await wait(0.2);
    this.dropTool(o);
    return { a, aim: null };
  }

  async mg_sablier(a) {
    const W = this.W;
    const o = await this.tool('sablier', W.launchPos(W.me).add(V(0, 0.8, -0.6)));
    this.open('RETOURNE-LE : GLISSE ↓');
    await this.swipes(1, () => {});
    sfx('freeze'); buzz(50);
    await this.A.spin(o, 'z', 0.5, 0.5, ease.inOutCubic);
    this.fx.flash('#a2d2ff', 0.55, 0.6);
    this.fx.ring(o.position.clone().setY(0.1), { color: '#a2d2ff', radius: 6, dur: 0.7 });
    await this.dropTool(o);
    return { a, aim: null };
  }

  async mg_ventilo(a) {
    const W = this.W;
    const zs = W.zs(W.me);
    const o = await this.tool('ventilo', V(0, 0.2, zs * 2.9));
    o.rotation.y = zs > 0 ? 0 : Math.PI;
    const blades = o.userData.model.userData.blades;
    this.open('FAIS TOURNER LE VENTILO');
    let spin = 0;
    await this.crank((d) => {
      spin += d * 0.08;
      if (blades) blades.rotation.z += d * 2;
      if (d > 0 && Math.random() < 0.2) sfx('tick');
      this.gauge(spin);
      return spin >= 1;
    });
    this.gauge(null);
    sfx('wind'); buzz(60);
    let alive = true;
    const blow = () => {
      if (!alive) return;
      if (blades) blades.rotation.z += 0.9;
      for (let k = 0; k < 4; k++) this.fx.norm.emit(V((Math.random() - 0.5) * 5, 0.3 + Math.random(), zs * 2.6), V((Math.random() - 0.5), 0, -zs * (9 + Math.random() * 4)), { color: '#e0fbfc', size: 0.12, life: 0.7, gravity: 0, drag: 0 });
      requestAnimationFrame(blow);
    };
    blow();
    setTimeout(() => { alive = false; this.dropTool(o); }, 1400);
    return { a, aim: null };
  }
}

export const MINIGAME_KINDS = new Set(['flingue', 'billard', 'peche', 'briquet', 'tronco', 'seau', 'aimant', 'engrais', 'photocop', 'pelle', 'de', 'sablier', 'ventilo']);
export { CELL };
