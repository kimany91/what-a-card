// Point d'entrée : menus, main de cartes, pioche au swipe, mini-jeux et déroulé de la partie.
import '@fontsource/bowlby-one/400.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import './style.css';
import { World } from './view/world.js';
import { Animator } from './view/anims.js';
import { Minigames, MINIGAME_KINDS } from './view/minigames.js';
import { Preview } from './view/preview.js';
import { clock, animate, ease } from './view/tween.js';
import { objectCanvas, battleCanvas, backCanvasGet } from './view/cards.js';
import { initAudio, sfx, setSound, buzz, setHaptics } from './view/audio.js';
import { KINDS, KIND_IDS } from './engine/kinds.js';
import { newGame, nextRound, act, draw, listActions, drainEvents, tgtKey, getEnt, cardValue, bonus } from './engine/engine.js';
import { chooseAction } from './engine/bot.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ sauvegarde locale
const store = {
  get(k, d) { try { const v = localStorage.getItem('wac.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wac.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const settings = Object.assign({ name: 'Toi', target: 20, sound: true }, store.get('settings', {}));
const stats = Object.assign({ games: 0, wins: 0, streak: 0, best: 0 }, store.get('stats', {}));
const seen = new Set(store.get('seen', []));

const imgCache = new Map();
function cardURL(kind) {
  if (!imgCache.has(kind)) imgCache.set(kind, objectCanvas(kind, world.icons).toDataURL('image/png'));
  return imgCache.get(kind);
}
let backURL = null;
const backImg = () => (backURL ||= backCanvasGet().toDataURL('image/png'));

// ------------------------------------------------------------ interface
class UI {
  constructor() { this.S = null; this.me = 0; this.hand = []; this.oppCount = 0; this.winStreak = 0; this.playable = new Set(); }
  name(p) { return this.S ? this.S.players[p].name : ''; }
  el(p, what) { return $((p === this.me ? 'me' : 'opp') + what); }
  setPts(p, v) { this.el(p, 'Pts').textContent = String(v); }
  bumpPts(p, d) {
    const e = this.el(p, 'Pts');
    e.textContent = String(Math.max(0, (+e.textContent || 0) + d));
    const chip = e.parentElement;
    chip.classList.remove('bump', 'hurt'); void chip.offsetWidth;
    chip.classList.add(d > 0 ? 'bump' : 'hurt');
  }
  streak(p) {
    this.winStreak = p === this.me ? this.winStreak + 1 : 0;
    const el = $('streak');
    el.hidden = this.winStreak < 2;
    if (this.winStreak >= 2) { el.textContent = 'SÉRIE ×' + this.winStreak; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
  }
  onRound() {}
  discover(kind) {
    if (seen.has(kind)) return;
    seen.add(kind); store.set('seen', [...seen]);
  }
  refreshGlobals() {
    const S = this.S, g = $('globals');
    if (!S) { g.innerHTML = ''; return; }
    const parts = S.globals.map((x) => `<span class="chip ${x.kind === 'orage' ? 'storm' : 'envers'}">${KINDS[x.kind].name.toUpperCase()} ${x.turns}</span>`);
    if (S.potTies > 0) parts.push(`<span class="chip pot">BATAILLE · ${S.potTies + 1} PTS</span>`);
    g.innerHTML = parts.join('');
  }
  update(S) {
    this.S = S;
    for (const p of [0, 1]) { this.setPts(p, S.players[p].pts); this.el(p, 'Name').textContent = S.players[p].name; }
    this.refreshGlobals();
    const real = S.players[this.me].hand;
    if (real.length !== this.hand.length || real.some((c, i) => c.id !== this.hand[i]?.id)) { this.hand = real.map((c) => ({ ...c })); this.renderHand(); }
    if (S.players[1 - this.me].hand.length !== this.oppCount) { this.oppCount = S.players[1 - this.me].hand.length; this.renderOpp(); }
  }
  prompt(text) { const p = $('prompt'); p.textContent = text; p.classList.toggle('on', !!text); }

  // ---- main du joueur
  handAdd(p, card) {
    if (p !== this.me) { this.oppCount++; this.renderOpp(true); return; }
    if (this.hand.some((c) => c.id === card.id)) return;
    this.hand.push({ ...card });
    this.renderHand(card.id);
    sfx('tap');
  }
  handRemove(p, hid, why) {
    if (p !== this.me) { this.oppCount = Math.max(0, this.oppCount - 1); this.renderOpp(); return; }
    const el = $('hand').querySelector(`[data-id="${hid}"]`);
    this.hand = this.hand.filter((c) => c.id !== hid);
    if (el && !el.dataset.gone) {
      el.classList.add(why === 'discard' ? 'burn' : 'leave');
      el.dataset.gone = '1';
      setTimeout(() => { el.remove(); this.layoutHand(); }, 350);
    }
  }
  renderHand(fresh = null) {
    const box = $('hand');
    const existing = new Map([...box.children].filter((e) => !e.dataset.gone).map((e) => [+e.dataset.id, e]));
    for (const [id, el] of existing) if (!this.hand.some((c) => c.id === id)) el.remove();
    for (const c of this.hand) {
      if (existing.has(c.id)) continue;
      const el = document.createElement('div');
      el.className = 'hcard' + (c.id === fresh ? ' enter' : '');
      el.dataset.id = c.id; el.dataset.kind = c.kind;
      el.innerHTML = `<img src="${cardURL(c.kind)}" alt="${KINDS[c.kind].name}" draggable="false">`;
      bindHandCard(el);
      box.appendChild(el);
    }
    this.layoutHand();
  }
  layoutHand() {
    const els = [...$('hand').children].filter((e) => !e.dataset.gone);
    const n = els.length, W = $('hand').clientWidth || 360;
    const cw = 78;
    const step = n > 1 ? Math.min(cw * 0.92, (W - cw - 24) / (n - 1)) : 0;
    const total = cw + step * (n - 1);
    els.forEach((el, i) => {
      const mid = (n - 1) / 2;
      el.style.setProperty('--x', ((W - total) / 2 + i * step) + 'px');
      el.style.setProperty('--y', (Math.abs(i - mid) ** 2 * 1.6) + 'px');
      el.style.setProperty('--r', ((i - mid) * Math.min(6, 30 / Math.max(1, n))) + 'deg');
      el.style.zIndex = String(10 + i);
      el.classList.toggle('playable', this.playable.has(+el.dataset.id));
    });
  }
  setPlayable(set) { this.playable = set; this.layoutHand(); }
  renderOpp(fresh = false) {
    const box = $('oppHand');
    box.innerHTML = '';
    for (let i = 0; i < this.oppCount; i++) {
      const im = document.createElement('img');
      im.src = backImg(); im.alt = '';
      im.style.setProperty('--r', ((i - (this.oppCount - 1) / 2) * 5) + 'deg');
      if (fresh && i === this.oppCount - 1) im.className = 'enter';
      box.appendChild(im);
    }
  }
}

// ------------------------------------------------------------ fiche d'une carte
let noteAction = null;
function openNote({ kind = null, card = null, title, short, canPlay = false, onPlay = null }) {
  $('noteImg').src = kind ? cardURL(kind) : card ? battleCanvas(card).toDataURL() : backImg();
  $('noteName').textContent = title || (kind ? KINDS[kind].name : '');
  $('noteShort').textContent = short || (kind ? KINDS[kind].short : '');
  $('btnPlay2').hidden = !canPlay;
  noteAction = onPlay;
  $('note').hidden = false;
  $('noteVideo').hidden = !kind;
  if (kind) requestAnimationFrame(() => preview.play(kind));
  sfx('tap');
}
function closeNote() { $('note').hidden = true; preview.stop(); noteAction = null; }

function infoFor(pick) {
  const S = game.S;
  if (!S) return;
  if (pick.t === 'ent') {
    const e = getEnt(S, pick.id);
    if (!e) return;
    const mine = e.owner === game.me;
    let extra = '';
    if (e.kind === 'bombe') extra = ` Explose dans ${e.timer} tour${e.timer > 1 ? 's' : ''}.`;
    if (e.kind === 'arbre') extra = ` Pousse : ${e.stage}/3.`;
    if (e.kind === 'trounoir') extra = ` Encore ${e.timer} tour${e.timer > 1 ? 's' : ''}.`;
    if (['reine', 'roi', 'tour', 'pion'].includes(e.kind) && mine) extra = ' Touche-la pendant ton tour pour la déplacer.';
    openNote({ kind: e.kind, short: KINDS[e.kind].short + extra, title: `${KINDS[e.kind].name}${mine ? '' : ' (adverse)'}` });
  } else if (pick.t === 'card') {
    const pl = S.players[pick.p];
    if (!pl.card) return;
    const v = cardValue(S, pick.p), b = bonus(S, pick.p);
    let short = `Vaut ${v}.`;
    if (b > 0) short += ` Le Roi ajoute +${b}.`;
    if (b < 0) short += ' Malheur : −1.';
    openNote({ card: pl.card, title: pick.p === game.me ? 'Ta carte' : `Carte de ${pl.name}`, short });
  } else if (pick.t === 'player') {
    const pl = S.players[pick.p];
    openNote({ title: pl.name, short: `${pl.pts} points · ${pl.hand.length} carte${pl.hand.length > 1 ? 's' : ''} en main${pl.dead ? ' · mort ce tour' : ''}.` });
  } else if (pick.t === 'deck') {
    openNote({ title: pick.p === game.me ? 'Ta pioche' : 'Sa pioche', short: `${S.players[pick.p].deck.length} cartes. Des objets s’y cachent.` });
  } else if (pick.t === 'grave') {
    openNote({ title: 'Cimetière', short: S.grave.length ? `${S.grave.length} carte${S.grave.length > 1 ? 's' : ''}. La Pelle les ressort.` : 'Vide.' });
  }
}

// ------------------------------------------------------------ partie
const game = {
  S: null, me: 0, busy: false, mode: null, alive: false, acts: [], holding: null,

  async start() {
    world.clearAll();
    this.S = newGame({ names: [settings.name || 'Toi', 'Le Bot'], target: settings.target });
    this.me = 0;
    Object.assign(ui, { me: 0, S: this.S, hand: [], oppCount: 0, winStreak: 0 });
    $('hand').innerHTML = ''; $('oppHand').innerHTML = ''; $('streak').hidden = true;
    world.setPerspective(0);
    ui.update(this.S);
    ui.prompt('');
    show('hud');
    this.alive = true;
    nextRound(this.S);
    await this.flush();
    this.step();
  },

  async flush() {
    this.busy = true;
    let evs = drainEvents(this.S);
    while (evs.length) {
      for (const ev of evs) {
        if (!this.alive) break;
        try {
          if (ev.type === 'draw' && ev.p === this.me) await anim.revealDraw(ev, swipeReveal);
          else await anim.play(ev);
        } catch (err) { console.error('animation', ev.type, err); }
      }
      evs = drainEvents(this.S);
    }
    anim.skipUse = false; anim.skipFrom = null; mg.skipFrom = null;
    if (mg.keepPov) { mg.keepPov = false; await world.clearPov(0.6); }
    clock.speed = 1;
    this.busy = false;
    if (!this.alive) return;
    await world.reconcile(this.S);
    ui.update(this.S);
  },

  step() {
    if (!this.alive) return;
    const S = this.S;
    this.reset();
    if (S.phase === 'over') return this.end();
    if (S.phase === 'result') { setTimeout(() => this.next(), 500); return; }
    if (S.phase === 'draw') {
      if (S.turn === this.me) {
        this.mode = 'draw';
        focus(false);
        world.deckGlow = this.me;
        world.highlight([{ t: 'deck', p: this.me }]);
        ui.prompt(S.players[this.me].objRun ? 'ENCORE ! TOUCHE TA PIOCHE' : 'TOUCHE TA PIOCHE');
        buzz(10);
      } else this.botLater(() => draw(S, S.turn), 450);
      return;
    }
    if (S.phase === 'action') {
      if (S.turn === this.me) this.myTurn();
      else this.botLater(() => { const c = chooseAction(S, S.turn); act(S, S.turn, c ? c.a : null, c ? c.aim : null); }, 650);
    }
  },

  botLater(fn, ms) {
    ui.prompt('');
    setTimeout(async () => {
      if (!this.alive) return;
      fn();
      await this.flush();
      this.step();
    }, ms + Math.random() * 300);
  },

  async next() {
    if (!this.alive || this.busy || this.S.phase !== 'result') return;
    nextRound(this.S);
    await this.flush();
    this.step();
  },

  reset() {
    this.mode = null; this.holding = null;
    focus(true);
    world.clearHighlight(); world.clearCells(); world.deckGlow = null;
    $('btnPass').hidden = true; $('btnCancel').hidden = true;
    ui.setPlayable(new Set());
    $('oppHand').classList.remove('target');
  },

  myTurn() {
    this.reset();
    const acts = listActions(this.S, this.me);
    this.acts = acts;
    this.mode = 'act';
    focus(false);
    ui.setPlayable(new Set(acts.filter((a) => a.type === 'card').map((a) => a.hid)));
    const movers = [...new Set(acts.filter((a) => a.type === 'move').map((a) => a.id))];
    world.highlight(movers.map((id) => ({ t: 'ent', id })));
    ui.prompt(movers.length ? 'JOUE, BOUGE UNE PIÈCE OU PASSE' : 'JOUE UNE CARTE OU PASSE');
    $('btnPass').hidden = false;
    buzz(15);
  },

  cardActs(hid) { return this.acts.filter((a) => a.type === 'card' && a.hid === hid); },

  // Choisir une cible pour une carte (ou la jouer directement si elle n'en a pas besoin).
  begin(hid) {
    const acts = this.cardActs(hid);
    if (!acts.length) return;
    const kind = acts[0].kind;
    const play = KINDS[kind].play;
    if (kind === 'flingue' || kind === 'billard') return this.commit(acts[0], acts);
    if (play !== 'target' && play !== 'cell') return this.commit(acts[0], acts);
    if (kind === 'pelle') return this.pickGrave(acts);
    this.reset();
    this.mode = 'target';
    this.holding = { hid, kind, acts };
    const real = acts.filter((a) => a.tgt.t !== 'miss');
    if (play === 'cell') world.markCells(real.map((a) => a.tgt));
    else world.highlight(real.filter((a) => a.tgt.t !== 'hand').map((a) => a.tgt));
    if (real.some((a) => a.tgt.t === 'hand')) $('oppHand').classList.add('target');
    ui.prompt('TOUCHE UNE CIBLE');
    $('btnCancel').hidden = false;
  },

  pickGrave(acts) {
    const row = $('pickRow');
    row.innerHTML = '';
    for (const a of acts) {
      const kind = this.S.grave[a.tgt.i];
      const b = document.createElement('button');
      b.innerHTML = `<img src="${cardURL(kind)}" alt="${KINDS[kind].name}">`;
      b.onclick = () => { $('pickList').hidden = true; this.commit(a, acts); };
      row.appendChild(b);
    }
    $('pickList').hidden = false;
  },

  async commit(a, acts) {
    this.reset();
    this.mode = 'busy';
    ui.prompt('');
    sfx('click'); buzz(20);
    let choice = { a, aim: null };
    if (a.type === 'card' && MINIGAME_KINDS.has(a.kind)) {
      ui.handRemove(this.me, a.hid, 'play');
      choice = await mg.run(a.kind, a, acts || this.cardActs(a.hid));
    }
    if (!choice?.a) { this.myTurn(); return; }
    act(this.S, this.me, choice.a, choice.aim);
    await this.flush();
    this.step();
  },

  async pass() {
    if (this.mode !== 'act') return;
    this.reset();
    this.mode = 'busy';
    act(this.S, this.me, null);
    await this.flush();
    this.step();
  },

  async drawMine() {
    this.reset();
    this.mode = 'busy';
    ui.prompt('');
    draw(this.S, this.me);
    await this.flush();
    this.step();
  },

  onTap(x, y) {
    if (!this.alive) return;
    if (this.busy) { clock.speed = 3; return; }
    const pick = world.pick(x, y);
    if (this.mode === 'draw') {
      if (pick?.t === 'deck' && pick.p === this.me) return this.drawMine();
      if (pick) infoFor(pick);
      return;
    }
    if (this.mode === 'target' && this.holding) {
      const a = pick ? this.holding.acts.find((x) => tgtKey(x.tgt) === tgtKey(pick)) : null;
      if (a) return this.commit(a, this.holding.acts);
      const cell = world.pickCell(x, y);
      const ac = cell && this.holding.acts.find((x) => x.tgt.t === 'cell' && x.tgt.x === cell.x && x.tgt.y === cell.y);
      if (ac) return this.commit(ac, this.holding.acts);
      return;
    }
    if (this.mode === 'move' && this.holding) {
      let cell = world.pickCell(x, y);
      if (pick?.t === 'ent') { const e = getEnt(this.S, pick.id); if (e?.zone === 'board') cell = { x: e.x, y: e.y }; }
      const mv = cell && this.holding.moves.find((m) => m.x === cell.x && m.y === cell.y);
      if (mv) return this.commit(mv);
      this.myTurn();
      return;
    }
    if (this.mode === 'act' && pick?.t === 'ent') {
      const moves = this.acts.filter((a) => a.type === 'move' && a.id === pick.id);
      if (moves.length) {
        sfx('tap');
        world.clearHighlight();
        world.markCells(moves.map((m) => ({ x: m.x, y: m.y, cap: m.cap })));
        this.mode = 'move';
        this.holding = { moves };
        ui.prompt('CHOISIS UNE CASE');
        focus(true);
        $('btnCancel').hidden = false; $('btnPass').hidden = true;
        return;
      }
    }
    if (pick) infoFor(pick);
  },

  end() {
    this.alive = false;
    const S = this.S, won = S.winner === this.me;
    stats.games++;
    if (won) { stats.wins++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
    store.set('stats', stats);
    sfx(won ? 'victory' : 'defeat');
    buzz(won ? 120 : 300);
    $('endTitle').textContent = won ? 'VICTOIRE' : 'DÉFAITE';
    $('end').classList.toggle('lost', !won);
    $('endScore').textContent = `${S.players[this.me].pts} – ${S.players[1 - this.me].pts}`;
    $('endStats').innerHTML = statHTML();
    setTimeout(() => show('end'), 900);
  },

  quit() { this.alive = false; world.clearAll(); show('menu'); attract(); },
};

// Pendant une action, la main et les boutons s'effacent pour laisser voir la table.
function focus(on) { $('hud').classList.toggle('focus', on); }

// Geste de révélation : glisser la carte à gauche ou à droite pour la retourner.
function swipeReveal(card, setFlip) {
  return new Promise((res) => {
    mg.open('GLISSE POUR RETOURNER');
    $('mg').classList.add('swipe');
    let sx = null, theta = Math.PI, passed = false;
    mg.handlers = {
      down: (e) => { sx = e.clientX; sfx('tap'); },
      move: (e) => {
        if (sx == null) return;
        const dx = e.clientX - sx;
        theta = Math.PI + Math.max(-2.8, Math.min(2.8, dx * 0.012));
        setFlip(theta, Math.min(1, Math.abs(dx) / 140));
        if (!passed && Math.abs(theta - Math.PI) > Math.PI / 2) { passed = true; sfx('flip'); buzz(15); }
      },
      up: (e) => {
        if (sx == null) return;
        const dx = e.clientX - sx;
        sx = null;
        if (Math.abs(dx) > 55) {
          mg.handlers = null;
          $('mg').classList.remove('swipe');
          const from = theta, to = dx > 0 ? Math.PI * 2 : 0;
          animate(0.22, (k) => setFlip(from + (to - from) * k, 1), ease.outCubic).then(() => { mg.close(); res(); });
        } else {
          const from = theta;
          passed = false;
          animate(0.2, (k) => setFlip(from + (Math.PI - from) * k, 0), ease.outBack);
        }
      },
    };
  });
}

// Cartes de la main : toucher = fiche ; glisser vers le haut = jouer.
function bindHandCard(el) {
  let start = null, drag = false;
  el.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY };
    drag = false;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const hid = +el.dataset.id;
    if (!drag && dy < -25 && game.mode === 'act' && ui.playable.has(hid)) {
      drag = true;
      el.classList.add('drag');
      const acts = game.cardActs(hid);
      world.highlight(acts.filter((a) => !['miss', 'self', 'hand', 'cell'].includes(a.tgt.t)).map((a) => a.tgt));
      if (acts.some((a) => a.tgt.t === 'cell')) world.markCells(acts.filter((a) => a.tgt.t === 'cell').map((a) => a.tgt));
      sfx('whoosh');
    }
    if (drag) { el.style.setProperty('--dx', dx + 'px'); el.style.setProperty('--dy', dy + 'px'); }
  });
  el.addEventListener('pointerup', (e) => {
    if (!start) return;
    const hid = +el.dataset.id, kind = el.dataset.kind;
    start = null;
    if (!drag) {
      const can = game.mode === 'act' && ui.playable.has(hid);
      openNote({ kind, canPlay: can, onPlay: () => game.begin(hid) });
      return;
    }
    el.classList.remove('drag');
    el.style.removeProperty('--dx'); el.style.removeProperty('--dy');
    world.clearHighlight(); world.clearCells();
    const acts = game.cardActs(hid);
    if (e.clientY > $('hand').getBoundingClientRect().top) { game.myTurn(); return; }
    const pick = world.pick(e.clientX, e.clientY);
    const cell = world.pickCell(e.clientX, e.clientY);
    let a = pick ? acts.find((x) => tgtKey(x.tgt) === tgtKey(pick)) : null;
    if (!a && cell) a = acts.find((x) => x.tgt.t === 'cell' && x.tgt.x === cell.x && x.tgt.y === cell.y);
    if (!a && e.clientY < $('oppHand').getBoundingClientRect().bottom + 20) a = acts.find((x) => x.tgt.t === 'hand');
    if (a && a.kind !== 'flingue' && a.kind !== 'billard') game.commit(a, acts);
    else game.begin(hid);
  });
  el.addEventListener('pointercancel', () => { start = null; el.classList.remove('drag'); });
}

function statHTML() {
  const rate = stats.games ? Math.round((stats.wins / stats.games) * 100) : 0;
  return `<div class="stat"><b>${stats.wins}</b><small>victoires</small></div><div class="stat"><b>${rate}%</b><small>réussite</small></div><div class="stat"><b>${stats.best}</b><small>meilleure série</small></div><div class="stat"><b>${seen.size}/${KIND_IDS.length}</b><small>cartes</small></div>`;
}

function show(which) {
  for (const id of ['menu', 'end', 'pause']) $(id).hidden = id !== which;
  $('hud').hidden = !(which === 'hud' || which === 'pause');
  if (which === 'menu') { $('stats').innerHTML = stats.games ? statHTML() : ''; $('codexCount').textContent = `${seen.size}/${KIND_IDS.length}`; }
}

function openSheet(html) { $('sheetBody').innerHTML = html; $('sheet').hidden = false; }
function closeSheet() { $('sheet').hidden = true; }

function rulesHTML() {
  return `<h2>Règles</h2>
  <ul class="rules">
    <li><b>Pioche</b> : touche ta pioche, puis glisse la carte pour la retourner.</li>
    <li><b>Carte normale</b> : c’est ta carte du pli. La plus forte gagne +1 point.</li>
    <li><b>Objet</b> : il va dans ta main, et tu repioches.</li>
    <li><b>Ton tour</b> : joue des objets (une fois chacun), bouge une pièce d’échecs, ou passe.</li>
    <li><b>Égalité</b> : BATAILLE, le pli suivant vaut plus.</li>
    <li><b>Mort</b> : tu perds le pli et 2 points.</li>
    <li><b>Victoire</b> : ${settings.target} points.</li>
  </ul>
  <p>Touche n’importe quoi sur la table pour savoir ce que c’est.</p>`;
}
function codexHTML() {
  const items = KIND_IDS.map((k) => `<button class="${seen.has(k) ? '' : 'locked'}" data-kind="${k}"><img src="${cardURL(k)}" alt=""></button>`).join('');
  return `<h2>Cartes ${seen.size}/${KIND_IDS.length}</h2><div class="codex">${items}</div>`;
}

let attractTimer = null;
function attract() {
  clearInterval(attractTimer);
  world.clearAll();
  ['reine', 'roi', 'bombe', 'chat', 'pion', 'tour'].forEach((k, i) => {
    const e = { id: -100 - i, kind: k, owner: i % 2, zone: 'board', x: [1, 3, 2, 0, 4, 2][i], y: [3, 1, 2, 1, 3, 4][i], timer: 3 };
    const m = world.addEnt(e, { scale: 1 });
    m.obj.rotation.y = Math.random() * 6;
  });
  world.showBoard(true);
  attractTimer = setInterval(() => { for (const m of world.models.values()) m.obj.rotation.y += 0.015; }, 33);
}

// ------------------------------------------------------------ démarrage
const world = new World($('stage'), $('overlay'));
const ui = new UI();
const anim = new Animator(world, ui);
const mg = new Minigames(world, anim);
const preview = new Preview($('noteVideo'));

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  world.update(dt);
  preview.update(dt);
  requestAnimationFrame(frame);
}

async function boot() {
  try { await Promise.all([document.fonts.load('40px "Bowlby One"'), document.fonts.load('800 16px "Bricolage Grotesque"')]); } catch { /* police de secours */ }
  world.renderIcons();
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      const { Haptics } = await import('@capacitor/haptics');
      setHaptics({ vibrate: ({ duration }) => (duration > 60 ? Haptics.vibrate({ duration }) : Haptics.impact({ style: duration > 30 ? 'MEDIUM' : 'LIGHT' })) });
    }
  } catch { /* pas de vibration native */ }
  setSound(settings.sound);
  bindUI();
  show('menu');
  attract();
  requestAnimationFrame(frame);
  const l = $('loading'); l.style.opacity = '0'; setTimeout(() => l.remove(), 450);
}

