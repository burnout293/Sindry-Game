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

puis ouvrir <http://localhost:8130/>.

| | Clavier | Manette |
|---|---|---|
| Changer de voie | ← → (ou Q D) | stick, croix |
| Sauter (maintenir pour plus haut) | ↑, Espace (ou Z) | A, gâchette droite |
| Glisser, ou plonger en l'air | ↓ (ou S) | B, stick vers le bas |
| Pause | Échap, P | Start |
| Réglages : Vitesse, Turbo, Réparer | 1, 2, 3 | X, Y, LB |

## Les règles

- Des **courses** de plus en plus longues, avec une ligne d'arrivée. Après chaque ligne, des
  **réglages** à placer : Vitesse, Turbo (on part déjà en turbo), Réparer (rend les dents).
- Trois **dents de réserve**. Un choc en casse une, et elles ne reviennent pas toutes seules
  d'une course à l'autre. Sans dent de réserve, la partie est terminée.
- Le **turbo** se ramasse sur la route et s'empile jusqu'à ×3 : plus vite, et la distance
  rapporte double, triple ou quadruple. Il ne s'éteint que lorsqu'une dent casse.
- Des **réglages** se ramassent aussi en chemin, et l'une des deux branches de chaque fourche
  en cache un.
- La **sauvegarde** est gardée dans le navigateur, et s'exporte ou s'importe en fichier
  depuis l'accueil.

## Le code

| Fichier | Rôle |
|---|---|
| `src/track.js` | le tracé : lignes droites, virages, pentes, tunnels, fourches |
| `src/course.js` | le parcours en coordonnées de piste (voies, obstacles, jetons) |
| `src/scene.js` | la scène three.js : la ville, la piste, l'engrenage, la caméra |
| `src/effects.js` | la couche « grunge » en 2D : traits de vitesse, encre, compteur |
| `src/main.js` | les règles, la physique, les écrans |
| `src/input.js`, `src/save.js`, `src/art.js` | clavier et manette, sauvegarde, dessins |

three.js 0.169 (licence MIT) est dans `vendor/three/`, la police Sindry Mono (OFL 1.1) dans `fonts/`.
