// Moteur de règles de What a Card v0.2. Logique pure, sans affichage.
// Chaque opération remplit S.ev d'événements que la vue 3D rejoue en animations.
import { KINDS, KIND_IDS, hasTag } from './kinds.js';
import { simulateShot, snapToCells } from './physics.js';

export const N = 5;
export const DEATH_PENALTY = 2;
export const MATE_PENALTY = 2;
export const BOMB_PENALTY = 1;
export const HAND_MAX = 8;
export const OBJ_CHANCE = 0.35;
export const SUITS = ['pique', 'coeur', 'carreau', 'trefle'];
export const CHESS = ['reine', 'roi', 'tour', 'pion'];

let R = Math.random;
export const setRandom = (fn) => { R = fn; };
const pick = (a) => a[Math.floor(R() * a.length)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const other = (p) => 1 - p;
export const clone = (o) => JSON.parse(JSON.stringify(o));

export const rankLabel = (v) => (v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : v === 14 ? 'A' : String(v));
const RANK_WORD = { 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
const SUIT_WORD = { pique: 'pique', coeur: 'cœur', carreau: 'carreau', trefle: 'trèfle' };
export const cardName = (c) => `${RANK_WORD[c.v] || c.v} de ${SUIT_WORD[c.s]}`;

// ---------------------------------------------------------------- création

export function newGame({ names = ['Toi', 'Le Bot'], target = 20 } = {}) {
  const deck = [];
  let id = 1;
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({ id: id++, r, s });
  shuffle(deck);
  return {
    round: 0, phase: 'idle', target,
    players: names.map((name, i) => ({
      name, deck: deck.slice(i * 26, (i + 1) * 26), hand: [], pts: 0, dead: false,
      card: null, malheur: 0, objRun: 0,
    })),
    ents: [], globals: [], pot: [], potTies: 0, grave: [], pool: [],
    nextId: 1000, cardId: id, handId: 1, initiative: 0, turn: null,
    drawn: [false, false], passes: [false, false], moved: [false, false], blocked: [false, false],
    freeze: null, collapse: false, result: null, winner: null, ev: [], log: [], logId: 0,
  };
}

// ---------------------------------------------------------------- utilitaires

function emit(S, type, data = {}, text = null) {
  const e = { type, ...data };
  if (text) {
    e.text = text;
    S.log.push({ id: ++S.logId, r: S.round, text });
    if (S.log.length > 150) S.log.shift();
  }
  S.ev.push(e);
}
export const drainEvents = (S) => { const e = S.ev; S.ev = []; return e; };

const P = (S, p) => S.players[p];
const nm = (S, p) => S.players[p].name;
export const getEnt = (S, id) => S.ents.find((e) => e.id === id);
const boardEnts = (S) => S.ents.filter((e) => e.zone === 'board');
const frontEnts = (S, p) => S.ents.filter((e) => e.zone === 'front' && e.owner === p);
const owns = (S, p, kind) => S.ents.find((e) => e.owner === p && e.kind === kind);
export const globalOn = (S, kind) => S.globals.some((g) => g.kind === kind);
const edgeDist = (e) => Math.min(e.x, e.y, N - 1 - e.x, N - 1 - e.y);
export const hasCard = (S, p) => !!P(S, p).card && !P(S, p).dead;
const label = (S, e) => `${KINDS[e.kind].name} (${nm(S, e.owner)})`;
const at = (S, x, y) => S.ents.find((e) => e.zone === 'board' && e.x === x && e.y === y);
const isPiece = (e) => CHESS.includes(e.kind);

function freeCells(S) {
  const out = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!at(S, x, y)) out.push({ x, y });
  return out;
}
function homeCell(S, owner, center = false) {
  const all = freeCells(S);
  if (!all.length) return null;
  if (center && all.some((c) => c.x === 2 && c.y === 2)) return { x: 2, y: 2 };
  const half = all.filter((c) => (owner === 0 ? c.y >= 3 : c.y <= 1));
  const mid = all.filter((c) => (owner === 0 ? c.y >= 2 : c.y <= 2));
  return pick(half.length ? half : mid.length ? mid : all);
}

function makeEnt(S, kind, owner, extra = {}) {
  const k = KINDS[kind];
  const e = { id: S.nextId++, kind, owner, zone: k.zone, wet: 0 };
  if (k.timer) e.timer = k.timer;
  if (kind === 'arbre') e.stage = 0;
  return Object.assign(e, extra);
}

function spawn(S, kind, owner, source = 'card', extra = {}, cell = null) {
  const e = makeEnt(S, kind, owner, extra);
  if (e.zone === 'board') {
    const c = cell || homeCell(S, owner, kind === 'trounoir');
    if (!c) { emit(S, 'popup', { p: owner, word: 'ÉCHIQUIER PLEIN' }, `Plus de place sur l’échiquier pour ${KINDS[kind].name}.`); S.grave.push(kind); return null; }
    e.x = c.x; e.y = c.y;
  }
  S.ents.push(e);
  emit(S, 'spawn', { ent: clone(e), source, p: owner }, `${KINDS[kind].name} arrive chez ${nm(S, owner)}.`);
  return e;
}

const CAUSE = {
  capture: 'se fait prendre', fall: 'tombe de la table', shot: 'se fait tirer dessus', burn: 'part en fumée',
  blast: 'saute dans l’explosion', cut: 'se fait découper', hole: 'disparaît dans le trou noir', cat: 'se fait pousser par le chat',
  wind: 's’envole', wash: 'est emportée par l’eau', defused: 'est désamorcée', flee: 's’enfuit', short: 'court-circuite',
  revive: 'se décharge', collapse: 's’effondre', broken: 'se brise', harvest: 'donne ses fruits',
};

function destroy(S, e, cause, toGrave = true) {
  const i = S.ents.indexOf(e);
  if (i < 0) return;
  S.ents.splice(i, 1);
  emit(S, 'destroy', { id: e.id, kind: e.kind, owner: e.owner, cause }, `${label(S, e)} ${CAUSE[cause] || 'disparaît'}.`);
  if (toGrave && e.kind !== 'trounoir' && e.kind !== 'banane') S.grave.push(e.kind);
  if (e.kind === 'roi') losePts(S, e.owner, MATE_PENALTY, 'mate', `Échec et mat ! ${nm(S, e.owner)} perd ${MATE_PENALTY} points.`);
  if (e.kind === 'miroir') {
    P(S, e.owner).malheur = 3;
    emit(S, 'malheur', { p: e.owner }, `Miroir brisé : ${nm(S, e.owner)} a 3 tours de malheur (−1).`);
  }
}

function losePts(S, p, n, cause, text) {
  const loss = Math.min(P(S, p).pts, n);
  P(S, p).pts -= loss;
  emit(S, 'pts', { p, delta: -loss, cause, total: P(S, p).pts }, text);
}

function kill(S, p, cause) {
  const pl = P(S, p);
  if (pl.dead) return;
  const d = owns(S, p, 'defib');
  if (d) {
    if (d.wet > 0) destroy(S, d, 'short');
    else {
      emit(S, 'kill', { p, cause, saved: true }, `${pl.name} est touché…`);
      destroy(S, d, 'revive');
      emit(S, 'revive', { p, cause: 'defib' }, `Le Défibrillateur ramène ${pl.name} à la vie !`);
      return;
    }
  }
  pl.dead = true;
  emit(S, 'kill', { p, cause }, `${pl.name} est mort : sa carte ne compte pas, et −${DEATH_PENALTY} à sa réincarnation.`);
}

function explode(S, e) {
  if (!S.ents.includes(e)) return;
  S.ents.splice(S.ents.indexOf(e), 1);
  emit(S, 'explode', { id: e.id, x: e.x, y: e.y, owner: e.owner }, `BOUM ! La bombe de ${nm(S, e.owner)} explose.`);
  for (const o of boardEnts(S)) {
    if (Math.abs(o.x - e.x) <= 1 && Math.abs(o.y - e.y) <= 1) {
      if (o.kind === 'bombe') explode(S, o);
      else if (o.kind !== 'trounoir') destroy(S, o, 'blast');
    }
  }
  const v = other(e.owner);
  losePts(S, v, BOMB_PENALTY, 'bomb', `${nm(S, v)} perd ${BOMB_PENALTY} point dans l’explosion.`);
}

function growTree(S, e, n) {
  e.stage = Math.min(3, e.stage + n);
  emit(S, 'grow', { id: e.id, stage: e.stage }, `L’Arbre de ${nm(S, e.owner)} pousse (${e.stage}/3).`);
  if (e.stage >= 3) { fruit(S, e, e.owner, 3); destroy(S, e, 'harvest'); }
}
function fruit(S, tree, to, n) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push({ id: S.cardId++, r: 11 + Math.floor(R() * 4), s: pick(SUITS), gold: true });
  P(S, to).deck.unshift(...cards);
  emit(S, 'fruit', { id: tree.id, p: to, cards: clone(cards) }, `${nm(S, to)} récolte ${n} grosses cartes !`);
}
function promote(S, e) {
  e.kind = 'reine';
  emit(S, 'promote', { id: e.id }, `Le Pion de ${nm(S, e.owner)} devient Reine !`);
}

