import { describe, expect, it } from 'vitest';
import { MODEL_FILES, TEXTURE_FILES } from '../src/render/assetManifest';

const files = Object.keys(import.meta.glob('/public/assets/**/*'));

describe('assets', () => {
  it.each(Object.values({ ...MODEL_FILES, ...TEXTURE_FILES }))('%s est présent', (path) => {
    expect(files).toContain(`/public/assets/${path}`);
  });

  it('les licences accompagnent les fichiers', () => {
    expect(files).toContain('/public/assets/CREDITS.md');
    expect(files.filter((f) => f.includes('/licenses/')).length).toBe(3);
  });

  it('les modèles retrouvent leur palette de couleurs', () => {
    expect(files).toContain('/public/assets/models/characters/Textures/colormap.png');
    expect(files).toContain('/public/assets/models/survival/Textures/colormap.png');
  });
});
