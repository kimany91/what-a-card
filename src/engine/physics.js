// Physique du billard sur l'échiquier (2D, déterministe). Unités : 1 = une case.
// Le plateau va de -0.5 à 4.5 sur x et y ; ce qui sort tombe de la table.

export const BALL_R = 0.26;
const STEP = 1 / 240;
const FRAME = 1 / 30;
const MIN = -0.5, MAX = 4.5;

export function simulateShot(bodies, start, angle, power) {
  const B = bodies.map((b) => ({ ...b, vx: 0, vy: 0, alive: true }));
  const ball = { id: 'ball', x: start.x, y: start.y, r: BALL_R, m: 1, vx: 0, vy: 0, alive: true };
  const v0 = 1.5 + Math.max(0, Math.min(1, power)) * 5.9;
  ball.vx = Math.cos(angle) * v0;
  ball.vy = Math.sin(angle) * v0;
  const all = [ball, ...B];
  const frames = [];
  const fallen = [];
  const hits = {};
  let t = 0, acc = FRAME;
  for (let i = 0; i < 240 * 5; i++) {
    for (const b of all) {
      if (!b.alive) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const dec = Math.min(sp, (2.4 + sp * 1.3) * STEP);
        b.vx -= (b.vx / sp) * dec; b.vy -= (b.vy / sp) * dec;
      }
      b.x += b.vx * STEP; b.y += b.vy * STEP;
      if (b.x < MIN || b.x > MAX || b.y < MIN || b.y > MAX) {
        b.alive = false;
        fallen.push({ id: b.id, t, x: b.x, y: b.y, vx: b.vx, vy: b.vy });
      }
    }
    for (let a = 0; a < all.length; a++) {
      const p = all[a];
      if (!p.alive) continue;
      for (let c = a + 1; c < all.length; c++) {
        const q = all[c];
        if (!q.alive) continue;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), min = p.r + q.r;
        if (d >= min || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        const rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
        const over = min - d;
        const tm = p.m + q.m;
        p.x -= nx * over * (q.m / tm); p.y -= ny * over * (q.m / tm);
        q.x += nx * over * (p.m / tm); q.y += ny * over * (p.m / tm);
        if (rel <= 0) continue;
        const j = (1.55 * rel) / (1 / p.m + 1 / q.m);
        p.vx -= (j / p.m) * nx; p.vy -= (j / p.m) * ny;
        q.vx += (j / q.m) * nx; q.vy += (j / q.m) * ny;
        hits[p.id] = Math.max(hits[p.id] || 0, rel);
        hits[q.id] = Math.max(hits[q.id] || 0, rel);
      }
    }
    t += STEP; acc += STEP;
    if (acc >= FRAME) {
      acc = 0;
      const f = { t };
      for (const b of all) if (b.alive || fallen.some((x) => x.id === b.id && t - x.t < FRAME * 1.5)) f[b.id] = [+b.x.toFixed(3), +b.y.toFixed(3)];
      frames.push(f);
    }
    if (all.every((b) => !b.alive || Math.hypot(b.vx, b.vy) < 0.03)) break;
  }
  const final = {};
  for (const b of all) if (b.alive) final[b.id] = { x: b.x, y: b.y };
  return { frames, final, fallen, hits };
}

// Recale chaque objet survivant sur la case libre la plus proche.
export function snapToCells(final, ids, N = 5) {
  const taken = new Set();
  const out = {};
  const order = ids.filter((id) => final[id]).map((id) => {
    const p = final[id];
    return { id, p, d: Math.hypot(p.x - Math.round(p.x), p.y - Math.round(p.y)) };
  }).sort((a, b) => a.d - b.d);
  for (const { id, p } of order) {
    const cells = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!taken.has(x + ',' + y)) cells.push({ x, y, d: Math.hypot(p.x - x, p.y - y) });
    cells.sort((a, b) => a.d - b.d);
    const c = cells[0];
    taken.add(c.x + ',' + c.y);
    out[id] = { x: c.x, y: c.y };
  }
  return out;
}