function modCard(S, p, delta, cause) {
  const c = P(S, p).card;
  if (!c) return;
  const from = c.v;
  c.v = Math.max(1, c.v + delta);
  emit(S, 'cardMod', { p, from, to: c.v, cause, card: clone(c) }, `Carte de ${nm(S, p)} : ${from} → ${c.v}.`);
}

function addToHand(S, p, kind, from) {
  const pl = P(S, p);
  const card = { id: S.handId++, kind };
  pl.hand.push(card);
  emit(S, 'toHand', { p, card: clone(card), from }, from === 'draw' ? null : `${nm(S, p)} récupère ${KINDS[kind].name}.`);
  if (pl.hand.length > HAND_MAX) {
    const old = pl.hand.shift();
    S.grave.push(old.kind);
    emit(S, 'discard', { p, hid: old.id, kind: old.kind }, `Main pleine : ${KINDS[old.kind].name} part au cimetière.`);
  }
}

// ---------------------------------------------------------------- valeurs

export function bonus(S, p) {
  let b = boardEnts(S).filter((e) => e.kind === 'roi' && e.owner === p).length;
  if (P(S, p).malheur > 0) b -= 1;
  return b;
}
export function cardValue(S, p) {
  const pl = P(S, p);
  if (!pl.card || pl.dead) return null;
  return Math.max(1, pl.card.v + bonus(S, p));
}
export function outlook(S) {
  if (S.collapse) return { winner: null, kind: 'void' };
  const a = cardValue(S, 0), b = cardValue(S, 1);
  if (a == null && b == null) return { winner: null, kind: 'tie', v: [a, b] };
  if (a == null) return { winner: 1, kind: 'win', v: [a, b] };
  if (b == null) return { winner: 0, kind: 'win', v: [a, b] };
  if (a === b) {
    const c0 = !!owns(S, 0, 'couronne'), c1 = !!owns(S, 1, 'couronne');
    if (c0 !== c1) return { winner: c0 ? 0 : 1, kind: 'crown', v: [a, b] };
    return { winner: null, kind: 'tie', v: [a, b] };
  }
  const low = globalOn(S, 'envers');
  return { winner: (a > b) !== low ? 0 : 1, kind: low ? 'envers' : 'win', v: [a, b] };
}

