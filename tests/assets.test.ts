import { describe, expect, it } from 'vitest';
import { MODEL_FILES, SOUND_FILES, TEXTURE_FILES } from '../src/render/assetManifest';

const files = Object.keys(import.meta.glob('/public/assets/**/*'));

describe('assets', () => {
  const all = [
    ...Object.values(MODEL_FILES),
    ...Object.values(TEXTURE_FILES),
    ...Object.values(SOUND_FILES).flat(),
  ];

  it.each(all)('%s est présent', (path) => {
    expect(files).toContain(`/public/assets/${path}`);
  });

  it('les licences accompagnent les fichiers', () => {
    expect(files).toContain('/public/assets/CREDITS.md');
    expect(files.filter((f) => f.includes('/licenses/')).length).toBe(7);
  });

  it('les modèles retrouvent leur palette de couleurs', () => {
    expect(files).toContain('/public/assets/models/characters/Textures/colormap.png');
    expect(files).toContain('/public/assets/models/survival/Textures/colormap.png');
  });
});
