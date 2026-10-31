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
```

L'interface ne modifie jamais l'état directement : elle passe par les commandes de `sim/game.ts`.
Le rendu ne fait que lire l'état, à une exception près : il vide les files `fx` et `dirty`, qui
n'influencent pas les règles.

## Un pas de simulation

`stepGame` dans `sim/game.ts` enchaîne, dans cet ordre :

1. `updateEconomy` : réseau électrique, recettes, formation, puis cité (oxygène, nourriture, impôts,
   moral, complot, population)
2. `updateCombat` : vagues, ennemis, foreurs et gardes, tourelles, retrait des morts
3. Chaque seconde : réparations, lave, gaz, secteurs et rang de la cité, missions, intrigues, fin de
   partie

La partie est suspendue tant qu'une décision d'intrigue attend une réponse (`story.pending`).

## Modules

| Fichier              | Rôle                                                            |
| -------------------- | --------------------------------------------------------------- |
| `sim/types.ts`       | Toutes les structures de l'état                                 |
| `sim/mapgen.ts`      | Génération de la carte unique, secteur par secteur              |
| `sim/progress.ts`    | Secteurs, rang de la cité, jalons et recherche                  |
| `sim/contracts.ts`   | Missions qui arrivent en continu                                |
| `sim/council.ts`     | Conseil du gouverneur : sièges, candidats, traits, niveaux      |
| `sim/pathfinding.ts` | A\* pour les trajets, champ de distance pour choisir les tâches |
| `sim/workers.ts`     | File de tâches et exécution : forage, transport, chantier       |
| `sim/economy.ts`     | Réseau, production et cité                                      |
| `sim/combat.ts`      | Vagues, ennemis, gardes et tourelles                            |
| `sim/storyEngine.ts` | Déclenchement des intrigues, effets, sabotage, enquête          |
| `render/terrain.ts`  | Le terrain, un seul champ de hauteur découpé en blocs           |
| `render/view.ts`     | Synchronisation état-scène, caméra, sélection à la souris       |
| `ui/mission.ts`      | Boucle de jeu, commandes et panneaux                            |
| `ui/planet.ts`       | Carte de la planète, écran titre et écran de fin                |

## Ajouter du contenu

Le contenu se déclare dans `src/data`, sans toucher aux règles :

- **Un secteur** : une entrée dans `regions.ts`. Sa position `planet` place aussi son centre sur la
  carte, et la somme de `control` doit rester à 100 (testé).
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

## Rendu

`render/view.ts` passe par un `EffectComposer` : la scène est dessinée en HDR, le bloom ne retient
que ce qui dépasse 1,0, puis la sortie applique le tone mapping. Pour qu'un objet brille, il suffit
donc de lui donner une couleur supérieure à 1, sans réglage par objet.

Le reste de la lumière coûte peu : l'occlusion au pied des murs et les reflets colorés des filons
sont calculés dans les couleurs de sommet de `render/terrain.ts`, et les halos au sol sont de
simples plans additifs (`groundGlow`).

La vue mesure les images par seconde. Sous 32, elle renonce à un effet toutes les 3 secondes, dans
cet ordre : pleine résolution, bloom et ombres à chaque image, puis ombres.

## Son

`render/audio.ts` joue les bruitages listés dans le manifeste, en choisissant une prise au hasard.
Les événements `sound` de la simulation peuvent porter une position : le volume et le panoramique
suivent alors la caméra. Tout passe par un écho de grotte calculé à l'ouverture de l'audio.

L'ambiance est volontairement presque silencieuse : aucun bourdon continu, seulement un souffle à
peine audible, et de loin en loin des gouttes, un grondement ou un accord qui monte et s'éteint. La
pulsation de danger n'apparaît que près des ennemis. Tout est synthétisé. Un navigateur qui ne lit
pas l'Ogg retombe sur des sons synthétisés équivalents.

## Outils de forage

Le pouvoir de forage (`mods.drillPower`) désigne l'outil des foreurs : pioche, marteau-piqueur, puis
foreuse laser (`DRILL_TOOLS`). La simulation ne connaît que ce chiffre. Le modèle tenu en main,
l'animation, le rayon et le son s'en déduisent à l'affichage.

## Voix

Les répliques (`data/voiceLines.ts`) sont des fichiers audio pré-générés, sous-titrés en jeu.
`tools/voices` les fabrique avec Piper : l'outil ne fait pas partie du jeu, seuls les WAV sont livrés.
Après avoir modifié une réplique, il faut les régénérer. `CREW` attribue à chaque personnage une voix,
une vitesse de lecture, qui règle la hauteur, et un rythme.
`render/voice.ts` choisit qui parle et quand, et la simulation signale l'événement par un effet `voice`.

## Gaz

Certaines cavernes sont remplies de gaz (`Tile.gas`). Il y reste enfermé tant qu'aucun tunnel ne les
ouvre, puis se répand et s'éclaircit (`sim/gas.ts`). Il blesse les personnes, pas les machines. Un
ventilateur alimenté l'aspire autour de lui.

## Sauvegarde

`campaign/save.ts` écrit la partie dans `localStorage`, toutes les 20 s et à chaque changement
d'écran. Toute modification incompatible de `GameState` doit changer la clé de
version pour que les anciennes sauvegardes soient ignorées proprement.
