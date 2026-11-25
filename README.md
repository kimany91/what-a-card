# What a Card — v0.1.0

Une bataille de cartes en 3D qui part en vrille. Jeu mobile Android, en portrait.

## Installer l'APK

1. Ouvre la page **Releases** du dépôt depuis ton téléphone et prends la dernière version `what-a-card-v0.1.0.apk`.
   (L'APK est aussi disponible dans l'onglet **Actions**, dans les « artifacts » de chaque construction.)
2. Ouvre le fichier. Android demande d'autoriser l'installation d'applications inconnues : accepte pour ton navigateur ou ton gestionnaire de fichiers.
3. Lance **What a Card**.

L'APK est une version de test (signée avec une clé de debug). Pour passer d'une version à l'autre, désinstalle d'abord l'ancienne.

## Règles

### La base : une bataille
- Paquet de 52 cartes, la moitié pour chaque joueur.
- À chaque tour, les deux joueurs retournent leur carte du dessus. La plus forte gagne le pli : **+1 point**, et les cartes passent sous son paquet.
- Égalité : **BATAILLE**. Les cartes restent au milieu et le pli suivant rapporte tout.
- Le premier à **20 points** gagne (15, 20 ou 30 au choix dans le menu). Un joueur sans cartes perd.

### Le chaos
Le premier tour est normal. Ensuite, chaque joueur retourne aussi une **carte chaos**. Elle n'a pas de valeur : elle ajoute un objet, une pièce d'échecs ou une règle qui reste en jeu.

### Un tour
1. Le monde avance : les arbres poussent, les bombes décomptent, les morts se réincarnent.
2. Les cartes se retournent. Les cartes chaos sont visibles mais pas encore actives.
3. Chacun peut utiliser **un objet** (l'initiative alterne). Pêcher ou brûler la carte chaos adverse l'annule.
4. Les cartes chaos s'activent, puis on compare les valeurs.

- Un joueur tué perd le pli et **2 points** à sa réincarnation.
- **6 objets maximum** devant chaque joueur : au 7e, le plus ancien part au cimetière.

### Tout est systémique
Les outils agissent sur des propriétés (inflammable, métal, pêchable, sur l'échiquier, vivant, fragile), pas sur des cartes précises. Le Briquet brûle aussi les pièces d'échecs en bois, l'Aimant attire tout ce qui est en métal, l'eau empêche le feu et enraye les armes.

### Les 27 cartes chaos
Reine d'échecs, Roi d'échecs (+1 à tes cartes), Boule de billard, Canne à pêche, Flingue, Arbre, Briquet, Seau d'eau, Bombe à retardement, Pion, Tour, Miroir, Aimant, Chat noir, Tronçonneuse, Trou noir, Orage, Couronne, Dé pipé, Sablier, Peau de banane, Photocopieuse, Ventilateur, Défibrillateur, Engrais, Monde à l'envers, Pelle.
Le détail de chaque carte est dans le jeu (menu **Cartes**) et dans `src/engine/kinds.js`.

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