// ---------------------------------------------------------------- échecs

export function chessMoves(S, e) {
  const out = [];
  const dirs = { reine: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], tour: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const enemy = (o) => o && o.owner !== e.owner && isPiece(o);
  if (e.kind === 'reine' || e.kind === 'tour') {
    for (const [dx, dy] of dirs[e.kind]) {
      let x = e.x + dx, y = e.y + dy;
      while (inside(x, y)) {
        const o = at(S, x, y);
        if (!o) out.push({ x, y });
        else { if (enemy(o)) out.push({ x, y, cap: o.id }); break; }
        x += dx; y += dy;
      }
    }
  } else if (e.kind === 'roi') {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const x = e.x + dx, y = e.y + dy;
      if (!inside(x, y)) continue;
      const o = at(S, x, y);
      if (!o) out.push({ x, y }); else if (enemy(o)) out.push({ x, y, cap: o.id });
    }
  } else if (e.kind === 'pion') {
    const f = e.owner === 0 ? -1 : 1;
    if (inside(e.x, e.y + f) && !at(S, e.x, e.y + f)) out.push({ x: e.x, y: e.y + f });
    for (const dx of [-1, 1]) {
      const x = e.x + dx, y = e.y + f;
      if (inside(x, y) && enemy(at(S, x, y))) out.push({ x, y, cap: at(S, x, y).id });
    }
  }
  return out;
}

function doMove(S, p, a) {
  const e = getEnt(S, a.id);
  const cap = a.cap ? getEnt(S, a.cap) : null;
  emit(S, 'move', { id: e.id, x: a.x, y: a.y, cause: 'chess', cap: cap?.id ?? null, p }, `${nm(S, p)} déplace ${KINDS[e.kind].name}.`);
  if (cap) destroy(S, cap, 'capture');
  e.x = a.x; e.y = a.y;
  if (e.kind === 'pion' && e.y === (e.owner === 0 ? 0 : N - 1)) promote(S, e);
  S.moved[p] = true;
}

// ---------------------------------------------------------------- cartes jouables

const T = {
  card: (p) => ({ t: 'card', p }), player: (p) => ({ t: 'player', p }), hand: (p) => ({ t: 'hand', p }),
  ent: (e) => ({ t: 'ent', id: e.id }), self: () => ({ t: 'self' }), cell: (c) => ({ t: 'cell', x: c.x, y: c.y }),
  grave: (i) => ({ t: 'grave', i }), miss: () => ({ t: 'miss' }),
};
export const tgtKey = (t) => `${t.t}:${t.p ?? ''}:${t.id ?? ''}:${t.i ?? ''}:${t.x ?? ''}:${t.y ?? ''}`;

export function describeTarget(S, t) {
  if (t.t === 'card') return `la carte de ${nm(S, t.p)}`;
  if (t.t === 'player') return nm(S, t.p);
  if (t.t === 'hand') return `la main de ${nm(S, t.p)}`;
  if (t.t === 'ent') { const e = getEnt(S, t.id); return e ? label(S, e) : '?'; }
  if (t.t === 'grave') return `${KINDS[S.grave[t.i]].name} (cimetière)`;
  if (t.t === 'cell') return 'l’échiquier';
  if (t.t === 'miss') return 'dans le vide';
  return '';
}

const not = (S, pred) => S.ents.filter((x) => x.kind !== 'trounoir' && pred(x));
const oppCard = (S, p) => (hasCard(S, other(p)) ? [T.card(other(p))] : []);
const oppHand = (S, p) => (P(S, other(p)).hand.length ? [T.hand(other(p))] : []);
const selfOnly = () => [T.self()];

