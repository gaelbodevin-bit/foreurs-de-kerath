import { SOUND_FILES, type SoundKey } from './assetManifest';
import { VOICE_FILES } from '../data/voiceLines';

interface SoundDef {
  /** Loudness once the recording plays. */
  gain: number;
  /** Shortest delay between two plays, in seconds. */
  gap: number;
  /** How much of it reaches the cave's echo. */
  wet: number;
  /** Synthesised stand-in, for browsers that cannot decode the recording. */
  synth: { freq: number; to: number; time: number; type: OscillatorType; gain: number };
}

const SOUNDS: Record<SoundKey, SoundDef> = {
  rattle: {
    gain: 0,
    gap: 0.5,
    wet: 0.3,
    synth: { freq: 38, to: 33, time: 0.7, type: 'sawtooth', gain: 0.05 },
  },
  drill: {
    gain: 0.2,
    gap: 0.1,
    wet: 0.3,
    synth: { freq: 90, to: 70, time: 0.09, type: 'sawtooth', gain: 0.018 },
  },
  collect: {
    gain: 0.3,
    gap: 0.08,
    wet: 0.25,
    synth: { freq: 660, to: 990, time: 0.09, type: 'sine', gain: 0.03 },
  },
  build: {
    gain: 0.5,
    gap: 0.2,
    wet: 0.45,
    synth: { freq: 330, to: 660, time: 0.25, type: 'triangle', gain: 0.06 },
  },
  alert: {
    gain: 0.5,
    gap: 1.2,
    wet: 0.3,
    synth: { freq: 520, to: 260, time: 0.45, type: 'square', gain: 0.05 },
  },
  laser: {
    gain: 0.22,
    gap: 0.09,
    wet: 0.35,
    synth: { freq: 1400, to: 300, time: 0.1, type: 'sawtooth', gain: 0.018 },
  },
  collapse: {
    gain: 0.75,
    gap: 0.3,
    wet: 0.6,
    synth: { freq: 110, to: 40, time: 0.5, type: 'sawtooth', gain: 0.08 },
  },
  plot: {
    gain: 0.45,
    gap: 0.5,
    wet: 0.5,
    synth: { freq: 196, to: 247, time: 0.6, type: 'sine', gain: 0.08 },
  },
  click: {
    gain: 0.3,
    gap: 0.04,
    wet: 0,
    synth: { freq: 800, to: 600, time: 0.03, type: 'square', gain: 0.02 },
  },
  step: {
    gain: 0.05,
    gap: 0.26,
    wet: 0.2,
    synth: { freq: 120, to: 80, time: 0.03, type: 'sine', gain: 0.012 },
  },
  win: {
    gain: 0.6,
    gap: 1,
    wet: 0.3,
    synth: { freq: 392, to: 784, time: 0.8, type: 'triangle', gain: 0.08 },
  },
  lose: {
    gain: 0.6,
    gap: 1,
    wet: 0.5,
    synth: { freq: 294, to: 110, time: 0.9, type: 'triangle', gain: 0.08 },
  },
};

const MUTE_KEY = 'foreurs-de-kerath/muted';
const VOLUME_KEY = 'foreurs-de-kerath/volumes';

export type VolumeId = 'master' | 'sfx' | 'voice' | 'ambience';

/** 1 is the level the game was balanced at: the sliders go from silence to twice that. */
export const MAX_VOLUME = 2;
const DEFAULT_VOLUMES: Record<VolumeId, number> = { master: 1, sfx: 1, voice: 1, ambience: 1 };

