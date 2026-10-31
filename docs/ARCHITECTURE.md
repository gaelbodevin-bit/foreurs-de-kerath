# Architecture

## Le principe : une simulation sans rendu

Toutes les règles vivent dans `src/sim`, qui n'importe jamais Three.js ni le DOM (une règle ESLint
le garantit). Trois propriétés en découlent :

- **Testable** : les tests jouent des parties entières dans Node, sans navigateur.
- **Sérialisable** : `GameState` ne contient que des données JSON. Sauvegarder revient à appeler
  `JSON.stringify`.
- **Déterministe** : le temps avance par pas fixes de 0,1 s et tout le hasard passe par une graine
  stockée dans l'état. Une même graine et les mêmes commandes donnent la même partie.

```text
         commandes (designateArea, placeBuilding, ...)
   ui/  ───────────────────────────────────────────────►  sim/  ◄── data/
    │                                                      │
    └──────► render/  ◄──── lit l'état à chaque image ─────┘
                                                           │
                       campaign/  ◄── résultat de mission ─┘
```

L'interface ne modifie jamais l'état directement : elle passe par les commandes de `sim/game.ts`.
Le rendu ne fait que lire l'état, à une exception près : il vide les files `fx` et `dirty`, qui
n'influencent pas les règles.

## Un pas de simulation

`stepGame` dans `sim/game.ts` enchaîne, dans cet ordre :

1. `updateEconomy` : réseau électrique, recettes, formation, puis cité (oxygène, nourriture, impôts,
   moral, complot, population)
2. `updateCombat` : vagues, ennemis, foreurs et gardes, tourelles, retrait des morts
3. Chaque seconde : réparations, lave, intrigues, conditions de victoire

La partie est suspendue tant qu'une décision d'intrigue attend une réponse (`story.pending`).

## Modules

| Fichier              | Rôle                                                            |
| -------------------- | --------------------------------------------------------------- |
| `sim/types.ts`       | Toutes les structures de l'état                                 |
| `sim/mapgen.ts`      | Génération des cartes à partir de `MapParams`                   |
| `sim/pathfinding.ts` | A\* pour les trajets, champ de distance pour choisir les tâches |
| `sim/workers.ts`     | File de tâches et exécution : forage, transport, chantier       |
| `sim/economy.ts`     | Réseau, production et cité                                      |
| `sim/combat.ts`      | Vagues, ennemis, gardes et tourelles                            |
| `sim/storyEngine.ts` | Déclenchement des intrigues, effets, sabotage, enquête          |
| `render/terrain.ts`  | Le terrain, un seul champ de hauteur découpé en blocs           |
| `render/view.ts`     | Synchronisation état-scène, caméra, sélection à la souris       |
| `ui/mission.ts`      | Boucle de jeu, commandes et panneaux de la mission              |
| `ui/planet.ts`       | Carte de la planète, recherche et écrans de fin                 |

## Ajouter du contenu

Le contenu se déclare dans `src/data`, sans toucher aux règles :

- **Une région** : une entrée dans `regions.ts`. La somme de `control` doit rester à 100 (testé).
- **Une intrigue** : une entrée dans `story.ts`, avec son déclencheur et ses effets.
- **Un bâtiment de production** : une entrée dans `buildings.ts` avec sa `recipe`, plus sa
  silhouette dans `render/prefabs.ts` (le compilateur signale le cas manquant).

## Assets

Les fichiers de `public/assets` sont listés dans `render/assetManifest.ts` et un test vérifie
qu'ils existent tous. `render/assets.ts` les charge une seule fois au démarrage, puis
`render/modelPrefabs.ts` les assemble en bâtiments, unités et ennemis.

Si un fichier ne se charge pas, l'erreur est seulement signalée dans la console : le rendu retombe
sur les formes de `render/prefabs.ts`, et le jeu reste jouable.

Pour ajouter un modèle : copiez le `.glb` dans `public/assets/models` (avec sa palette
`Textures/colormap.png` s'il en a une), déclarez-le dans le manifeste et citez sa source dans
`CREDITS.md`.

## Sauvegarde

`campaign/save.ts` écrit la campagne et la mission en cours dans `localStorage`, toutes les 20 s et
à chaque changement d'écran. Toute modification incompatible de `GameState` doit changer la clé de
version pour que les anciennes sauvegardes soient ignorées proprement.