const CARDS = {
  reine: { targets: selfOnly, apply: (S, p) => spawn(S, 'reine', p) },
  roi: { targets: selfOnly, apply: (S, p) => spawn(S, 'roi', p) },
  pion: { targets: selfOnly, apply: (S, p) => spawn(S, 'pion', p) },
  tour: { targets: selfOnly, apply: (S, p) => spawn(S, 'tour', p) },
  chat: { targets: selfOnly, apply: (S, p) => spawn(S, 'chat', p) },
  trounoir: { targets: selfOnly, apply: (S, p) => spawn(S, 'trounoir', p) },
  arbre: { targets: selfOnly, apply: (S, p) => spawn(S, 'arbre', p) },
  miroir: { targets: selfOnly, apply: (S, p) => spawn(S, 'miroir', p) },
  defib: { targets: selfOnly, apply: (S, p) => spawn(S, 'defib', p) },
  couronne: { targets: selfOnly, apply: (S, p) => spawn(S, 'couronne', p) },
  banane: { targets: selfOnly, apply: (S, p) => spawn(S, 'banane', other(p), 'card', { by: p }) },
  bombe: { targets: (S) => freeCells(S).map(T.cell), apply: (S, p, t) => spawn(S, 'bombe', p, 'card', {}, { x: t.x, y: t.y }) },
  orage: { targets: selfOnly, apply: (S, p) => setGlobal(S, p, 'orage') },
  envers: { targets: selfOnly, apply: (S, p) => setGlobal(S, p, 'envers') },

  billard: {
    available: (S) => boardEnts(S).some((e) => e.kind !== 'trounoir'),
    targets: (S) => freeCells(S).map(T.cell),
    apply(S, p, t, aim) {
      const ents = boardEnts(S).filter((e) => e.kind !== 'trounoir');
      const bodies = ents.map((e) => ({ id: e.id, x: e.x, y: e.y, r: e.kind === 'chat' ? 0.24 : 0.3, m: e.kind === 'roi' || e.kind === 'tour' ? 1.6 : 1.2 }));
      const angle = aim?.angle ?? 0, power = aim?.power ?? 0.7;
      const sim = simulateShot(bodies, { x: t.x, y: t.y }, angle, power);
      const fallenIds = sim.fallen.map((f) => f.id).filter((id) => id !== 'ball');
      const alive = ents.filter((e) => !fallenIds.includes(e.id)).map((e) => e.id);
      const snaps = snapToCells(sim.final, alive);
      emit(S, 'billiard', { p, start: { x: t.x, y: t.y }, angle, power, frames: sim.frames, fallen: sim.fallen, snaps }, `${nm(S, p)} tire au billard.`);
      for (const id of fallenIds) { const e = getEnt(S, id); if (e) destroy(S, e, 'fall'); }
      for (const id of alive) { const e = getEnt(S, id); if (e && snaps[id]) { e.x = snaps[id].x; e.y = snaps[id].y; } }
      for (const id of alive) {
        const e = getEnt(S, id);
        if (e && e.kind === 'bombe' && (sim.hits[id] || 0) > 3) explode(S, e);
      }
      if (!fallenIds.length) emit(S, 'popup', { p, word: 'RIEN NE TOMBE' });
    },
  },
  peche: {
    hostile: true,
    targets: (S, p) => [...oppCard(S, p), ...oppHand(S, p), ...not(S, (x) => x.owner !== p && hasTag(x.kind, 'peche')).map(T.ent), T.miss()],
    apply(S, p, t) {
      emit(S, 'use', { p, kind: 'peche', tgt: t }, `${nm(S, p)} lance sa ligne vers ${describeTarget(S, t)}.`);
      if (t.t === 'miss') { emit(S, 'miss', { tgt: t }, 'Ça n’a pas mordu.'); return; }
      if (t.t === 'card') {
        const c = P(S, t.p).card;
        P(S, t.p).card = null;
        P(S, p).deck.push(c);
        emit(S, 'cardGone', { p: t.p, cause: 'fish', to: p }, `${nm(S, p)} pêche le ${cardName(c)} ! Il ne compte plus et rejoint son paquet.`);
      } else if (t.t === 'hand') steal(S, t.p, p, () => true, 'fish');
      else takeEnt(S, getEnt(S, t.id), p, 'fish');
    },
  },
  flingue: {
    hostile: true,
    targets: (S, p) => [...(P(S, other(p)).dead ? [] : [T.player(other(p))]), ...oppCard(S, p), ...not(S, () => true).map(T.ent), T.miss()],
    apply(S, p, t) {
      emit(S, 'use', { p, kind: 'flingue', tgt: t }, `${nm(S, p)} tire sur ${describeTarget(S, t)} !`);
      if (t.t === 'miss') { emit(S, 'miss', { tgt: t }, 'Raté !'); return; }
      if (t.t === 'player') kill(S, t.p, 'shot');
      else if (t.t === 'card') modCard(S, t.p, -3, 'shot');
      else {
        const x = getEnt(S, t.id);
        if (x.kind === 'bombe') explode(S, x);
        else if (x.kind === 'tour') emit(S, 'ricochet', { id: x.id }, 'La balle ricoche sur la Tour.');
        else destroy(S, x, x.kind === 'miroir' ? 'broken' : 'shot');
      }
    },
  },
  briquet: {
    hostile: true,
    available: (S) => !globalOn(S, 'orage'),
    targets: (S, p) => [...oppCard(S, p), ...not(S, (x) => (x.owner !== p && hasTag(x.kind, 'feu')) || x.kind === 'bombe').map(T.ent)],
    apply(S, p, t) {
      emit(S, 'use', { p, kind: 'briquet', tgt: t }, `${nm(S, p)} met le feu à ${describeTarget(S, t)}.`);
      if (t.t === 'card') {
        const c = P(S, t.p).card;
        if (c.wet > 0) { emit(S, 'fizzle', { tgt: t }, 'Trop mouillée, elle ne brûle pas.'); return; }
        P(S, t.p).card = null;
        emit(S, 'cardGone', { p: t.p, cause: 'burn' }, `Le ${cardName(c)} part en fumée !`);
        return;
      }
      const x = getEnt(S, t.id);
      if (x.wet > 0) { emit(S, 'fizzle', { tgt: t }, 'Trop mouillé, ça ne prend pas.'); return; }
      if (x.kind === 'bombe') explode(S, x); else destroy(S, x, 'burn');
    },
  },
  seau: {
    hostile: true,
    targets: (S, p) => [...(hasCard(S, p) ? [T.card(p)] : []), ...oppCard(S, p), ...not(S, () => true).map(T.ent)],
    apply(S, p, t) {
      emit(S, 'use', { p, kind: 'seau', tgt: t }, `${nm(S, p)} renverse le Seau sur ${describeTarget(S, t)}.`);
      if (t.t === 'card') { P(S, t.p).card.wet = 3; modCard(S, t.p, -2, 'wet'); return; }
      const x = getEnt(S, t.id);
      if (x.kind === 'bombe') destroy(S, x, 'defused');
      else if (x.kind === 'chat') destroy(S, x, 'flee');
      else if (x.kind === 'banane') destroy(S, x, 'wash', false);
      else { x.wet = 3; emit(S, 'wet', { id: x.id }); if (x.kind === 'arbre') growTree(S, x, 1); }
    },
  },
  aimant: {
    hostile: true,
    targets: (S, p) => [...oppHand(S, p), ...frontEnts(S, other(p)).filter((x) => hasTag(x.kind, 'metal')).map(T.ent)],
    apply(S, p, t) {
      emit(S, 'use', { p, kind: 'aimant', tgt: t }, `L’Aimant de ${nm(S, p)} attire ${describeTarget(S, t)}.`);
      if (t.t === 'hand') steal(S, t.p, p, (c) => hasTag(c.kind, 'metal'), 'magnet');
      else takeEnt(S, getEnt(S, t.id), p, 'magnet');
    },
  },
  tronco: {
    hostile: true,
    targets: (S, p) => [...oppCard(S, p), ...not(S, (x) => x.owner !== p && hasTag(x.kind, 'feu')).map(T.ent)],
    apply(S, p, t) {
      emit(S, 'use', { p, kind: 'tronco', tgt: t }, `${nm(S, p)} démarre la Tronçonneuse sur ${describeTarget(S, t)}.`);
      if (t.t === 'card') { const c = P(S, t.p).card; modCard(S, t.p, Math.ceil(c.v / 2) - c.v, 'cut'); return; }
      const x = getEnt(S, t.id);
      if (x.kind === 'arbre' && x.stage >= 2) fruit(S, x, p, 2);
      destroy(S, x, 'cut');
    },
  },
  de: {
    available: (S, p) => hasCard(S, p),
    targets: selfOnly,
    apply(S, p) {
      const c = P(S, p).card, nv = 1 + Math.floor(R() * 14);
      emit(S, 'use', { p, kind: 'de', tgt: T.self(), roll: nv }, `${nm(S, p)} lance le Dé pipé…`);
      modCard(S, p, nv - c.v, 'dice');
    },
  },
  sablier: {
    available: (S) => !S.freeze,
    targets: selfOnly,
    apply(S, p) {
      S.freeze = { by: p, round: S.round + 1 };
      emit(S, 'use', { p, kind: 'sablier', tgt: T.self() }, `${nm(S, p)} retourne le Sablier : au prochain tour, ${nm(S, other(p))} ne joue pas.`);
    },
  },
  photocop: {
    targets: (S, p) => [...(hasCard(S, p) && hasCard(S, other(p)) ? [T.card(other(p))] : []), ...not(S, (x) => x.kind !== 'banane').map(T.ent)],
    apply(S, p, t) {
      emit(S, 'use', { p, kind: 'photocop', tgt: t }, `${nm(S, p)} photocopie ${describeTarget(S, t)}.`);
      if (t.t === 'card') {
        const src = P(S, t.p).card, mine = P(S, p).card;
        mine.r = src.r; mine.s = src.s;
        modCard(S, p, src.v - mine.v, 'copy');
      } else {
        const x = getEnt(S, t.id);
        spawn(S, x.kind, p, 'copy', x.kind === 'arbre' ? { stage: x.stage } : x.timer != null ? { timer: x.timer } : {});
      }
    },
  },
  ventilo: {
    available: (S) => boardEnts(S).some((e) => e.kind !== 'trounoir'),
    targets: selfOnly,
    apply(S, p) {
      emit(S, 'use', { p, kind: 'ventilo', tgt: T.self() }, `${nm(S, p)} allume le Ventilateur !`);
      const dy = p === 0 ? -1 : 1;
      const list = boardEnts(S).filter((x) => x.kind !== 'trounoir').sort((a, b) => (dy < 0 ? a.y - b.y : b.y - a.y));
      for (const x of list) {
        const ny = x.y + dy;
        if (ny < 0 || ny >= N) { destroy(S, x, 'wind'); continue; }
        if (at(S, x.x, ny)) continue;
        x.y = ny;
        emit(S, 'move', { id: x.id, x: x.x, y: ny, cause: 'wind' });
      }
      for (const x of S.ents) x.wet = 0;
      if (globalOn(S, 'orage')) {
        S.globals = S.globals.filter((g) => g.kind !== 'orage');
        emit(S, 'global', { kind: 'orage', on: false }, 'Le Ventilateur chasse l’Orage !');
      }
    },
  },
  engrais: {
    targets: (S, p) => [...(hasCard(S, p) ? [T.card(p)] : []), ...S.ents.filter((x) => x.owner === p && (x.kind === 'arbre' || x.kind === 'pion')).map(T.ent)],
    apply(S, p, t) {
      emit(S, 'use', { p, kind: 'engrais', tgt: t }, `${nm(S, p)} répand l’Engrais sur ${describeTarget(S, t)}.`);
      if (t.t === 'card') { modCard(S, p, 3, 'grow'); return; }
      const x = getEnt(S, t.id);
      if (x.kind === 'arbre') growTree(S, x, 2); else promote(S, x);
    },
  },
  pelle: {
    targets: (S) => {
      const out = [], seen = new Set();
      for (let i = S.grave.length - 1; i >= 0 && out.length < 3; i--) {
        if (seen.has(S.grave[i])) continue;
        seen.add(S.grave[i]); out.push(T.grave(i));
      }
      return out;
    },
    apply(S, p, t) {
      const kind = S.grave[t.i];
      emit(S, 'use', { p, kind: 'pelle', tgt: t, dig: kind }, `${nm(S, p)} creuse le cimetière…`);
      S.grave.splice(t.i, 1);
      addToHand(S, p, kind, 'grave');
    },
  },
};

