// IA du bot : simule ses coups possibles (cartes et coups d'échecs) et garde le meilleur.
import { KINDS } from './kinds.js';
import { listActions, act, clone, outlook, other, getEnt } from './engine.js';

const ACCURACY = { flingue: 0.75, peche: 0.7 };

function worth(e) {
  let w = KINDS[e.kind].worth;
  if (e.kind === 'arbre') w += e.stage * 1.5;
  if (e.kind === 'banane') w = -2;
  return w;
}

export function evaluate(S, p) {
  const o = other(p);
  if (S.phase === 'over') return S.winner === p ? 10000 : -10000;
  let s = (S.players[p].pts - S.players[o].pts) * 10;
  for (const e of S.ents) s += (e.owner === p ? 1 : -1) * worth(e);
  for (const c of S.players[p].hand) s += KINDS[c.kind].worth * 0.55;
  for (const c of S.players[o].hand) s -= KINDS[c.kind].worth * 0.55;
  if (S.phase === 'action') {
    const ol = outlook(S);
    const stake = 9 * (1 + S.potTies);
    if (ol.winner === p) s += stake; else if (ol.winner === o) s -= stake;
  }
  if (S.players[p].dead) s -= 20;
  if (S.players[o].dead) s += 20;
  s -= S.players[p].malheur * 2;
  s += S.players[o].malheur * 2;
  return s;
}

function simulate(S, p, a, aim, n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const C = clone(S);
    C.ev = [];
    act(C, p, a, aim);
    total += evaluate(C, p);
  }
  return total / n;
}

function billiardCandidates(S, p, acts) {
  const enemies = S.ents.filter((e) => e.zone === 'board' && e.owner !== p && e.kind !== 'trounoir');
  const targets = enemies.length ? enemies : S.ents.filter((e) => e.zone === 'board' && e.kind !== 'trounoir');
  const out = [];
  for (let i = 0; i < 10 && targets.length; i++) {
    const a = acts[Math.floor(Math.random() * acts.length)];
    const t = targets[Math.floor(Math.random() * targets.length)];
    const angle = Math.atan2(t.y - a.tgt.y, t.x - a.tgt.x) + (Math.random() - 0.5) * 0.25;
    out.push({ a, aim: { angle, power: 0.55 + Math.random() * 0.45 } });
  }
  return out;
}

export function chooseAction(S, p) {
  const acts = listActions(S, p);
  if (!acts.length) return null;
  const base = evaluate(S, p);
  const cands = [];
  const byKind = {};
  for (const a of acts) (byKind[a.kind + a.type] ||= []).push(a);
  for (const [key, list] of Object.entries(byKind)) {
    if (key === 'billardcard') { cands.push(...billiardCandidates(S, p, list)); continue; }
    let pool = list.filter((a) => a.tgt?.t !== 'miss');
    if (key === 'bombecard' && pool.length > 6) pool = pool.sort(() => Math.random() - 0.5).slice(0, 6);
    for (const a of pool) cands.push({ a, aim: null });
  }
  let best = null, bestScore = -Infinity;
  for (const c of cands) {
    const random = c.a.type === 'card' && ['de', 'billard'].includes(c.a.kind) ? 1 : 2;
    const sc = simulate(S, p, c.a, c.aim, random) + (Math.random() - 0.5) * 1.5;
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  if (!best || bestScore <= base + 0.8) return null;
  // le bot peut rater son tir ou sa pêche
  const accu = ACCURACY[best.a.kind];
  if (best.a.type === 'card' && accu && Math.random() > accu) {
    const miss = acts.find((x) => x.hid === best.a.hid && x.tgt.t === 'miss');
    if (miss) return { a: miss, aim: null };
  }
  return best;
}

export { getEnt };
