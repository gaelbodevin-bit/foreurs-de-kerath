import type { AdvisorId, GovernorTraitId, Modifiers, SeatId } from '../sim/types';

export const SEATS: Record<SeatId, { name: string; desc: string }> = {
  engineering: { name: 'Ingénierie', desc: 'Forage, chantiers et sécurité des galeries.' },
  logistics: { name: 'Intendance', desc: 'Production, finances et transports.' },
  science: { name: 'Science', desc: 'Recherche, énergie et air respirable.' },
  defense: { name: 'Défense', desc: 'Gardes, tourelles et contre-espionnage.' },
};

export const SEAT_IDS = Object.keys(SEATS) as SeatId[];

export interface CouncilTrait {
  seat: SeatId;
  name: string;
  desc: string;
  /** Added once per level of whoever has this trait. */
  perLevel: Partial<Modifiers>;
}

export const COUNCIL_TRAITS: Record<string, CouncilTrait> = {
  driller: {
    seat: 'engineering',
    name: 'Foreur de métier',
    desc: 'Forage +10 % par niveau.',
    perLevel: { drillSpeed: 0.1 },
  },
  builder: {
    seat: 'engineering',
    name: 'Chef de chantier',
    desc: 'Construction +12 % par niveau.',
    perLevel: { buildSpeed: 0.12 },
  },
  careful: {
    seat: 'engineering',
    name: 'Prudence maladive',
    desc: 'Éboulements et lave −10 % par niveau.',
    perLevel: { hazard: -0.1 },
  },
  manager: {
    seat: 'logistics',
    name: 'Gestionnaire',
    desc: 'Production +6 % par niveau.',
    perLevel: { production: 0.06 },
  },
  taxman: {
    seat: 'logistics',
    name: 'Percepteur',
    desc: 'Recettes fiscales +10 % par niveau.',
    perLevel: { taxes: 0.1 },
  },
  runner: {
    seat: 'logistics',
    name: 'Logisticien',
    desc: 'Déplacements +5 % par niveau.',
    perLevel: { moveSpeed: 0.05 },
  },
  scholar: {
    seat: 'science',
    name: 'Chercheuse née',
    desc: 'Recherche +15 % par niveau.',
    perLevel: { research: 0.15 },
  },
  gridmaster: {
    seat: 'science',
    name: 'Électricien de génie',
    desc: 'Énergie +8 % par niveau.',
    perLevel: { powerOutput: 0.08 },
  },
  biologist: {
    seat: 'science',
    name: 'Biologiste',
    desc: 'Oxygène +8 % par niveau.',
    perLevel: { oxygen: 0.08 },
  },
  veteran: {
    seat: 'defense',
    name: 'Vétéran',
    desc: 'Dégâts +10 % par niveau.',
    perLevel: { combatDamage: 0.1 },
  },
  spymaster: {
    seat: 'defense',
    name: 'Maître espion',
    desc: 'Complot −10 % par niveau.',
    perLevel: { conspiracyGain: -0.1 },
  },
};

/** The advisors who came with the expedition: they take their seats when the governor is named. */
export const FOUNDING_COUNCIL: { advisor: AdvisorId; name: string; seat: SeatId; trait: string }[] =
  [
    { advisor: 'orsa', name: 'Orsa Veld', seat: 'engineering', trait: 'careful' },
    { advisor: 'krell', name: 'Tomas Krell', seat: 'logistics', trait: 'manager' },
    { advisor: 'soum', name: 'Dr Ilyane Soum', seat: 'science', trait: 'scholar' },
  ];

export const CANDIDATE_FIRST_NAMES = [
  'Sana',
  'Ioan',
  'Maëva',
  'Teodor',
  'Lina',
  'Bastien',
  'Yara',
  'Corentin',
  'Noor',
  'Elias',
  'Jade',
  'Rurik',
] as const;

export const CANDIDATE_LAST_NAMES = [
  'Marek',
  'Dorval',
  'Okoye',
  'Vasseur',
  'Tanaka',
  'Lindqvist',
  'Ferrand',
  'Achour',
  'Quill',
  'Roussel',
  'Benali',
  'Stroud',
] as const;

export const MAX_COUNCIL_LEVEL = 5;
/** Seconds in a seat before someone gains a level. */
export const COUNCIL_LEVEL_EVERY = 300;
/** Credits per minute, per level. */
export const COUNCIL_UPKEEP = 3;
/** Seconds between two new lists of candidates. */
export const CANDIDATES_EVERY = 180;
export const CANDIDATE_COUNT = 3;
export const hireCost = (level: number): number => 30 + level * 30;

export const GOVERNOR_TRAITS: Record<
  GovernorTraitId,
  { name: string; desc: string; mods: Partial<Modifiers> }
> = {
  builder: { name: 'Bâtisseur', desc: 'Construction +20 %', mods: { buildSpeed: 0.2 } },
  prospector: { name: 'Prospecteur', desc: 'Forage +20 %', mods: { drillSpeed: 0.2 } },
  warlord: { name: 'Stratège', desc: 'Dégâts +20 %', mods: { combatDamage: 0.2 } },
};