function setGlobal(S, p, kind) {
  const k = KINDS[kind];
  const g = S.globals.find((x) => x.kind === kind);
  if (g) g.turns = k.turns; else S.globals.push({ kind, turns: k.turns, owner: p });
  emit(S, 'global', { kind, on: true, p }, `${k.name} : ${k.short}`);
}

function steal(S, from, to, pred, cause) {
  const pool = P(S, from).hand.filter(pred);
  if (!pool.length) { emit(S, 'miss', { tgt: T.hand(from) }, cause === 'magnet' ? 'Rien en métal dans sa main.' : 'Main vide.'); return; }
  const c = pick(pool);
  P(S, from).hand.splice(P(S, from).hand.indexOf(c), 1);
  emit(S, 'steal', { from, to, hid: c.id, kind: c.kind, cause }, `${nm(S, to)} vole ${KINDS[c.kind].name} dans la main de ${nm(S, from)} !`);
  addToHand(S, to, c.kind, 'steal');
}

function takeEnt(S, x, p, cause) {
  if (x.kind === 'banane') { destroy(S, x, 'wash', false); return; }
  x.owner = p;
  emit(S, 'owner', { id: x.id, owner: p, cause }, `${nm(S, p)} récupère ${KINDS[x.kind].name} !`);
}

