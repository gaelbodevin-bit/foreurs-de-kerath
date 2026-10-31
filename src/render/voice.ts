import { CREW, VOICE_LINES, type CrewMember } from '../data/voiceLines';
import type { VoiceId } from '../sim/types';
import { audio } from './audio';
import type { VoiceProfile } from './babble';

const VOICES: Record<CrewMember, VoiceProfile> = {
  bako: { pitch: 118, rate: 7.4, throat: 0.92, rough: 0.9 },
  nina: { pitch: 205, rate: 8.6, throat: 1.14, rough: 0.5 },
  harl: { pitch: 92, rate: 8.2, throat: 0.84, rough: 0.7 },
  orsa: { pitch: 178, rate: 6.8, throat: 1.08, rough: 0.25 },
  krell: { pitch: 132, rate: 6.1, throat: 0.97, rough: 0.35 },
};

/** Seconds of quiet kept between two ordinary lines, so that the crew doesn't chatter. */
const BREATHER = 5;

export interface SpokenLine {
  name: string;
  text: string;
  seconds: number;
}

/** Decides who says what and when. The sound itself is in `babble.ts`. */
class Voice {
  private readonly last = new Map<VoiceId, number>();
  private readonly lastLine = new Map<VoiceId, string>();
  private busyUntil = -Infinity;
  private lastAny = -Infinity;

  /** Returns the line to subtitle, or null when now isn't the moment. */
  say(id: VoiceId): SpokenLine | null {
    const set = VOICE_LINES[id];
    const now = performance.now() / 1000;
    if (now - (this.last.get(id) ?? -Infinity) < set.gap) return null;
    if (!set.urgent && (now < this.busyUntil || now - this.lastAny < BREATHER)) return null;
    this.last.set(id, now);
    this.lastAny = now;

    // Never the same line twice in a row.
    const choices = set.lines.filter((line) => line.text !== this.lastLine.get(id));
    const line = choices[Math.floor(Math.random() * choices.length)] ?? set.lines[0];
    this.lastLine.set(id, line.text);

    const seconds = audio.speak(line.text, VOICES[line.who]);
    this.busyUntil = now + seconds;
    return { name: CREW[line.who].name, text: line.text, seconds };
  }
}

/** One instance for the whole game, like the audio. */
export const voice = new Voice();
