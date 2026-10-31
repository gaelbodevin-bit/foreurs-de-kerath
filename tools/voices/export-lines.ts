/** Lists every voice line as JSON, for `generate.py`. Run with `npx vite-node tools/voices/export-lines.ts`. */
import { CREW, voiceFile, VOICE_LINES } from '../../src/data/voiceLines';
import type { VoiceId } from '../../src/sim/types';

/** What the screen shows and what the generator reads best are not quite the same text. */
const forSpeech = (text: string): string => text.replace(/’/g, "'").replace(/CITY/g, 'Citi');

const lines = (Object.keys(VOICE_LINES) as VoiceId[]).flatMap((id) =>
  VOICE_LINES[id].lines.map((line, index) => ({
    file: voiceFile(id, index),
    text: forSpeech(line.text),
    voice: CREW[line.who].voice,
    // Played back at `rate` to set the pitch, so spoken longer or shorter to keep a natural pace.
    lengthScale: CREW[line.who].rate * CREW[line.who].pace,
  })),
);
console.log(JSON.stringify(lines));
