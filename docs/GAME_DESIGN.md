# Conception du jeu

## Pitch

La Charte vous envoie gouverner Kerath, une planète dont toute la vie se trouve sous la croûte.
Il faut forer pour survivre, bâtir pour durer et se méfier de ceux qui vous conseillent.

## Les trois boucles

**Mission (minutes) : creuser.** Marquer la roche, laisser les foreurs extraire et rapporter les
ressources, ouvrir de nouvelles galeries, repousser ce qui en sort.

**Cité (dizaines de minutes) : gouverner.** Chaque citoyen respire, mange et veut un toit et un
emploi. Les impôts paient les recrues, mais pèsent sur le moral. Un moral bas ralentit la production
et nourrit le complot.

**Campagne (heures) : conquérir.** Chaque région conquise ajoute un pourcentage de contrôle et un
bonus permanent. La recherche et l'enquête traversent toutes les missions, même perdues.

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

Un bâtiment qui consomme de l'énergie doit être relié au Noyau de commande, par des voies
énergétiques ou par contact avec un autre bâtiment raccordé. Les voies accélèrent aussi les
déplacements et arrêtent la lave : le tracé de la ville est une vraie décision.

## Le complot

- Le traître est tiré au sort au début de la campagne : Orsa Veld, Tomas Krell ou Ilyane Soum.
- Les intrigues livrent des indices dont le texte dépend du coupable. Chacun pointe vers un métier :
  l'ingénierie, l'intendance ou le laboratoire.
- Le complot monte seul, plus vite si le moral est bas et tant que le traître est libre. À 40 % et
  70 %, des bâtiments sont sabotés. À 100 %, c'est le soulèvement.
- L'accusation arrive dans les régions de rang 3 et plus. Viser juste fait chuter le complot et
  rapporte de la recherche. Viser faux détruit un innocent et renforce le complot.

## Les ennemis

| Camp              | Unités                | Structure       | Style                 |
| ----------------- | --------------------- | --------------- | --------------------- |
| La Faune          | Rongeur, golem, larve | Nid             | Surgit des parois     |
| Consortium Vantor | Drone                 | Avant-poste     | Raids à distance      |
| Enfants du Noyau  | Saboteur              | Cœur du Dormeur | Vise l'infrastructure |

Les structures dorment tant qu'elles n'ont pas été découvertes : creuser vers elles, c'est aussi
décider quand le combat commence.

## La carte de campagne

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

- Valider l'équilibrage des régions 3 à 7 par de vraies parties, puis améliorer le bot en conséquence
- Faire répondre le Cœur au serment : pour l'instant, tenir parole n'évite pas de le détruire
- Priorités de tâches réglables par le joueur
- Citoyens visibles dans les galeries
- Modèles pour la Faune et le Cœur du Dormeur, qui restent en formes simples
- Musique d'ambiance
