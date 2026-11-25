// Moteur de règles de What a Card. Logique pure, sans affichage.
// Chaque opération remplit S.ev d'événements que la vue 3D rejoue en animations.
import { KINDS, KIND_IDS, hasTag } from './kinds.js';

export const N = 5; // échiquier 5 x 5
export const DEATH_PENALTY = 2;
export const MATE_PENALTY = 2;
export const BOMB_PENALTY = 1;
export const MAX_ITEMS = 6; // objets max devant chaque joueur
export const SUITS = ['pique', 'coeur', 'carreau', 'trefle'];

let R = Math.random;
export const setRandom = (fn) => { R = fn; };
const pick = (a) => a[Math.floor(R() * a.length)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const other = (p) => 1 - p;
export const clone = (o) => JSON.parse(JSON.stringify(o));

export const rankLabel = (v) => (v === 11 ? 'V' : v === 12 ? 'D' : v === 13 ? 'R' : v === 14 ? 'A' : String(v));
const RANK_WORD = { 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
const SUIT_WORD = { pique: 'pique', coeur: 'cœur', carreau: 'carreau', trefle: 'trèfle' };
export const cardName = (c) => `${RANK_WORD[c.v] || c.v} de ${SUIT_WORD[c.s]}`;
export const kindName = (k) => KINDS[k].name;

// ---------------------------------------------------------------- création

export function newGame({ names = ['Toi', 'Le Bot'], target = 20 } = {}) {
  const deck = [];
  let id = 1;
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({ id: id++, r, s });
  shuffle(deck);
  return {
    round: 0, phase: 'idle', target,
    players: names.map((name, i) => ({
      name, deck: deck.slice(i * 26, (i + 1) * 26), pts: 0, dead: false,
      card: null, chaos: null, bonusChaos: [], malheur: 0,
    })),
    ents: [], globals: [], pot: [], potTies: 0, grave: [], chaosDeck: [],
    nextId: 1000, cardId: id, initiative: 0, turn: null,
    acted: [false, false], blocked: [false, false], freeze: null, collapse: false,
    result: null, winner: null, ev: [], log: [], logId: 0,
  };
}

// ---------------------------------------------------------------- utilitaires

function emit(S, type, data = {}, text = null) {
  const e = { type, ...data };
  if (text) {
    e.text = text;
    S.log.push({ id: ++S.logId, r: S.round, text });
    if (S.log.length > 120) S.log.shift();
  }
  S.ev.push(e);
}
export const drainEvents = (S) => { const e = S.ev; S.ev = []; return e; };

const P = (S, p) => S.players[p];
const nm = (S, p) => S.players[p].name;
export const getEnt = (S, id) => S.ents.find((e) => e.id === id);
const boardEnts = (S) => S.ents.filter((e) => e.zone === 'board');
const sideEnts = (S, p) => S.ents.filter((e) => e.zone === 'side' && e.owner === p);
const owns = (S, p, kind) => S.ents.find((e) => e.owner === p && e.kind === kind);
export const globalOn = (S, kind) => S.globals.some((g) => g.kind === kind);
const edgeDist = (e) => Math.min(e.x, e.y, N - 1 - e.x, N - 1 - e.y);
export const hasCard = (S, p) => !!P(S, p).card && !P(S, p).dead;
const entLabel = (S, e) => `${KINDS[e.kind].name} (${nm(S, e.owner)})`;

function freeCell(S, owner, center = false) {
  const occ = new Set(boardEnts(S).map((e) => e.x + ',' + e.y));
  if (center && !occ.has('2,2')) return { x: 2, y: 2 };
  const all = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!occ.has(x + ',' + y)) all.push({ x, y });
  if (!all.length) return null;
  const half = all.filter((c) => (owner === 0 ? c.y >= 3 : c.y <= 1));
  const mid = all.filter((c) => (owner === 0 ? c.y >= 2 : c.y <= 2));
  return pick(half.length ? half : mid.length ? mid : all);
}

function makeEnt(S, kind, owner, extra = {}) {
  const k = KINDS[kind];
  const e = { id: S.nextId++, kind, owner, zone: k.zone, wet: 0, cd: 0 };
  if (k.uses) e.uses = k.uses;
  if (k.timer) e.timer = k.timer;
  if (kind === 'arbre') e.stage = 0;
  if (kind === 'pion') e.age = 0;
  return Object.assign(e, extra);
}

// Fait apparaître un objet. source : 'chaos' | 'copy' | 'dig' | 'promote'
function spawn(S, kind, owner, source = 'chaos', extra = {}) {
  const e = makeEnt(S, kind, owner, extra);
  if (e.zone === 'board') {
    const c = freeCell(S, owner, kind === 'trounoir');
    if (!c) { emit(S, 'popup', { p: owner, word: 'PLATEAU PLEIN' }, `${KINDS[kind].name} : plus de place sur l’échiquier.`); return null; }
    e.x = c.x; e.y = c.y;
  } else if (e.zone === 'side') {
    const mine = sideEnts(S, owner).filter((x) => x.kind !== 'banane');
    if (kind !== 'banane' && mine.length >= MAX_ITEMS) destroy(S, mine[0], 'overflow');
  }
  S.ents.push(e);
  emit(S, 'spawn', { ent: clone(e), source, p: owner }, `${KINDS[kind].name} apparaît chez ${nm(S, owner)}.`);
  return e;
}

const CAUSE_TEXT = {
  capture: 'se fait capturer par la Reine', fall: 'tombe de la table', shot: 'se fait tirer dessus',
  burn: 'part en fumée', blast: 'est soufflé par l’explosion', cut: 'se fait découper', hole: 'disparaît dans le trou noir',
  cat: 'se fait pousser par le chat', wind: 's’envole avec le vent', wash: 'est emporté par l’eau', spent: 'est épuisé',
  slip: 'glisse et se casse', defused: 'est désamorcé', flee: 's’enfuit, trempé', short: 'court-circuite', revive: 'se décharge',
  collapse: 's’effondre', broken: 'se brise', harvest: 'a donné tous ses fruits', overflow: 'part au cimetière (6 objets max)',
};

function destroy(S, e, cause, toGrave = true) {
  const i = S.ents.indexOf(e);
  if (i < 0) return;
  S.ents.splice(i, 1);
  emit(S, 'destroy', { id: e.id, kind: e.kind, owner: e.owner, cause }, `${entLabel(S, e)} ${CAUSE_TEXT[cause] || 'disparaît'}.`);
  if (toGrave && e.kind !== 'trounoir' && e.kind !== 'banane') S.grave.push({ kind: e.kind, owner: e.owner });
  if (e.kind === 'roi') {
    losePts(S, e.owner, MATE_PENALTY, 'mate', `Échec et mat ! ${nm(S, e.owner)} perd ${MATE_PENALTY} points.`);
  }
  if (e.kind === 'miroir') {
    P(S, e.owner).malheur = 3;
    emit(S, 'malheur', { p: e.owner }, `Miroir brisé : ${nm(S, e.owner)} a 3 tours de malheur (−1).`);
  }
}

function makeRoom(S, p, incoming) {
  if (incoming.zone !== 'side') return;
  const mine = sideEnts(S, p).filter((x) => x.kind !== 'banane');
  if (mine.length >= MAX_ITEMS) destroy(S, mine[0], 'overflow');
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
    if (d.wet > 0) {
      destroy(S, d, 'short');
    } else {
      emit(S, 'kill', { p, cause, saved: true }, `${pl.name} est touché…`);
      destroy(S, d, 'revive');
      emit(S, 'revive', { p, cause: 'defib' }, `Le Défibrillateur ramène ${pl.name} à la vie !`);
      return;
    }
  }
  pl.dead = true;
  emit(S, 'kill', { p, cause }, `${pl.name} est mort. Sa carte ne compte pas ce tour, et ${DEATH_PENALTY} points de moins à sa réincarnation.`);
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

function engraisBlast(S, e) {
  const owner = e.owner;
  destroy(S, e, 'burn');
  emit(S, 'explode', { id: e.id, side: owner, owner }, `L’Engrais explose chez ${nm(S, owner)} !`);
  for (const o of sideEnts(S, owner)) if (o.kind !== 'banane') destroy(S, o, 'blast');
}

function growTree(S, e, n) {
  e.stage = Math.min(3, e.stage + n);
  emit(S, 'grow', { id: e.id, stage: e.stage }, `L’Arbre de ${nm(S, e.owner)} pousse (${e.stage}/3).`);
  if (e.stage >= 3) { fruit(S, e, e.owner, 3); destroy(S, e, 'harvest'); }
}

function strongCard(S) {
  return { id: S.cardId++, r: 11 + Math.floor(R() * 4), s: pick(SUITS), gold: true };
}

function fruit(S, tree, to, n) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(strongCard(S));
  P(S, to).deck.unshift(...cards);
  emit(S, 'fruit', { id: tree.id, p: to, cards: clone(cards) }, `${nm(S, to)} récolte ${n} cartes fortes !`);
}

