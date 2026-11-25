// Sons 100 % synthétisés avec WebAudio : rien à télécharger, tout marche hors ligne.
let ctx = null, master = null, enabled = true;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
  } catch { ctx = null; }
}
export function setSound(on) { enabled = on; }
export const soundOn = () => enabled;

function noiseBuffer() {
  if (noiseBuffer.b) return noiseBuffer.b;
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuffer.b = b);
}

function env(g, t, a, peak, dec, end = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + dec);
}

function tone({ type = 'sine', f = 440, f2 = null, t = 0, a = 0.005, d = 0.2, v = 0.3, dest = master, detune = 0 }) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, now); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + a + d);
  env(g, now, a, v, d);
  o.connect(g); g.connect(dest);
  o.start(now); o.stop(now + a + d + 0.05);
}

function noise({ t = 0, a = 0.005, d = 0.3, v = 0.3, type = 'lowpass', f = 1200, f2 = null, q = 1 }) {
  const now = ctx.currentTime + t;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer();
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, now); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + a + d);
  const g = ctx.createGain(); env(g, now, a, v, d);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(now, Math.random()); s.stop(now + a + d + 0.05);
}

const SFX = {
  click: () => tone({ type: 'triangle', f: 900, f2: 1300, d: 0.05, v: 0.15 }),
  tap: () => tone({ type: 'sine', f: 520, f2: 760, d: 0.08, v: 0.2 }),
  whoosh: () => noise({ d: 0.28, v: 0.25, type: 'bandpass', f: 400, f2: 2400, q: 1.2 }),
  flip: () => { noise({ d: 0.07, v: 0.3, type: 'highpass', f: 2500 }); tone({ type: 'triangle', f: 300, f2: 600, d: 0.06, v: 0.1 }); },
  slam: () => { tone({ f: 120, f2: 38, d: 0.25, v: 0.7 }); noise({ d: 0.12, v: 0.35, f: 900 }); },
  sparkle: () => [0, 0.06, 0.12, 0.18].forEach((t, i) => tone({ type: 'triangle', f: 880 * Math.pow(1.26, i), t, d: 0.25, v: 0.12 })),
  spawn: () => { tone({ type: 'square', f: 220, f2: 880, d: 0.18, v: 0.08 }); [0.1, 0.17].forEach((t, i) => tone({ type: 'triangle', f: 1046 * (i + 1), t, d: 0.3, v: 0.1 })); },
  shot: () => { noise({ a: 0.001, d: 0.25, v: 0.9, f: 3000, f2: 300 }); tone({ f: 160, f2: 40, d: 0.3, v: 0.8 }); },
  boom: () => { noise({ a: 0.005, d: 1.4, v: 1, f: 1800, f2: 60 }); tone({ f: 80, f2: 25, d: 1.0, v: 1 }); },
  fire: () => { for (let i = 0; i < 10; i++) noise({ t: i * 0.05 + Math.random() * 0.03, d: 0.04, v: 0.25, type: 'highpass', f: 1500 }); noise({ d: 0.7, v: 0.2, type: 'bandpass', f: 600 }); },
  splash: () => { noise({ d: 0.6, v: 0.5, type: 'bandpass', f: 1800, f2: 300, q: 0.8 }); tone({ f: 600, f2: 200, d: 0.15, v: 0.15 }); },
  magnet: () => { tone({ type: 'sawtooth', f: 90, f2: 180, d: 0.7, v: 0.15 }); tone({ type: 'sine', f: 440, f2: 1200, t: 0.3, d: 0.4, v: 0.12 }); },
  saw: () => { for (let i = 0; i < 6; i++) tone({ type: 'square', f: 140 + i * 6, t: i * 0.08, d: 0.08, v: 0.12 }); noise({ d: 0.6, v: 0.2, type: 'bandpass', f: 2500 }); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f, t: i * 0.07, d: 0.3, v: 0.2 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone({ type: 'triangle', f, t: i * 0.1, d: 0.3, v: 0.16 })),
  coin: () => { tone({ type: 'square', f: 988, d: 0.07, v: 0.1 }); tone({ type: 'square', f: 1319, t: 0.07, d: 0.25, v: 0.1 }); },
  bataille: () => [0, 0.12].forEach((t) => [196, 247, 294].forEach((f) => tone({ type: 'sawtooth', f, t, d: 0.35, v: 0.12 }))),
  thunder: () => { noise({ a: 0.001, d: 0.15, v: 1, type: 'highpass', f: 2000 }); noise({ t: 0.05, d: 1.8, v: 0.7, f: 500, f2: 60 }); },
  meow: () => tone({ type: 'sawtooth', f: 520, f2: 880, d: 0.18, v: 0.08, a: 0.04 }) || tone({ type: 'sine', f: 880, f2: 480, t: 0.2, d: 0.25, v: 0.12 }),
  dice: () => { for (let i = 0; i < 8; i++) noise({ t: i * 0.07 + Math.random() * 0.03, d: 0.03, v: 0.4, type: 'bandpass', f: 3000 }); },
  tick: () => tone({ type: 'square', f: 1800, d: 0.02, v: 0.08 }),
  copier: () => { tone({ type: 'sawtooth', f: 70, f2: 110, d: 1.1, v: 0.1 }); noise({ d: 1.1, v: 0.1, type: 'bandpass', f: 1200 }); tone({ type: 'square', f: 1500, t: 1.0, d: 0.1, v: 0.08 }); },
  wind: () => noise({ a: 0.2, d: 1.0, v: 0.5, type: 'bandpass', f: 300, f2: 1400, q: 0.6 }),
  zap: () => { tone({ type: 'sine', f: 200, f2: 2400, d: 0.6, v: 0.1 }); noise({ t: 0.6, d: 0.2, v: 0.6, type: 'highpass', f: 1500 }); },
  dig: () => { for (let i = 0; i < 3; i++) noise({ t: i * 0.22, d: 0.12, v: 0.5, f: 700 }); },
  slip: () => tone({ type: 'sine', f: 1400, f2: 200, d: 0.5, v: 0.2 }),
  plop: () => tone({ type: 'sine', f: 900, f2: 180, d: 0.12, v: 0.3 }),
  reel: () => { for (let i = 0; i < 10; i++) tone({ type: 'square', f: 2200, t: i * 0.035, d: 0.015, v: 0.05 }); },
  ghost: () => tone({ type: 'sine', f: 400, f2: 200, a: 0.1, d: 0.8, v: 0.15 }),
  revive: () => [262, 330, 392, 523, 659].forEach((f, i) => tone({ type: 'triangle', f, t: i * 0.05, d: 0.25, v: 0.12 })),
  glass: () => { for (let i = 0; i < 6; i++) tone({ type: 'triangle', f: 2000 + Math.random() * 3000, t: i * 0.03, d: 0.2, v: 0.08 }); noise({ d: 0.3, v: 0.3, type: 'highpass', f: 4000 }); },
  clink: () => tone({ type: 'triangle', f: 2400, f2: 1800, d: 0.1, v: 0.2 }),
  freeze: () => [1568, 1318, 1046, 784].forEach((f, i) => tone({ type: 'sine', f, t: i * 0.08, d: 0.5, v: 0.1 })),
  suck: () => tone({ type: 'sawtooth', f: 800, f2: 40, d: 0.8, v: 0.12 }),
  victory: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f, t: i * 0.11, d: 0.4, v: 0.18 })),
  defeat: () => [392, 370, 349, 330].forEach((f, i) => tone({ type: 'sawtooth', f, t: i * 0.25, d: 0.45, v: 0.08 })),
  round: () => { tone({ type: 'triangle', f: 660, d: 0.08, v: 0.12 }); tone({ type: 'triangle', f: 990, t: 0.08, d: 0.15, v: 0.12 }); },
  grow: () => tone({ type: 'sine', f: 300, f2: 900, d: 0.3, v: 0.15 }),
};

export function sfx(name) {
  if (!ctx || !enabled || !SFX[name]) return;
  try { SFX[name](); } catch { /* son ignoré */ }
}

let hapticsPlugin = null;
export function setHaptics(p) { hapticsPlugin = p; }
export function buzz(ms = 20) {
  if (!enabled) return;
  try {
    if (hapticsPlugin) hapticsPlugin.vibrate({ duration: ms });
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch { /* pas de vibration */ }
}
