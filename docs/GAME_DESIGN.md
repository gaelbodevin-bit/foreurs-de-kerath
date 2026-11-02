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
rien : il agrandit le Noyau.

## La cité et les avant-postes

L'onglet Cité du menu de construction s'ouvre en rejoignant CITY. Tout se pose où l'on veut : c'est le
courant qui décide de ce qui fonctionne. CITY alimente le réseau autour d'elle comme le Noyau.
L'avant-poste sert de dépôt et de source à un réseau électrique séparé, pour s'installer loin de la
cité.

## Le gouverneur et son conseil

Rejoindre CITY fait du chef d'expédition le gouverneur, qui choisit son style. La ville compte déjà
douze habitants et de quoi les loger, et abrite le siège du conseil, un bâtiment unique qu'il suffit
de cliquer pour ouvrir le panneau. Le conseil a
quatre sièges : Ingénierie, Intendance, Science et Défense. Orsa Veld, Tomas Krell et Ilyane Soum
occupent les trois premiers. De nouveaux candidats se présentent toutes les 3 minutes, chacun avec un trait. Renvoyer un conseiller ne règle pas le complot.

## Les secousses

Chaque secteur ouvert a sa propre activité : la fréquence et la plage de magnitude sont fixées par
zone, de M 2 à 4,4 au Val de Cendre jusqu'à M 7,8 au Noyau. Sous M 2,8, le sol tremble seulement. Au
dessus, la roche tombe au pied des murs (à déblayer, et dangereuse pour qui se trouve dessous) et la
roche meuble s'effondre. Dès M 3,5, les bâtiments sont abîmés, sans jamais être abattus. Les routes
tiennent, et le sol de CITY aussi.

Le sismographe (touche T) trace l'historique des magnitudes et le bilan par zone. La station
sismique annonce la prochaine secousse et sa magnitude. L'étai de soutènement protège 5 cases autour
de lui. En rejoignant CITY, le gouverneur reçoit aussi 10 mineurs.

## L'obscurité

La caverne est noire. La lumière vient des bâtiments achevés (presque plus quand ils n'ont pas de
courant), du sol technique, de CITY et de la roche qui brille : lave et cristal. Chaque foreur et
chaque garde a sa lampe frontale, dirigée devant lui, et les machines ont leurs phares. Loin de tout
cela, la roche se devine à peine, et un monstre aussi.

## Les biomes

Chaque secteur a la teinte de sa roche et sa géologie propre.

| Secteur           | Ce qu'on y trouve                          |
| ----------------- | ------------------------------------------ |
| Val de Cendre     | Le point de départ, une première faille    |
| Jardins de Lueur  | Grottes de mousse luminescente, comestible |
| Gouffre d'Ombre   | Failles sans fond, pétrole, fumerolles     |
| Failles de Verre  | Cristal et gorges                          |
| Banquise Noire    | Glace et eau                               |
| Bassin de Soufre  | Soufre, gaz, fumerolles, rivière de lave   |
| Concession Vantor | Tungstène, pétrole                         |
| Mer de Magma      | Rivières de lave, reliques                 |
| Le Noyau          | Un peu de tout, en pire                    |

**Gouffres.** Rien ne les franchit sans pont : ni les foreurs, ni la Faune. L'outil Pont (touche B)
trace une ligne droite au-dessus du vide, de l'eau ou de la lave. Un foreur pose les travées depuis
le bord, à 3 roches et 2 minerais la case. Un pont porte le courant et ne se démonte pas.

**Fumerolles.** Une fois découverte, une fumerolle souffle 5 s toutes les 40 s. Le captage de gaz,
posé dessus, la fait taire et produit de l'énergie sans combustible.

**Mousse.** Elle éclaire et se récolte comme les champignons, pour un peu moins de nourriture.

## Les gisements et les chaînes de l'industrie

