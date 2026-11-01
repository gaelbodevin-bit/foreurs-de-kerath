/** How a work radio sounds: narrow, slightly overdriven, with a hiss and a burst at each end. */

const LOW_CUT = 350;
const HIGH_CUT = 3200;
/** Where a small speaker is at its harshest: this is most of what makes it sound like a radio. */
const PRESENCE = { frequency: 1800, gain: 7, q: 0.9 };
const DRIVE = 2.4;
const HISS_LEVEL = 0.012;
const BURST_LEVEL = 0.09;
const BURST_IN = 0.07;
const BURST_OUT = 0.1;

export interface RadioLine {
  /** From the first burst to the end of the last one. */
  seconds: number;
  stop(): void;
}

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseFor(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noises.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(ctx, buffer);
  }
  return buffer;
}

/** Two of these in a row give the sharp edge of a small speaker. One alone sounds merely muffled. */
function bandEdge(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = 0.8;
  return filter;
}

/** A soft limit: loud peaks round off instead of clipping, which adds the crackly edge. */
function overdrive(ctx: BaseAudioContext): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * DRIVE) / Math.tanh(DRIVE);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

/** Plays a recorded line as if over the radio, into `out`. */
export function playOverRadio(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  rate: number,
  out: AudioNode,
): RadioLine {
  const start = ctx.currentTime + 0.02;
  const speech = buffer.duration / rate;
  const voiceAt = start + BURST_IN;
  const end = voiceAt + speech;
  const last = end + BURST_OUT;

  const speaker = ctx.createGain();
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = PRESENCE.frequency;
  presence.gain.value = PRESENCE.gain;
  presence.Q.value = PRESENCE.q;
  speaker
    .connect(bandEdge(ctx, 'highpass', LOW_CUT))
    .connect(bandEdge(ctx, 'highpass', LOW_CUT))
    .connect(presence)
    .connect(overdrive(ctx))
    // After the overdrive, which adds high harmonics of its own.
    .connect(bandEdge(ctx, 'lowpass', HIGH_CUT))
    .connect(bandEdge(ctx, 'lowpass', HIGH_CUT))
    .connect(out);

  const voice = ctx.createBufferSource();
  voice.buffer = buffer;
  voice.playbackRate.value = rate;
  voice.connect(speaker);
  voice.start(voiceAt);

  // The channel opening and closing: a burst of noise, with a steady hiss in between.
  const static_ = ctx.createBufferSource();
  static_.buffer = noiseFor(ctx);
  static_.loop = true;
  const shape = ctx.createGain();
  shape.gain.setValueAtTime(0, start);
  shape.gain.linearRampToValueAtTime(BURST_LEVEL, start + 0.008);
  shape.gain.setValueAtTime(BURST_LEVEL, voiceAt - 0.02);
  shape.gain.linearRampToValueAtTime(HISS_LEVEL, voiceAt);
  shape.gain.setValueAtTime(HISS_LEVEL, end);
  shape.gain.linearRampToValueAtTime(BURST_LEVEL, end + 0.01);
  shape.gain.setValueAtTime(BURST_LEVEL, last - 0.02);
  shape.gain.linearRampToValueAtTime(0, last);
  static_.connect(shape).connect(speaker);
  static_.start(start);
  static_.stop(last);

  return {
    seconds: last - start,
    stop: () => {
      voice.stop();
      static_.stop();
    },
  };
}
