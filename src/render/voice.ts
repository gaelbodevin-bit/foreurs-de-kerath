import { CREW, voiceFile, VOICE_LINES } from '../data/voiceLines';
import type { VoiceId } from '../sim/types';
import { audio } from './audio';

/** Seconds of quiet kept between two ordinary lines, so that the crew doesn't chatter. */
const BREATHER = 5;

export interface SpokenLine {
  name: string;
  text: string;
  seconds: number;
}

/** Decides who says what and when. The recordings are made by `tools/voices`. */
class Voice {
  private readonly last = new Map<VoiceId, number>();
  private readonly lastLine = new Map<VoiceId, number>();
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
    const choices = set.lines.map((_, i) => i).filter((i) => i !== this.lastLine.get(id));
    const index = choices[Math.floor(Math.random() * choices.length)] ?? 0;
    this.lastLine.set(id, index);

    const line = set.lines[index];
    const member = CREW[line.who];
    const seconds = audio.speak(voiceFile(id, index), member.rate);
    this.busyUntil = now + seconds;
    return { name: member.name, text: line.text, seconds };
  }
}

/** One instance for the whole game, like the audio. */
export const voice = new Voice();
