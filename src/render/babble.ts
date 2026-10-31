/**
 * A made-up crew language: a line's vowels and rhythm drive a small voice synthesiser, heard as if
 * over a work radio. Nobody mistakes it for real speech, and it can't sound like a text-to-speech
 * engine either. The words themselves appear as a subtitle.
 */

export interface VoiceProfile {
  /** Base pitch, in Hz. */
  pitch: number;
  /** Syllables per second. */
  rate: number;
  /** Moves the vowels up or down: a larger or smaller throat. */
  throat: number;
  /** Random pitch wobble between syllables, 0 to 1. */
  rough: number;
}

const VOWELS: Record<string, [number, number]> = {
  a: [750, 1250],
  e: [470, 1800],
  i: [310, 2250],
  o: [520, 950],
  u: [330, 1050],
};

const ACCENTS: Record<string, string> = {
  à: 'a',
  â: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  î: 'i',
  ï: 'i',
  y: 'i',
  ô: 'o',
  ö: 'o',
  ù: 'u',
  û: 'u',
  ü: 'u',
};

interface Syllable {
  vowel: [number, number];
  /** Starts with a consonant, heard as a small burst of noise. */
  onset: boolean;
  /** Silence after it, in syllable lengths. */
  rest: number;
}

const SYLLABLE = /([^aeiouyàâéèêëîïôöùûü\s,.!?…'’-]*)([aeiouyàâéèêëîïôöùûü]+)|([,.!?…]+)/gi;

function syllables(text: string): Syllable[] {
  const list: Syllable[] = [];
  for (const match of text.toLowerCase().matchAll(SYLLABLE)) {
    if (match[3]) {
      const last = list[list.length - 1];
      if (last) last.rest = match[3].includes(',') ? 1 : 2;
      continue;
    }
    const letter = match[2][0];
    list.push({
      vowel: VOWELS[ACCENTS[letter] ?? letter] ?? VOWELS.e,
      onset: match[1].length > 0,
      rest: 0,
    });
  }
  return list;
}

let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** Schedules one line and returns how long it lasts, in seconds. */
export function playBabble(
  ctx: BaseAudioContext,
  out: AudioNode,
  text: string,
  voice: VoiceProfile,
  level = 0.5,
): number {
  const parts = syllables(text);
  if (parts.length === 0) return 0;
  const start = ctx.currentTime + 0.02;
  const shout = text.includes('!');
  const asks = text.includes('?');
  const beat = (shout ? 0.85 : 1) / voice.rate;

  const glottis = ctx.createOscillator();
  glottis.type = 'sawtooth';
  const first = ctx.createBiquadFilter();
  first.type = 'bandpass';
  first.Q.value = 7;
  const second = ctx.createBiquadFilter();
  second.type = 'bandpass';
  second.Q.value = 9;
  const secondLevel = ctx.createGain();
  secondLevel.gain.value = 0.55;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, start);
  glottis.connect(first).connect(envelope);
  glottis.connect(second).connect(secondLevel).connect(envelope);

  // The narrow band of a work radio, which hides how simple the voice underneath is.
  const radioLow = ctx.createBiquadFilter();
  radioLow.type = 'highpass';
  radioLow.frequency.value = 320;
  const radioHigh = ctx.createBiquadFilter();
  radioHigh.type = 'lowpass';
  radioHigh.frequency.value = 3000;
  const output = ctx.createGain();
  output.gain.value = level * (shout ? 1.2 : 1);
  envelope.connect(radioLow).connect(radioHigh).connect(output).connect(out);

  let time = start;
  parts.forEach((part, i) => {
    const progress = i / Math.max(1, parts.length - 1);
    // Falls through the line, unless it's a question; shouting sits higher.
    const contour = asks ? 0.92 + progress * progress * 0.5 : 1.12 - progress * 0.28;
    const wobble = 1 + (Math.random() - 0.5) * voice.rough * 0.35;
    const pitch = voice.pitch * contour * wobble * (shout ? 1.25 : 1);
    const length = beat * (0.82 + Math.random() * 0.36);
    glottis.frequency.setTargetAtTime(pitch, time, 0.025);
    first.frequency.setTargetAtTime(part.vowel[0] * voice.throat, time, 0.018);
    second.frequency.setTargetAtTime(part.vowel[1] * voice.throat, time, 0.018);

    envelope.gain.setTargetAtTime(1, time + (part.onset ? 0.02 : 0), 0.012);
    envelope.gain.setTargetAtTime(part.rest > 0 ? 0 : 0.35, time + length * 0.72, 0.02);

    if (part.onset) {
      const burst = ctx.createBufferSource();
      burst.buffer = noise(ctx);
      const shape = ctx.createBiquadFilter();
      shape.type = 'highpass';
      shape.frequency.value = 1800;
      const burstGain = ctx.createGain();
      burstGain.gain.setValueAtTime(0.16, time);
      burstGain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
      burst.connect(shape).connect(burstGain).connect(radioLow);
      burst.start(time, Math.random() * 0.9, 0.04);
    }
    time += length + part.rest * beat * 0.9;
  });
  envelope.gain.setTargetAtTime(0, time, 0.03);
  glottis.start(start);
  glottis.stop(time + 0.25);
  return time + 0.25 - start;
}
