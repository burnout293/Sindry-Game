# Roue libre

Le jeu de Sindry, en 3D : l'engrenage de l'icône file dans une ville dessinée à l'encre noire
sur fond blanc. Un « runner » : trois voies, des virages, des pentes, des tunnels et des
fourches où il faut choisir son côté.

## Jouer

Le jeu est une page web sans étape de construction. Il faut seulement la servir en local, car
les modules ES ne se chargent pas depuis un fichier :

```bash
node outils/serveur.mjs
```

puis ouvrir <http://localhost:8130/>, sur ordinateur ou sur téléphone (même réseau).

| | Clavier | Manette | Téléphone |
|---|---|---|---|
| Changer de voie | ← → (ou Q D) | stick, croix | glisser à gauche, à droite |
| Sauter (maintenir pour plus haut) | ↑, Espace (ou Z) | A, gâchette droite | toucher, glisser vers le haut |
| Glisser, ou plonger en l'air | ↓ (ou S) | croix ou stick vers le bas | glisser vers le bas |
| Pause | Échap, P | Start | bouton II |
| Dans les menus | flèches, Espace, Retour | croix, A, B | toucher |

## Les règles

- Des **courses** longues (3 600 m, puis 900 m de plus à chaque fois), avec une ligne d'arrivée.
  Après chaque ligne : le détail de la course, puis la suivante ou le menu.
- Trois **dents de réserve**. Un choc en casse une ; elles ne reviennent pas d'une course à
  l'autre. Sans dent de réserve, la partie est terminée.
- Des **pièces** sur la route. Elles, les objets et les skins sont gardés d'une partie à l'autre.
- Le **turbo** dure 4 s, s'empile jusqu'à ×3 : plus vite, et la distance rapporte double,
  triple ou quadruple.
- La **boutique** vend des objets (Broyeur, IA, Investissement, Marqueur, Dent de réserve,
  Aimant, Turbo prolongé, Bouclier, modes rapide et tranquille) et la Réparation ; une autre
  vend des **skins**.
- Un **défi** peut se choisir pour la prochaine course : Travaux (une voie fermée, pièces ×1,5),
  Quitte ou double (une seule vie, pièces ×2).
- La **sauvegarde** est gardée dans le navigateur, et s'exporte ou s'importe en fichier.

## Le code

| Fichier | Rôle |
|---|---|
| `src/track.js` | le tracé : lignes droites, virages, pentes, tunnels, fourches |
| `src/course.js` | le parcours en coordonnées de piste (voies, obstacles, jetons) |
| `src/scene.js` | la scène three.js : la ville, la piste, l'engrenage, la caméra |
| `src/effects.js` | la couche « grunge » en 2D : traits de vitesse, encre, compteur |
| `src/main.js` | les règles, la physique, les écrans |
| `src/shop.js` | les objets, les défis, les skins |
| `src/input.js`, `src/save.js`, `src/art.js` | clavier et manette, sauvegarde, dessins |

three.js 0.169 (licence MIT) est dans `vendor/three/`, la police Sindry Mono (OFL 1.1) dans `fonts/`.
