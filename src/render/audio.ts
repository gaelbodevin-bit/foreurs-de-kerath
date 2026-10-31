import { SOUND_FILES, type SoundKey } from './assetManifest';

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
  drill: {
    gain: 0.3,
    gap: 0.22,
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
    gain: 0.1,
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
  hum: {
    gain: 0,
    gap: 0,
    wet: 0,
    synth: { freq: 60, to: 60, time: 0.01, type: 'sine', gain: 0 },
  },
};

const MUTE_KEY = 'foreurs-de-kerath/muted';

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

/** Blends a recording's end into its start, so that looping it makes no click. */
function seamlessLoop(ctx: AudioContext, source: AudioBuffer, overlap: number): AudioBuffer {
  const fade = Math.floor(source.sampleRate * overlap);
  const length = source.length - fade;
  const loop = ctx.createBuffer(source.numberOfChannels, length, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const input = source.getChannelData(channel);
    const output = loop.getChannelData(channel);
    output.set(input.subarray(0, length));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      output[i] = input[i] * Math.sqrt(t) + input[length + i] * Math.sqrt(1 - t);
    }
  }
  return loop;
}

/** Everything the ambience holds on to while it plays. */
interface Ambience {
  stop: () => void;
  hum: GainNode | null;
  tension: GainNode;
  pad: OscillatorNode[];
}

/** Dark chords for the slow pad, as frequencies. */
const CHORDS = [
  [55, 82.4, 130.8],
  [49, 73.4, 116.5],
  [43.7, 87.3, 130.8],
  [55, 77.8, 123.5],
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
  private wantAmbience = false;
  private decoding: Promise<void> | null = null;
  private dripTimer = 3;
  private chordTimer = 0;
  private chord = 0;
  private mutedValue = readMuted();
  private listener = { x: 0, y: 0, heading: 0, reach: 20 };

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
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value ? 0 : 1, this.ctx.currentTime, 0.03);
    }
  }

  /** Fetches the recordings. They can only be decoded once the player has touched the page. */
  async preload(onProgress: (ratio: number) => void): Promise<void> {
    const paths = Object.values(SOUND_FILES).flat();
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
    this.master.gain.value = this.mutedValue ? 0 : 1;
    this.master.connect(compressor).connect(ctx.destination);
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
      gain.gain.value = def.gain * distanceGain;
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
    gain.gain.setValueAtTime(synth.gain * distanceGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + synth.time);
    osc.connect(gain).connect(panner);
    osc.start(now);
    osc.stop(now + synth.time);
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
    out.connect(master);
    const nodes: AudioScheduledSourceNode[] = [];

    // Wind: noise behind a filter that opens and closes very slowly.
    const wind = ctx.createBufferSource();
    wind.buffer = brownNoise(ctx, 6);
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 340;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.09;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 170;
    lfo.connect(lfoDepth).connect(windFilter.frequency);
    wind.connect(windFilter).connect(windGain).connect(out);
    nodes.push(wind, lfo);

    // Pad: three quiet voices through a dark filter.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 420;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.018;
    padFilter.connect(padGain).connect(out);
    const pad = CHORDS[0].map((frequency, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = frequency;
      osc.detune.value = (i - 1) * 7;
      osc.connect(padFilter);
      nodes.push(osc);
      return osc;
    });

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

    // The base's machines, recorded, rise as the camera gets close to them.
    let hum: GainNode | null = null;
    const humBuffer = this.buffers.get(SOUND_FILES.hum[0]);
    if (humBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = seamlessLoop(ctx, humBuffer, 0.6);
      source.loop = true;
      hum = ctx.createGain();
      hum.gain.value = 0;
      source.connect(hum).connect(out);
      nodes.push(source);
    }

    for (const node of nodes) node.start();
    return {
      hum,
      tension,
      pad,
      stop: () => {
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(0, now, 0.25);
        for (const node of nodes) node.stop(now + 1.5);
      },
    };
  }

  /** `tension` and `machines` go from 0 to 1. */
  updateAmbience(dt: number, tension: number, machines: number): void {
    const { ctx, ambience } = this;
    if (!ctx || !ambience || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    ambience.tension.gain.setTargetAtTime(tension * 0.16, now, 1);
    ambience.hum?.gain.setTargetAtTime(machines * 0.05, now, 0.6);

    this.chordTimer -= dt;
    if (this.chordTimer <= 0) {
      this.chordTimer = 22;
      this.chord = (this.chord + 1) % CHORDS.length;
      ambience.pad.forEach((osc, i) => {
        osc.frequency.setTargetAtTime(CHORDS[this.chord][i], now, 4);
      });
    }

    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 3 + Math.random() * 9;
      this.drip(ctx);
    }
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
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(this.echo);
    osc.start(now);
    osc.stop(now + 0.07);
  }
}

/** One instance for the whole game: the context has to survive changes of screen. */
export const audio = new Audio();
