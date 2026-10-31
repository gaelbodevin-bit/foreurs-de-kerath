import type { SoundId } from '../sim/types';

/** All sounds are synthesised, in keeping with having no asset files. */
const SOUNDS: Record<
  SoundId,
  { freq: number; to: number; time: number; type: OscillatorType; gain: number; gap: number }
> = {
  drill: { freq: 90, to: 70, time: 0.09, type: 'sawtooth', gain: 0.018, gap: 0.2 },
  collect: { freq: 660, to: 990, time: 0.09, type: 'sine', gain: 0.03, gap: 0.08 },
  build: { freq: 330, to: 660, time: 0.25, type: 'triangle', gain: 0.06, gap: 0.2 },
  alert: { freq: 520, to: 260, time: 0.45, type: 'square', gain: 0.05, gap: 1.2 },
  laser: { freq: 1400, to: 300, time: 0.1, type: 'sawtooth', gain: 0.018, gap: 0.09 },
  collapse: { freq: 110, to: 40, time: 0.5, type: 'sawtooth', gain: 0.08, gap: 0.3 },
  plot: { freq: 196, to: 247, time: 0.6, type: 'sine', gain: 0.08, gap: 0.5 },
};

export class Audio {
  private ctx: AudioContext | null = null;
  private last = new Map<SoundId, number>();
  muted = false;

  /** Browsers only allow sound after a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
      }
    }
    void this.ctx?.resume();
  }

  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const def = SOUNDS[id];
    const now = ctx.currentTime;
    if (now - (this.last.get(id) ?? -10) < def.gap) return;
    this.last.set(id, now);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = def.type;
    osc.frequency.setValueAtTime(def.freq, now);
    osc.frequency.exponentialRampToValueAtTime(def.to, now + def.time);
    gain.gain.setValueAtTime(def.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + def.time);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + def.time);
  }
}
