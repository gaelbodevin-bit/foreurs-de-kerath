# Contribuer

1. Créez une branche depuis `main`.
2. Faites votre modification. Tout changement de règle s'accompagne d'un test dans `tests/`.
3. Lancez `npm run check` : c'est ce que la CI exécute. `npm run format` corrige la mise en forme.
4. Ouvrez une pull request qui explique ce qui change pour le joueur.

## Règles du projet

- `src/sim`, `src/data` et `src/campaign` n'importent ni Three.js, ni le DOM. ESLint le vérifie.
- Tout le hasard de la simulation passe par `rand(state)`, jamais par `Math.random`, sinon les
  sauvegardes et les tests ne sont plus reproductibles.
- `GameState` ne contient que des données JSON : ni classe, ni `Map`, ni fonction.
- L'interface agit sur le jeu par les commandes de `sim/game.ts`.
- Le texte du jeu est en français, le code et ses commentaires en anglais.
- Pas de contenu repris d'un autre jeu. Les assets ajoutés sont sous CC0 et cités dans
  `public/assets/CREDITS.md`.
