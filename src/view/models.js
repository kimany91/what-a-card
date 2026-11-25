// Modèles 3D procéduraux (style jouet en vinyle) pour toutes les cartes chaos.
import * as THREE from 'three';

const cache = new Map();
export function mat(color, { rough = 0.5, metal = 0, emissive = null, ei = 0.6, opacity = 1, flat = false } = {}) {
  const key = [color, rough, metal, emissive, ei, opacity, flat].join('|');
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
  if (opacity < 1) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
  cache.set(key, m);
  return m;
}
function mesh(geo, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null } = {}) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  if (s) Array.isArray(s) ? o.scale.set(...s) : o.scale.setScalar(s);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
const G = () => new THREE.Group();
const cyl = (rt, rb, h, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

export const OWNER = [
  { body: '#f6ecd4', trim: '#ffc93c', ring: '#ffc93c', name: 'ivoire' },
  { body: '#2d2a3e', trim: '#ff3d71', ring: '#ff3d71', name: 'ébène' },
];

// ------------------------------------------------------------ pièces d'échecs
const pieceBase = [[0, 0], [0.34, 0], [0.34, 0.06], [0.3, 0.1], [0.24, 0.14]];
function chess(kind, owner) {
  const g = G();
  const o = OWNER[owner ?? 0];
  const body = mat(o.body, { rough: 0.35 });
  const trim = mat(o.trim, { rough: 0.3, metal: 0.4 });
  let prof;
  if (kind === 'pion') prof = [...pieceBase, [0.16, 0.22], [0.12, 0.4], [0.16, 0.44], [0.08, 0.47]];
  else if (kind === 'tour') prof = [...pieceBase, [0.22, 0.2], [0.2, 0.55], [0.27, 0.6], [0.27, 0.74], [0, 0.74]];
  else if (kind === 'roi') prof = [...pieceBase, [0.17, 0.28], [0.12, 0.6], [0.2, 0.66], [0.22, 0.72], [0.16, 0.8], [0, 0.82]];
  else prof = [...pieceBase, [0.17, 0.28], [0.11, 0.58], [0.2, 0.64], [0.23, 0.72], [0.12, 0.78], [0, 0.79]];
  g.add(mesh(lathe(prof), body));
  g.add(mesh(cyl(0.345, 0.345, 0.04), trim, { y: 0.03 }));
  if (kind === 'pion') g.add(mesh(sph(0.15), body, { y: 0.58 }));
  if (kind === 'tour') for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(mesh(box(0.12, 0.12, 0.12), body, { x: Math.cos(a) * 0.2, y: 0.8, z: Math.sin(a) * 0.2, ry: -a }));
  }
  if (kind === 'roi') {
    g.add(mesh(box(0.07, 0.3, 0.07), trim, { y: 0.98 }));
    g.add(mesh(box(0.22, 0.07, 0.07), trim, { y: 1.02 }));
  }
  if (kind === 'reine') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.add(mesh(sph(0.045), trim, { x: Math.cos(a) * 0.19, y: 0.82, z: Math.sin(a) * 0.19 }));
    }
    g.add(mesh(sph(0.08), trim, { y: 0.88 }));
  }
  g.userData.tint = [body, trim];
  return g;
}

