import type { VoiceId } from '../sim/types';

export type CrewMember = 'driller' | 'drillerF' | 'guard' | 'engineer' | 'steward';

/** The recorded voices the lines are generated with. See `tools/voices/generate.py`. */
export type VoiceModel = 'siwis' | 'pierre' | 'jessica' | 'gilles';

/**
 * Who speaks with which voice, under the job shown in the subtitle. `rate` is the playback speed,
 * which sets the pitch, and stays close to 1: a voice pushed far from its own pitch stops sounding
 * human. `pace` is how fast they talk.
 */
export const CREW: Record<
  CrewMember,
  { name: string; voice: VoiceModel; rate: number; pace: number }
> = {
  driller: { name: 'Foreur', voice: 'pierre', rate: 1, pace: 1 },
  drillerF: { name: 'Foreuse', voice: 'jessica', rate: 1, pace: 0.95 },
  guard: { name: 'Garde', voice: 'pierre', rate: 0.92, pace: 0.92 },
  engineer: { name: 'Ingénieure', voice: 'siwis', rate: 1, pace: 1.02 },
  steward: { name: 'Intendant', voice: 'gilles', rate: 1, pace: 1.05 },
};

export interface LineSet {
  /** Shortest delay before this kind of line comes back, in seconds. */
  gap: number;
  /** Cuts off whoever is speaking, instead of giving way. */
  urgent?: boolean;
  lines: { who: CrewMember; text: string }[];
}

const say = (who: CrewMember, ...texts: string[]) => texts.map((text) => ({ who, text }));

/**
 * Each line says what just happened: heard without looking, it should still tell the player
 * something. Written out in full, as a speech generator reads slang and dropped words badly.
 */
export const VOICE_LINES: Record<VoiceId, LineSet> = {
  ack: {
    gap: 8,
    lines: [
      ...say('driller', 'Bien reçu, j’y vais.', 'D’accord, j’y vais.', 'Ordre reçu.'),
      ...say('drillerF', 'Bien reçu, chef.', 'J’arrive tout de suite.', 'Je m’en occupe.'),
    ],
  },
  drill: {
    gap: 20,
    lines: [
      ...say(
        'driller',
        'Je commence à creuser.',
        'Nous attaquons cette paroi.',
        'Forage en cours.',
      ),
      ...say('drillerF', 'Je creuse ici.', 'Nous perçons cette roche.'),
    ],
  },
  find: {
    gap: 40,
    lines: [
      ...say('driller', 'Filon dégagé, je ramène tout.', 'Nous avons trouvé un filon.'),
      ...say('drillerF', 'Filon trouvé !', 'Il y a des ressources à ramasser ici.'),
    ],
  },
  built: {
    gap: 15,
    lines: [
      ...say('driller', 'Le bâtiment est terminé.', 'Construction terminée.'),
      ...say('drillerF', 'Le chantier est fini.', 'Encore un bâtiment de prêt.'),
      ...say('engineer', 'Bâtiment prêt. Pensez à le relier au réseau.'),
    ],
  },
  raid: {
    gap: 20,
    urgent: true,
    lines: say(
      'guard',
      'Ennemis en approche !',
      'Ennemis dans la galerie !',
      'Alerte, tout le monde à son poste !',
      'La colonie est attaquée !',
    ),
  },
  collapse: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('driller', 'Éboulement ! Reculez !', 'La roche s’effondre !'),
      ...say('drillerF', 'Attention, éboulement !', 'Le plafond s’effondre !'),
    ],
  },
  destroyed: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('guard', 'Nous venons de perdre un bâtiment !', 'Un bâtiment est détruit !'),
      ...say('steward', 'Ce bâtiment est perdu.'),
    ],
  },
  citizenLost: {
    gap: 45,
    lines: say(
      'steward',
      'Un habitant vient de mourir.',
      'Nous avons encore perdu quelqu’un.',
      'Les habitants ne tiennent plus.',
    ),
  },
  sabotage: {
    gap: 20,
    urgent: true,
    lines: [
      ...say('engineer', 'Ce n’est pas une panne. C’est un sabotage.'),
      ...say('steward', 'Quelqu’un a saboté les machines !', 'Un traître est parmi nous.'),
    ],
  },
  gas: {
    gap: 25,
    urgent: true,
    lines: [
      ...say('driller', 'Du gaz toxique ! Reculez !', 'Je tousse, il y a du gaz ici.'),
      ...say('drillerF', 'Du gaz ! Sortez d’ici !'),
      ...say('engineer', 'Gaz toxique. Il nous faut un ventilateur.'),
    ],
  },
  lair: {
    gap: 30,
    urgent: true,
    lines: [
      ...say(
        'driller',
        'Il y a des monstres dans cette salle.',
        'Attention, quelque chose bouge ici.',
      ),
      ...say('drillerF', 'Des monstres au fond de la salle !'),
      ...say('guard', 'Des monstres ! Protégez les foreurs !'),
    ],
  },
  reunited: {
    gap: 0,
    urgent: true,
    lines: say('engineer', 'Nous avons rejoint CITY !', 'La galerie est ouverte, voici CITY !'),
  },
  contract: {
    gap: 12,
    lines: [
      ...say('steward', 'Nouvelle mission disponible.', 'Une nouvelle demande vient d’arriver.'),
      ...say('engineer', 'Une mission vient d’arriver.', 'Une demande vous attend, Gouverneur.'),
    ],
  },
  contractDone: {
    gap: 10,
    lines: [
      ...say('steward', 'Mission accomplie, la récompense est versée.', 'Mission terminée.'),
      ...say('drillerF', 'Mission réussie !'),
    ],
  },
  sector: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('guard', 'Le secteur est sous contrôle !', 'Ce secteur est à nous.'),
      ...say('engineer', 'Un secteur de plus sur la carte.'),
    ],
  },
  levelUp: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('steward', 'La colonie grandit, Gouverneur.', 'La population augmente.'),
      ...say('engineer', 'La cité s’agrandit, nous pouvons bâtir plus loin.'),
    ],
  },
  win: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('engineer', 'La planète est sous contrôle. Beau travail, Gouverneur.'),
      ...say('guard', 'Kerath est à nous !'),
    ],
  },
  lose: {
    gap: 0,
    urgent: true,
    lines: [
      ...say('engineer', 'La colonie est perdue. Nous évacuons.'),
      ...say('guard', 'Nous ne pouvons plus tenir. Évacuez !'),
    ],
  },
};

/** Where a line's recording lives, relative to `public/assets`. */
export const voiceFile = (id: VoiceId, index: number): string => `audio/voices/${id}_${index}.wav`;

export const VOICE_FILES: string[] = (Object.keys(VOICE_LINES) as VoiceId[]).flatMap((id) =>
  VOICE_LINES[id].lines.map((_, index) => voiceFile(id, index)),
);