```text
Suintement ─► Derrick ─► Pétrole ─┬─► Centrale au fioul ─► Énergie
                                  └─► Usine de caoutchouc (+ soufre) ─► Caoutchouc
Caoutchouc + Métal ─► Atelier de pneus ─► Pneus ─┬─► Camion
                                                 └─► Train tout-terrain (recherche)
Filon de tungstène (laser) ─┬─► Forets au tungstène (recherche)
                            └─► Tourelle à obus
```

Le derrick et le captage se posent uniquement sur leur gisement. Le panneau Production (touche N)
liste chaque usine, sa recette et ce qui la bloque.

## Les vivres

Chaque bouche mange un tiers de part par minute dès que CITY est rejointe. Une serre nourrit environ
45 personnes si elle a de l'eau. Le panneau Production donne le bilan, les minutes de réserve et fixe
les rations : demi-rations (60 %, moral −12), normales ou copieuses (140 %, moral +6).

Krell ouvre une fenêtre pour tout expliquer peu après l'arrivée à CITY, puis revient quand il reste
moins de trois minutes de vivres, et quand les silos sont vides.

## Les édits

Le registre (touche L) reprend le principe du livre de lois de Frostpunk. Un édit se signe pour
toujours, il faut 150 s entre deux signatures, et beaucoup en excluent un autre. Trois branches :
Survie (soupe allongée ou assiette garantie, quarts de quatorze heures ou jour sans forage, viande de
galerie, puis « Rien ne se perd » ou l'Ossuaire), Ordre (garde de quartier, informateurs ou conseil
ouvert, tribunal d'exception), Croyance (serment de la Charte ou veillée du Dormeur, puis offrandes).
Les plus durs ont leurs conséquences dans l'histoire.

## Les tenues

Le panneau Tenues (touche U) habille les foreurs et les gardes. Certaines tenues se gagnent en
conquérant un secteur, en abattant 40 ennemis ou en signant un édit. Une unité sélectionnée peut
porter sa propre tenue.

## L'intrigue

Sous le complot du conseil, une autre histoire remonte par morceaux : ce qui frappe derrière la paroi,
les plaques de la Charte plus vieilles que la première expédition, l'éboulement qui n'en était pas un,
le rêve commun des Jardins, ce qui appelle au fond du gouffre, la directive qui avait tout prévu, et
ce que le Noyau a de commun avec les horaires de la cité.

## Le sol technique

Un glisser trace une ligne droite, à l'horizontale, à la verticale ou à 45°, selon la direction la
plus proche. Pour tourner, on repart de son extrémité. Le courant suit les diagonales de dalle à dalle.

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

Glace ─► Fondoir ─► Eau ─┬─► Serre ─► Nourriture
                         └─► Cuve à algues ─► Nourriture
Édit ─► Vivier à larves ─► Nourriture
Cristal ─► Centrale ─► Énergie
Or ─► Marché ─► Crédits
Citoyens ─► Impôts ─► Crédits
```

## Le réseau

Un bâtiment qui consomme de l'énergie doit recevoir le courant, par le sol technique ou par contact
avec un autre bâtiment raccordé. Le courant a une portée : 8 cases, plus 2 par unité d'énergie
produite par sa source, soit 16 pour le Noyau et 36 pour une centrale à cristaux. Il perd une case de
portée à chaque pas, et chaque centrale en marche atteinte le relance. Une centrale sans cristal ne
relance rien.

Au-delà, les dalles sont éteintes, sans lumière dans leur voie ni lampadaire allumé, et ce qui en
dépend est à l'arrêt : c'est le signe qu'il faut produire plus. Orsa Veld le signale la première
fois. Les voies accélèrent aussi les déplacements et arrêtent la lave : le tracé de la ville est une
vraie décision.

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
et, dès qu'un ennemi s'approche à moins de 6 cases, lâchent leur travail pour aller le frapper, sauf
ordre contraire du joueur : les gardes et les tourelles restent la vraie défense.

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
