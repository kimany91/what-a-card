# What a Card — v0.4.0

Une bataille de cartes en 3D qui part en vrille. Jeu mobile Android, en portrait.

## Installer l'APK

1. Ouvre la page **Releases** du dépôt depuis ton téléphone et prends la dernière version `what-a-card-v0.4.0.apk`.
   (L'APK est aussi disponible dans l'onglet **Actions**, dans les « artifacts » de chaque construction.)
2. Ouvre le fichier. Android demande d'autoriser l'installation d'applications inconnues : accepte pour ton navigateur ou ton gestionnaire de fichiers.
3. Lance **What a Card**.

L'APK est une version de test (signée avec une clé de debug). Pour passer d'une version à l'autre, désinstalle d'abord l'ancienne.

## Règles

- **Piocher** : à ton tour, ta pioche brille. Touche-la, puis glisse la carte à gauche ou à droite pour la retourner.
- **Carte normale** : c’est ta carte du pli (2 à As). La plus forte gagne : +1 point.
- **Objets** : chaque joueur commence avec 2 objets en main. À partir du tour 2, tu pioches toujours au moins un objet (souvent 2, parfois 3) avant ta carte normale.
- **Ton tour d’action** : joue des objets de ta main (chacun ne sert qu’une fois), déplace une de tes pièces d’échecs (un coup par tour), ou passe. On joue chacun son tour jusqu’à ce que les deux passent.
- **Égalité** : BATAILLE, le pli suivant rapporte plus.
- **Mort** (Flingue, foudre…) : tu perds le pli et 2 points à ta réincarnation.
- **Victoire** : 20 points (15 ou 30 au choix).

### Les gestes
- **Flingue** : vue subjective, tu vises en glissant, tu tires avec le bouton TIRER. On peut rater.
- **Boule de billard** : pose ta boule sur l’échiquier, vise sur le côté, tire la queue vers le bas et lâche. Une vraie physique décide de ce qui tombe.
- **Canne à pêche** : touche ta cible, puis mouline en cercle. Trop vite, la ligne casse.
- **Briquet** : frotte la molette, puis maintiens pour brûler (un As ne brûle pas, les pièces d’échecs non plus). **Tronçonneuse** : tire la corde, puis maintiens.
- **Pelle**, **Engrais** : tape vite. **Dé** : lance-le d’un geste. **Seau**, **Aimant** : maintiens.

- **Gants de boxe** : duel, tapez le plus vite pendant 3 secondes (aussi quand le bot te défie).
- **Ballon de foot** : penalty, choisis gauche, centre ou droite (et où plonger quand le bot tire).
- **Basket, Lance-pierre, Marteau** : arrête l’aiguille dans la zone verte. **Fléchettes** : trois fois, au centre.
- **Bowling** : glisse pour choisir la colonne, puis LANCER. **Glaçon**, **Taser** : maintiens. **Pile ou face** : glisse vers le haut.

### Les échecs
Reine (lignes et diagonales), Tour (lignes), Fou (diagonales), Cavalier (en L, saute par-dessus tout), Roi (une case, +1 à tes cartes), Pion (avance d’une case, prend en diagonale, devient Reine au bout). Prendre le Roi adverse : échec et mat, il perd 2 points.

### Tout est systémique
Les outils agissent sur des propriétés (inflammable, métal, pêchable, sur l’échiquier, vivant, fragile). Le Briquet brûle aussi les pièces en bois, l’Aimant vole tout ce qui est en métal, l’eau empêche le feu.

### États
- **Carte gelée** (Glaçon) : sa valeur ne bouge plus. Le Briquet ou le Marteau la libèrent.
- **Joueur mouillé** (Seau, Orage) : le Taser le tue au lieu de l’assommer. Le Parapluie protège.
- **Assommé** (Taser) : plus d’objet jusqu’à la fin du tour.
- **Carton jaune** : au deuxième, carton rouge et pli perdu.

Touche n’importe quoi sur la table ou dans ta main pour voir sa fiche, avec une petite animation qui montre ce qu’elle fait.

### Les 44 cartes objets
- **Échecs** : Reine, Roi, Tour, Fou, Cavalier, Pion.
- **Armes et attaques** : Flingue, Briquet, Tronçonneuse, Taser, Lance-pierre, Marteau, Missile, Bombe, Boule de billard, Boule de bowling.
- **Vol et contrôle** : Canne à pêche, Aimant, Photocopieuse, Carte Échange, Loupe, Carton jaune, Peau de banane.
- **Sport et hasard** : Gants de boxe, Ballon de foot, Ballon de basket, Fléchettes, Pile ou face, Dé pipé.
- **Protection** : Miroir, Défibrillateur, Chien de garde, Coffre-fort, Parapluie, Couronne, Rocher.
- **Nature et météo** : Arbre, Engrais, Seau d’eau, Glaçon, Orage, Chat noir, Monde à l’envers.
- **Divers** : Pelle (ressort une carte du cimetière).

## Développement

```bash
npm install
npm run dev        # jeu dans le navigateur
npm test           # parties bot contre bot pour tester le moteur
npm run build && npx cap sync android   # prépare le projet Android
```

- `src/engine/` : règles du jeu (logique pure) et IA du bot.
- `src/view/` : rendu 3D (three.js), animations, effets, sons synthétisés.
- `android/` : projet Capacitor. L'APK est construit par GitHub Actions (`.github/workflows/android.yml`).
