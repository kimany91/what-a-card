// Cartes 3D : textures dessinées sur canvas (cartes de bataille et cartes chaos).
import * as THREE from 'three';
import { KINDS } from '../engine/kinds.js';
import { rankLabel } from '../engine/engine.js';

export const CW = 1.1, CH = 1.54;
const TW = 360, TH = 504;
const RED = '#d7263d', INK = '#17142a';
export const FONT_D = '"Bowlby One", "Arial Black", sans-serif';
export const FONT_B = '"Bricolage Grotesque", "Segoe UI", Roboto, sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function drawSuit(g, s, x, y, size) {
  g.save(); g.translate(x, y); g.scale(size / 100, size / 100);
  g.fillStyle = s === 'coeur' || s === 'carreau' ? RED : INK;
  g.beginPath();
  if (s === 'coeur') {
    g.moveTo(0, 35); g.bezierCurveTo(-70, -10, -45, -65, 0, -28); g.bezierCurveTo(45, -65, 70, -10, 0, 35);
  } else if (s === 'carreau') {
    g.moveTo(0, -50); g.lineTo(38, 0); g.lineTo(0, 50); g.lineTo(-38, 0);
  } else if (s === 'pique') {
    g.moveTo(0, -48); g.bezierCurveTo(-70, 5, -45, 50, 0, 18); g.bezierCurveTo(45, 50, 70, 5, 0, -48);
    g.moveTo(0, 10); g.lineTo(-16, 48); g.lineTo(16, 48);
  } else {
    g.arc(0, -24, 20, 0, Math.PI * 2); g.moveTo(-22, 8); g.arc(-22, 8, 20, 0, Math.PI * 2); g.moveTo(22, 8); g.arc(22, 8, 20, 0, Math.PI * 2);
    g.moveTo(0, 0); g.lineTo(-14, 48); g.lineTo(14, 48);
  }
  g.closePath(); g.fill();
  g.restore();
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function battleFace(card, { wet = false } = {}) {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  roundRect(g, 4, 4, TW - 8, TH - 8, 30);
  g.fillStyle = card.gold ? '#fff3c4' : '#fbf6ea'; g.fill();
  g.lineWidth = card.gold ? 14 : 6; g.strokeStyle = card.gold ? '#f2b705' : '#d9cdb4'; g.stroke();
  const col = card.s === 'coeur' || card.s === 'carreau' ? RED : INK;
  const label = rankLabel(card.r);
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `86px ${FONT_D}`;
  g.fillText(label, 62, 72);
  drawSuit(g, card.s, 62, 150, 70);
  g.save(); g.translate(TW - 62, TH - 72); g.rotate(Math.PI); g.fillText(label, 0, 0); g.restore();
  g.save(); g.translate(TW - 62, TH - 150); g.rotate(Math.PI); drawSuit(g, card.s, 0, 0, 70); g.restore();
  if (card.r >= 11) {
    roundRect(g, 95, 120, TW - 190, TH - 240, 22); g.fillStyle = col; g.globalAlpha = 0.09; g.fill(); g.globalAlpha = 1;
    g.font = `170px ${FONT_D}`; g.fillText(label, TW / 2, TH / 2 - 10);
    drawSuit(g, card.s, TW / 2, TH / 2 + 110, 60);
  } else {
    drawSuit(g, card.s, TW / 2, TH / 2 + 20, 150);
  }
  if (wet) { g.fillStyle = 'rgba(72,202,228,0.28)'; roundRect(g, 4, 4, TW - 8, TH - 8, 30); g.fill(); }
  return tex(c);
}

