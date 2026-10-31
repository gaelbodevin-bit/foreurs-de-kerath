import type { VoiceId } from '../sim/types';

export type CrewMember = 'bako' | 'nina' | 'harl' | 'orsa' | 'krell';

/** The recorded voices the lines are generated with. See `tools/voices/generate.py`. */
export type VoiceModel = 'siwis' | 'pierre' | 'jessica' | 'gilles';

/**
 * Who speaks with which voice. `rate` is the playback speed, which sets the pitch, and stays close
 * to 1: a voice pushed far from its own pitch stops sounding human. `pace` is how fast they talk.
 */
export const CREW: Record<
  CrewMember,
  { name: string; voice: VoiceModel; rate: number; pace: number }
> = {
  bako: { name: 'Bako, foreur', voice: 'pierre', rate: 1, pace: 1 },
  nina: { name: 'Nina, foreuse', voice: 'jessica', rate: 1, pace: 0.95 },
  harl: { name: 'Sergent Harl', voice: 'pierre', rate: 0.92, pace: 0.92 },
  orsa: { name: 'Orsa Veld', voice: 'siwis', rate: 1, pace: 1.02 },
  krell: { name: 'Tomas Krell', voice: 'gilles', rate: 1, pace: 1.05 },
};

export interface LineSet {
  /** Shortest delay before this kind of line comes back, in seconds. */
  gap: number;
  /** Cuts off whoever is speaking, instead of giving way. */
  urgent?: boolean;
  lines: { who: CrewMember; text: string }[];
}

const say = (who: CrewMember, ...texts: string[]) => texts.map((text) => ({ who, text }));

/** Written out in full: a speech generator reads « Y a » or a missing « ne » far worse than a person. */
export const VOICE_LINES: Record<VoiceId, LineSet> = {
  ack: {
    gap: 8,
    lines: [
      ...say('bako', 'Bien, j’y vais.', 'Bon, d’accord.', 'Encore moi ?', 'On y va, on y va.'),
      ...say('nina', 'Ça marche, chef.', 'Deux secondes, j’arrive.', 'Je m’en occupe.'),
    ],
  },
  drill: {
    gap: 20,
    lines: [
      ...say(
        'bako',
        'Et c’est reparti pour un trou.',
        'Mes pauvres bras.',
        'Ça va faire du bruit.',
      ),
      ...say('nina', 'Allez, on attaque.', 'Laisse, je la sens bien, celle-là.'),
    ],
  },
  find: {
    gap: 40,
    lines: [
      ...say('bako', 'Ah, voilà qui paie le loyer.', 'Nous ne rentrerons pas les mains vides.'),
      ...say('nina', 'Venez voir ça !', 'C’est joli, ça.', 'Touché ! Il y a du bon là-dedans.'),
    ],
  },
  built: {
    gap: 15,
    lines: [
      ...say(
        'bako',
        'Ce n’est pas très droit, mais ça tient.',
        'Terminé. Ne touchez pas, c’est frais.',
      ),
      ...say('nina', 'Et voilà, c’est monté !', 'Un de plus.'),
      ...say('orsa', 'Bon travail. Il reste à le brancher.'),
    ],
  },
  raid: {
    gap: 20,
    urgent: true,
    lines: say(
      'harl',
      'Ils arrivent ! Bougez-vous !',
      'Contact dans la galerie !',
      'À vos postes, vite !',
      'Ça grouille là-dedans !',
    ),
  },
  collapse: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('bako', 'Ça s’effondre ! Dégagez !', 'Nom d’un filon !'),
      ...say('nina', 'Attention à la tête !', 'Le plafond ! Le plafond !'),
    ],
  },
  destroyed: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('harl', 'Nous venons de perdre un bâtiment !', 'C’est tombé ! Tout est tombé !'),
      ...say('krell', 'Il n’y a plus rien, là-bas.'),
    ],
  },
  citizenLost: {
    gap: 45,
    lines: say(
      'krell',
      'Gouverneur, nous avons perdu quelqu’un.',
      'Encore un. Il faut faire quelque chose.',
      'Les gens ne tiennent plus.',
    ),
  },
  sabotage: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('orsa', 'Ce n’est pas une panne. C’est un sabotage.'),
      ...say('krell', 'Quelqu’un a touché aux machines !', 'Nous avons un traître parmi nous.'),
    ],
  },
  gas: {
    gap: 25,
    urgent: true,
    lines: [
      ...say('bako', 'Ça sent mauvais là-dedans. Reculez !', 'Je tousse, chef. Il y a du gaz.'),
      ...say('nina', 'Du gaz ! Les masques, vite !'),
      ...say('orsa', 'Gaz toxique. Il nous faut un ventilateur.'),
    ],
  },
  lair: {
    gap: 30,
    urgent: true,
    lines: [
      ...say('bako', 'Il y a quelque chose là-dedans.', 'Chef ? Ça vient de bouger.'),
      ...say('nina', 'Ça bouge au fond de la salle !'),
      ...say('harl', 'Des bêtes ! Toute une nichée !'),
    ],
  },
  reunited: {
    gap: 0,
    urgent: true,
    lines: say('orsa', 'Ils sont là ! Port-Cendre répond !', 'Ça y est, nous les entendons !'),
  },
  contract: {
    gap: 12,
    lines: [
      ...say('krell', 'Gouverneur, une demande de plus.', 'On nous réclame encore quelque chose.'),
      ...say('orsa', 'Ceci vient d’arriver sur le bureau.', 'Regardez ça dès que vous pourrez.'),
    ],
  },
  contractDone: {
    gap: 10,
    lines: [
      ...say('krell', 'C’est réglé, et c’est payé.', 'Un dossier de moins sur la pile.'),
      ...say('nina', 'Ça, c’est fait !'),
    ],
  },
  sector: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('harl', 'Le secteur est à nous !', 'Celui-là, on ne nous le reprendra pas.'),
      ...say('orsa', 'Une région de plus sur la carte.'),
    ],
  },
  levelUp: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('krell', 'La colonie grandit, Gouverneur.', 'Il va falloir de nouveaux registres.'),
      ...say('orsa', 'Regardez-moi ça. On dirait presque une vraie ville.'),
    ],
  },
  win: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('orsa', 'C’est fait. Beau travail, Gouverneur.'),
      ...say('harl', 'La région est à nous !'),
    ],
  },
  lose: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('orsa', 'C’est fini. Nous plions bagage.'),
      ...say('harl', 'Nous ne pouvons plus tenir. Tout le monde dehors !'),
    ],
  },
};

/** Where a line's recording lives, relative to `public/assets`. */
export const voiceFile = (id: VoiceId, index: number): string => `audio/voices/${id}_${index}.wav`;

export const VOICE_FILES: string[] = (Object.keys(VOICE_LINES) as VoiceId[]).flatMap((id) =>
  VOICE_LINES[id].lines.map((_, index) => voiceFile(id, index)),
);