// ------------------------------------------------------------ objets
const B = {
  billard() {
    const g = G();
    const tex = ballTexture();
    g.add(mesh(sph(0.3, 32, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.05 }), { y: 0.3, ry: -0.6, rx: 0.3 }));
    const cue = cueModel(); cue.scale.setScalar(0.55); cue.position.set(0.1, 0.06, 0.2); cue.rotation.set(0, 0.6, Math.PI / 2 - 0.08);
    g.add(cue);
    return g;
  },
  peche() {
    const g = G();
    const rod = mesh(cyl(0.015, 0.04, 1.4, 8), mat('#3a86ff', { rough: 0.3 }), { y: 0.7, x: 0.1, rz: -0.35 });
    g.add(rod);
    g.add(mesh(cyl(0.05, 0.05, 0.3, 12), mat('#212529'), { x: -0.06, y: 0.25, rz: -0.35 }));
    g.add(mesh(cyl(0.09, 0.09, 0.06, 16), mat('#adb5bd', { metal: 0.6, rough: 0.3 }), { x: 0.0, y: 0.38, z: 0.06, rx: Math.PI / 2 }));
    const line = mesh(cyl(0.005, 0.005, 0.7, 4), mat('#ffffff'), { x: 0.34, y: 1.0 });
    g.add(line);
    g.add(mesh(sph(0.06), mat('#ef233c', { rough: 0.3 }), { x: 0.34, y: 0.64 }));
    g.add(mesh(sph(0.045, 12, 8), mat('#ffffff'), { x: 0.34, y: 0.69 }));
    return g;
  },
  flingue() {
    const g = G();
    const dark = mat('#2b2d42', { metal: 0.6, rough: 0.35 }), red = mat('#e63946', { rough: 0.4 });
    const gun = G();
    gun.add(mesh(box(0.85, 0.2, 0.16), dark, { y: 0.1 }));
    gun.add(mesh(cyl(0.06, 0.06, 0.3, 12), dark, { x: 0.52, y: 0.12, rz: Math.PI / 2 }));
    gun.add(mesh(box(0.2, 0.44, 0.15), red, { x: -0.28, y: -0.18, rz: -0.25 }));
    gun.add(mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI), dark, { x: -0.06, y: -0.02, rz: Math.PI }));
    gun.add(mesh(box(0.06, 0.06, 0.06), mat('#ffd166', { metal: 0.6 }), { x: 0.36, y: 0.24 }));
    gun.position.y = 0.5; gun.rotation.z = 0.1;
    g.add(gun);
    g.userData.gun = gun;
    return g;
  },
  arbre(e) {
    const g = G();
    const stage = e?.stage ?? 0;
    const s = [0.45, 0.65, 0.85, 1][stage];
    const t = G();
    t.add(mesh(cyl(0.08, 0.13, 0.7, 10), mat('#7f5539', { flat: true }), { y: 0.35 }));
    const leaf = mat(stage >= 2 ? '#2d6a4f' : '#52b788', { flat: true, rough: 0.7 });
    [[0, 0.85, 0, 0.38], [0.22, 0.7, 0.05, 0.26], [-0.2, 0.72, -0.05, 0.27], [0.05, 1.08, 0.05, 0.25]].forEach(([x, y, z, r]) =>
      t.add(mesh(new THREE.IcosahedronGeometry(r, 0), leaf, { x, y, z, ry: x * 4 })));
    if (stage >= 2) for (let i = 0; i < (stage === 3 ? 6 : 3); i++) {
      const a = i * 2.1;
      t.add(mesh(sph(0.06, 10, 8), mat('#ffd166', { emissive: '#ffb703', ei: 0.4 }), { x: Math.cos(a) * 0.3, y: 0.8 + (i % 3) * 0.12, z: Math.sin(a) * 0.3 }));
    }
    t.scale.setScalar(s);
    g.add(t);
    g.add(mesh(cyl(0.3, 0.34, 0.08, 16), mat('#6f4518'), { y: 0.04 }));
    return g;
  },
  briquet() {
    const g = G();
    g.add(mesh(box(0.34, 0.5, 0.16), mat('#fb8500', { rough: 0.35 }), { y: 0.25 }));
    g.add(mesh(box(0.34, 0.16, 0.16), mat('#ced4da', { metal: 0.8, rough: 0.2 }), { y: 0.58 }));
    g.add(mesh(cyl(0.05, 0.05, 0.1, 12), mat('#495057', { metal: 0.7 }), { x: 0.08, y: 0.7, rx: Math.PI / 2 }));
    const flame = G();
    flame.add(mesh(new THREE.ConeGeometry(0.08, 0.3, 12), mat('#ffba08', { emissive: '#ff6d00', ei: 1.5 }), { y: 0.15 }));
    flame.add(mesh(new THREE.ConeGeometry(0.04, 0.16, 10), mat('#fff3b0', { emissive: '#ffea00', ei: 2 }), { y: 0.09 }));
    flame.position.set(-0.04, 0.68, 0); flame.scale.setScalar(0.0001);
    g.add(flame);
    g.userData.flame = flame;
    return g;
  },
  seau() {
    const g = G();
    const sh = mesh(cyl(0.3, 0.22, 0.5, 24), mat('#48cae4', { rough: 0.3, metal: 0.2 }), { y: 0.25 });
    sh.geometry = new THREE.CylinderGeometry(0.3, 0.22, 0.5, 24, 1, true);
    sh.material = sh.material.clone(); sh.material.side = THREE.DoubleSide;
    g.add(sh);
    g.add(mesh(cyl(0.22, 0.22, 0.02, 24), mat('#0096c7'), { y: 0.01 }));
    g.add(mesh(cyl(0.27, 0.27, 0.02, 24), mat('#90e0ef', { emissive: '#48cae4', ei: 0.3, opacity: 0.85 }), { y: 0.42 }));
    g.add(mesh(new THREE.TorusGeometry(0.3, 0.015, 8, 24, Math.PI), mat('#adb5bd', { metal: 0.8 }), { y: 0.5 }));
    return g;
  },
  bombe(e) {
    const g = G();
    g.add(mesh(sph(0.32, 24, 18), mat('#1b1b1e', { rough: 0.35, metal: 0.3 }), { y: 0.34 }));
    g.add(mesh(cyl(0.1, 0.12, 0.12, 12), mat('#6c757d', { metal: 0.7 }), { y: 0.68 }));
    const fuse = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.72, 0), new THREE.Vector3(0.06, 0.86, 0), new THREE.Vector3(0.16, 0.9, 0.02)]);
    g.add(mesh(new THREE.TubeGeometry(fuse, 10, 0.022, 6), mat('#d4a373')));
    const spark = mesh(sph(0.06, 10, 8), mat('#fff3b0', { emissive: '#ffba08', ei: 3 }), { x: 0.16, y: 0.9, z: 0.02 });
    g.add(spark);
    g.add(mesh(sph(0.07, 10, 8), mat('#ffffff', { opacity: 0.6 }), { x: -0.12, y: 0.48, z: 0.22 }));
    g.userData.spark = spark;
    return g;
  },
  pion: (e) => chess('pion', e?.owner),
  tour: (e) => chess('tour', e?.owner),
  reine: (e) => chess('reine', e?.owner),
  roi: (e) => chess('roi', e?.owner),
  miroir() {
    const g = G();
    const fr = mat('#d4a373', { metal: 0.5, rough: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ map: mirrorTexture(), roughness: 0.05, metalness: 0.3 });
    const oval = mesh(new THREE.CircleGeometry(0.3, 32), glass, { y: 0.55, z: 0.025 });
    oval.scale.y = 1.35;
    g.add(oval);
    const ring = mesh(new THREE.TorusGeometry(0.31, 0.04, 10, 40), fr, { y: 0.55 });
    ring.scale.y = 1.35;
    g.add(ring);
    g.add(mesh(box(0.08, 0.15, 0.08), fr, { y: 0.08 }));
    g.add(mesh(cyl(0.2, 0.24, 0.05, 20), fr, { y: 0.02 }));
    return g;
  },
  aimant() {
    const g = G();
    const red = mat('#d62828', { rough: 0.35 }), steel = mat('#dee2e6', { metal: 0.9, rough: 0.2 });
    g.add(mesh(new THREE.TorusGeometry(0.24, 0.1, 12, 24, Math.PI), red, { y: 0.55 }));
    g.add(mesh(box(0.2, 0.3, 0.2), red, { x: -0.24, y: 0.4 }));
    g.add(mesh(box(0.2, 0.3, 0.2), red, { x: 0.24, y: 0.4 }));
    g.add(mesh(box(0.2, 0.12, 0.2), steel, { x: -0.24, y: 0.2 }));
    g.add(mesh(box(0.2, 0.12, 0.2), steel, { x: 0.24, y: 0.2 }));
    g.position.y = 0.04;
    return g;
  },
  chat() {
    const g = G();
    const fur = mat('#1d1b26', { rough: 0.8 }), eye = mat('#ffd60a', { emissive: '#ffd60a', ei: 1.2 });
    g.add(mesh(sph(0.22, 18, 14), fur, { y: 0.24, s: [1.25, 0.95, 0.85] }));
    g.add(mesh(sph(0.17, 18, 14), fur, { x: 0.25, y: 0.48 }));
    g.add(mesh(new THREE.ConeGeometry(0.06, 0.13, 8), fur, { x: 0.22, y: 0.66, z: 0.08 }));
    g.add(mesh(new THREE.ConeGeometry(0.06, 0.13, 8), fur, { x: 0.22, y: 0.66, z: -0.08 }));
    g.add(mesh(sph(0.035, 10, 8), eye, { x: 0.4, y: 0.5, z: 0.06 }));
    g.add(mesh(sph(0.035, 10, 8), eye, { x: 0.4, y: 0.5, z: -0.06 }));
    const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.25, 0.25, 0), new THREE.Vector3(-0.38, 0.4, 0), new THREE.Vector3(-0.3, 0.65, 0.05), new THREE.Vector3(-0.2, 0.7, 0.1)]);
    g.add(mesh(new THREE.TubeGeometry(tail, 16, 0.035, 8), fur));
    for (const [x, z] of [[0.15, 0.1], [0.15, -0.1], [-0.15, 0.1], [-0.15, -0.1]]) g.add(mesh(cyl(0.045, 0.045, 0.12, 8), fur, { x, z, y: 0.06 }));
    return g;
  },
  tronco() {
    const g = G();
    g.add(mesh(box(0.42, 0.3, 0.22), mat('#ffb703', { rough: 0.4 }), { y: 0.25 }));
    g.add(mesh(box(0.7, 0.06, 0.03), mat('#adb5bd', { metal: 0.9, rough: 0.25 }), { x: 0.5, y: 0.22 }));
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 16, Math.PI), mat('#212529'), { x: -0.05, y: 0.42 }));
    g.add(mesh(box(0.12, 0.08, 0.24), mat('#212529'), { x: -0.25, y: 0.2 }));
    return g;
  },
  trounoir() {
    const g = G();
    g.add(mesh(sph(0.3, 32, 24), new THREE.MeshBasicMaterial({ color: '#000000' }), { y: 0.45 }));
    const disk = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.75, 64), new THREE.MeshBasicMaterial({ map: diskTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    disk.rotation.x = -Math.PI / 2 + 0.35; disk.position.y = 0.45;
    g.add(disk);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.29, 0.36, 48), new THREE.MeshBasicMaterial({ color: '#c77dff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    halo.position.y = 0.45;
    g.add(halo);
    g.userData.disk = disk; g.userData.halo = halo;
    return g;
  },
  orage() {
    const g = G();
    const cl = mat('#6c757d', { rough: 0.9, flat: true });
    [[0, 0.7, 0, 0.3], [0.25, 0.65, 0, 0.22], [-0.25, 0.65, 0.02, 0.24], [0.1, 0.85, 0, 0.22]].forEach(([x, y, z, r]) => g.add(mesh(new THREE.IcosahedronGeometry(r, 1), cl, { x, y, z })));
    g.add(mesh(boltGeo(), mat('#ffd60a', { emissive: '#ffd60a', ei: 1.4 }), { y: 0.05, s: 0.5 }));
    return g;
  },
  couronne() {
    const g = G();
    const gold = mat('#ffd166', { metal: 0.85, rough: 0.25 });
    const band = mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.22, 32, 1, true), gold, { y: 0.15 });
    band.material = gold.clone(); band.material.side = THREE.DoubleSide;
    g.add(band);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 8), gold, { x: Math.cos(a) * 0.29, y: 0.35, z: Math.sin(a) * 0.29 }));
      g.add(mesh(sph(0.035, 10, 8), mat(i % 2 ? '#e63946' : '#3a86ff', { rough: 0.1, emissive: i % 2 ? '#e63946' : '#3a86ff', ei: 0.3 }), { x: Math.cos(a) * 0.31, y: 0.14, z: Math.sin(a) * 0.31 }));
    }
    return g;
  },
  de() {
    const g = G();
    const mats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshStandardMaterial({ map: pipTexture(n), roughness: 0.3 }));
    const d = new THREE.Mesh(box(0.45, 0.45, 0.45), mats);
    d.position.y = 0.23; d.rotation.y = 0.5; d.castShadow = true;
    g.add(d);
    g.userData.die = d;
    return g;
  },
  sablier() {
    const g = G();
    const wood = mat('#9c6644', { rough: 0.6 }), glass = mat('#caf0f8', { rough: 0.05, opacity: 0.35 }), sand = mat('#e9c46a', { rough: 0.9 });
    g.add(mesh(cyl(0.26, 0.26, 0.06, 20), wood, { y: 0.03 }));
    g.add(mesh(cyl(0.26, 0.26, 0.06, 20), wood, { y: 0.87 }));
    for (let i = 0; i < 3; i++) { const a = i * 2.09; g.add(mesh(cyl(0.025, 0.025, 0.8, 8), wood, { x: Math.cos(a) * 0.22, y: 0.45, z: Math.sin(a) * 0.22 })); }
    g.add(mesh(new THREE.ConeGeometry(0.18, 0.4, 20, 1, true), glass, { y: 0.26, rx: Math.PI }));
    g.add(mesh(new THREE.ConeGeometry(0.18, 0.4, 20, 1, true), glass, { y: 0.64 }));
    g.add(mesh(new THREE.ConeGeometry(0.14, 0.18, 16), sand, { y: 0.15 }));
    g.add(mesh(new THREE.ConeGeometry(0.1, 0.12, 16), sand, { y: 0.56, rx: Math.PI }));
    return g;
  },
  banane() {
    const g = G();
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.35, 0.2, 0), new THREE.Vector3(-0.15, 0.08, 0), new THREE.Vector3(0.15, 0.08, 0), new THREE.Vector3(0.35, 0.22, 0)]);
    g.add(mesh(new THREE.TubeGeometry(c, 20, 0.08, 10), mat('#ffe66d', { rough: 0.5 })));
    g.add(mesh(cyl(0.03, 0.04, 0.08, 8), mat('#6f4518'), { x: 0.37, y: 0.25, rz: -0.7 }));
    for (const a of [-0.8, 0.9, 2.6]) {
      g.add(mesh(new THREE.ConeGeometry(0.07, 0.3, 6), mat('#f4d35e', { rough: 0.6 }), { x: -0.4 + Math.cos(a) * 0.08, y: 0.08, z: Math.sin(a) * 0.12, rz: Math.PI / 2 + 0.4, ry: a }));
    }
    return g;
  },
  photocop() {
    const g = G();
    const body = mat('#e9ecef', { rough: 0.4 }), dark = mat('#495057', { rough: 0.4 });
    g.add(mesh(box(0.9, 0.42, 0.62), body, { y: 0.21 }));
    const lid = G();
    lid.add(mesh(box(0.9, 0.06, 0.62), dark, { z: 0.31, y: 0.03 }));
    lid.position.set(0, 0.42, -0.31);
    g.add(lid);
    g.add(mesh(box(0.25, 0.04, 0.16), mat('#212529'), { x: 0.28, y: 0.43, z: 0.22 }));
    g.add(mesh(sph(0.03, 10, 8), mat('#38b000', { emissive: '#38b000', ei: 1.5 }), { x: 0.38, y: 0.45, z: 0.24 }));
    g.add(mesh(box(0.5, 0.02, 0.4), mat('#ffffff'), { x: -0.62, y: 0.2, rz: 0.15 }));
    const light = mesh(box(0.86, 0.02, 0.04), mat('#b9fbc0', { emissive: '#38b000', ei: 2 }), { y: 0.425, z: -0.25 });
    light.visible = false;
    g.add(light);
    g.userData.lid = lid; g.userData.light = light;
    g.scale.setScalar(0.85);
    return g;
  },
  ventilo() {
    const g = G();
    const blue = mat('#90e0ef', { rough: 0.3 }), steel = mat('#adb5bd', { metal: 0.8, rough: 0.3 });
    g.add(mesh(cyl(0.24, 0.28, 0.08, 24), steel, { y: 0.04 }));
    g.add(mesh(cyl(0.035, 0.035, 0.5, 10), steel, { y: 0.3 }));
    const head = G();
    head.position.y = 0.62;
    head.add(mesh(cyl(0.08, 0.1, 0.16, 16), blue, { rx: Math.PI / 2, z: -0.05 }));
    const blades = G();
    for (let i = 0; i < 3; i++) {
      const b = mesh(sph(0.16, 12, 8), blue, { s: [0.5, 1, 0.12] });
      b.position.set(Math.cos((i * 2 * Math.PI) / 3) * 0.13, Math.sin((i * 2 * Math.PI) / 3) * 0.13, 0.05);
      b.rotation.z = (i * 2 * Math.PI) / 3 + Math.PI / 2;
      blades.add(b);
    }
    blades.position.z = 0.06;
    head.add(blades);
    head.add(mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 40), steel, { z: 0.06 }));
    g.add(head);
    g.userData.blades = blades;
    return g;
  },
  defib() {
    const g = G();
    g.add(mesh(box(0.6, 0.32, 0.4), mat('#ef476f', { rough: 0.4 }), { y: 0.16 }));
    g.add(mesh(box(0.2, 0.06, 0.02), mat('#ffffff'), { y: 0.2, z: 0.21 }));
    g.add(mesh(box(0.06, 0.2, 0.02), mat('#ffffff'), { y: 0.2, z: 0.21 }));
    for (const x of [-0.18, 0.18]) {
      g.add(mesh(cyl(0.09, 0.09, 0.05, 16), mat('#212529'), { x, y: 0.36 }));
      g.add(mesh(cyl(0.03, 0.03, 0.12, 8), mat('#ffd166'), { x, y: 0.44 }));
    }
    return g;
  },
  engrais() {
    const g = G();
    g.add(mesh(sph(0.3, 16, 12), mat('#b08968', { rough: 0.9, flat: true }), { y: 0.3, s: [1, 1.15, 0.7] }));
    g.add(mesh(cyl(0.16, 0.22, 0.1, 12), mat('#b08968', { rough: 0.9 }), { y: 0.66 }));
    g.add(mesh(box(0.42, 0.18, 0.02), mat('#52b788'), { y: 0.32, z: 0.2 }));
    g.add(mesh(sph(0.05, 8, 6), mat('#ffd166'), { y: 0.33, z: 0.22 }));
    return g;
  },
  envers() {
    const g = G();
    const p = mat('#c77dff', { rough: 0.3, emissive: '#7b2cbf', ei: 0.4 });
    g.add(mesh(new THREE.TorusGeometry(0.3, 0.06, 10, 32, Math.PI * 1.5), p, { y: 0.5, rz: 0.4 }));
    g.add(mesh(new THREE.ConeGeometry(0.12, 0.22, 12), p, { x: 0.3, y: 0.36, rz: Math.PI }));
    g.add(mesh(cyl(0.2, 0.24, 0.06, 20), mat('#3c096c'), { y: 0.03 }));
    return g;
  },
  pelle() {
    const g = G();
    const wood = mat('#9c6644', { rough: 0.6 });
    g.add(mesh(cyl(0.03, 0.03, 0.8, 8), wood, { y: 0.55, rz: 0.4 }));
    g.add(mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12), wood, { x: -0.18, y: 0.95, rz: 0.4 }));
    g.add(mesh(sph(0.2, 16, 10, 0, Math.PI), mat('#adb5bd', { metal: 0.8, rough: 0.3 }), { x: 0.13, y: 0.15, rz: 0.4, s: [1, 1.3, 0.35] }));
    return g;
  },
};

