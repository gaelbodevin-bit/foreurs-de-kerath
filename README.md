# Foreurs de Kerath

Jeu de stratégie souterraine en 3D, jouable dans le navigateur : forez la roche, bâtissez une cité
sous la croûte, démasquez le traître de votre conseil et prenez le contrôle de toute la planète,
secteur après secteur, à partir d'une seule cité qui grandit tout au long de la partie.

Le jeu s'inspire de la boucle de minage de _LEGO Rock Raiders_ (1999), à laquelle il ajoute une
vraie couche de gestion de cité et une campagne planétaire. C'est une création originale, sans
aucun lien avec LEGO : ni personnage, ni nom, ni élément graphique ou sonore n'en provient. Les
modèles et les textures viennent de packs CC0 de Kenney et de Poly Haven
([crédits](public/assets/CREDITS.md)). La Faune et le Cœur du Dormeur sont construits à partir de
formes simples. Les bruitages viennent aussi de Kenney, l'ambiance de la grotte est synthétisée, et les voix sont générées avec Piper (voir les crédits pour leurs licences).

## Démarrer

Il faut Node.js 20 ou plus récent.

```bash
npm install
```

```bash
npm run dev
```

## Comment jouer

| Action                            | Commande                                                |
| --------------------------------- | ------------------------------------------------------- |
| Marquer la roche à forer          | Glisser sur les parois (recommencer annule)             |
| Sélectionner                      | Clic, Maj + clic pour en ajouter                        |
| Sélectionner des gardes           | Glisser autour d'eux                                    |
| Déplacer des unités               | Clic droit                                              |
| Poser un bâtiment                 | Choisir dans le menu, puis cliquer (Maj pour enchaîner) |
| Tracer une voie                   | Touche P ou menu, puis glisser                          |
| Caméra                            | ZQSD ou flèches, molette, A/E (clavier AZERTY)          |
| Pause et vitesse                  | Espace, puis 1, 2, 3                                    |
| Cité, recherche, conseil, enquête | C, R, K et J                                            |
| Carte de la planète               | M                                                       |

**Pour bien commencer :** forez minerai et cristal, puis creusez jusqu'à CITY, l'anneau turquoise
de la mini-carte. Vous devenez gouverneur : l'onglet Cité, le conseil et la recherche s'ouvrent.
Construisez de quoi loger, nourrir et faire respirer la colonie, puis un laboratoire.

## Contenu

- **Une seule carte, une seule cité** : 7 secteurs autour de votre colonie, chacun avec ses objectifs
  et un bonus permanent une fois conquis. La roche entre eux demande de meilleurs outils.
- **Une progression par la recherche** : de la pioche au marteau-piqueur puis au laser, du laboratoire
  à l'atelier de véhicules
- **Un gouverneur et son conseil** : quatre sièges, et des candidats à recruter pour leurs traits
- **Des salles de monstres** : endormis dans des cavernes scellées, avec un butin
- **Des missions en continu** : commandes, chantiers, sauvetages, relevés, incursions et réfugiés
- **12 ressources** : minerai, cristal, roche, glace, soufre, or, reliques, métal, eau, nourriture,
  alliage et crédits
- **17 bâtiments** et **4 types d'unités** : foreur, garde, foreuse lourde et mule
- **Une cité vivante** : logement, emplois, oxygène, énergie, moral, impôts et décrets
- **Un complot** : un conseiller trahit, tiré au sort à chaque partie. Rassemblez les indices,
  puis accusez-le. Une erreur coûte cher.
- **Trois camps ennemis** : la Faune, le Consortium Vantor et les Enfants du Noyau
- **16 technologies** et **3 fins** selon vos décisions

## Développement

| Commande        | Rôle                                          |
| --------------- | --------------------------------------------- |
| `npm run dev`   | Serveur de développement                      |
| `npm run build` | Vérification des types et build de production |
| `npm test`      | Tests, dont des parties jouées par un bot     |
| `npm run check` | Types, lint, format et tests (comme la CI)    |

```text
src/
├── data/       Contenu du jeu : secteurs, bâtiments, unités, intrigues, technologies, répliques
├── sim/        Règles du jeu, sans aucun rendu, déterministes et sérialisables
├── campaign/   Sauvegarde
├── render/     Scène Three.js : terrain, modèles, décor, lumière, effets, sons
└── ui/         Interface HTML : partie, menus, carte de la planète
public/assets/  Modèles, textures, sons et licences (CC0)
tests/          Tests de la simulation et parties automatiques
docs/           Architecture et conception du jeu
```

Pour aller plus loin : [architecture](docs/ARCHITECTURE.md), [conception du jeu](docs/GAME_DESIGN.md)
et [guide de contribution](CONTRIBUTING.md).

## État du projet

Prototype jouable. Le bot de test conquiert le premier secteur, puis une longue partie tourne sans
plantage sur une seule carte. L'équilibrage du reste de la campagne reste à valider par de vraies
parties : le bot n'a pas prouvé qu'elle se gagne, et il perd sa cité au bout d'une demi-heure.

## Licence

[MIT](LICENSE)
