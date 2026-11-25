// La scène 3D : table, échiquier, cartes, objets, avatars. Garde un miroir visuel de l'état du jeu.
import * as THREE from 'three';
import { FX } from './fx.js';
import { tween, ease, updateTweens, clock } from './tween.js';
import { makeModel, ownerRing, avatarModel, OWNER, mat } from './models.js';
import { makeCard, battleFace, objectFace, deckModel, CH } from './cards.js';
import { KINDS, KIND_IDS } from '../engine/kinds.js';
import { isWet } from '../engine/engine.js';

export const CELL = 0.9;
export const CARD_TILT = 0.62;
const TABLE_W = 3.35, TABLE_D = 6.7;

export class World {
  constructor(canvasHost, overlay) {
    this.host = canvasHost; this.overlay = overlay;
    this.me = 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    canvasHost.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0a14');
    this.scene.fog = new THREE.Fog('#0b0a14', 18, 34);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camBase = new THREE.Vector3(0, 14, 8);
    this.camTarget = new THREE.Vector3(0, 0, 0.4);
    this.camRoll = 0;
    this.camPunch = 0;

    this.fx = new FX(this.scene, this.camera, overlay);
    this.models = new Map();
    this.cards = [null, null];
    this.markers = [];
    this.cellMarks = [];
    this.pov = null; this.povK = 0;
    this.pstate = [{}, {}];
    this.badges = new Map();
    this.ghost = [false, false];
    this.mal = [0, 0];
    this.time = 0;
    this.icons = {};
    this.iconURL = {};

    this.buildLights();
    this.buildTable();
    this.decks = [deckModel(26), deckModel(26)];
    this.decks.forEach((d, p) => { d.userData.pick = { t: 'deck', p }; this.scene.add(d); });
    this.avatars = [avatarModel(0), avatarModel(1)];
    this.avatars.forEach((a, p) => { a.userData.pick = { t: 'player', p }; this.scene.add(a); this.addHit(a, 0.45, 1.5); });
    this.potGroup = new THREE.Group(); this.scene.add(this.potGroup);
    this.globalsGroup = new THREE.Group(); this.scene.add(this.globalsGroup);
    this.globalObjs = {};
    this.place();

    this.raycaster = new THREE.Raycaster();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ------------------------------------------------------------ décor
  buildLights() {
    this.hemi = new THREE.HemisphereLight('#c9d6ff', '#2a1f14', 0.9);
    this.scene.add(this.hemi);
    const d = new THREE.DirectionalLight('#fff3dd', 2.4);
    d.position.set(-4, 12, 6);
    d.castShadow = true;
    d.shadow.mapSize.set(1024, 1024);
    Object.assign(d.shadow.camera, { left: -6, right: 6, top: 9, bottom: -9, near: 1, far: 30 });
    d.shadow.bias = -0.0008; d.shadow.radius = 4;
    this.sun = d;
    this.scene.add(d);
    this.rim = new THREE.PointLight('#ff3d71', 18, 14, 1.6);
    this.rim.position.set(0, 3, -7.5);
    this.scene.add(this.rim);
    this.rim2 = new THREE.PointLight('#ffc93c', 12, 12, 1.6);
    this.rim2.position.set(0, 3, 7.8);
    this.scene.add(this.rim2);
    this.lampMood = new THREE.Color('#fff3dd');
  }

  buildTable() {
    const felt = new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W * 2, 0.3, TABLE_D * 2), felt);
    top.position.y = -0.15; top.receiveShadow = true;
    this.scene.add(top);
    const wood = mat('#4a2c1a', { rough: 0.45, metal: 0.1 });
    const rail = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), wood); m.position.set(x, 0, z); m.castShadow = m.receiveShadow = true; this.scene.add(m); };
    rail(TABLE_W * 2 + 0.6, 0.3, 0, TABLE_D + 0.15);
    rail(TABLE_W * 2 + 0.6, 0.3, 0, -TABLE_D - 0.15);
    rail(0.3, TABLE_D * 2, TABLE_W + 0.15, 0);
    rail(0.3, TABLE_D * 2, -TABLE_W - 0.15, 0);
    const gold = mat('#c9a227', { metal: 0.8, rough: 0.3 });
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W * 2 + 0.62, 0.02, 0.05), gold); inlay.position.set(0, 0.145, TABLE_D); this.scene.add(inlay);
    const inlay2 = inlay.clone(); inlay2.position.z = -TABLE_D; this.scene.add(inlay2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#120f1d', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -3; this.scene.add(floor);

    // échiquier
    this.board = new THREE.Group();
    const light = mat('#e9dcc0', { rough: 0.5 }), dark = mat('#8a5a3c', { rough: 0.5 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(CELL * 5 + 0.24, 0.08, CELL * 5 + 0.24), mat('#2b1a10', { rough: 0.4 }));
    frame.position.y = 0.02; frame.receiveShadow = true; this.board.add(frame);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.02, 0.05, CELL - 0.02), (x + y) % 2 ? dark : light);
      t.position.set((x - 2) * CELL, 0.06, (y - 2) * CELL); t.receiveShadow = true;
      t.userData.cell = { x, y };
      this.board.add(t);
    }
    this.board.scale.setScalar(0.0001);
    this.boardShown = false;
    this.scene.add(this.board);

    // cimetière (petit monticule de terre)
    this.grave = new THREE.Group();
    const dirt = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), mat('#5c3d2e', { rough: 1, flat: true }));
    dirt.scale.set(1, 0.32, 1); dirt.receiveShadow = true; dirt.castShadow = true;
    this.grave.add(dirt);
    const cross = new THREE.Group();
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.05), mat('#adb5bd')));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.05), mat('#adb5bd')); bar.position.y = 0.08; cross.add(bar);
    cross.position.set(0.12, 0.28, -0.1); cross.rotation.z = -0.15;
    cross.children.forEach((c) => (c.castShadow = true));
    this.grave.add(cross);
    this.grave.position.set(-2.85, 0, 0);
    this.grave.userData.pick = { t: 'grave' };
    this.scene.add(this.grave);
  }

  addHit(obj, r = 0.4, h = 0.9) {
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = h / 2;
    hit.userData.isHit = true;
    obj.add(hit);
  }

  // ------------------------------------------------------------ positions
  zs(p) { return p === this.me ? 1 : -1; }
  cellPos(x, y) { const s = this.me === 0 ? 1 : -1; return new THREE.Vector3((x - 2) * CELL, 0.085, (y - 2) * CELL * s); }
  cardPos(p) { const z = this.zs(p) * 3.3; return new THREE.Vector3(0.05, Math.sin(CARD_TILT) * CH / 2 + 0.05, z); }
  launchPos(p) { return new THREE.Vector3(0, 0.8, this.zs(p) * 4.6); }
  deckPos(p) { return new THREE.Vector3(-2.35, 0, this.zs(p) * 3.3); }
  avatarPos(p) { return new THREE.Vector3(2.55, 0, this.zs(p) * 3.25); }
  potPos() { return new THREE.Vector3(2.85, 0, 0); }
  cardRot(p) { return new THREE.Euler(CARD_TILT, 0, 0); }

  // Objets posés devant un joueur : sur les côtés de l'échiquier, dans sa moitié de table.
  slotPos(p, i) {
    const zs = this.zs(p);
    if (i < 3) return new THREE.Vector3(2.88, 0, zs * (0.7 + i * 0.78));
    return new THREE.Vector3(-2.88, 0, zs * (1.05 + (i - 3) * 0.8));
  }
  sideScale() { return 0.82; }

  entTarget(m) {
    if (m.zone === 'board') return { pos: this.cellPos(m.x, m.y), scale: 1.05 };
    const list = this.sideList(m.owner);
    const i = list.indexOf(m);
    return { pos: this.slotPos(m.owner, i, list.length), scale: this.sideScale(list.length) };
  }
  sideList(p) { return [...this.models.values()].filter((m) => m.zone === 'front' && m.owner === p).sort((a, b) => a.id - b.id); }

  place() {
    for (const p of [0, 1]) {
      this.decks[p].position.copy(this.deckPos(p));
      this.avatars[p].position.copy(this.avatarPos(p));
      this.avatars[p].rotation.y = p === this.me ? Math.PI : 0;
    }
  }
  setPerspective(me) { this.me = me; this.place(); }

  // ------------------------------------------------------------ caméra
  resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera();
  }
  fitCamera() {
    const dir = new THREE.Vector3(0, 1, 0.78).normalize();
    const pts = [];
    for (const x of [-3.05, 3.05]) for (const z of [-5.3, 5.3]) pts.push(new THREE.Vector3(x, 0.3, z));
    pts.push(new THREE.Vector3(2.55, 1.6, -3.25));
    const cam = this.camera;
    let lo = 6, hi = 60;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(this.camTarget).addScaledVector(dir, d);
      cam.lookAt(this.camTarget); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const ok = pts.every((p) => { const v = p.clone().project(cam); return Math.abs(v.x) < 0.99 && v.y < 0.7 && v.y > -0.6; });
      if (ok) hi = d; else lo = d;
    }
    this.camBase.copy(this.camTarget).addScaledVector(dir, hi);
  }

  // ------------------------------------------------------------ entités
  buildEntObject(m) {
    const g = new THREE.Group();
    const model = makeModel(m.kind, m);
    g.add(model);
    if (m.kind !== 'banane') g.add(ownerRing(m.owner));
    g.userData.model = model;
    g.userData.pick = { t: 'ent', id: m.id };
    this.addHit(g, 0.38, 0.9);
    return g;
  }
  addEnt(ent, { at = null, scale = 0.0001 } = {}) {
    const m = { id: ent.id, kind: ent.kind, owner: ent.owner, zone: ent.zone, x: ent.x, y: ent.y, uses: ent.uses, timer: ent.timer, stage: ent.stage, age: ent.age, wet: ent.wet || 0, cd: ent.cd || 0 };
    m.obj = this.buildEntObject(m);
    this.models.set(m.id, m);
    const t = this.entTarget(m);
    m.obj.position.copy(at || t.pos);
    m.obj.scale.setScalar(scale);
    if (m.zone === 'front' && m.owner !== this.me) m.obj.rotation.y = Math.PI;
    this.scene.add(m.obj);
    return m;
  }
  rebuildEnt(m) {
    const pos = m.obj.position.clone(), sc = m.obj.scale.x, ry = m.obj.rotation.y;
    this.scene.remove(m.obj);
    m.obj = this.buildEntObject(m);
    m.obj.position.copy(pos); m.obj.scale.setScalar(sc); m.obj.rotation.y = ry;
    this.scene.add(m.obj);
  }
  removeEnt(id) {
    const m = this.models.get(id);
    if (!m) return;
    this.scene.remove(m.obj);
    this.models.delete(id);
    this.dropBadges('e' + id);
  }
  relayout(dur = 0.35, skip = null) {
    const ps = [];
    for (const m of this.models.values()) {
      if (m === skip || m.busy) continue;
      const t = this.entTarget(m);
      const ry = m.zone === 'front' && m.owner !== this.me ? Math.PI : 0;
      if (m.obj.position.distanceTo(t.pos) > 0.01 || Math.abs(m.obj.scale.x - t.scale) > 0.01) {
        ps.push(tween(m.obj.position, { x: t.pos.x, y: t.pos.y, z: t.pos.z }, dur, ease.outBack));
        ps.push(tween(m.obj.scale, { x: t.scale, y: t.scale, z: t.scale }, dur, ease.outBack));
        ps.push(tween(m.obj.rotation, { y: ry }, dur));
      }
    }
    return Promise.all(ps);
  }
  showBoard(on) {
    if (on === this.boardShown) return null;
    this.boardShown = on;
    return tween(this.board.scale, { x: on ? 1 : 0.0001, y: on ? 1 : 0.0001, z: on ? 1 : 0.0001 }, on ? 0.6 : 0.3, on ? ease.outBack : ease.inQuad);
  }
  recolor(m) { this.rebuildEnt(m); }

  // ------------------------------------------------------------ cartes
  makeBattleCard(card, p) {
    const c = makeCard(battleFace(card));
    c.userData.pick = { t: 'card', p };
    c.userData.data = { ...card };
    this.scene.add(c);
    return c;
  }
  makeObjectCard(kind) {
    const c = makeCard(objectFace(kind, this.icons));
    c.userData.kind = kind;
    this.scene.add(c);
    return c;
  }
  makeBackCard() { const c = makeCard(battleFace({ r: 2, v: 2, s: 'pique' })); this.scene.add(c); return c; }
  refreshCardFace(p) {
    const c = this.cards[p];
    if (!c) return;
    const d = c.userData.data;
    const t = battleFace(d);
    c.userData.front.material.map = t; c.userData.front.material.emissiveMap = t;
    c.userData.front.material.needsUpdate = true;
  }
  // Point devant la caméra, pour montrer une carte en grand.
  revealPoint(dist = 5.5, up = 0) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    return this.camera.position.clone().addScaledVector(dir, dist).addScaledVector(camUp, up);
  }
  // Oriente une carte (face vers +y en local) pour qu'elle regarde la caméra.
  faceCamera(card, flip = 0) {
    const q = this.camera.quaternion.clone();
    const fix = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), flip);
    card.quaternion.copy(q).multiply(spin).multiply(fix);
  }
  cameraQuat(flip = 0) {
    const o = new THREE.Object3D();
    this.faceCamera(o, flip);
    return o.quaternion.clone();
  }

  // ------------------------------------------------------------ réconciliation finale
  reconcile(S) {
    const ids = new Set(S.ents.map((e) => e.id));
    for (const id of [...this.models.keys()]) if (!ids.has(id)) this.removeEnt(id);
    for (const e of S.ents) {
      let m = this.models.get(e.id);
      if (!m) { m = this.addEnt(e, { scale: 0.78 }); }
      const kindChanged = m.kind !== e.kind, ownerChanged = m.owner !== e.owner, stageChanged = m.stage !== e.stage;
      Object.assign(m, { kind: e.kind, owner: e.owner, zone: e.zone, x: e.x, y: e.y, uses: e.uses, timer: e.timer, stage: e.stage, age: e.age, wet: e.wet, cd: e.cd });
      if (kindChanged || ownerChanged || stageChanged) this.rebuildEnt(m);
    }
    for (let p = 0; p < 2; p++) {
      this.decks[p].userData.set(S.players[p].deck.length);
      this.mal[p] = S.players[p].malheur;
      const pl = S.players[p];
      this.pstate[p] = { wet: isWet(S, p), stunned: pl.stunned, yellow: pl.yellow };
      if (this.cards[p] && pl.card) this.cards[p].userData.data.frozen = !!pl.card.frozen;
    }
    this.showBoard(true);
    return this.relayout(0.3);
  }

  // ------------------------------------------------------------ marqueurs de cible
  objectForTarget(t) {
    if (t.t === 'ent') return this.models.get(t.id)?.obj;
    if (t.t === 'card') return this.cards[t.p];
    if (t.t === 'deck') return this.decks[t.p];
    if (t.t === 'player') return this.avatars[t.p];
    if (t.t === 'grave' || t.t === 'self') return this.grave;
    return null;
  }
  posForTarget(t) {
    const o = this.objectForTarget(t);
    if (!o) return new THREE.Vector3();
    const p = o.getWorldPosition(new THREE.Vector3());
    if (t.t === 'player') p.y += 0.9;
    else if (t.t === 'ent') p.y += 0.35;
    return p;
  }
  highlight(targets) {
    this.clearHighlight();
    for (const t of targets) {
      const o = this.objectForTarget(t);
      if (!o) continue;
      const g = new THREE.Group();
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 4), new THREE.MeshBasicMaterial({ color: '#ffe14d' }));
      arrow.rotation.x = Math.PI;
      g.add(arrow);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: '#ffe14d', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      g.userData = { target: t, obj: o, arrow, ring };
      this.scene.add(g);
      this.markers.push(g);
    }
  }
  clearHighlight() { for (const g of this.markers) this.scene.remove(g); this.markers = []; }

  pick(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const roots = [...[...this.models.values()].map((m) => m.obj), ...this.cards.filter(Boolean), ...this.avatars, this.grave, ...this.decks];
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick;
    }
    return this.boardShown ? this.pickCell(cx, cy) : null;
  }
  pickCell(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hit = this.raycaster.intersectObjects(this.board.children, false).find((h) => h.object.userData.cell);
    if (!hit) return null;
    const c = hit.object.userData.cell;
    return { t: 'cell', x: c.x, y: this.me === 0 ? c.y : 4 - c.y };
  }
  // Point du plateau (y = 0) sous le doigt.
  tablePoint(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }
  // Cases lumineuses (déplacements d'échecs, pose de bombe, boule de billard).
  markCells(cells, color = '#ffe14d') {
    this.clearCells();
    for (const c of cells) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.86, CELL * 0.86), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(this.cellPos(c.x, c.y)).setY(0.1);
      m.userData.capture = !!c.cap;
      if (c.cap) m.material.color.set('#ff3d71');
      this.scene.add(m);
      this.cellMarks.push(m);
    }
  }
  clearCells() { for (const m of this.cellMarks) this.scene.remove(m); this.cellMarks = []; }

  // ------------------------------------------------------------ badges HTML
  badge(key, anchor, text, cls) {
    let b = this.badges.get(key);
    if (!b) { b = { el: document.createElement('div') }; b.el.className = 'badge'; this.overlay.appendChild(b.el); this.badges.set(key, b); }
    if (b.text !== text) { b.el.textContent = text; b.text = text; }
    if (b.cls !== cls) { b.el.className = 'badge ' + cls; b.cls = cls; }
    b.anchor = anchor; b.seen = true;
  }
  dropBadges(prefix) { for (const [k, b] of this.badges) if (k.startsWith(prefix)) { b.el.remove(); this.badges.delete(k); } }
  updateBadges() {
    for (const b of this.badges.values()) b.seen = false;
    const W = this.overlay.clientWidth, H = this.overlay.clientHeight;
    for (const [k, b] of this.badges) {
      if (!b.seen) { b.el.remove(); this.badges.delete(k); continue; }
      const v = b.anchor.clone().project(this.camera);
      b.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px) translate(-50%, -50%)`;
    }
  }

  // ------------------------------------------------------------ icônes (rendu des modèles en image)
  renderIcons() {
    const size = 256;
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight('#ffffff', '#555566', 1.6));
    const dl = new THREE.DirectionalLight('#ffffff', 2.2); dl.position.set(2, 4, 3); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const buf = new Uint8Array(size * size * 4);
    const prevClear = this.renderer.getClearAlpha();
    const prevBg = null;
    for (const k of KIND_IDS) {
      const m = makeModel(k, { owner: 0, stage: 2 });
      sc.add(m);
      const bb = new THREE.Box3().setFromObject(m);
      const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
      const r = Math.max(s.x, s.y, s.z) * 0.62;
      cam.position.set(c.x + r * 1.2, c.y + r * 1.4, c.z + r * 2.6);
      cam.lookAt(c);
      this.renderer.setRenderTarget(rt);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.render(sc, cam);
      this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d');
      const img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      g.putImageData(img, 0, 0);
      this.icons[k] = cv;
      this.iconURL[k] = cv.toDataURL();
      sc.remove(m);
    }
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, prevClear);
    rt.dispose();
    void prevBg;
  }

  // ------------------------------------------------------------ boucle
  update(dtReal) {
    const dt = updateTweens(dtReal);
    this.time += dt;
    this.fx.update(dt);
    // marqueurs
    for (const g of this.markers) {
      const o = g.userData.obj;
      const p = o.getWorldPosition(new THREE.Vector3());
      const t = g.userData.target;
      const h = t.t === 'player' ? 2.1 : t.t === 'card' ? 1.75 : t.t === 'deck' ? 1.0 : 1.2 * (o.scale?.x || 1);
      g.userData.arrow.position.set(p.x, h + Math.sin(this.time * 6) * 0.1, p.z);
      g.userData.ring.position.set(p.x, 0.1, p.z);
      const s = 1 + Math.sin(this.time * 6) * 0.08;
      g.userData.ring.scale.set(s, s, s);
      g.userData.arrow.rotation.y = this.time * 2;
    }
    // animations au repos
    for (const m of this.models.values()) {
      const u = m.obj.userData.model?.userData;
      if (!u) continue;
      if (u.blades) u.blades.rotation.z += dt * (m.spin || 1.5);
      if (u.disk) { u.disk.rotation.z += dt * 1.6; u.halo.scale.setScalar(1 + Math.sin(this.time * 4) * 0.06); }
      if (u.spark) { const s = 0.7 + Math.random() * 0.6; u.spark.scale.setScalar(s); if (Math.random() < 0.3) this.fx.add.emit(u.spark.getWorldPosition(new THREE.Vector3()), new THREE.Vector3((Math.random() - 0.5), 1.5, (Math.random() - 0.5)), { color: '#ffba08', size: 0.08, life: 0.35, gravity: -2 }); }
      if (m.kind === 'chat' && !m.busy) m.obj.userData.model.rotation.y = Math.sin(this.time * 0.7 + m.id) * 0.6;
      if (m.kind === 'bombe') this.bombLed(m);
    }
    for (const p of [0, 1]) {
      const a = this.avatars[p].userData.inner;
      if (!this.ghost[p] && !this.avatars[p].userData.busy) a.position.y = Math.abs(Math.sin(this.time * 2.2 + p)) * 0.05;
      if (this.ghost[p]) a.position.y = 0.4 + Math.sin(this.time * 3) * 0.12;
    }
    for (const m of this.cellMarks) m.material.opacity = 0.35 + Math.sin(this.time * 6) * 0.2;
    this.updateStates(dt);
    for (const p of [0, 1]) {
      const gl = this.decks[p].userData.glow;
      const target = this.deckGlow === p ? 0.55 + Math.sin(this.time * 5) * 0.3 : 0;
      gl.material.opacity += (target - gl.material.opacity) * Math.min(1, dt * 10);
    }
    if (this.storm) {
      for (let i = 0; i < 2; i++) this.fx.norm.emit(new THREE.Vector3((Math.random() - 0.5) * 7, 6, (Math.random() - 0.5) * 12), new THREE.Vector3(0, -14, 0), { color: '#90e0ef', size: 0.045, life: 0.45, gravity: -10, drag: 0 });
    }
    // caméra
    this.camPunch *= Math.pow(0.02, dtReal);
    const cam = this.camera;
    const sway = new THREE.Vector3(Math.sin(this.time * 0.35) * 0.08, Math.sin(this.time * 0.5) * 0.05, 0);
    const k = this.povK;
    const basePos = this.camBase.clone().add(sway);
    const look = this.camTarget.clone();
    if (this.pov && k > 0) { basePos.lerp(this.pov.pos, k); look.lerp(this.pov.target, k); }
    cam.position.copy(basePos).add(this.fx.shakeOffset);
    const toward = look.clone().sub(cam.position).multiplyScalar(this.camPunch * 0.08);
    cam.position.add(toward);
    cam.up.set(Math.sin(this.camRoll), Math.cos(this.camRoll), 0);
    const wantFov = this.pov && k > 0 ? 38 + ((this.pov.fov ?? 38) - 38) * k : 38;
    if (Math.abs(cam.fov - wantFov) > 0.01) { cam.fov = wantFov; cam.updateProjectionMatrix(); }
    cam.lookAt(look);
    this.updateBadges();
    this.renderer.render(this.scene, cam);
    void clock;
  }
  punch(a = 1) { this.camPunch = Math.max(this.camPunch, a); }

  // États visibles : carte gelée (glace), joueur mouillé (gouttes), assommé (étoiles), cartons jaunes.
  updateStates(dt) {
    for (const p of [0, 1]) {
      const c = this.cards[p];
      if (c) {
        let ice = c.userData.ice;
        const on = !!c.userData.data?.frozen;
        if (on && !ice) {
          ice = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 1.66), new THREE.MeshStandardMaterial({ color: '#caf0f8', transparent: true, opacity: 0.55, roughness: 0.05, emissive: '#48cae4', emissiveIntensity: 0.35, depthWrite: false }));
          ice.position.y = 0.04;
          c.add(ice); c.userData.ice = ice;
        }
        if (ice) ice.visible = on;
      }
      const st = this.pstate[p] || {};
      const av = this.avatars[p];
      let ex = av.userData.extras;
      if (!ex) {
        ex = new THREE.Group();
        const stars = new THREE.Group();
        for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: '#ffd60a' })); s.position.set(Math.cos(i * 2.1) * 0.35, 0, Math.sin(i * 2.1) * 0.35); stars.add(s); }
        stars.position.y = 1.75;
        const cards = new THREE.Group();
        for (let i = 0; i < 2; i++) { const y = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.02), new THREE.MeshStandardMaterial({ color: '#ffd000', emissive: '#ffb703', emissiveIntensity: 0.4 })); y.position.set(0.45 + i * 0.12, 0.5, 0.1); y.rotation.z = -0.2 + i * 0.15; cards.add(y); }
        ex.add(stars, cards);
        av.add(ex);
        av.userData.extras = ex; ex.userData = { stars, cards };
      }
      ex.userData.stars.visible = !!st.stunned;
      ex.userData.stars.rotation.y += dt * 4;
      ex.userData.cards.children.forEach((y, i) => (y.visible = (st.yellow || 0) > i));
      if (st.wet && Math.random() < dt * 10) {
        const at = av.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.3, (Math.random() - 0.5) * 0.4));
        this.fx.norm.emit(at, new THREE.Vector3(0, -1, 0), { color: '#48cae4', size: 0.09, life: 0.6, gravity: -6 });
      }
    }
  }

  // Petit écran LED fixé sur la bombe : le compte à rebours fait partie de la scène 3D.
  bombLed(m) {
    let led = m.obj.userData.led;
    if (!led) {
      const cv = document.createElement('canvas'); cv.width = 96; cv.height = 64;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      led = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshBasicMaterial({ map: tex }));
      led.position.set(0, 1.0, 0);
      led.userData = { cv, tex, shown: null };
      m.obj.add(led);
      m.obj.userData.led = led;
    }
    led.quaternion.copy(this.camera.quaternion);
    if (m.obj.parent) led.quaternion.premultiply(m.obj.quaternion.clone().invert());
    if (led.userData.shown !== m.timer) {
      led.userData.shown = m.timer;
      const g = led.userData.cv.getContext('2d');
      g.fillStyle = '#111'; g.fillRect(0, 0, 96, 64);
      g.strokeStyle = '#444'; g.lineWidth = 6; g.strokeRect(3, 3, 90, 58);
      g.fillStyle = '#ff3030'; g.shadowColor = '#ff0000'; g.shadowBlur = 12;
      g.font = 'bold 46px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(m.timer ?? ''), 48, 35);
      led.userData.tex.needsUpdate = true;
    }
  }

  // Vue subjective : la caméra glisse vers pos et regarde target.
  setPov(pos, target, fov = 55, dur = 0.6) {
    if (!this.pov) this.pov = { pos: pos.clone(), target: target.clone(), fov };
    else { this.pov.pos.copy(pos); this.pov.target.copy(target); this.pov.fov = fov; }
    return tween(this, { povK: 1 }, dur, ease.inOutCubic);
  }
  clearPov(dur = 0.6) { return tween(this, { povK: 0 }, dur, ease.inOutCubic).then(() => { if (this.povK === 0) this.pov = null; }); }

  clearAll() {
    for (const id of [...this.models.keys()]) this.removeEnt(id);
    for (const c of this.cards) if (c) this.scene.remove(c);
    this.cards = [null, null];
    this.clearCells();
    this.deckGlow = null;
    this.pstate = [{}, {}];
    this.pov = null; this.povK = 0;
    for (const c of [...this.potGroup.children]) this.potGroup.remove(c);
    this.storm = false;
    this.hemi.intensity = 0.9; this.sun.intensity = 2.4;
    this.rim.color.set('#ff3d71'); this.rim2.color.set('#ffc93c');
    this.camRoll = 0;
    this.mal = [0, 0];
    this.clearHighlight();
    for (const p of [0, 1]) {
      const a = this.avatars[p];
      if (a.userData.cloned) a.traverse((o) => { if (o.material) { o.material.transparent = false; o.material.opacity = 1; o.material.depthWrite = true; } });
      a.userData.inner.rotation.set(0, 0, 0);
      this.ghost[p] = false;
      this.decks[p].userData.set(26);
    }
    this.showBoard(false);
  }
}

function feltTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(256, 256, 40, 256, 256, 360);
  gr.addColorStop(0, '#1b6b5a'); gr.addColorStop(1, '#0c3a33');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
