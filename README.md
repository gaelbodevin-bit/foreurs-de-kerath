# Foreurs de Kerath

Jeu de stratégie souterraine en 3D, jouable dans le navigateur : forez la roche, bâtissez une cité
sous la croûte, démasquez le traître de votre conseil et prenez le contrôle de toute la planète,
une région après l'autre.

Le jeu s'inspire de la boucle de minage de _LEGO Rock Raiders_ (1999), à laquelle il ajoute une
vraie couche de gestion de cité et une campagne planétaire. C'est une création originale, sans
aucun lien avec LEGO : ni personnage, ni nom, ni élément graphique ou sonore n'en provient. Les
modèles et les textures viennent de packs CC0 de Kenney et de Poly Haven
([crédits](public/assets/CREDITS.md)). La Faune et le Cœur du Dormeur sont construits à partir de
formes simples, et tous les sons sont synthétisés.

## Démarrer

Il faut Node.js 20 ou plus récent.

```bash
npm install
```

```bash
npm run dev
```

## Comment jouer

| Action                      | Commande                                                |
| --------------------------- | ------------------------------------------------------- |
| Marquer la roche à forer    | Glisser sur les parois (recommencer annule)             |
| Sélectionner                | Clic, Maj + clic pour en ajouter                        |
| Sélectionner des gardes     | Glisser autour d'eux                                    |
| Déplacer des unités         | Clic droit                                              |
| Poser un bâtiment           | Choisir dans le menu, puis cliquer (Maj pour enchaîner) |
| Tracer une voie énergétique | Touche P ou menu, puis glisser                          |
| Caméra                      | ZQSD ou flèches, molette, A/E (clavier AZERTY)          |
| Pause et vitesse            | Espace, puis 1, 2, 3                                    |
| Cité et enquête             | C et J                                                  |

**Pour bien commencer :** forez cristal, minerai et glace autour du Noyau de commande. Construisez
une serre et un fondoir collés au Noyau (les bâtiments adjacents sont raccordés au réseau), puis un
habitat et une centrale dès que l'énergie manque.

## Contenu

- **7 régions** sur une carte de la planète, chacune avec ses objectifs et un bonus permanent une
  fois conquise
- **12 ressources** : minerai, cristal, roche, glace, soufre, or, reliques, métal, eau, nourriture,
  alliage et crédits
- **16 bâtiments** et **4 types d'unités** : foreur, garde, foreuse lourde et mule
- **Une cité vivante** : logement, emplois, oxygène, énergie, moral, impôts et décrets
- **Un complot** : un conseiller trahit, tiré au sort à chaque campagne. Rassemblez les indices,
  puis accusez-le. Une erreur coûte cher.
- **Trois camps ennemis** : la Faune, le Consortium Vantor et les Enfants du Noyau
- **10 technologies** conservées d'une mission à l'autre et **3 fins** selon vos décisions

## Développement

| Commande        | Rôle                                          |
| --------------- | --------------------------------------------- |
| `npm run dev`   | Serveur de développement                      |
| `npm run build` | Vérification des types et build de production |
| `npm test`      | Tests, dont des parties jouées par un bot     |
| `npm run check` | Types, lint, format et tests (comme la CI)    |

```text
src/
├── data/       Contenu du jeu : régions, bâtiments, unités, intrigues, technologies
├── sim/        Règles du jeu, sans aucun rendu, déterministes et sérialisables
├── campaign/   Progression entre les missions et sauvegarde
├── render/     Scène Three.js : terrain, modèles, décor, effets, sons
└── ui/         Interface HTML : mission, carte de la planète
public/assets/  Modèles, textures et licences (CC0)
tests/          Tests de la simulation et parties automatiques
docs/           Architecture et conception du jeu
```

Pour aller plus loin : [architecture](docs/ARCHITECTURE.md), [conception du jeu](docs/GAME_DESIGN.md)
et [guide de contribution](CONTRIBUTING.md).

## État du projet

Prototype jouable du début à la fin. Le bot de test gagne les deux premières régions (Val de Cendre
et Failles de Verre). Les cinq suivantes tournent sans plantage, mais leur équilibrage reste à
valider par de vraies parties : le bot n'a pas encore prouvé qu'elles se gagnent.

## Licence

[MIT](LICENSE)