function readVolumes(): Record<VolumeId, number> {
  try {
    return { ...DEFAULT_VOLUMES, ...JSON.parse(localStorage.getItem(VOLUME_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
}
const VOICE_LEVEL = 0.32;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** A few seconds of brown noise: the raw material of the cave's wind and echo. */
function brownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

/** The echo of a large cave, computed instead of recorded: noise fading away over two seconds. */
function caveEcho(ctx: AudioContext): AudioBuffer {
  const seconds = 2.2;
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
    }
  }
  return buffer;
}

/** Everything the ambience holds on to while it plays. */
interface Ambience {
  stop: () => void;
  out: GainNode;
  tension: GainNode;
}

/** Dark chords for the rare musical swells, as frequencies. */
const CHORDS = [
  [110, 164.8, 261.6],
  [98, 146.8, 233.1],
  [87.3, 174.6, 261.6],
  [110, 155.6, 246.9],
];

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private echo: GainNode | null = null;
  private readonly last = new Map<SoundKey, number>();
  private readonly raw = new Map<string, ArrayBuffer>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private ambience: Ambience | null = null;
  private speaking: AudioBufferSourceNode | null = null;
  private speakingGain: GainNode | null = null;
  private wantAmbience = false;
  private decoding: Promise<void> | null = null;
  private dripTimer = 3;
  private swellTimer = 25;
  private rumbleTimer = 45;
  private chord = 0;
  private mutedValue = readMuted();
  private readonly volumes = readVolumes();
  private ambienceBus: GainNode | null = null;
  private listener = { x: 0, y: 0, heading: 0, reach: 20 };

  volume(id: VolumeId): number {
    return this.volumes[id];
  }

  setVolume(id: VolumeId, value: number): void {
    this.volumes[id] = Math.max(0, Math.min(MAX_VOLUME, value));
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify(this.volumes));
    } catch {
      // Private window: the choice simply won't outlive the page.
    }
    this.applyLevels();
  }

  /** Follows the sliders at once for what lasts. Short sounds pick up the new level when they start. */
  private applyLevels(): void {
    const { ctx, master, ambienceBus } = this;
    if (!ctx || !master) return;
    const level = this.mutedValue ? 0 : this.volumes.master;
    master.gain.setTargetAtTime(level, ctx.currentTime, 0.03);
    ambienceBus?.gain.setTargetAtTime(this.volumes.ambience, ctx.currentTime, 0.03);
    if (this.speakingGain) {
      this.speakingGain.gain.setTargetAtTime(
        VOICE_LEVEL * this.volumes.voice,
        ctx.currentTime,
        0.03,
      );
    }
  }

  get muted(): boolean {
    return this.mutedValue;
  }

  set muted(value: boolean) {
    this.mutedValue = value;
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
      // Private window: the choice simply won't outlive the page.
    }
    this.applyLevels();
  }

  /** Fetches the recordings. They can only be decoded once the player has touched the page. */
  async preload(onProgress: (ratio: number) => void): Promise<void> {
    const paths = [...Object.values(SOUND_FILES).flat(), ...VOICE_FILES];
    let done = 0;
    await Promise.all(
      paths.map(async (path) => {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}assets/${path}`);
          if (!response.ok) throw new Error(String(response.status));
          this.raw.set(path, await response.arrayBuffer());
        } catch (error) {
          console.warn(`Son introuvable : ${path}`, error);
        }
        onProgress(++done / paths.length);
      }),
    );
  }

  /** Browsers only allow sound after a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.buildGraph(this.ctx);
      this.decoding = this.decodeAll(this.ctx);
    }
    void this.ctx.resume();
    void this.decoding?.then(() => this.syncAmbience());
  }

  private buildGraph(ctx: AudioContext): void {
    const compressor = ctx.createDynamicsCompressor();
    this.master = ctx.createGain();
    this.master.gain.value = this.mutedValue ? 0 : this.volumes.master;
    this.master.connect(compressor).connect(ctx.destination);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = this.volumes.ambience;
    this.ambienceBus.connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const convolver = ctx.createConvolver();
    convolver.buffer = caveEcho(ctx);
    this.echo = ctx.createGain();
    this.echo.connect(convolver).connect(this.master);
  }

  private async decodeAll(ctx: AudioContext): Promise<void> {
    await Promise.all(
      [...this.raw].map(async ([path, data]) => {
        try {
          this.buffers.set(path, await ctx.decodeAudioData(data));
        } catch (error) {
          // Older Safari cannot read Ogg: the synthesised stand-in takes over.
          console.warn(`Son illisible : ${path}`, error);
        }
      }),
    );
    this.raw.clear();
  }

  /** Where the camera is, so that distant sounds fade and pan with their position. */
  listen(x: number, y: number, heading: number, distance: number): void {
    this.listener = { x, y, heading, reach: 10 + distance * 0.6 };
  }

  play(id: SoundKey, x?: number, y?: number): void {
    const { ctx, dry, echo } = this;
    if (!ctx || !dry || !echo || ctx.state !== 'running') return;
    const def = SOUNDS[id];
    const now = ctx.currentTime;

    let distanceGain = 1;
    let pan = 0;
    if (x !== undefined && y !== undefined) {
      const dx = x - this.listener.x;
      const dy = y - this.listener.y;
      const ratio = Math.hypot(dx, dy) / this.listener.reach;
      distanceGain = 1 / (1 + ratio * ratio * 2.5);
      // A sound far away would only add noise: this also spares the gap for a nearer one.
      if (distanceGain < 0.04) return;
      const across = dx * Math.cos(this.listener.heading) - dy * Math.sin(this.listener.heading);
      pan = Math.max(-0.8, Math.min(0.8, across / this.listener.reach));
    }
    if (now - (this.last.get(id) ?? -10) < def.gap) return;
    this.last.set(id, now);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const send = ctx.createGain();
    send.gain.value = def.wet;
    panner.connect(dry);
    panner.connect(send).connect(echo);

    const variants = SOUND_FILES[id].filter((path) => this.buffers.has(path));
    if (variants.length > 0) {
      const source = ctx.createBufferSource();
      source.buffer = this.buffers.get(
        variants[Math.floor(Math.random() * variants.length)],
      ) as AudioBuffer;
      // A slight change of pitch keeps repeated sounds from feeling mechanical.
      if (id !== 'win' && id !== 'lose') source.playbackRate.value = 0.93 + Math.random() * 0.14;
      const gain = ctx.createGain();
      gain.gain.value = def.gain * distanceGain * this.volumes.sfx;
      source.connect(gain).connect(panner);
      source.start(now);
      return;
    }

    const { synth } = def;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = synth.type;
    osc.frequency.setValueAtTime(synth.freq, now);
    osc.frequency.exponentialRampToValueAtTime(synth.to, now + synth.time);
    gain.gain.setValueAtTime(synth.gain * distanceGain * this.volumes.sfx, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + synth.time);
    osc.connect(gain).connect(panner);
    osc.start(now);
    osc.stop(now + synth.time);
  }

  /**
   * A recorded line, cutting off the one before. `rate` sets its pitch. Returns its length, or 0
   * while sound is locked or the file didn't load: the subtitle still shows.
   */
  speak(path: string, rate: number): number {
    const { ctx, dry, echo } = this;
    const buffer = this.buffers.get(path);
    if (!ctx || !dry || !echo || !buffer || ctx.state !== 'running') return 0;
    this.speaking?.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    // A touch of work radio and of the cave, so that the voice sits in the scene.
    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 150;
    const high = ctx.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.value = VOICE_LEVEL * this.volumes.voice;
    this.speakingGain = gain;
    const send = ctx.createGain();
    send.gain.value = 0.08;
    source.connect(low).connect(high).connect(gain);
    gain.connect(dry);
    gain.connect(send).connect(echo);
    source.onended = () => {
      if (this.speaking === source) this.speaking = null;
    };
    source.start();
    this.speaking = source;
    return buffer.duration / rate;
  }

  /** Cave background for missions. It waits for the first gesture if there hasn't been one. */
  startAmbience(): void {
    this.wantAmbience = true;
    this.syncAmbience();
  }

  stopAmbience(): void {
    this.wantAmbience = false;
    this.syncAmbience();
  }

  private syncAmbience(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    if (!this.wantAmbience) {
      this.ambience?.stop();
      this.ambience = null;
    } else if (!this.ambience) {
      this.ambience = this.createAmbience(ctx, master);
    }
  }

  private createAmbience(ctx: AudioContext, master: GainNode): Ambience {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    out.connect(this.ambienceBus ?? master);
    const nodes: AudioScheduledSourceNode[] = [];

    // Nothing drones: the only constant layer is a breath of air, barely above silence.
    const wind = ctx.createBufferSource();
    wind.buffer = brownNoise(ctx, 6);
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 240;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.018;
    wind.connect(windFilter).connect(windGain).connect(out);
    nodes.push(wind);

    // Tension: a low pulse that only rises when enemies are close.
    const pulse = ctx.createOscillator();
    pulse.frequency.value = 55;
    const tension = ctx.createGain();
    tension.gain.value = 0;
    const beat = ctx.createOscillator();
    beat.frequency.value = 1.6;
    const beatDepth = ctx.createGain();
    beatDepth.gain.value = 0.5;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.5;
    beat.connect(beatDepth).connect(pulseGain.gain);
    pulse.connect(pulseGain).connect(tension).connect(out);
    nodes.push(pulse, beat);

    for (const node of nodes) node.start();
    return {
      out,
      tension,
      stop: () => {
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(0, now, 0.25);
        for (const node of nodes) node.stop(now + 1.5);
      },
    };
  }

  /** `tension` goes from 0 to 1. Between events, the cave stays nearly silent. */
  updateAmbience(dt: number, tension: number): void {
    const { ctx, ambience } = this;
    if (!ctx || !ambience || ctx.state !== 'running') return;
    ambience.tension.gain.setTargetAtTime(tension * 0.05, ctx.currentTime, 1);

    this.swellTimer -= dt;
    if (this.swellTimer <= 0) {
      this.swellTimer = 60 + Math.random() * 60;
      this.swell(ctx, ambience.out);
    }

    this.rumbleTimer -= dt;
    if (this.rumbleTimer <= 0) {
      this.rumbleTimer = 50 + Math.random() * 70;
      this.rumble(ctx, ambience.out);
    }

    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 6 + Math.random() * 14;
      this.drip(ctx);
    }
  }

  /** A soft chord that rises and dies away, then leaves the silence alone for a minute or more. */
  private swell(ctx: AudioContext, out: GainNode): void {
    const now = ctx.currentTime;
    const seconds = 9;
    this.chord = (this.chord + 1) % CHORDS.length;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.022, now + seconds * 0.4);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    gain.connect(out);
    for (const frequency of CHORDS[this.chord]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + seconds);
    }
  }

  /** Rock settling far away: a muffled roll of noise. */
  private rumble(ctx: AudioContext, out: GainNode): void {
    const now = ctx.currentTime;
    const seconds = 3.5;
    const source = ctx.createBufferSource();
    source.buffer = brownNoise(ctx, seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 130;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.8);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    source.connect(filter).connect(gain).connect(out);
    source.start(now);
  }

  /** Water falling somewhere in the dark: a short blip, heard mostly through the echo. */
  private drip(ctx: AudioContext): void {
    if (!this.echo) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = 1000 + Math.random() * 900;
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(start * 1.8, now + 0.05);
    gain.gain.setValueAtTime(0.1 * this.volumes.ambience, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(this.echo);
    osc.start(now);
    osc.stop(now + 0.07);
  }
}

/** One instance for the whole game: the context has to survive changes of screen. */
export const audio = new Audio();
