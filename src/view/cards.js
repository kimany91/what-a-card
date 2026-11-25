// Cartes : vraies faces de jeu (index J Q K A, motifs classiques, figures), cartes objets et dos commun.
import * as THREE from 'three';
import { KINDS } from '../engine/kinds.js';
import { rankLabel } from '../engine/engine.js';

export const CW = 1.1, CH = 1.54;
const TW = 360, TH = 504;
const RED = '#c8102e', INK = '#16141f';
export const FONT_D = '"Bowlby One", "Arial Black", sans-serif';
export const FONT_B = '"Bricolage Grotesque", "Segoe UI", Roboto, sans-serif';
const FONT_IDX = '"Bricolage Grotesque", Georgia, serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const isRed = (s) => s === 'coeur' || s === 'carreau';

export function drawSuit(g, s, x, y, size, flip = false) {
  g.save(); g.translate(x, y); if (flip) g.rotate(Math.PI); g.scale(size / 100, size / 100);
  g.fillStyle = isRed(s) ? RED : INK;
  g.beginPath();
  if (s === 'coeur') {
    g.moveTo(0, 42); g.bezierCurveTo(-30, 18, -52, 0, -50, -22); g.bezierCurveTo(-48, -46, -14, -54, 0, -28);
    g.bezierCurveTo(14, -54, 48, -46, 50, -22); g.bezierCurveTo(52, 0, 30, 18, 0, 42);
  } else if (s === 'carreau') {
    g.moveTo(0, -50); g.quadraticCurveTo(18, -18, 38, 0); g.quadraticCurveTo(18, 18, 0, 50); g.quadraticCurveTo(-18, 18, -38, 0); g.quadraticCurveTo(-18, -18, 0, -50);
  } else if (s === 'pique') {
    g.moveTo(0, -50); g.bezierCurveTo(14, -24, 52, -8, 50, 14); g.bezierCurveTo(48, 36, 16, 40, 4, 20);
    g.quadraticCurveTo(8, 40, 18, 48); g.lineTo(-18, 48); g.quadraticCurveTo(-8, 40, -4, 20);
    g.bezierCurveTo(-16, 40, -48, 36, -50, 14); g.bezierCurveTo(-52, -8, -14, -24, 0, -50);
  } else {
    g.arc(0, -22, 21, 0, Math.PI * 2); g.moveTo(-22, 10); g.arc(-24, 10, 21, 0, Math.PI * 2); g.moveTo(45, 10); g.arc(24, 10, 21, 0, Math.PI * 2);
    g.moveTo(-5, 4); g.quadraticCurveTo(-4, 38, -18, 48); g.lineTo(18, 48); g.quadraticCurveTo(4, 38, 5, 4);
  }
  g.closePath(); g.fill();
  g.restore();
}

// Positions classiques des motifs (cartes 2 à 10)
const L = 112, C = 180, Rx = 248;
const PIPS = {
  2: [[C, 112], [C, 392]],
  3: [[C, 112], [C, 252], [C, 392]],
  4: [[L, 112], [Rx, 112], [L, 392], [Rx, 392]],
  5: [[L, 112], [Rx, 112], [C, 252], [L, 392], [Rx, 392]],
  6: [[L, 112], [Rx, 112], [L, 252], [Rx, 252], [L, 392], [Rx, 392]],
  7: [[L, 112], [Rx, 112], [C, 182], [L, 252], [Rx, 252], [L, 392], [Rx, 392]],
  8: [[L, 112], [Rx, 112], [C, 182], [L, 252], [Rx, 252], [C, 322], [L, 392], [Rx, 392]],
  9: [[L, 112], [Rx, 112], [L, 205], [Rx, 205], [C, 252], [L, 299], [Rx, 299], [L, 392], [Rx, 392]],
  10: [[L, 112], [Rx, 112], [C, 159], [L, 205], [Rx, 205], [L, 299], [Rx, 299], [C, 345], [L, 392], [Rx, 392]],
};

