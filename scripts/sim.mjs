// Fait jouer des parties bot contre bot pour vérifier que le moteur ne plante pas.
import { newGame, nextRound, act, draw, drainEvents } from '../src/engine/engine.js';
import { chooseAction } from '../src/engine/bot.js';

const games = +(process.argv[2] || 20);
let rounds = 0, maxHand = 0, maxEnts = 0;
const wins = [0, 0], plays = {}, moves = {};
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const S = newGame({ names: ['A', 'B'], target: 20 });
  nextRound(S);
  let guard = 0;
  while (S.phase !== 'over' && guard++ < 3000) {
    for (const e of drainEvents(S)) {
      if (e.type === 'play') plays[e.kind] = (plays[e.kind] || 0) + 1;
      if (e.type === 'move' && e.cause === 'chess') moves[e.cap ? 'capture' : 'move'] = (moves[e.cap ? 'capture' : 'move'] || 0) + 1;
    }
    if (S.phase === 'draw') { if (!draw(S, S.turn)) throw new Error('pioche refusée'); }
    else if (S.phase === 'action') {
      const c = chooseAction(S, S.turn);
      if (!act(S, S.turn, c ? c.a : null, c ? c.aim : null)) throw new Error('action refusée');
    } else if (S.phase === 'result') nextRound(S);
    maxHand = Math.max(maxHand, ...S.players.map((p) => p.hand.length));
    maxEnts = Math.max(maxEnts, S.ents.length);
    if (S.players.some((p) => p.pts < 0)) throw new Error('points négatifs');
  }
  if (guard >= 3000) throw new Error('partie bloquée');
  rounds += S.round;
  if (S.winner != null) wins[S.winner]++;
}
console.log({ games, avgRounds: (rounds / games).toFixed(1), wins, maxHand, maxEnts, ms: Date.now() - t0 });
console.log('cartes jouées', plays);
console.log('échecs', moves);
