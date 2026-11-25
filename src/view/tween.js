// Petit moteur d'interpolation, avec vitesse globale (accélérée quand le joueur touche l'écran).
export const clock = { speed: 1, now: 0 };
const active = new Set();

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: (t) => { const c1 = 1.7, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// Anime une fonction de progression : fn(k) avec k de 0 à 1.
export function animate(duration, fn, easing = ease.outCubic) {
  return new Promise((resolve) => {
    const tw = { t: 0, duration: Math.max(0.001, duration), fn, easing, resolve };
    active.add(tw);
    fn(easing(0));
  });
}

// Anime des propriétés numériques d'un objet (gère les Vector3/Euler via chemins "position.x").
export function tween(obj, to, duration, easing = ease.outCubic) {
  const keys = Object.keys(to);
  const from = keys.map((k) => get(obj, k));
  return animate(duration, (k) => {
    keys.forEach((key, i) => set(obj, key, from[i] + (to[key] - from[i]) * k));
  }, easing);
}
function get(o, path) { return path.split('.').reduce((a, k) => a[k], o); }
function set(o, path, v) { const p = path.split('.'); const last = p.pop(); p.reduce((a, k) => a[k], o)[last] = v; }

export const wait = (s) => animate(s, () => {}, ease.linear);

let hitstop = 0;
export function freezeFrame(s) { hitstop = Math.max(hitstop, s); }

export function updateTweens(dtReal) {
  let dt = dtReal * clock.speed;
  if (hitstop > 0) { hitstop -= dtReal; dt *= 0.05; }
  clock.now += dt;
  for (const tw of [...active]) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.duration);
    tw.fn(tw.easing(k));
    if (k >= 1) { active.delete(tw); tw.resolve(); }
  }
  return dt;
}

export const all = (...ps) => Promise.all(ps.flat());
