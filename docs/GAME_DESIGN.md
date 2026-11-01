# Conception du jeu

## Pitch

La Charte vous envoie gouverner Kerath, une planète dont toute la vie se trouve sous la croûte.
Il faut forer pour survivre, bâtir pour durer et se méfier de ceux qui vous conseillent.

## Les trois boucles

**Terrain (minutes) : creuser.** Marquer la roche, laisser les foreurs extraire et rapporter les
ressources, ouvrir de nouvelles galeries, repousser ce qui en sort, et répondre aux missions qui
arrivent sans cesse.

**Cité (dizaines de minutes) : gouverner.** Chaque citoyen respire, mange et veut un toit et un
emploi. Les impôts paient les recrues, mais pèsent sur le moral. Un moral bas ralentit la production
et nourrit le complot.

**Campagne (heures) : conquérir.** Tout se joue sur une seule carte, autour d'une seule cité. Chaque
secteur conquis ajoute un pourcentage de contrôle et un bonus permanent, et ouvre les suivants.

## La progression

Au départ, le menu de construction se limite à ce qui sert à explorer : voies, énergie, entrepôt,
ventilateur, tourelle, caserne. Rejoindre CITY fait de vous le gouverneur et ouvre le reste :
l'onglet Cité, le conseil et la recherche. Avant cela, ces éléments ne sont pas affichés.

Le laboratoire produit la recherche, dépensée en jeu :

```text
Forets trempés ─► Marteau-piqueur ─► Foreuse laser
Raffinage ─┬─► Atelier de véhicules
           ├─► Avant-postes
           └─► Métallurgie
```

La roche entre les secteurs impose cet ordre : du dur autour du premier, qu'il faut percer au
marteau-piqueur ou à la foreuse lourde, puis du basalte, réservé au laser.

La population donne le rang de la cité (Campement, Bourg, Ville, Cité, Capitale), qui ne débloque
rien : il élargit la zone constructible et agrandit le Noyau.

## La zone de la cité et les avant-postes

L'onglet Cité du menu de construction s'ouvre en rejoignant CITY. Ses bâtiments ne se posent que dans un
rayon autour du Noyau ou de CITY, qui grandit avec le rang. CITY alimente le réseau comme le Noyau :
ce qui la touche, directement ou par une voie, est sous tension.
Ceux du menu Exploration se posent partout. L'avant-poste sert de dépôt et de source à un réseau
électrique séparé, pour s'installer loin de la cité.

## Le gouverneur et son conseil

Rejoindre CITY fait du chef d'expédition le gouverneur, qui choisit son style. La ville compte déjà
douze habitants et de quoi les loger, et abrite le siège du conseil, un bâtiment unique qu'il suffit
de cliquer pour ouvrir le panneau. Le conseil a
quatre sièges : Ingénierie, Intendance, Science et Défense. Orsa Veld, Tomas Krell et Ilyane Soum
occupent les trois premiers. De nouveaux candidats se présentent toutes les 3 minutes, chacun avec un trait. Renvoyer un conseiller ne règle pas le complot.

## Le sol technique

Il se trace et se retire à la main : un foreur vient le poser ou le démonter. Le retirer rend une
roche par case et peut couper le réseau derrière lui.

## Les salles de monstres

Certaines cavernes scellées abritent des monstres endormis et un butin. Ils se réveillent ensemble
dès qu'une unité approche ou qu'on les blesse.

## Les missions

Une fois CITY rejointe, une demande arrive toutes les 35 à 75 secondes, 4 au plus à la fois : livrer une commande, bâtir un
chantier, forer jusqu'à un point marqué, sauver une équipe ensevelie, abattre une incursion ou
accueillir des réfugiés. Réussir paie, et rater pèse sur le moral.

## Chaînes de production

```text
Minerai ─► Raffinerie ─► Métal ─┐
                                ├─► Forge ─► Alliage
Soufre ─────────────────────────┘

Glace ─► Fondoir ─► Eau ─► Serre ─► Nourriture
Cristal ─► Centrale ─► Énergie
Or ─► Marché ─► Crédits
Citoyens ─► Impôts ─► Crédits
```

## Le réseau

Un bâtiment qui consomme de l'énergie doit être relié au Noyau de commande, par des voies ou par
contact avec un autre bâtiment raccordé. Les voies accélèrent aussi les
déplacements et arrêtent la lave : le tracé de la ville est une vraie décision.

## Le complot

- Le traître est tiré au sort au début de la partie : Orsa Veld, Tomas Krell ou Ilyane Soum.
- Les intrigues livrent des indices dont le texte dépend du coupable. Chacun pointe vers un métier :
  l'ingénierie, l'intendance ou le laboratoire.
- Le complot monte seul, plus vite si le moral est bas et tant que le traître est libre. À 40 % et
  70 %, des bâtiments sont sabotés. À 100 %, c'est le soulèvement.
- L'accusation arrive quand les secteurs de rang 3 s'ouvrent. Viser juste fait chuter le complot et
  rapporte de la recherche. Viser faux détruit un innocent et renforce le complot.

## Les ennemis

| Camp              | Unités                | Structure       | Style                 |
| ----------------- | --------------------- | --------------- | --------------------- |
| La Faune          | Rongeur, golem, larve | Nid             | Surgit des parois     |
| Consortium Vantor | Drone                 | Avant-poste     | Raids à distance      |
| Enfants du Noyau  | Saboteur              | Cœur du Dormeur | Vise l'infrastructure |

Les foreurs rendent les coups au corps à corps, faiblement mais plus fort avec de meilleurs outils,
sans quitter leur travail : les gardes et les tourelles restent la vraie défense.

Les structures dorment tant qu'elles n'ont pas été découvertes : creuser vers elles, c'est aussi
décider quand le combat commence.

## La carte de la planète

```text
                 Le Noyau
                /        \
   Concession Vantor    Mer de Magma
                \        /
              Bassin de Soufre
                /        \
    Failles de Verre    Banquise Noire
                \        /
              Val de Cendre
```

## Les fins

- **Le Maître de Kerath** : le Cœur est détruit sans pacte.
- **Le Serment de Kerath** : le pacte a été juré et tenu.
- **Un Trône sur des Cendres** : le pacte a été juré, puis trahi.

## Pistes pour la suite

- Valider l'équilibrage de la campagne par de vraies parties, puis améliorer le bot en conséquence
- Faire répondre le Cœur au serment : pour l'instant, tenir parole n'évite pas de le détruire
- Priorités de tâches réglables par le joueur
- Citoyens visibles dans les galeries
- Modèles pour la Faune et le Cœur du Dormeur, qui restent en formes simples
- Musique d'ambiance