function promote(S, e) {
  e.kind = 'reine';
  e.cd = 0;
  emit(S, 'promote', { id: e.id }, `Le Pion de ${nm(S, e.owner)} devient une Reine !`);
}

// ---------------------------------------------------------------- valeurs

export function cardValue(S, p) {
  const pl = P(S, p);
  if (!pl.card || pl.dead) return null;
  let v = pl.card.v;
  v += boardEnts(S).filter((e) => e.kind === 'roi' && e.owner === p).length;
  if (pl.malheur > 0) v -= 1;
  return Math.max(1, v);
}

// Qui gagnerait si on résolvait maintenant (sans les effets chaos en attente).
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
  const w = (a > b) !== low ? 0 : 1;
  return { winner: w, kind: low ? 'envers' : 'win', v: [a, b] };
}

// ---------------------------------------------------------------- cibles

const T = {
  card: (p) => ({ t: 'card', p }),
  chaos: (p) => ({ t: 'chaos', p }),
  player: (p) => ({ t: 'player', p }),
  ent: (e) => ({ t: 'ent', id: e.id }),
  self: () => ({ t: 'self' }),
  grave: (i) => ({ t: 'grave', i }),
};
export const tgtKey = (t) => `${t.t}:${t.p ?? ''}:${t.id ?? ''}:${t.i ?? ''}`;

