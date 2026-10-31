import type { VoiceId } from '../sim/types';

export type CrewMember = 'bako' | 'nina' | 'harl' | 'orsa' | 'krell';

export const CREW: Record<CrewMember, { name: string }> = {
  bako: { name: 'Bako, foreur' },
  nina: { name: 'Nina, foreuse' },
  harl: { name: 'Sergent Harl' },
  orsa: { name: 'Orsa Veld' },
  krell: { name: 'Tomas Krell' },
};

export interface LineSet {
  /** Shortest delay before this kind of line comes back, in seconds. */
  gap: number;
  /** Cuts off whoever is speaking, instead of giving way. */
  urgent?: boolean;
  lines: { who: CrewMember; text: string }[];
}

const say = (who: CrewMember, ...texts: string[]) => texts.map((text) => ({ who, text }));

export const VOICE_LINES: Record<VoiceId, LineSet> = {
  ack: {
    gap: 8,
    lines: [
      ...say('bako', 'Ouais, j’y vais.', 'Bon, d’accord…', 'Encore moi ?', 'On bouge, on bouge.'),
      ...say('nina', 'Ça marche, chef.', 'Deux secondes, j’arrive.', 'Je m’en occupe.'),
    ],
  },
  drill: {
    gap: 20,
    lines: [
      ...say(
        'bako',
        'Et c’est reparti pour un trou.',
        'Mes pauvres bras…',
        'Ça va faire du bruit.',
      ),
      ...say('nina', 'Allez, on tape dedans.', 'Laisse, je la sens bien, celle-là.'),
    ],
  },
  find: {
    gap: 40,
    lines: [
      ...say('bako', 'Ah, ça, ça paie le loyer.', 'On rentrera pas les mains vides.'),
      ...say('nina', 'Eh, venez voir ça !', 'Joli, joli…', 'Touché ! Y a du bon là-dedans.'),
    ],
  },
  built: {
    gap: 15,
    lines: [
      ...say('bako', 'Pas très droit, mais ça tient.', 'Terminé. Touchez pas, c’est frais.'),
      ...say('nina', 'Et voilà, c’est monté !', 'Un de plus.'),
      ...say('orsa', 'Bon travail. Branchez-moi ça.'),
    ],
  },
  raid: {
    gap: 20,
    urgent: true,
    lines: say(
      'harl',
      'Ils arrivent ! Bougez-vous !',
      'Contact, galerie ouverte !',
      'À vos postes, vite !',
      'Ça grouille là-dedans !',
    ),
  },
  collapse: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('bako', 'Ça descend ! Dégagez !', 'Nom d’un filon !'),
      ...say('nina', 'Attention la tête !', 'Le plafond ! Le plafond !'),
    ],
  },
  destroyed: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('harl', 'On vient de perdre un bâtiment !', 'C’est tombé ! Tout est tombé !'),
      ...say('krell', 'Y a plus rien, là-bas…'),
    ],
  },
  citizenLost: {
    gap: 45,
    lines: say(
      'krell',
      'Gouverneur… on a perdu quelqu’un.',
      'Encore un. Faites quelque chose.',
      'Les gens tiennent plus, là.',
    ),
  },
  sabotage: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('orsa', 'C’est pas une panne, ça. C’est un sabotage.'),
      ...say('krell', 'Quelqu’un a touché aux machines !', 'On a un traître parmi nous.'),
    ],
  },
  gas: {
    gap: 25,
    urgent: true,
    lines: [
      ...say('bako', 'Ça pue, là-dedans… Reculez !', 'Je tousse, chef, ça sent mauvais.'),
      ...say('nina', 'Du gaz ! Masques, vite !'),
      ...say('orsa', 'Gaz toxique. Il nous faut un ventilateur.'),
    ],
  },
  reunited: {
    gap: 0,
    urgent: true,
    lines: say('orsa', 'Ils sont là ! Port-Cendre répond !', 'Ça y est, on les entend !'),
  },
  win: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('orsa', 'Ça, c’est fait. Joli travail, Gouverneur.'),
      ...say('harl', 'La région est à nous !'),
    ],
  },
  lose: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('orsa', 'C’est fini… on plie bagage.'),
      ...say('harl', 'On peut plus tenir. Tout le monde dehors !'),
    ],
  },
};
