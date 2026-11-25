// IA du bot : simule chaque action possible sur une copie de la partie et garde la meilleure.
import { KINDS } from './kinds.js';
import { listActions, act, clone, outlook, other, hasCard } from './engine.js';

function worth(e) {
  let w = KINDS[e.kind].worth;
  if (e.uses != null) w += e.uses * 0.8;
  if (e.kind === 'arbre') w += e.stage * 1.5;
  if (e.kind === 'pion') w += e.age;
  if (e.cd) w -= 0.5;
  return w;
}

export function evaluate(S, p) {
  const o = other(p);
  if (S.phase === 'over') return S.winner === p ? 10000 : -10000;
  let s = (S.players[p].pts - S.players[o].pts) * 10;
  for (const e of S.ents) s += (e.owner === p ? 1 : -1) * worth(e);
  if (S.phase === 'action') {
    const ol = outlook(S);
    const stake = 8 * (1 + S.potTies);
    if (ol.winner === p) s += stake; else if (ol.winner === o) s -= stake;
    for (const q of [0, 1]) {
      const k = S.players[q].chaos;
      if (k && hasCard(S, q) !== undefined) s += (q === p ? 1 : -1) * Math.max(1.5, KINDS[k].worth) * 0.8;
    }
  }
  if (S.players[p].dead) s -= 20;
  if (S.players[o].dead) s += 20;
  s -= S.players[p].malheur * 2;
  s += S.players[o].malheur * 2;
  return s;
}

const silent = (S) => { S.ev = []; return S; };

export function chooseAction(S, p, { level = 1 } = {}) {
  const acts = listActions(S, p);
  if (!acts.length) return null;
  const base = evaluate(S, p);
  let best = null, bestScore = -Infinity;
  for (const a of acts) {
    let total = 0;
    const sims = 4;
    for (let i = 0; i < sims; i++) {
      const C = clone(S);
      C.ev = [];
      act(C, p, a);
      silent(C);
      total += evaluate(C, p);
    }
    const score = total / sims + (Math.random() - 0.5) * (level < 1 ? 6 : 1.5);
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore > base + 0.8 ? best : null;
}
