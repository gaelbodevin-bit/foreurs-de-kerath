import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The simulation must stay headless: it is what makes it testable and saveable.
    files: ['src/sim/**/*.ts', 'src/data/**/*.ts', 'src/campaign/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', '**/render/**', '**/ui/**'],
              message: 'Le cœur du jeu reste sans rendu.',
            },
          ],
        },
      ],
    },
  },
);