export function listActions(S, p) {
  if (S.phase !== 'action' || S.turn !== p || P(S, p).dead || S.blocked[p]) return [];
  const out = [];
  for (const c of P(S, p).hand) {
    const def = CARDS[c.kind];
    if (def.available && !def.available(S, p)) continue;
    for (const t of def.targets(S, p)) out.push({ type: 'card', hid: c.id, kind: c.kind, tgt: t, key: `c${c.id}|${tgtKey(t)}` });
  }
  if (!S.moved[p]) {
    for (const e of boardEnts(S)) {
      if (e.owner !== p || !isPiece(e)) continue;
      for (const m of chessMoves(S, e)) out.push({ type: 'move', id: e.id, kind: e.kind, x: m.x, y: m.y, cap: m.cap ?? null, key: `m${e.id}|${m.x},${m.y}` });
    }
  }
  return out;
}

// ---------------------------------------------------------------- jouer

export function act(S, p, a, aim = null) {
  if (S.phase !== 'action' || S.turn !== p) return false;
  if (a) {
    const valid = listActions(S, p).find((x) => x.key === a.key);
    if (!valid) return false;
    if (valid.type === 'move') doMove(S, p, valid);
    else playCard(S, p, valid, aim);
    S.passes = [false, false];
  } else {
    emit(S, 'pass', { p }, `${nm(S, p)} passe.`);
    S.passes[p] = true;
  }
  if (S.phase !== 'action') return true;
  S.turn = other(p);
  settle(S);
  return true;
}

