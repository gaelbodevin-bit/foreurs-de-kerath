import { describe, expect, it } from 'vitest';
import { Audio, MAX_VOLUME } from '../src/render/audio';

describe('volumes', () => {
  it('démarrent au niveau normal, et restent entre le silence et le maximum', () => {
    const audio = new Audio();
    expect(audio.volume('voice')).toBe(1);
    audio.setVolume('voice', 0.4);
    expect(audio.volume('voice')).toBe(0.4);
    audio.setVolume('voice', 50);
    expect(audio.volume('voice')).toBe(MAX_VOLUME);
    audio.setVolume('voice', -3);
    expect(audio.volume('voice')).toBe(0);
    expect(audio.volume('sfx')).toBe(1);
  });
});