export function describeTarget(S, t) {
  if (t.t === 'card') return `Carte de ${nm(S, t.p)} (${cardName(P(S, t.p).card)})`;
  if (t.t === 'chaos') return `Carte chaos de ${nm(S, t.p)} (${KINDS[P(S, t.p).chaos].name})`;
  if (t.t === 'player') return nm(S, t.p);
  if (t.t === 'ent') { const e = getEnt(S, t.id); return e ? entLabel(S, e) : '?'; }
  if (t.t === 'grave') return `${KINDS[S.grave[t.i].kind].name} (cimetière)`;
  return '';
}

const others = (S, p, e, pred) => S.ents.filter((x) => x !== e && x.kind !== 'trounoir' && pred(x));
const oppCard = (S, p) => (hasCard(S, other(p)) ? [T.card(other(p))] : []);
const oppChaos = (S, p) => (P(S, other(p)).chaos ? [T.chaos(other(p))] : []);

const ACTIONS = {
  reine: {
    label: 'Capturer',
    targets: (S, p) => boardEnts(S).filter((x) => x.owner !== p && hasTag(x.kind, 'piece')).map(T.ent),
    apply(S, p, e, t) {
      const x = getEnt(S, t.id);
      emit(S, 'use', { p, id: e.id, kind: 'reine', tgt: t }, `La Reine de ${nm(S, p)} attaque ${entLabel(S, x)}.`);
      const pos = { x: x.x, y: x.y };
      destroy(S, x, 'capture');
      e.x = pos.x; e.y = pos.y;
      emit(S, 'move', { id: e.id, x: e.x, y: e.y, cause: 'queen' });
    },
  },
  billard: {
    label: 'Frapper',
    targets: (S, p, e) => others(S, p, e, (x) => x.zone === 'board').map(T.ent),
    apply(S, p, e, t) {
      const x = getEnt(S, t.id);
      const chance = [0.8, 0.5, 0.3][edgeDist(x)];
      const ok = R() < chance;
      emit(S, 'use', { p, id: e.id, kind: 'billard', tgt: t, ok }, `${nm(S, p)} vise ${entLabel(S, x)} au billard.`);
      if (ok) {
        if (x.kind === 'chat') destroy(S, x, 'flee');
        else destroy(S, x, 'fall');
      } else {
        const occ = new Set(boardEnts(S).map((o) => o.x + ',' + o.y));
        const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        let moved = false;
        for (const [dx, dy] of dirs) {
          const nx = x.x + dx, ny = x.y + dy;
          if (nx >= 0 && ny >= 0 && nx < N && ny < N && !occ.has(nx + ',' + ny)) {
            x.x = nx; x.y = ny; moved = true;
            emit(S, 'move', { id: x.id, x: nx, y: ny, cause: 'push' }, `Raté ! ${KINDS[x.kind].name} glisse d’une case.`);
            break;
          }
        }
        if (!moved) emit(S, 'miss', { id: x.id }, 'Raté !');
      }
    },
  },
  peche: {
    label: 'Pêcher', hostile: true,
    targets: (S, p, e) => [...oppCard(S, p), ...oppChaos(S, p),
      ...others(S, p, e, (x) => x.owner !== p && hasTag(x.kind, 'peche')).map(T.ent)],
    apply(S, p, e, t) {
      const ok = R() < 0.65;
      emit(S, 'use', { p, id: e.id, kind: 'peche', tgt: t, ok }, `${nm(S, p)} lance sa ligne vers ${describeTarget(S, t)}.`);
      if (!ok) { emit(S, 'miss', { tgt: t }, 'Ça n’a pas mordu.'); return; }
      if (t.t === 'card') {
        const c = P(S, t.p).card;
        P(S, t.p).card = null;
        P(S, p).deck.push(c);
        emit(S, 'cardGone', { p: t.p, cause: 'fish', to: p }, `${nm(S, p)} pêche le ${cardName(c)} ! Il ne compte pas et rejoint son paquet.`);
      } else if (t.t === 'chaos') {
        const k = P(S, t.p).chaos;
        P(S, t.p).chaos = null;
        P(S, p).bonusChaos.push(k);
        emit(S, 'chaosGone', { p: t.p, cause: 'fish', to: p, kind: k }, `${nm(S, p)} pêche la carte ${KINDS[k].name} : effet annulé, elle sera à lui au prochain tour.`);
      } else {
        const x = getEnt(S, t.id);
        makeRoom(S, p, x);
        x.owner = p;
        emit(S, 'owner', { id: x.id, owner: p, cause: 'fish' }, `${nm(S, p)} pêche ${KINDS[x.kind].name} !`);
      }
    },
  },
  flingue: {
    label: 'Tirer', hostile: true,
    targets: (S, p, e) => [
      ...(P(S, other(p)).dead ? [] : [T.player(other(p))]), ...oppCard(S, p),
      ...others(S, p, e, (x) => true).map(T.ent)],
    apply(S, p, e, t) {
      if (e.wet > 0) {
        e.wet = 0;
        emit(S, 'jam', { p, id: e.id }, `Le Flingue de ${nm(S, p)} est mouillé : il s’enraye !`);
        return 'nouse';
      }
      emit(S, 'use', { p, id: e.id, kind: 'flingue', tgt: t }, `${nm(S, p)} tire sur ${describeTarget(S, t)} !`);
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
    label: 'Brûler', hostile: true,
    available: (S, p, e) => !globalOn(S, 'orage') && e.wet === 0,
    targets: (S, p, e) => [...oppCard(S, p), ...oppChaos(S, p),
      ...others(S, p, e, (x) => x.owner !== p && (hasTag(x.kind, 'feu') || x.kind === 'bombe')).map(T.ent),
      ...others(S, p, e, (x) => x.owner === p && x.kind === 'bombe').map(T.ent)],
    apply(S, p, e, t) {
      emit(S, 'use', { p, id: e.id, kind: 'briquet', tgt: t }, `${nm(S, p)} met le feu à ${describeTarget(S, t)}.`);
      if (t.t === 'card') {
        const c = P(S, t.p).card;
        if (c.wet > 0) { emit(S, 'fizzle', { tgt: t }, 'Trop mouillée, elle ne brûle pas.'); return; }
        P(S, t.p).card = null;
        emit(S, 'cardGone', { p: t.p, cause: 'burn' }, `Le ${cardName(c)} part en fumée !`);
      } else if (t.t === 'chaos') {
        const k = P(S, t.p).chaos;
        P(S, t.p).chaos = null;
        emit(S, 'chaosGone', { p: t.p, cause: 'burn', kind: k }, `La carte ${KINDS[k].name} brûle : effet annulé.`);
      } else {
        const x = getEnt(S, t.id);
        if (x.wet > 0) { emit(S, 'fizzle', { tgt: t }, 'Trop mouillé, ça ne prend pas.'); return; }
        if (x.kind === 'bombe') explode(S, x);
        else if (x.kind === 'engrais') engraisBlast(S, x);
        else destroy(S, x, 'burn');
      }
    },
  },
  seau: {
    label: 'Arroser', hostile: true,
    targets: (S, p, e) => [...(hasCard(S, p) ? [T.card(p)] : []), ...oppCard(S, p), ...others(S, p, e, () => true).map(T.ent)],
    apply(S, p, e, t) {
      emit(S, 'use', { p, id: e.id, kind: 'seau', tgt: t }, `${nm(S, p)} renverse le Seau sur ${describeTarget(S, t)}.`);
      if (t.t === 'card') {
        P(S, t.p).card.wet = 3;
        modCard(S, t.p, -2, 'wet');
        return;
      }
      const x = getEnt(S, t.id);
      if (x.kind === 'bombe') destroy(S, x, 'defused');
      else if (x.kind === 'chat') destroy(S, x, 'flee');
      else if (x.kind === 'banane') destroy(S, x, 'wash', false);
      else {
        x.wet = 3;
        emit(S, 'wet', { id: x.id });
        if (x.kind === 'arbre') growTree(S, x, 1);
      }
    },
  },
  aimant: {
    label: 'Attirer', hostile: true,
    targets: (S, p) => sideEnts(S, other(p)).filter((x) => hasTag(x.kind, 'metal')).map(T.ent),
    apply(S, p, e, t) {
      const x = getEnt(S, t.id);
      emit(S, 'use', { p, id: e.id, kind: 'aimant', tgt: t }, `L’Aimant de ${nm(S, p)} attire ${entLabel(S, x)}.`);
      makeRoom(S, p, x);
      x.owner = p;
      emit(S, 'owner', { id: x.id, owner: p, cause: 'magnet' });
    },
  },
  tronco: {
    label: 'Découper', hostile: true,
    targets: (S, p, e) => [...oppCard(S, p), ...others(S, p, e, (x) => x.owner !== p && hasTag(x.kind, 'feu')).map(T.ent)],
    apply(S, p, e, t) {
      emit(S, 'use', { p, id: e.id, kind: 'tronco', tgt: t }, `${nm(S, p)} démarre la Tronçonneuse sur ${describeTarget(S, t)}.`);
      if (t.t === 'card') {
        const c = P(S, t.p).card;
        modCard(S, t.p, Math.floor(c.v / 2) - c.v, 'cut');
        return;
      }
      const x = getEnt(S, t.id);
      if (x.kind === 'arbre' && x.stage >= 2) fruit(S, x, p, 2);
      if (x.kind === 'engrais') { engraisBlast(S, x); return; }
      destroy(S, x, 'cut');
    },
  },
  de: {
    label: 'Lancer',
    available: (S, p) => hasCard(S, p),
    targets: () => [T.self()],
    apply(S, p, e) {
      const c = P(S, p).card;
      const nv = 1 + Math.floor(R() * 14);
      emit(S, 'use', { p, id: e.id, kind: 'de', tgt: T.self(), roll: nv }, `${nm(S, p)} lance le Dé pipé…`);
      modCard(S, p, nv - c.v, 'dice');
    },
  },
  sablier: {
    label: 'Arrêter le temps',
    available: (S) => !S.freeze,
    targets: () => [T.self()],
    apply(S, p, e) {
      S.freeze = { by: p, round: S.round + 1 };
      emit(S, 'use', { p, id: e.id, kind: 'sablier', tgt: T.self() }, `${nm(S, p)} retourne le Sablier : le prochain tour sera figé.`);
    },
  },
  photocop: {
    label: 'Photocopier',
    targets: (S, p, e) => [
      ...(hasCard(S, p) && hasCard(S, other(p)) ? [T.card(other(p))] : []), ...oppChaos(S, p),
      ...others(S, p, e, (x) => x.kind !== 'banane').map(T.ent)],
    apply(S, p, e, t) {
      emit(S, 'use', { p, id: e.id, kind: 'photocop', tgt: t }, `${nm(S, p)} photocopie ${describeTarget(S, t)}.`);
      if (t.t === 'card') {
        const src = P(S, t.p).card, mine = P(S, p).card;
        mine.r = src.r; mine.s = src.s;
        modCard(S, p, src.v - mine.v, 'copy');
      } else if (t.t === 'chaos') {
        triggerChaos(S, p, P(S, t.p).chaos, 'copy');
      } else {
        const x = getEnt(S, t.id);
        const extra = {};
        if (x.kind === 'arbre') extra.stage = x.stage;
        if (x.kind === 'pion') extra.age = x.age;
        if (x.uses != null) extra.uses = x.uses;
        if (x.timer != null) extra.timer = x.timer;
        if (x.kind === 'banane') return;
        spawn(S, x.kind, p, 'copy', extra);
      }
    },
  },
  ventilo: {
    label: 'Souffler',
    targets: () => [T.self()],
    apply(S, p, e) {
      emit(S, 'use', { p, id: e.id, kind: 'ventilo', tgt: T.self() }, `${nm(S, p)} allume le Ventilateur !`);
      const dy = p === 0 ? -1 : 1;
      const list = boardEnts(S).filter((x) => x.kind !== 'trounoir').sort((a, b) => (dy < 0 ? a.y - b.y : b.y - a.y));
      for (const x of list) {
        const ny = x.y + dy;
        if (ny < 0 || ny >= N) { destroy(S, x, 'wind'); continue; }
        if (S.ents.some((o) => o.zone === 'board' && o.x === x.x && o.y === ny)) continue;
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
    label: 'Fertiliser',
    targets: (S, p, e) => [...(hasCard(S, p) ? [T.card(p)] : []),
      ...S.ents.filter((x) => x.owner === p && (x.kind === 'arbre' || x.kind === 'pion')).map(T.ent)],
    apply(S, p, e, t) {
      emit(S, 'use', { p, id: e.id, kind: 'engrais', tgt: t }, `${nm(S, p)} répand l’Engrais sur ${describeTarget(S, t)}.`);
      if (t.t === 'card') { modCard(S, p, 3, 'grow'); return; }
      const x = getEnt(S, t.id);
      if (x.kind === 'arbre') growTree(S, x, 2);
      else promote(S, x);
    },
  },
  pelle: {
    label: 'Creuser',
    targets: (S) => {
      const out = [], seen = new Set();
      for (let i = S.grave.length - 1; i >= 0 && out.length < 4; i--) {
        if (seen.has(S.grave[i].kind)) continue;
        seen.add(S.grave[i].kind);
        out.push(T.grave(i));
      }
      return out;
    },
    apply(S, p, e, t) {
      const g = S.grave[t.i];
      emit(S, 'use', { p, id: e.id, kind: 'pelle', tgt: t, dig: g.kind }, `${nm(S, p)} creuse le cimetière…`);
      S.grave.splice(t.i, 1);
      spawn(S, g.kind, p, 'dig');
    },
  },
};

function modCard(S, p, delta, cause) {
  const c = P(S, p).card;
  if (!c) return;
  const from = c.v;
  c.v = Math.max(1, c.v + delta);
  emit(S, 'cardMod', { p, from, to: c.v, cause, card: clone(c) }, `${nm(S, p)} : carte ${from} → ${c.v}.`);
}

// ---------------------------------------------------------------- actions

export function listActions(S, p) {
  if (S.phase !== 'action' || P(S, p).dead || S.blocked[p] || S.acted[p]) return [];
  const out = [];
  for (const e of S.ents) {
    if (e.owner !== p) continue;
    const def = ACTIONS[e.kind];
    if (!def) continue;
    if (e.zone === 'side' || e.kind === 'reine') {
      if (e.cd > 0) continue;
      if (e.uses != null && e.uses <= 0) continue;
      if (def.available && !def.available(S, p, e)) continue;
      for (const t of def.targets(S, p, e)) out.push({ id: e.id, kind: e.kind, label: def.label, tgt: t, key: e.id + '|' + tgtKey(t) });
    }
  }
  return out;
}
export const actionLabel = (kind) => ACTIONS[kind]?.label;
export const isActive = (kind) => !!ACTIONS[kind];

// Joue une action (a = élément de listActions) ou passe (a = null) pour le joueur p.
export function act(S, p, a) {
  if (S.phase !== 'action' || S.turn !== p) return false;
  if (a) {
    const valid = listActions(S, p).find((x) => x.key === a.key);
    if (!valid) return false;
    doAction(S, p, valid);
  } else {
    emit(S, 'pass', { p }, `${nm(S, p)} passe.`);
  }
  S.acted[p] = true;
  advanceTurn(S);
  return true;
}

function doAction(S, p, a) {
  const e = getEnt(S, a.id);
  const def = ACTIONS[e.kind];
  let t = a.tgt;

  // Peau de banane
  const ban = owns(S, p, 'banane');
  if (ban) {
    S.ents.splice(S.ents.indexOf(ban), 1);
    if (R() < 0.5) {
      emit(S, 'slip', { p, id: e.id, banana: ban.id }, `${nm(S, p)} glisse sur la Peau de banane !`);
      if (e.kind === 'flingue') {
        const ts = def.targets(S, p, e);
        if (ts.length) def.apply(S, p, e, pick(ts));
        consume(S, e, def);
      } else if (e.kind === 'reine') {
        destroy(S, e, 'fall');
      } else {
        destroy(S, e, 'slip');
      }
      return;
    }
    emit(S, 'dodge', { p, banana: ban.id }, `${nm(S, p)} évite la Peau de banane de justesse.`);
  }

  // Miroir : renvoie l'attaque
  if (def.hostile && (t.t === 'player' || t.t === 'card' || t.t === 'chaos') && t.p !== p) {
    const m = owns(S, t.p, 'miroir');
    if (m) {
      const nt = { ...t, p };
      const valid = (nt.t === 'player' && !P(S, p).dead) || (nt.t === 'card' && hasCard(S, p)) || (nt.t === 'chaos' && P(S, p).chaos);
      emit(S, 'reflect', { p: t.p, mirror: m.id, back: p }, `Le Miroir de ${nm(S, t.p)} renvoie l’attaque !`);
      destroy(S, m, 'broken');
      if (!valid) { consume(S, e, def); return; }
      t = nt;
    }
  }

  // Tour : protège la carte de bataille
  if (def.hostile && t.t === 'card' && t.p !== p && owns(S, t.p, 'tour')) {
    emit(S, 'use', { p, id: e.id, kind: e.kind, tgt: t, blocked: true });
    emit(S, 'block', { p: t.p, tower: owns(S, t.p, 'tour').id }, `La Tour protège la carte de ${nm(S, t.p)}.`);
    consume(S, e, def);
    return;
  }

  if (t.t === 'ent' && !getEnt(S, t.id)) { emit(S, 'miss', { tgt: t }); consume(S, e, def); return; }
  const r = def.apply(S, p, e, t);
  if (r !== 'nouse') consume(S, e, def);
}

function consume(S, e, def) {
  if (!S.ents.includes(e)) return;
  if (KINDS[e.kind].cd) e.cd = KINDS[e.kind].cd;
  if (e.uses != null) {
    e.uses--;
    emit(S, 'uses', { id: e.id, uses: e.uses });
    if (e.uses <= 0) destroy(S, e, 'spent');
  }
}

function canAct(S, p) {
  return !S.acted[p] && !S.blocked[p] && !P(S, p).dead && listActions(S, p).length > 0;
}

function advanceTurn(S) {
  for (const p of [S.initiative, other(S.initiative)]) {
    if (S.acted[p]) continue;
    if (canAct(S, p)) { S.turn = p; emit(S, 'turn', { p }); return; }
    S.acted[p] = true;
  }
  S.turn = null;
  resolve(S);
}

// ---------------------------------------------------------------- chaos

function drawChaos(S, p) {
  const pl = P(S, p);
  if (pl.bonusChaos.length) return pl.bonusChaos.shift();
  if (!S.chaosDeck.length) {
    const pool = [];
    for (const k of KIND_IDS) for (let i = 0; i < KINDS[k].weight; i++) pool.push(k);
    S.chaosDeck = shuffle(pool);
  }
  return S.chaosDeck.pop();
}

function triggerChaos(S, p, kind, source = 'chaos') {
  const k = KINDS[kind];
  emit(S, 'chaosFire', { p, kind, source }, `${nm(S, p)} active ${k.name} !`);
  if (k.zone === 'global') {
    const g = S.globals.find((x) => x.kind === kind);
    if (g) g.turns = k.turns;
    else S.globals.push({ kind, turns: k.turns, owner: p });
    emit(S, 'global', { kind, on: true, p }, k.desc);
    return;
  }
  if (kind === 'banane') { spawn(S, 'banane', other(p), source, { by: p }); return; }
  spawn(S, kind, p, source);
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
  for (const e of S.ents) { if (e.cd > 0) e.cd--; if (e.wet > 0 && !frozen) e.wet--; }
  for (const pl of S.players) if (pl.malheur > 0) pl.malheur--;

  if (frozen) emit(S, 'frozen', { by: S.freeze.by }, 'Le temps est figé : rien ne bouge ce tour.');
  else worldTick(S);
  if (S.phase === 'over') return;

  for (let p = 0; p < 2; p++) {
    if (!P(S, p).deck.length) { endGame(S, other(p), `${nm(S, p)} n’a plus de cartes.`); return; }
  }
  for (let p = 0; p < 2; p++) {
    const pl = P(S, p);
    const c = pl.deck.shift();
    c.v = c.r; c.wet = 0;
    pl.card = c;
    emit(S, 'reveal', { p, card: clone(c) });
  }
  for (let p = 0; p < 2; p++) {
    const pl = P(S, p);
    pl.chaos = S.round >= 2 ? drawChaos(S, p) : null;
    if (pl.chaos) emit(S, 'chaosReveal', { p, kind: pl.chaos }, `${pl.name} retourne ${KINDS[pl.chaos].name}.`);
  }
  S.phase = 'action';
  S.acted = [false, false];
  S.blocked = [false, false];
  if (frozen) { S.blocked[other(S.freeze.by)] = true; S.freeze = null; }
  advanceTurn(S);
}

function worldTick(S) {
  for (const g of S.globals) g.turns--;
  for (const g of S.globals.filter((x) => x.turns <= 0)) emit(S, 'global', { kind: g.kind, on: false }, `Fin de ${KINDS[g.kind].name}.`);
  S.globals = S.globals.filter((g) => g.turns > 0);
  const storm = globalOn(S, 'orage');

  for (const e of [...S.ents]) {
    if (!S.ents.includes(e)) continue;
    if (e.kind === 'arbre') growTree(S, e, storm ? 2 : 1);
    else if (e.kind === 'pion') { e.age++; if (e.age >= 3) promote(S, e); }
    else if (e.kind === 'bombe') {
      e.timer--;
      if (e.timer <= 0) explode(S, e);
      else emit(S, 'tick', { id: e.id, timer: e.timer });
    } else if (e.kind === 'trounoir') {
      const near = boardEnts(S).filter((o) => o !== e && o.kind !== 'trounoir')
        .sort((a, b) => (Math.abs(a.x - e.x) + Math.abs(a.y - e.y)) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)));
      if (near.length) { emit(S, 'suck', { id: e.id, target: near[0].id }); destroy(S, near[0], 'hole'); }
      e.timer--;
      emit(S, 'tick', { id: e.id, timer: e.timer });
      if (e.timer <= 0) {
        S.collapse = true;
        destroy(S, e, 'collapse', false);
      }
    } else if (e.kind === 'chat') {
      if (R() < 0.5) {
        const c = boardEnts(S).filter((o) => o !== e && o.kind !== 'trounoir' && edgeDist(o) === 0);
        if (c.length) {
          const v = pick(c);
          emit(S, 'catPush', { id: e.id, target: v.id });
          destroy(S, v, 'cat');
        }
      }
    }
  }
  if (storm) {
    const m = [0, 1].map((p) => sideEnts(S, p).filter((x) => hasTag(x.kind, 'metal')).length);
    if (Math.max(...m) > 0) {
      const struck = m[0] > m[1] ? 0 : m[1] > m[0] ? 1 : pick([0, 1]);
      emit(S, 'lightning', { p: struck }, `La foudre frappe ${nm(S, struck)} (${m[struck]} objet${m[struck] > 1 ? 's' : ''} en métal) !`);
      kill(S, struck, 'lightning');
    }
  }
}

function resolve(S) {
  emit(S, 'resolve', {});
  for (const p of [S.initiative, other(S.initiative)]) {
    const pl = P(S, p);
    if (pl.chaos) {
      const k = pl.chaos;
      pl.chaos = null;
      if (!pl.dead) triggerChaos(S, p, k);
      else emit(S, 'chaosGone', { p, cause: 'dead', kind: k }, `${pl.name} est mort : ${KINDS[k].name} ne s’active pas.`);
    }
  }
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
    const won = shuffle([...cards, ...S.pot]);
    P(S, w).deck.push(...won);
    S.pot = []; S.potTies = 0;
    P(S, w).pts += res.gain;
    const why = o.kind === 'crown' ? ' grâce à la Couronne' : o.kind === 'envers' ? ' (monde à l’envers)' : '';
    emit(S, 'pts', { p: w, delta: res.gain, cause: 'win', total: P(S, w).pts }, `${nm(S, w)} gagne le pli${why} : +${res.gain}.`);
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