function corner(g, label, s, col) {
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${label.length > 1 ? 52 : 60}px ${FONT_IDX}`;
  g.fillText(label, 42, 50);
  drawSuit(g, s, 42, 98, 34);
  g.save(); g.translate(TW, TH); g.rotate(Math.PI);
  g.fillText(label, 42, 50);
  drawSuit(g, s, 42, 98, 34);
  g.restore();
}

// Figure (Valet, Dame, Roi) : demi-personnage dessiné deux fois, tête-bêche, comme sur un vrai jeu.
function court(g, rank, s) {
  const x0 = 82, y0 = 70, w = TW - 164, h = TH - 140;
  const red = isRed(s);
  const robeA = red ? '#c8102e' : '#1d3557', robeB = '#f2b134', robeC = red ? '#1d3557' : '#c8102e';
  g.save();
  roundRect(g, x0, y0, w, h, 10); g.fillStyle = '#fdf3dc'; g.fill();
  g.lineWidth = 3; g.strokeStyle = red ? RED : INK; g.stroke();
  g.clip();
  const half = (flip) => {
    g.save();
    if (flip) { g.translate(TW, TH); g.rotate(Math.PI); }
    const cx = 180, hy = 150;
    // robe
    g.fillStyle = robeA;
    g.beginPath(); g.moveTo(cx - 70, 252); g.lineTo(cx - 52, 196); g.quadraticCurveTo(cx, 178, cx + 52, 196); g.lineTo(cx + 70, 252); g.closePath(); g.fill();
    g.fillStyle = robeB;
    g.beginPath(); g.moveTo(cx - 16, 186); g.lineTo(cx + 16, 186); g.lineTo(cx + 26, 252); g.lineTo(cx - 26, 252); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(cx - 60 + i * 8, 240 - i * 12); g.lineTo(cx - 30 + i * 4, 240 - i * 12); g.stroke(); }
    g.fillStyle = robeC; g.fillRect(cx + 30, 210, 28, 42);
    // cou et visage
    g.fillStyle = '#f6d7b0'; g.fillRect(cx - 8, hy + 22, 16, 16);
    g.beginPath(); g.ellipse(cx, hy, 24, 28, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    g.fillStyle = INK;
    g.beginPath(); g.arc(cx - 9, hy - 3, 2.6, 0, 7); g.arc(cx + 9, hy - 3, 2.6, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx - 6, hy + 12); g.quadraticCurveTo(cx, hy + 16, cx + 6, hy + 12); g.stroke();
    if (rank === 13) { // barbe + couronne
      g.fillStyle = '#7a4a1e';
      g.beginPath(); g.moveTo(cx - 22, hy + 6); g.quadraticCurveTo(cx, hy + 44, cx + 22, hy + 6); g.quadraticCurveTo(cx, hy + 24, cx - 22, hy + 6); g.fill();
      g.fillStyle = '#f2b134'; g.strokeStyle = INK;
      g.beginPath(); g.moveTo(cx - 26, hy - 22); g.lineTo(cx - 26, hy - 52); g.lineTo(cx - 13, hy - 36); g.lineTo(cx, hy - 58); g.lineTo(cx + 13, hy - 36); g.lineTo(cx + 26, hy - 52); g.lineTo(cx + 26, hy - 22); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = robeA; g.beginPath(); g.arc(cx, hy - 32, 4, 0, 7); g.fill();
    } else if (rank === 12) { // cheveux + diadème + fleur
      g.fillStyle = '#d9a441';
      g.beginPath(); g.moveTo(cx - 26, hy - 6); g.quadraticCurveTo(cx - 34, hy + 34, cx - 22, hy + 40); g.lineTo(cx - 20, hy - 14); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(cx + 26, hy - 6); g.quadraticCurveTo(cx + 34, hy + 34, cx + 22, hy + 40); g.lineTo(cx + 20, hy - 14); g.closePath(); g.fill();
      g.fillStyle = '#f2b134'; g.strokeStyle = INK;
      g.beginPath(); g.moveTo(cx - 22, hy - 22); g.quadraticCurveTo(cx, hy - 48, cx + 22, hy - 22); g.closePath(); g.fill(); g.stroke();
      for (const dx of [-12, 0, 12]) { g.fillStyle = dx ? robeA : '#fff'; g.beginPath(); g.arc(cx + dx, hy - 30 - (dx ? 0 : 4), 4, 0, 7); g.fill(); }
      g.strokeStyle = '#2d6a4f'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 44, 250); g.lineTo(cx - 44, 200); g.stroke();
      g.fillStyle = robeA; g.beginPath(); g.arc(cx - 44, 196, 9, 0, 7); g.fill();
    } else { // valet : chapeau à plume
      g.fillStyle = robeC; g.strokeStyle = INK;
      g.beginPath(); g.ellipse(cx, hy - 24, 32, 10, -0.1, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx - 20, hy - 26); g.quadraticCurveTo(cx, hy - 56, cx + 20, hy - 26); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = '#f2b134'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx + 14, hy - 40); g.quadraticCurveTo(cx + 44, hy - 66, cx + 50, hy - 40); g.stroke();
      g.fillStyle = '#7a4a1e'; g.fillRect(cx - 24, hy - 18, 8, 26); g.fillRect(cx + 16, hy - 18, 8, 26);
    }
    drawSuit(g, s, cx + 44, 222, 30);
    g.restore();
  };
  half(false); half(true);
  g.strokeStyle = red ? RED : INK; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0, TH / 2 + 18); g.lineTo(x0 + w, TH / 2 - 18); g.stroke();
  g.restore();
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const faceCache = new Map();
// Face d'une carte de bataille. card = { r, v, s, gold, wet }
export function battleCanvas(card) {
  const v = Math.max(1, card.v ?? card.r);
  const shown = Math.min(14, v);
  const key = `${shown}|${card.s}|${card.gold ? 1 : 0}|${card.wet > 0 ? 1 : 0}|${v - card.r}`;
  if (faceCache.has(key)) return faceCache.get(key);
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  roundRect(g, 3, 3, TW - 6, TH - 6, 26);
  g.fillStyle = card.gold ? '#fff6d8' : '#fbf8f1'; g.fill();
  g.lineWidth = card.gold ? 12 : 3; g.strokeStyle = card.gold ? '#e0a800' : '#d8d1c2'; g.stroke();
  const col = isRed(card.s) ? RED : INK;
  const label = rankLabel(shown);
  corner(g, label === '1' ? '1' : label, card.s, col);
  if (shown >= 11 && shown <= 13) court(g, shown, card.s);
  else if (shown === 14 || shown === 1) {
    drawSuit(g, card.s, TW / 2, TH / 2, card.s === 'pique' ? 170 : 130);
    if (card.s === 'pique' && shown === 14) { g.strokeStyle = '#fbf8f1'; g.lineWidth = 4; g.beginPath(); g.arc(TW / 2, TH / 2 - 8, 22, 0, 7); g.stroke(); }
  } else {
    for (const [x, y] of PIPS[shown]) drawSuit(g, card.s, x, y, 58, y > TH / 2 + 5);
  }
  const d = v - card.r;
  if (d !== 0) {
    // sceau de cire : la valeur a été modifiée
    g.fillStyle = d > 0 ? '#e0a800' : '#7b2cbf';
    g.beginPath(); g.arc(TW - 58, TH / 2, 40, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#fff'; g.font = `34px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((d > 0 ? '+' : '−') + Math.abs(d), TW - 58, TH / 2 + 2);
  }
  if (card.wet > 0) { g.fillStyle = 'rgba(72,170,228,0.22)'; roundRect(g, 3, 3, TW - 6, TH - 6, 26); g.fill(); }
  faceCache.set(key, c);
  return c;
}
const texCache = new WeakMap();
const texOf = (c) => { if (!texCache.has(c)) texCache.set(c, tex(c)); return texCache.get(c); };
export const battleFace = (card) => texOf(battleCanvas(card));