function playCard(S, p, a, aim) {
  const pl = P(S, p);
  const card = pl.hand.find((c) => c.id === a.hid);
  pl.hand.splice(pl.hand.indexOf(card), 1);
  const def = CARDS[card.kind];
  const k = KINDS[card.kind];
  let t = a.tgt;
  emit(S, 'play', { p, hid: card.id, kind: card.kind, tgt: t }, `${pl.name} joue ${k.name}.`);
  const placed = k.play !== 'target' && k.play !== 'self';

  const ban = owns(S, p, 'banane');
  if (ban) {
    S.ents.splice(S.ents.indexOf(ban), 1);
    if (R() < 0.5) {
      emit(S, 'slip', { p, banana: ban.id, kind: card.kind }, `${pl.name} glisse sur la Peau de banane : ${k.name} est perdu !`);
      S.grave.push(card.kind);
      if (card.kind === 'flingue') {
        const ts = def.targets(S, p).filter((x) => x.t !== 'miss');
        if (ts.length) def.apply(S, p, pick(ts));
      }
      return;
    }
    emit(S, 'dodge', { p, banana: ban.id }, `${pl.name} évite la Peau de banane.`);
  }

  if (k.hostile && ['player', 'card', 'hand'].includes(t.t) && t.p !== p) {
    const m = owns(S, t.p, 'miroir');
    if (m) {
      const nt = { ...t, p };
      const ok = (nt.t === 'player' && !pl.dead) || (nt.t === 'card' && hasCard(S, p)) || (nt.t === 'hand' && pl.hand.length);
      emit(S, 'reflect', { p: t.p, mirror: m.id, back: p }, `Le Miroir de ${nm(S, t.p)} renvoie l’attaque !`);
      destroy(S, m, 'broken');
      if (!ok) { S.grave.push(card.kind); return; }
      t = nt;
    }
  }
  if (k.hostile && t.t === 'card' && t.p !== p && owns(S, t.p, 'tour')) {
    emit(S, 'use', { p, kind: card.kind, tgt: t, blocked: true });
    emit(S, 'block', { p: t.p, tower: owns(S, t.p, 'tour').id }, `La Tour protège la carte de ${nm(S, t.p)}.`);
    S.grave.push(card.kind);
    return;
  }
  if (t.t === 'ent' && !getEnt(S, t.id)) { emit(S, 'miss', { tgt: t }); S.grave.push(card.kind); return; }
  def.apply(S, p, t, aim);
  if (!placed) S.grave.push(card.kind);
}

function canAct(S, p) {
  return !P(S, p).dead && !S.blocked[p] && listActions(S, p).length > 0;
}

// Passe automatiquement les joueurs qui ne peuvent rien faire ; résout quand les deux ont passé.
function settle(S) {
  for (let i = 0; i < 4; i++) {
    if (S.passes[0] && S.passes[1]) { resolve(S); return; }
    const p = S.turn;
    if (canAct(S, p)) { emit(S, 'actionTurn', { p }); return; }
    S.passes[p] = true;
    S.turn = other(p);
  }
  resolve(S);
}

// ---------------------------------------------------------------- pioche

export const canDraw = (S, p) => S.phase === 'draw' && S.turn === p && !S.drawn[p];

export function draw(S, p) {
  if (!canDraw(S, p)) return false;
  const pl = P(S, p);
  if (S.round >= 2 && pl.objRun < 3 && R() < OBJ_CHANCE) {
    if (!S.pool.length) {
      const all = [];
      for (const k of KIND_IDS) for (let i = 0; i < KINDS[k].weight; i++) all.push(k);
      S.pool = shuffle(all);
    }
    const kind = S.pool.pop();
    pl.objRun++;
    emit(S, 'draw', { p, obj: kind }, `${pl.name} pioche ${KINDS[kind].name}.`);
    addToHand(S, p, kind, 'draw');
    emit(S, 'drawTurn', { p, again: true });
    return true;
  }
  if (!pl.deck.length) { endGame(S, other(p), `${pl.name} n’a plus de cartes.`); return true; }
  const c = pl.deck.shift();
  c.v = c.r; c.wet = 0;
  pl.card = c;
  pl.objRun = 0;
  S.drawn[p] = true;
  emit(S, 'draw', { p, card: clone(c) }, `${pl.name} retourne ${cardName(c)}.`);
  if (!S.drawn[other(p)]) { S.turn = other(p); emit(S, 'drawTurn', { p: other(p) }); return true; }
  S.phase = 'action';
  S.turn = S.initiative;
  S.passes = [false, false];
  S.moved = [false, false];
  settle(S);
  return true;
}

// ---------------------------------------------------------------- tour de jeu