function bindUI() {
  window.addEventListener('pointerdown', () => initAudio(), { passive: true });
  $('inName').value = settings.name;
  $('inName').addEventListener('change', (e) => { settings.name = e.target.value.trim().slice(0, 14) || 'Toi'; store.set('settings', settings); });
  const segs = [...$('segTarget').querySelectorAll('button')];
  const paint = () => segs.forEach((b) => b.classList.toggle('on', +b.dataset.v === settings.target));
  segs.forEach((b) => (b.onclick = () => { settings.target = +b.dataset.v; store.set('settings', settings); paint(); sfx('tap'); }));
  paint();
  const paintSound = () => ($('btnSound').textContent = 'SON : ' + (settings.sound ? 'OUI' : 'NON'));
  $('btnSound').onclick = () => { settings.sound = !settings.sound; setSound(settings.sound); store.set('settings', settings); paintSound(); sfx('tap'); };
  paintSound();

  const play = () => { initAudio(); sfx('click'); clearInterval(attractTimer); game.start(); };
  $('btnPlay').onclick = play;
  $('btnAgain').onclick = play;
  $('btnMenu').onclick = () => { sfx('tap'); game.quit(); };
  $('btnRules').onclick = $('btnPauseRules').onclick = () => { sfx('tap'); openSheet(rulesHTML()); };
  $('btnCodex').onclick = $('btnPauseCodex').onclick = () => { sfx('tap'); openSheet(codexHTML()); };
  $('btnPause').onclick = () => { sfx('tap'); show('pause'); };
  $('btnResume').onclick = () => { sfx('tap'); show('hud'); };
  $('btnQuit').onclick = () => { sfx('tap'); game.quit(); };
  $('btnLog').onclick = () => {
    const S = game.S;
    const rows = S ? S.log.slice(-40).reverse().map((l) => `<div>${l.text}</div>`).join('') : '';
    openSheet(`<h2>Journal</h2><div class="log-list">${rows || '<p>Rien pour l’instant.</p>'}</div>`);
  };
  $('btnSheetClose').onclick = closeSheet;
  $('sheet').addEventListener('click', (e) => {
    if (e.target === $('sheet')) closeSheet();
    const k = e.target.closest('.codex button');
    if (k && seen.has(k.dataset.kind)) { closeSheet(); openNote({ kind: k.dataset.kind }); }
    else if (k) sfx('lose');
  });
  $('btnPass').onclick = () => { sfx('tap'); game.pass(); };
  $('btnCancel').onclick = () => { sfx('tap'); game.myTurn(); };
  $('btnNoteClose').onclick = closeNote;
  $('note').addEventListener('click', (e) => { if (e.target === $('note')) closeNote(); });
  $('btnPlay2').onclick = () => { const f = noteAction; closeNote(); f?.(); };
  $('btnPickClose').onclick = () => { $('pickList').hidden = true; game.myTurn(); };
  $('oppHand').addEventListener('click', () => {
    if (game.mode === 'target' && game.holding) {
      const a = game.holding.acts.find((x) => x.tgt.t === 'hand');
      if (a) return game.commit(a, game.holding.acts);
    }
    if (game.S) openNote({ title: 'Sa main', short: `${ui.oppCount} carte${ui.oppCount > 1 ? 's' : ''} cachée${ui.oppCount > 1 ? 's' : ''}.` });
  });
  window.addEventListener('resize', () => ui.layoutHand());

  let down = null;
  $('stage').addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  $('stage').addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
    if (!$('hud').hidden && $('pause').hidden) game.onTap(e.clientX, e.clientY);
  });
}

window.__wac = { game, world, ui, anim, mg };
boot();
