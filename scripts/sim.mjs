// Fait jouer des parties bot contre bot pour vérifier que le moteur ne plante pas.
import { newGame, nextRound, act, drainEvents } from '../src/engine/engine.js';
import { chooseAction } from '../src/engine/bot.js';
const games = +(process.argv[2] || 30);
let rounds = 0, wins = [0, 0], types = {}, maxEnts = 0, actions = {};
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const S = newGame({ names: ['A', 'B'], target: 20 });
  nextRound(S);
  let guard = 0;
  while (S.phase !== 'over' && guard++ < 400) {
    for (const e of drainEvents(S)) { types[e.type] = (types[e.type] || 0) + 1; if (e.type === 'use') actions[e.kind] = (actions[e.kind] || 0) + 1; }
    if (S.phase === 'action') {
      const a = chooseAction(S, S.turn);
      if (!act(S, S.turn, a)) throw new Error('action refusée');
    } else if (S.phase === 'result') nextRound(S);
    maxEnts = Math.max(maxEnts, S.ents.length);
    const total = S.players[0].deck.length + S.players[1].deck.length + S.pot.length;
    if (S.players.some(p => p.pts < 0)) throw new Error('points négatifs');
  }
  rounds += S.round;
  if (S.winner != null) wins[S.winner]++;
}
console.log({ games, avgRounds: (rounds / games).toFixed(1), wins, maxEnts, ms: Date.now() - t0 });
console.log('actions', actions);
console.log('events', types);