export function startRound(S) {
  S.round++;
  S.result = null;
  emit(S, 'round', { round: S.round });
  const frozen = !!(S.freeze && S.freeze.round === S.round);
  for (let p = 0; p < 2; p++) {
    const pl = P(S, p);
    if (pl.dead) {
      pl.dead = false;
      const loss = Math.min(pl.pts, DEATH_PENALTY);
      pl.pts -= loss;
      emit(S, 'revive', { p, cause: 'reincarnate', loss }, `${pl.name} se réincarne et perd ${loss} point${loss > 1 ? 's' : ''}.`);
    }
  }
  for (const e of S.ents) if (e.wet > 0 && !frozen) e.wet--;
  for (const pl of S.players) if (pl.malheur > 0) pl.malheur--;
  if (frozen) emit(S, 'frozen', { by: S.freeze.by }, `Le temps est figé : ${nm(S, other(S.freeze.by))} ne joue pas ce tour.`);
  else worldTick(S);
  if (S.phase === 'over') return;
  S.blocked = [false, false];
  if (frozen) { S.blocked[other(S.freeze.by)] = true; S.freeze = null; }
  S.phase = 'draw';
  S.drawn = [false, false];
  S.turn = S.initiative;
  for (const pl of S.players) pl.objRun = 0;
  emit(S, 'drawTurn', { p: S.turn });
}

function worldTick(S) {
  for (const g of S.globals) g.turns--;
  for (const g of S.globals.filter((x) => x.turns <= 0)) emit(S, 'global', { kind: g.kind, on: false }, `Fin de ${KINDS[g.kind].name}.`);
  S.globals = S.globals.filter((g) => g.turns > 0);
  const storm = globalOn(S, 'orage');
  for (const e of [...S.ents]) {
    if (!S.ents.includes(e)) continue;
    if (e.kind === 'arbre') growTree(S, e, storm ? 2 : 1);
    else if (e.kind === 'bombe') {
      e.timer--;
      if (e.timer <= 0) explode(S, e); else emit(S, 'tick', { id: e.id, timer: e.timer });
    } else if (e.kind === 'trounoir') {
      const near = boardEnts(S).filter((o) => o !== e && o.kind !== 'trounoir')
        .sort((a, b) => (Math.abs(a.x - e.x) + Math.abs(a.y - e.y)) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)));
      if (near.length) destroy(S, near[0], 'hole');
      e.timer--;
      emit(S, 'tick', { id: e.id, timer: e.timer });
      if (e.timer <= 0) { S.collapse = true; destroy(S, e, 'collapse', false); }
    } else if (e.kind === 'chat' && R() < 0.5) {
      const c = boardEnts(S).filter((o) => o !== e && o.kind !== 'trounoir' && edgeDist(o) === 0);
      if (c.length) { const v = pick(c); emit(S, 'catPush', { id: e.id, target: v.id }); destroy(S, v, 'cat'); }
    }
  }
  if (storm) {
    const metal = (p) => frontEnts(S, p).filter((x) => hasTag(x.kind, 'metal')).length + P(S, p).hand.filter((c) => hasTag(c.kind, 'metal')).length;
    const m = [metal(0), metal(1)];
    if (Math.max(...m) > 0) {
      const struck = m[0] > m[1] ? 0 : m[1] > m[0] ? 1 : pick([0, 1]);
      emit(S, 'lightning', { p: struck }, `La foudre frappe ${nm(S, struck)}, qui porte du métal !`);
      kill(S, struck, 'lightning');
    }
  }
}

function resolve(S) {
  S.turn = null;
  emit(S, 'resolve', {});
  const o = outlook(S);
  const cards = [P(S, 0).card, P(S, 1).card].filter(Boolean);
  const res = { round: S.round, kind: o.kind, winner: o.winner, v: o.v || [cardValue(S, 0), cardValue(S, 1)], gain: 0 };
  if (o.kind !== 'void' && o.winner != null) res.gain = 1 + S.potTies;
  emit(S, 'result', { res: clone(res) });
  if (o.kind === 'void') {
    S.collapse = false;
    emit(S, 'void', {}, 'Le trou noir avale les deux cartes. Personne ne gagne ce pli.');
  } else if (o.winner == null) {
    S.pot.push(...cards);
    S.potTies++;
    emit(S, 'bataille', { ties: S.potTies }, `BATAILLE ! Le prochain pli rapporte ${S.potTies + 1} points.`);
  } else {
    const w = o.winner;
    P(S, w).deck.push(...shuffle([...cards, ...S.pot]));
    S.pot = []; S.potTies = 0;
    P(S, w).pts += res.gain;
    emit(S, 'pts', { p: w, delta: res.gain, cause: 'win', total: P(S, w).pts }, `${nm(S, w)} gagne le pli : +${res.gain}.`);
  }
  for (const pl of S.players) pl.card = null;
  S.result = res;
  S.phase = 'result';
  const best = [0, 1].filter((p) => P(S, p).pts >= S.target);
  if (best.length) {
    const w = best.length === 2 ? (P(S, 0).pts >= P(S, 1).pts ? 0 : 1) : best[0];
    endGame(S, w, `${nm(S, w)} atteint ${S.target} points !`);
  }
}

function endGame(S, w, why) {
  S.phase = 'over';
  S.winner = w;
  emit(S, 'over', { winner: w }, why);
}

export function nextRound(S) {
  if (S.phase !== 'result' && S.phase !== 'idle') return false;
  if (S.phase === 'result') S.initiative = other(S.initiative);
  startRound(S);
  return true;
}
