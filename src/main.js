// Point d'entrée : menus, HUD et déroulé de la partie contre le bot.
import '@fontsource/bowlby-one/400.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import './style.css';
import { World } from './view/world.js';
import { Animator } from './view/anims.js';
import { clock } from './view/tween.js';
import { initAudio, sfx, setSound, soundOn, buzz, setHaptics } from './view/audio.js';
import { KINDS, KIND_IDS } from './engine/kinds.js';
import { newGame, nextRound, act, listActions, drainEvents, tgtKey, describeTarget, cardName, getEnt, rankLabel, cardValue } from './engine/engine.js';
import { chooseAction } from './engine/bot.js';

const $ = (id) => document.getElementById(id);
const TAG_LABEL = { piece: 'Sur l’échiquier', feu: 'Inflammable', metal: 'Métal', peche: 'Pêchable', vivant: 'Vivant', verre: 'Fragile' };

// ------------------------------------------------------------ sauvegarde locale
const store = {
  get(k, d) { try { const v = localStorage.getItem('wac.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wac.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const settings = Object.assign({ name: 'Toi', target: 20, sound: true }, store.get('settings', {}));
const stats = Object.assign({ games: 0, wins: 0, streak: 0, best: 0, plis: 0 }, store.get('stats', {}));
const seen = new Set(store.get('seen', []));

// ------------------------------------------------------------ UI
class UI {
  constructor() { this.pts = [0, 0]; this.winStreak = 0; this.S = null; this.me = 0; }
  name(p) { return this.S ? this.S.players[p].name : ''; }
  el(p, what) { return $((p === this.me ? 'me' : 'opp') + what); }
  setPts(p, v) {
    this.pts[p] = v;
    this.el(p, 'Pts').textContent = String(v);
    const t = this.S?.target || 20;
    this.el(p, 'Meter').style.width = Math.min(100, (v / t) * 100) + '%';
  }
  bumpPts(p, d) {
    this.setPts(p, Math.max(0, this.pts[p] + d));
    const e = this.el(p, 'Pts');
    e.classList.remove('bump', 'hurt'); void e.offsetWidth;
    e.classList.add(d > 0 ? 'bump' : 'hurt');
    if (p === this.me && d < 0) buzz(80);
  }
  streak(p) {
    if (p === this.me) { this.winStreak++; stats.plis++; } else this.winStreak = 0;
    const el = $('streak');
    if (this.winStreak >= 2) {
      el.hidden = false; el.textContent = 'SÉRIE ×' + this.winStreak;
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      if (this.winStreak >= 3) world.fx.banner('SÉRIE ×' + this.winStreak, 'gold', 0.9);
    } else el.hidden = true;
  }
  onRound(n) { $('roundChip').textContent = 'TOUR ' + n; }
  discover(kind, pos) {
    if (seen.has(kind)) return;
    seen.add(kind); store.set('seen', [...seen]);
    if (pos) world.fx.pop(pos.clone().setY(pos.y + 1.2), 'NOUVEAU', 'gold', 1.2);
    sfx('sparkle');
  }
  refreshGlobals() {
    const S = this.S, g = $('globals');
    if (!S) { g.innerHTML = ''; return; }
    const parts = S.globals.map((x) => `<span class="chip ${x.kind === 'orage' ? 'storm' : 'envers'}">${KINDS[x.kind].name.toUpperCase()} · ${x.turns}</span>`);
    if (S.potTies > 0) parts.push(`<span class="chip pot">BATAILLE EN JEU · ${S.potTies + 1} PTS</span>`);
    if (S.freeze) parts.push('<span class="chip frozen">TEMPS FIGÉ AU PROCHAIN TOUR</span>');
    g.innerHTML = parts.join('');
  }
  update(S) {
    this.S = S;
    for (const p of [0, 1]) {
      const pl = S.players[p];
      this.el(p, 'Name').dataset.status = pl.dead ? 'MORT' : pl.malheur ? 'MALHEUR' : '';
      this.setPts(p, S.players[p].pts);
      this.el(p, 'Deck').textContent = String(S.players[p].deck.length);
      this.el(p, 'Name').textContent = S.players[p].name;
      this.el(p, 'Of').textContent = '/' + S.target;
    }
    this.refreshGlobals();
  }
  prompt(text, mine = false) { const p = $('prompt'); p.textContent = text; p.classList.toggle('mine', mine); }
  tick(text) { if (text) $('ticker').textContent = text; }
}

// ------------------------------------------------------------ feuilles
function openSheet(html) { $('sheetBody').innerHTML = html; $('sheet').hidden = false; $('sheet').querySelector('.sheet-inner').scrollTop = 0; }
function closeSheet() { $('sheet').hidden = true; }

function kindHTML(kind, extra = '') {
  const k = KINDS[kind];
  const tags = k.tags.map((t) => `<span class="tag-pill">${TAG_LABEL[t]}</span>`).join('');
  const zone = k.zone === 'board' ? 'Se pose sur l’échiquier' : k.zone === 'global' ? 'Règle globale' : 'Se pose devant toi';
  return `<div class="kind-head"><img src="${world.iconURL[kind] || ''}" alt=""><div><h2>${k.name}</h2>${extra}</div></div>
    <p>${k.desc}</p>
    <div class="tags"><span class="tag-pill">${zone}</span>${tags}</div>
    ${k.combo.length ? `<h3>Ça interagit avec</h3><ul>${k.combo.map((c) => `<li>${c}</li>`).join('')}</ul>` : ''}`;
}

function showInfo(pick) {
  const S = game.S;
  if (!pick || !S) return;
  sfx('tap');
  if (pick.t === 'ent') {
    const e = getEnt(S, pick.id);
    if (!e) return;
    const mine = e.owner === game.me;
    const state = [];
    if (e.uses != null) state.push(`${e.uses} utilisation${e.uses > 1 ? 's' : ''} restante${e.uses > 1 ? 's' : ''}`);
    if (e.cd) state.push(`se recharge : ${e.cd} tour${e.cd > 1 ? 's' : ''}`);
    if (e.timer != null) state.push(`compte à rebours : ${e.timer}`);
    if (e.stage != null) state.push(`croissance : ${e.stage}/3`);
    if (e.age != null) state.push(`survie : ${e.age}/3`);
    if (e.wet) state.push(`mouillé (${e.wet} tour${e.wet > 1 ? 's' : ''})`);
    const who = e.kind === 'banane' ? `Piège posé chez ${S.players[e.owner].name}` : (mine ? 'À toi' : 'À ' + S.players[e.owner].name);
    openSheet(kindHTML(e.kind, `<span class="owner ${mine ? 'me' : 'opp'}">${who}</span>${state.length ? `<p>${state.join(' · ')}</p>` : ''}`));
  } else if (pick.t === 'chaos') {
    const k = world.chaos[pick.p]?.userData.kind;
    if (k) openSheet(kindHTML(k, `<span class="owner ${pick.p === game.me ? 'me' : 'opp'}">Carte chaos de ${S.players[pick.p].name}, s’active à la fin du tour</span>`));
  } else if (pick.t === 'card') {
    const pl = S.players[pick.p];
    if (!pl.card) return;
    const v = cardValue(S, pick.p);
    const mods = [];
    const kings = S.ents.filter((e) => e.kind === 'roi' && e.owner === pick.p && e.zone === 'board').length;
    if (kings) mods.push(`+${kings} grâce au Roi`);
    if (pl.malheur) mods.push('−1 de malheur');
    if (pl.card.v !== pl.card.r) mods.push(`valeur modifiée : ${pl.card.r} → ${pl.card.v}`);
    openSheet(`<h2>${cardName({ v: pl.card.r, s: pl.card.s })}</h2><p>Carte de bataille de ${pl.name}. Valeur actuelle : <b>${v}</b>.</p>${mods.length ? `<ul>${mods.map((m) => `<li>${m}</li>`).join('')}</ul>` : ''}<p>La plus forte gagne le pli. Valet 11, Dame 12, Roi 13, As 14.</p>`);
  } else if (pick.t === 'player') {
    const pl = S.players[pick.p];
    openSheet(`<h2>${pl.name}</h2><p>${pl.pts} point${pl.pts > 1 ? 's' : ''} sur ${S.target} · ${pl.deck.length} cartes dans le paquet.</p>${pl.dead ? '<p>Mort ce tour : sa carte ne compte pas. Il perdra 2 points en se réincarnant.</p>' : ''}${pl.malheur ? `<p>Malheur : −1 à ses cartes pendant encore ${pl.malheur} tour(s).</p>` : ''}`);
  } else if (pick.t === 'grave') {
    const list = S.grave.slice(-8).reverse().map((g) => `<li>${KINDS[g.kind].name}</li>`).join('');
    openSheet(`<h2>Cimetière</h2><p>Tout objet détruit ou épuisé finit ici. La Pelle peut en déterrer.</p>${list ? `<ul>${list}</ul>` : '<p>Vide pour l’instant.</p>'}`);
  }
}

function rulesHTML() {
  return `<h2>Règles</h2>
  <h3>La base : une bataille</h3>
  <p>Chacun a la moitié d’un paquet de 52 cartes. À chaque tour, les deux joueurs retournent leur carte du dessus. La plus forte gagne le pli : +1 point, et les deux cartes vont sous son paquet. Égalité : BATAILLE, les cartes restent au milieu et le pli suivant rapporte tout.</p>
  <p>Le premier à ${settings.target} points gagne. Si quelqu’un n’a plus de cartes, il perd.</p>
  <h3>Le chaos</h3>
  <p>Le premier tour est normal. Ensuite, chaque joueur retourne aussi une carte chaos. Elle n’a pas de valeur : elle ajoute un objet, une pièce d’échecs ou une règle qui reste en jeu.</p>
  <h3>Un tour</h3>
  <ul>
    <li>Le monde avance : les arbres poussent, les bombes décomptent, les morts se réincarnent.</li>
    <li>Les cartes se retournent. Les cartes chaos sont visibles mais pas encore actives.</li>
    <li>Chacun peut utiliser un objet (l’initiative alterne). C’est le moment de contrer : pêcher ou brûler la carte chaos adverse l’annule.</li>
    <li>Les cartes chaos s’activent, puis on compare les valeurs.</li>
  </ul>
  <h3>Mourir</h3>
  <p>Un joueur tué perd le pli en cours et 2 points quand il se réincarne au tour suivant.</p>
  <h3>Tout est systémique</h3>
  <p>Les outils agissent sur des propriétés, pas sur des cartes précises. Le Briquet brûle tout ce qui est inflammable, donc aussi les pièces d’échecs en bois. L’Aimant attire tout ce qui est en métal. L’eau empêche le feu, enraye les armes et court-circuite l’électrique.</p>
  <h3>Les commandes</h3>
  <ul>
    <li>Quand c’est ton tour, tes objets utilisables ont une flèche jaune. Touche-en un, puis touche sa cible.</li>
    <li>Touche n’importe quel objet pour lire ce qu’il fait.</li>
    <li>Touche l’écran pendant une animation pour l’accélérer.</li>
  </ul>`;
}

function codexHTML() {
  const items = KIND_IDS.map((k) => `<button class="${seen.has(k) ? '' : 'locked'}" data-kind="${k}"><img src="${world.iconURL[k] || ''}" alt=""><span>${seen.has(k) ? KINDS[k].name : '???'}</span></button>`).join('');
  return `<h2>Cartes chaos</h2><p>${seen.size} sur ${KIND_IDS.length} découvertes. Les autres se dévoilent en jouant.</p><div class="codex">${items}</div>`;
}

// ------------------------------------------------------------ partie
const game = {
  S: null, me: 0, busy: false, sel: null, alive: false, autoTimer: null,

  async start() {
    clearTimeout(this.autoTimer);
    world.clearAll();
    this.S = newGame({ names: [settings.name || 'Toi', 'Le Bot'], target: settings.target });
    this.me = 0;
    ui.me = 0; ui.S = this.S; ui.winStreak = 0; $('streak').hidden = true;
    world.setPerspective(0);
    ui.update(this.S);
    ui.prompt('');
    $('ticker').textContent = '';
    show('hud');
    this.alive = true;
    nextRound(this.S);
    await this.flush();
    this.step();
  },

  async flush() {
    const evs = drainEvents(this.S);
    this.busy = true;
    for (const ev of evs) {
      if (!this.alive) break;
      if (ev.text) ui.tick(ev.text);
      try { await anim.play(ev); } catch (err) { console.error('animation', ev.type, err); }
    }
    clock.speed = 1;
    this.busy = false;
    if (!this.alive) return;
    await world.reconcile(this.S);
    ui.update(this.S);
  },

  step() {
    if (!this.alive) return;
    const S = this.S;
    world.clearHighlight();
    this.sel = null;
    $('pickPanel').hidden = true;
    $('btnPass').hidden = true;
    if (S.phase === 'over') return this.end();
    if (S.phase === 'result') {
      ui.prompt('');
      this.autoTimer = setTimeout(() => this.next(), 650);
      return;
    }
    if (S.phase !== 'action') return;
    if (S.turn === this.me) this.myTurn();
    else {
      ui.prompt('');
      setTimeout(async () => {
        if (!this.alive) return;
        const a = chooseAction(S, S.turn);
        act(S, S.turn, a);
        await this.flush();
        this.step();
      }, 550 + Math.random() * 400);
    }
  },

  async next() {
    if (!this.alive || this.busy || this.S.phase !== 'result') return;
    nextRound(this.S);
    await this.flush();
    this.step();
  },

  myTurn() {
    const acts = listActions(this.S, this.me);
    this.sel = { phase: 'item', acts };
    const ids = [...new Set(acts.map((a) => a.id))];
    world.highlight(ids.map((id) => ({ t: 'ent', id })));
    ui.prompt('À TOI', true);
    $('btnPass').hidden = false;
    buzz(15);
  },

  chooseItem(id) {
    const acts = this.sel.acts.filter((a) => a.id === id);
    if (!acts.length) return;
    sfx('tap');
    this.sel = { phase: 'target', acts: this.sel.acts, id, targets: acts };
    const e = getEnt(this.S, id);
    $('pickIcon').src = world.iconURL[e.kind] || '';
    $('pickName').textContent = `${KINDS[e.kind].name} : ${acts[0].label}`;
    $('pickDesc').textContent = KINDS[e.kind].desc;
    const chips = $('pickChips');
    chips.innerHTML = '';
    for (const a of acts) {
      const b = document.createElement('button');
      b.className = 'chip-btn';
      b.innerHTML = `${targetIcon(a.tgt)}<span>${a.tgt.t === 'self' ? 'ACTIVER' : describeTarget(this.S, a.tgt)}</span>`;
      b.onclick = () => this.commit(a);
      chips.appendChild(b);
    }
    $('pickPanel').hidden = false;
    $('btnPass').hidden = true;
    world.highlight(acts.filter((a) => a.tgt.t !== 'self').map((a) => a.tgt));
    ui.prompt('');
  },

  backToItems() { sfx('tap'); $('pickPanel').hidden = true; this.myTurn(); },

  async commit(a) {
    if (!this.sel) return;
    sfx('click'); buzz(20);
    this.sel = null;
    world.clearHighlight();
    $('pickPanel').hidden = true; $('btnPass').hidden = true;
    ui.prompt('');
    act(this.S, this.me, a);
    await this.flush();
    this.step();
  },

  async pass() {
    if (!this.sel) return;
    this.sel = null;
    world.clearHighlight();
    $('btnPass').hidden = true; $('pickPanel').hidden = true;
    ui.prompt('');
    act(this.S, this.me, null);
    await this.flush();
    this.step();
  },

  onTap(x, y) {
    if (!this.alive) return;
    if (this.busy) { clock.speed = 3.2; return; }
    const pick = world.pick(x, y);
    if (this.sel?.phase === 'item' && pick?.t === 'ent' && this.sel.acts.some((a) => a.id === pick.id)) return this.chooseItem(pick.id);
    if (this.sel?.phase === 'target' && pick) {
      const key = pick.t === 'grave' ? null : tgtKey(pick);
      const match = this.sel.targets.find((a) => tgtKey(a.tgt) === key);
      if (match) return this.commit(match);
      if (pick.t === 'grave') return;
    }
    if (pick) showInfo(pick);
  },

  end() {
    this.alive = false;
    const S = this.S, won = S.winner === this.me;
    stats.games++;
    if (won) { stats.wins++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
    store.set('stats', stats);
    sfx(won ? 'victory' : 'defeat');
    buzz(won ? 120 : 300);
    if (won) for (let i = 0; i < 6; i++) setTimeout(() => world.fx.burst(new world.camera.position.constructor((Math.random() - 0.5) * 5, 1, (Math.random() - 0.5) * 8), { n: 60, colors: ['#ffc93c', '#ff3d71', '#4cc9f0', '#7ae582', '#ffffff'], speed: 5, up: 8, size: 0.25, life: 1.6, gravity: -9 }), i * 180);
    $('endTitle').textContent = won ? 'VICTOIRE' : 'DÉFAITE';
    $('end').classList.toggle('lost', !won);
    $('endScore').textContent = `${S.players[this.me].pts} – ${S.players[1 - this.me].pts} · ${S.round} tours`;
    $('endStats').innerHTML = statHTML();
    setTimeout(() => show('end'), 900);
  },

  quit() { this.alive = false; clearTimeout(this.autoTimer); world.clearAll(); show('menu'); attract(); },
};

function targetIcon(t) {
  const S = game.S;
  if (t.t === 'ent') { const e = getEnt(S, t.id); return `<img src="${world.iconURL[e.kind] || ''}" alt="">`; }
  if (t.t === 'grave') return `<img src="${world.iconURL[S.grave[t.i].kind] || ''}" alt="">`;
  if (t.t === 'chaos') return `<img src="${world.iconURL[S.players[t.p].chaos] || ''}" alt="">`;
  if (t.t === 'card') return `<span class="ci">${rankLabel(S.players[t.p].card.v)}</span>`;
  if (t.t === 'player') return '<span class="ci player">J</span>';
  return '<span class="ci">GO</span>';
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

// Ambiance du menu : quelques objets qui tournent sur la table.
let attractTimer = null;
function attract() {
  clearInterval(attractTimer);
  world.clearAll();
  const picks = ['reine', 'flingue', 'peche', 'bombe', 'arbre', 'photocop', 'chat', 'roi'];
  picks.forEach((k, i) => {
    const e = { id: -100 - i, kind: k, owner: i % 2, zone: KINDS[k].zone, x: (i * 2) % 5, y: i % 2 ? 1 : 3, stage: 2, age: 1 };
    const m = world.addEnt(e, { scale: 0.85 });
    if (e.zone === 'board') world.showBoard(true);
    m.obj.rotation.y = Math.random() * 6;
  });
  world.relayout(0.01);
  attractTimer = setInterval(() => { for (const m of world.models.values()) m.obj.rotation.y += 0.02; }, 33);
}

// ------------------------------------------------------------ démarrage
const world = new World($('stage'), $('overlay'));
const ui = new UI();
const anim = new Animator(world, ui);

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  world.update(dt);
  requestAnimationFrame(frame);
}

async function boot() {
  try { await Promise.all([document.fonts.load('40px "Bowlby One"'), document.fonts.load('800 16px "Bricolage Grotesque"')]); } catch { /* police de secours */ }
  world.renderIcons();
  try {
    const cap = window.Capacitor;
    if (cap?.isNativePlatform?.()) {
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
  const unlock = () => initAudio();
  window.addEventListener('pointerdown', unlock, { passive: true });
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
    const rows = S ? S.log.slice(-60).reverse().map((l) => `<div><b>T${l.r}</b>${l.text}</div>`).join('') : '';
    openSheet(`<h2>Journal</h2><div class="log-list">${rows || '<p>Rien pour l’instant.</p>'}</div>`);
  };
  $('btnSheetClose').onclick = closeSheet;
  $('sheet').addEventListener('click', (e) => {
    if (e.target === $('sheet')) closeSheet();
    const k = e.target.closest('.codex button');
    if (k && seen.has(k.dataset.kind)) openSheet(kindHTML(k.dataset.kind) + '<p><button class="btn ghost small" id="codexBack">RETOUR</button></p>');
    else if (k) sfx('lose');
    if (e.target.id === 'codexBack') openSheet(codexHTML());
  });
  $('btnPass').onclick = () => { sfx('tap'); game.pass(); };
  $('btnBack').onclick = () => game.backToItems();
  $('ticker').onclick = () => $('btnLog').onclick();

  let down = null;
  $('stage').addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  $('stage').addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
    if (!$('hud').hidden && $('pause').hidden) game.onTap(e.clientX, e.clientY);
  });
}

window.__wac = { game, world, ui };
boot();