export function makeModel(kind, e = null) {
  const g = (B[kind] || B.orage)(e);
  g.userData.kind = kind;
  return g;
}

// Socle coloré du propriétaire (anneau sous chaque objet).
export function ownerRing(owner) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.41, 40), new THREE.MeshBasicMaterial({ color: OWNER[owner].ring, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012;
  m.userData.isRing = true;
  return m;
}

export function cueModel() {
  const g = G();
  g.add(mesh(cyl(0.02, 0.035, 2.2, 10), mat('#d4a373', { rough: 0.4 }), { y: 1.1 }));
  g.add(mesh(cyl(0.036, 0.04, 0.7, 10), mat('#3d2c1e'), { y: 0.35 }));
  g.add(mesh(cyl(0.02, 0.02, 0.04, 10), mat('#4895ef'), { y: 2.22 }));
  return g;
}

export function avatarModel(owner) {
  const g = G();
  const o = OWNER[owner];
  const body = mat(owner === 0 ? '#ffc93c' : '#ff3d71', { rough: 0.45 });
  const skin = mat(owner === 0 ? '#fff1d6' : '#3b3355', { rough: 0.5 });
  const inner = G();
  inner.add(mesh(new THREE.CapsuleGeometry(0.28, 0.35, 8, 16), body, { y: 0.48 }));
  inner.add(mesh(sph(0.26, 24, 18), skin, { y: 1.08 }));
  const eyeM = mat('#14111f', { rough: 0.2 });
  inner.add(mesh(sph(0.045, 10, 8), eyeM, { x: -0.09, y: 1.12, z: 0.22 }));
  inner.add(mesh(sph(0.045, 10, 8), eyeM, { x: 0.09, y: 1.12, z: 0.22 }));
  inner.add(mesh(cyl(0.3, 0.3, 0.05, 24), mat(o.trim), { y: 1.3 }));
  inner.add(mesh(cyl(0.2, 0.24, 0.2, 24), mat(o.trim), { y: 1.42 }));
  g.add(inner);
  g.userData.inner = inner;
  return g;
}

// ------------------------------------------------------------ textures

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const texCache = new Map();

function ballTexture() {
  if (texCache.has('ball')) return texCache.get('ball');
  const c = canvas(256, 128), g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 26, 0, 7); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('8', 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set('ball', t); return t;
}
function mirrorTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 128);
  gr.addColorStop(0, '#e0fbfc'); gr.addColorStop(0.5, '#98c1d9'); gr.addColorStop(1, '#3d5a80');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(20, 60); g.lineTo(60, 20); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(40, 80); g.lineTo(80, 40); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function diskTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.45, 'rgba(255,140,60,0.9)'); gr.addColorStop(0.75, 'rgba(160,60,220,0.6)'); gr.addColorStop(1, 'rgba(60,0,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(128, 128, 50 + i * 2, i, i + 1.2); g.lineWidth = 1.2; g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function pipTexture(n) {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = n === 1 ? '#e63946' : '#14111f';
  const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[30, 30], [98, 30], [64, 64], [30, 98], [98, 98]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] }[n];
  for (const [x, y] of P) { g.beginPath(); g.arc(x, y, n === 1 ? 18 : 11, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function boltGeo() {
  const s = new THREE.Shape();
  s.moveTo(0.1, 1); s.lineTo(-0.25, 0.35); s.lineTo(0.02, 0.35); s.lineTo(-0.12, -0.3); s.lineTo(0.3, 0.5); s.lineTo(0.04, 0.5); s.lineTo(0.22, 1); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
}
