// Catalogue des cartes chaos de What a Card.
// zone : 'board' = posé sur l'échiquier, 'side' = posé devant son propriétaire, 'global' = règle.
// tags : piece (sur l'échiquier), feu (inflammable), metal, peche (pêchable), vivant, verre.

export const KINDS = {
  reine: {
    name: 'Reine d’échecs', zone: 'board', tags: ['piece', 'feu', 'peche'], cd: 2, worth: 6, weight: 2,
    color: '#f4d35e',
    desc: 'Pose l’échiquier. Elle capture une pièce adverse sur l’échiquier, puis se repose 2 tours.',
    combo: ['Elle est en bois : le Briquet la brûle.', 'Capturer le Roi adverse lui coûte 2 points.', 'Un Pion qui survit 3 tours devient une Reine.'],
  },
  roi: {
    name: 'Roi d’échecs', zone: 'board', tags: ['piece', 'feu', 'peche'], worth: 5, weight: 2,
    color: '#f4d35e',
    desc: 'Tant qu’il est sur l’échiquier, toutes les cartes de son propriétaire gagnent +1.',
    combo: ['S’il est détruit, c’est échec et mat : son propriétaire perd 2 points.', 'La Canne à pêche peut le voler, et le bonus change de camp.'],
  },
  billard: {
    name: 'Boule de billard', zone: 'side', tags: ['peche'], worth: 3, weight: 2,
    color: '#2a9d8f',
    desc: 'Chaque tour, frappe une pièce de l’échiquier avec la queue. Ce qui tombe de la table disparaît.',
    combo: ['Plus la pièce est près du bord, plus elle tombe facilement.', 'Une pièce ratée glisse d’une case, parfois vers une Bombe.'],
  },
  peche: {
    name: 'Canne à pêche', zone: 'side', tags: ['feu'], uses: 1, worth: 3, weight: 2,
    color: '#3a86ff',
    desc: 'Une seule fois : pêche la carte de l’adversaire, sa carte chaos, ou un de ses objets.',
    combo: ['Carte de bataille pêchée : elle ne compte pas et finit dans ton paquet.', 'Carte chaos pêchée : son effet est annulé et tu la tireras au prochain tour.', 'Tu peux pêcher sa Reine, son Roi ou son Flingue.'],
  },
  flingue: {
    name: 'Flingue', zone: 'side', tags: ['metal', 'peche'], uses: 3, worth: 4, weight: 2,
    color: '#e63946',
    desc: '3 balles. Tire sur l’adversaire, sur sa carte (−3) ou sur n’importe quel objet.',
    combo: ['Un joueur abattu perd le tour et 2 points à sa réincarnation.', 'Tirer sur une Bombe la fait exploser.', 'Mouillé, il s’enraye.', 'Les balles ricochent sur la Tour.'],
  },
  arbre: {
    name: 'Arbre', zone: 'side', tags: ['feu', 'vivant'], worth: 4, weight: 2,
    color: '#52b788',
    desc: 'Pousse en 3 tours. Adulte, il donne 3 cartes fortes (Valet à As) sur le dessus de ton paquet, puis il meurt.',
    combo: ['Le Briquet le brûle, la Tronçonneuse le coupe.', 'L’eau et l’Engrais le font pousser plus vite.', 'L’Orage le fait pousser deux fois plus vite.'],
  },
  briquet: {
    name: 'Briquet', zone: 'side', tags: ['metal', 'peche'], uses: 3, worth: 3, weight: 2,
    color: '#fb8500',
    desc: '3 utilisations. Brûle la carte adverse, sa carte chaos, ou tout ce qui est inflammable.',
    combo: ['Ne brûle rien de mouillé.', 'Inutilisable pendant l’Orage.', 'Enflamme une Bombe, qui explose aussitôt.', 'Brûler l’Engrais le fait exploser.'],
  },
  seau: {
    name: 'Seau d’eau', zone: 'side', tags: ['peche'], uses: 1, worth: 2, weight: 2,
    color: '#48cae4',
    desc: 'Une fois : mouille n’importe quoi pendant 3 tours. Une carte mouillée perd 2.',
    combo: ['Désamorce une Bombe.', 'Fait pousser un Arbre.', 'Enraye un Flingue, court-circuite un Défibrillateur.', 'Fait fuir le Chat, emporte la Peau de banane.'],
  },
  bombe: {
    name: 'Bombe à retardement', zone: 'board', tags: ['metal'], timer: 3, worth: 2, weight: 2,
    color: '#495057',
    desc: 'Explose au bout de 3 tours : détruit tout autour d’elle et l’adversaire perd 1 point.',
    combo: ['Le feu ou une balle la font exploser tout de suite.', 'L’eau la désamorce.', 'Une explosion fait exploser les bombes voisines.'],
  },
  pion: {
    name: 'Pion', zone: 'board', tags: ['piece', 'feu', 'peche'], worth: 2, weight: 2,
    color: '#f4d35e',
    desc: 'Une petite pièce. S’il survit 3 tours, il devient une Reine.',
    combo: ['L’Engrais le transforme tout de suite en Reine.'],
  },
  tour: {
    name: 'Tour', zone: 'board', tags: ['piece'], worth: 3, weight: 2,
    color: '#adb5bd',
    desc: 'Tant qu’elle est debout, ta carte de bataille ne peut pas être visée.',
    combo: ['En pierre : elle ne brûle pas et les balles ricochent.', 'Le billard, la Bombe et la Reine peuvent l’abattre.'],
  },
  miroir: {
    name: 'Miroir', zone: 'side', tags: ['verre', 'peche'], worth: 3, weight: 2,
    color: '#caf0f8',
    desc: 'Renvoie la première attaque contre toi ou tes cartes. Il se brise : 3 tours de malheur (−1).',
    combo: ['Un tir sur toi revient sur le tireur.', 'Le briser directement donne aussi le malheur à son propriétaire.'],
  },
  aimant: {
    name: 'Aimant', zone: 'side', tags: ['metal'], cd: 2, worth: 3, weight: 2,
    color: '#d62828',
    desc: 'Vole un objet en métal à l’adversaire, puis se recharge 2 tours.',
    combo: ['Flingue, Briquet, Couronne, Tronçonneuse…', 'Pendant l’Orage, le métal attire la foudre.'],
  },
  chat: {
    name: 'Chat noir', zone: 'board', tags: ['vivant', 'peche'], worth: 1, weight: 2,
    color: '#22223b',
    desc: 'Chaque tour, il a une chance sur deux de pousser hors de la table une pièce au bord. Même les tiennes.',
    combo: ['L’eau le fait fuir.', 'On peut le pêcher.'],
  },
  tronco: {
    name: 'Tronçonneuse', zone: 'side', tags: ['metal'], uses: 2, worth: 3, weight: 2,
    color: '#ffb703',
    desc: '2 utilisations. Coupe en deux la carte adverse, ou découpe tout ce qui est en bois.',
    combo: ['Sur un Arbre presque adulte, c’est toi qui ramasses ses fruits.'],
  },
  trounoir: {
    name: 'Trou noir', zone: 'board', tags: [], timer: 4, worth: 0, weight: 1,
    color: '#5a189a',
    desc: 'Aspire chaque tour l’objet le plus proche. Au bout de 4 tours, il avale les deux cartes du tour.',
    combo: ['Rien ne peut le détruire.'],
  },
  orage: {
    name: 'Orage', zone: 'global', tags: [], worth: 0, weight: 1, turns: 3,
    color: '#4361ee',
    desc: '3 tours. Tout est mouillé, le feu ne marche plus. La foudre frappe celui qui porte le plus de métal.',
    combo: ['Les Arbres poussent deux fois plus vite.', 'Le Ventilateur chasse l’Orage.'],
  },
  couronne: {
    name: 'Couronne', zone: 'side', tags: ['metal', 'peche'], worth: 3, weight: 2,
    color: '#ffd166',
    desc: 'Tu gagnes toutes les égalités : plus de bataille contre toi.',
    combo: ['En métal : l’Aimant peut te la prendre.'],
  },
  de: {
    name: 'Dé pipé', zone: 'side', tags: ['feu', 'peche'], uses: 2, worth: 2, weight: 2,
    color: '#f1faee',
    desc: '2 utilisations. Relance ta carte de bataille : elle prend une valeur au hasard de 1 à As.',
    combo: [],
  },
  sablier: {
    name: 'Sablier', zone: 'side', tags: ['verre', 'peche'], uses: 1, worth: 2, weight: 2,
    color: '#e9c46a',
    desc: 'Une fois : le temps s’arrête au prochain tour. L’adversaire ne joue pas et rien ne pousse ni ne décompte.',
    combo: ['Retarde une Bombe ou un Arbre.'],
  },
  banane: {
    name: 'Peau de banane', zone: 'side', tags: [], worth: -2, weight: 2,
    color: '#ffe66d',
    desc: 'Piège posé chez l’adversaire. À sa prochaine action, une chance sur deux de glisser : l’objet se casse.',
    combo: ['Si c’est le Flingue, le coup part tout seul.', 'L’eau ou une balle l’enlèvent.'],
  },
  photocop: {
    name: 'Photocopieuse', zone: 'side', tags: [], uses: 1, worth: 3, weight: 2,
    color: '#8d99ae',
    desc: 'Une fois : copie un objet pour toi, la carte adverse, ou l’effet de sa carte chaos.',
    combo: ['Copie son Flingue, son Roi ou son Arbre à moitié poussé.'],
  },
  ventilo: {
    name: 'Ventilateur', zone: 'side', tags: ['metal'], cd: 2, worth: 2, weight: 2,
    color: '#90e0ef',
    desc: 'Souffle : tout l’échiquier glisse d’une case vers l’adversaire. Ce qui sort tombe.',
    combo: ['Sèche tout ce qui est mouillé.', 'Chasse l’Orage.'],
  },
  defib: {
    name: 'Défibrillateur', zone: 'side', tags: ['metal', 'peche'], worth: 4, weight: 2,
    color: '#ef476f',
    desc: 'La première fois que tu meurs, il te réanime aussitôt, sans perte de points.',
    combo: ['Mouillé, il court-circuite et ne sert à rien.'],
  },
  engrais: {
    name: 'Engrais', zone: 'side', tags: ['feu', 'peche'], uses: 1, worth: 2, weight: 2,
    color: '#7f5539',
    desc: 'Une fois : +2 crans à un Arbre, promotion immédiate d’un Pion, ou +3 à ta carte.',
    combo: ['S’il brûle, il explose et détruit tous les objets de son propriétaire.'],
  },
  envers: {
    name: 'Monde à l’envers', zone: 'global', tags: [], worth: 0, weight: 1, turns: 3,
    color: '#c77dff',
    desc: '3 tours. La plus petite carte gagne.',
    combo: ['Le bonus du Roi devient un poison.', 'Le −3 du Flingue devient un cadeau.'],
  },
  pelle: {
    name: 'Pelle', zone: 'side', tags: ['feu', 'peche'], uses: 2, worth: 2, weight: 2,
    color: '#9c6644',
    desc: '2 utilisations. Déterre un objet du cimetière : il est à toi.',
    combo: ['Tout objet détruit ou épuisé finit au cimetière.'],
  },
};

export const KIND_IDS = Object.keys(KINDS);
export const hasTag = (kind, t) => KINDS[kind].tags.includes(t);