let backTex = null, chaosBackTex = null;
export function battleBack() {
  if (backTex) return backTex;
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  roundRect(g, 4, 4, TW - 8, TH - 8, 30); g.fillStyle = '#1d3557'; g.fill();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 12;
  for (let i = -TH; i < TW + TH; i += 36) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - TH, TH); g.stroke(); }
  g.restore();
  roundRect(g, 24, 24, TW - 48, TH - 48, 20); g.lineWidth = 6; g.strokeStyle = '#ffc93c'; g.stroke();
  g.fillStyle = '#ffc93c'; g.font = `64px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('WHAT', TW / 2, TH / 2 - 60); g.fillText('A', TW / 2, TH / 2); g.fillText('CARD', TW / 2, TH / 2 + 60);
  return (backTex = tex(c));
}

export function chaosBack() {
  if (chaosBackTex) return chaosBackTex;
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  roundRect(g, 4, 4, TW - 8, TH - 8, 30);
  const gr = g.createLinearGradient(0, 0, TW, TH);
  gr.addColorStop(0, '#7209b7'); gr.addColorStop(0.5, '#f72585'); gr.addColorStop(1, '#ff9e00');
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(TW / 2, TH / 2, 30 + i * 24, 0, Math.PI * 2); g.strokeStyle = `rgba(255,255,255,${0.12 - i * 0.007})`; g.lineWidth = 9; g.stroke(); }
  g.restore();
  g.fillStyle = '#fff'; g.font = `200px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', TW / 2, TH / 2 + 10);
  g.font = `40px ${FONT_D}`; g.fillText('CHAOS', TW / 2, TH - 60);
  return (chaosBackTex = tex(c));
}

function wrap(g, text, maxW) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

const chaosCache = new Map();
export function chaosFace(kind, icons) {
  if (chaosCache.has(kind)) return chaosCache.get(kind);
  const k = KINDS[kind];
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  roundRect(g, 4, 4, TW - 8, TH - 8, 30); g.fillStyle = k.color; g.fill();
  roundRect(g, 22, 22, TW - 44, TH - 44, 20); g.fillStyle = '#17142a'; g.fill();
  const ig = g.createRadialGradient(TW / 2, 200, 10, TW / 2, 200, 170);
  ig.addColorStop(0, k.color); ig.addColorStop(1, 'rgba(23,20,42,0)');
  g.fillStyle = ig; g.fillRect(22, 40, TW - 44, 330);
  if (icons && icons[kind]) g.drawImage(icons[kind], TW / 2 - 140, 60, 280, 280);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 44;
  g.font = `${size}px ${FONT_D}`;
  let lines = wrap(g, k.name.toUpperCase(), TW - 70);
  while (lines.length > 2 && size > 28) { size -= 4; g.font = `${size}px ${FONT_D}`; lines = wrap(g, k.name.toUpperCase(), TW - 70); }
  lines.forEach((l, i) => g.fillText(l, TW / 2, 395 + (i - (lines.length - 1) / 2) * (size + 4)));
  g.fillStyle = k.color; g.font = `22px ${FONT_D}`; g.fillText('CHAOS', TW / 2, 50);
  const t = tex(c);
  chaosCache.set(kind, t);
  return t;
}

const planeGeo = new THREE.PlaneGeometry(CW, CH);
const edgeGeo = new THREE.BoxGeometry(CW * 0.96, 0.025, CH * 0.97);
const edgeMat = new THREE.MeshStandardMaterial({ color: '#e9e2cf', roughness: 0.8 });

export function makeCard(frontTex, backTexture) {
  const g = new THREE.Group();
  const front = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.55, transparent: true, alphaTest: 0.5 }));
  front.rotation.x = -Math.PI / 2; front.position.y = 0.014;
  const back = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.55, transparent: true, alphaTest: 0.5 }));
  back.rotation.x = Math.PI / 2; back.position.y = -0.014;
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  front.castShadow = back.castShadow = edge.castShadow = true;
  g.add(front, back, edge);
  g.userData.front = front;
  return g;
}

export function setCardFace(card, t) {
  const m = card.userData.front.material;
  if (m.map && m.map !== t) m.map.dispose?.();
  m.map = t; m.needsUpdate = true;
}

export function deckModel(n = 26) {
  const g = new THREE.Group();
  const sides = new THREE.MeshStandardMaterial({ color: '#efe6d0', roughness: 0.8 });
  const top = new THREE.MeshStandardMaterial({ map: battleBack(), roughness: 0.6, transparent: true, alphaTest: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CW * 0.96, 1, CH * 0.97), sides);
  body.castShadow = true; body.receiveShadow = true;
  const cap = new THREE.Mesh(planeGeo, top); cap.rotation.x = -Math.PI / 2;
  g.add(body, cap);
  g.userData.set = (count) => {
    g.userData.count = count;
    const h = Math.max(0.01, Math.min(count, 60) * 0.012);
    body.scale.y = h; body.position.y = h / 2; cap.position.y = h + 0.002;
    g.visible = count > 0;
  };
  g.userData.set(n);
  return g;
}