let backCanvas = null;
export function backCanvasGet() {
  if (backCanvas) return backCanvas;
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  roundRect(g, 3, 3, TW - 6, TH - 6, 26); g.fillStyle = '#fbf8f1'; g.fill();
  roundRect(g, 18, 18, TW - 36, TH - 36, 16); g.fillStyle = '#9b1d2a'; g.fill();
  g.save(); roundRect(g, 18, 18, TW - 36, TH - 36, 16); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 3;
  for (let i = -TH; i < TW + TH; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + TH, TH); g.stroke(); g.beginPath(); g.moveTo(i, TH); g.lineTo(i + TH, 0); g.stroke(); }
  g.restore();
  g.fillStyle = '#fbf8f1';
  g.beginPath(); g.ellipse(TW / 2, TH / 2, 62, 84, 0, 0, 7); g.fill();
  g.fillStyle = '#9b1d2a'; g.font = `44px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('W', TW / 2, TH / 2 - 24); g.fillText('C', TW / 2, TH / 2 + 26);
  return (backCanvas = c);
}
export const battleBack = () => texOf(backCanvasGet());

// Carte objet : sobre, une illustration et un nom.
const objCache = new Map();
export function objectCanvas(kind, icons) {
  if (objCache.has(kind) && icons?.[kind]) return objCache.get(kind);
  const k = KINDS[kind];
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  roundRect(g, 3, 3, TW - 6, TH - 6, 26); g.fillStyle = '#fbf8f1'; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#d8d1c2'; g.stroke();
  roundRect(g, 24, 24, TW - 48, 330, 18);
  const gr = g.createLinearGradient(0, 24, 0, 354);
  gr.addColorStop(0, k.color); gr.addColorStop(1, shade(k.color, -0.45));
  g.fillStyle = gr; g.fill();
  g.save(); roundRect(g, 24, 24, TW - 48, 330, 18); g.clip();
  const rg = g.createRadialGradient(TW / 2, 180, 10, TW / 2, 180, 170);
  rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, TW, TH);
  if (icons && icons[kind]) g.drawImage(icons[kind], TW / 2 - 150, 40, 300, 300);
  g.restore();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 40;
  g.font = `${size}px ${FONT_D}`;
  const name = k.name.toUpperCase();
  while (g.measureText(name).width > TW - 50 && size > 22) { size -= 2; g.font = `${size}px ${FONT_D}`; }
  g.fillText(name, TW / 2, 420);
  g.fillStyle = k.color; roundRect(g, TW / 2 - 30, 458, 60, 8, 4); g.fill();
  objCache.set(kind, c);
  return c;
}
export const objectFace = (kind, icons) => texOf(objectCanvas(kind, icons));

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (f < 0 ? v * f : (255 - v) * f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

const planeGeo = new THREE.PlaneGeometry(CW, CH);
const edgeGeo = new THREE.BoxGeometry(CW * 0.96, 0.02, CH * 0.97);
const edgeMat = new THREE.MeshStandardMaterial({ color: '#e9e2cf', roughness: 0.8 });

export function makeCard(frontTex, backTexture = battleBack()) {
  const g = new THREE.Group();
  const front = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: frontTex, emissiveMap: frontTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, roughness: 0.5, transparent: true, alphaTest: 0.5 }));
  front.rotation.x = -Math.PI / 2; front.position.y = 0.012;
  const back = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: backTexture, emissiveMap: backTexture, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4, roughness: 0.5, transparent: true, alphaTest: 0.5 }));
  back.rotation.x = Math.PI / 2; back.position.y = -0.012;
  back.rotation.z = Math.PI;
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  front.castShadow = back.castShadow = edge.castShadow = true;
  g.add(front, back, edge);
  g.userData.front = front;
  return g;
}
export function setCardFace(card, t) {
  const m = card.userData.front.material;
  m.map = t; m.emissiveMap = t; m.needsUpdate = true;
}

export function deckModel(n = 26) {
  const g = new THREE.Group();
  const sides = new THREE.MeshStandardMaterial({ color: '#efe6d0', roughness: 0.8 });
  const top = new THREE.MeshStandardMaterial({ map: battleBack(), roughness: 0.6, transparent: true, alphaTest: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CW * 0.96, 1, CH * 0.97), sides);
  body.castShadow = true; body.receiveShadow = true;
  const cap = new THREE.Mesh(planeGeo, top); cap.rotation.x = -Math.PI / 2;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(CW * 1.5, CH * 1.4), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01;
  g.add(glow, body, cap);
  g.userData.glow = glow;
  g.userData.set = (count) => {
    g.userData.count = count;
    const h = Math.max(0.01, Math.min(count, 60) * 0.012);
    body.scale.y = h; body.position.y = h / 2; cap.position.y = h + 0.002;
    g.visible = count > 0;
  };
  g.userData.set(n);
  return g;
}
