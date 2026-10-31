import type { Cost, EnemyType, PolicyId, UnitType } from '../sim/types';

export interface UnitDef {
  name: string;
  desc: string;
  hp: number;
  speed: number;
  cost: Cost;
  /** Citizens leaving civilian life to join up. */
  citizens: number;
  trainTime: number;
  drillPower: number;
  drillSpeed: number;
  jobs: readonly string[];
  /** Items moved per trip. */
  carryLimit: number;
  attack?: { range: number; damage: number; cooldown: number };
}

export const UNITS: Record<UnitType, UnitDef> = {
  foreur: {
    name: 'Foreur',
    desc: 'Fore, déblaie, transporte et construit.',
    hp: 60,
    speed: 2.8,
    cost: { credits: 15 },
    citizens: 1,
    trainTime: 6,
    drillPower: 1,
    drillSpeed: 1,
    jobs: ['build', 'drill', 'path', 'haul', 'harvest', 'clear'],
    carryLimit: 3,
  },
  garde: {
    name: 'Garde',
    desc: 'Combat automatiquement. Clic droit pour le déplacer.',
    hp: 110,
    speed: 2.5,
    cost: { credits: 25, ore: 4 },
    citizens: 1,
    trainTime: 7,
    drillPower: 0,
    drillSpeed: 0,
    jobs: [],
    carryLimit: 0,
    attack: { range: 5.5, damage: 10, cooldown: 0.8 },
  },
  heavy: {
    name: 'Foreuse lourde',
    desc: 'Machine sans pilote : la seule capable de percer la roche dure.',
    hp: 200,
    speed: 1.6,
    cost: { metal: 10, crystal: 4 },
    citizens: 0,
    trainTime: 12,
    drillPower: 2,
    drillSpeed: 3,
    jobs: ['drill'],
    carryLimit: 0,
  },
  hauler: {
    name: 'Mule',
    desc: 'Transporteur rapide et sans pilote. Ne fait que du transport.',
    hp: 120,
    speed: 4,
    cost: { metal: 6, crystal: 2 },
    citizens: 0,
    trainTime: 8,
    drillPower: 0,
    drillSpeed: 0,
    jobs: ['haul'],
    carryLimit: 6,
  },
};

export interface EnemyDef {
  name: string;
  faction: 'Faune' | 'Enfants du Noyau' | 'Consortium Vantor';
  hp: number;
  speed: number;
  damage: number;
  cooldown: number;
  range: number;
  /** Structures stay put and spawn others. */
  structure?: { spawns: EnemyType[]; every: number };
  /** Multiplier on damage dealt to buildings. */
  vsBuilding: number;
  prefersUnits?: boolean;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  rongeur: {
    name: 'Rongeur',
    faction: 'Faune',
    hp: 28,
    speed: 2.6,
    damage: 4,
    cooldown: 0.8,
    range: 1.1,
    vsBuilding: 1,
    prefersUnits: true,
  },
  golem: {
    name: 'Golem de roche',
    faction: 'Faune',
    hp: 170,
    speed: 1.1,
    damage: 16,
    cooldown: 1.6,
    range: 1.3,
    vsBuilding: 1.5,
  },
  larve: {
    name: 'Larve magmatique',
    faction: 'Faune',
    hp: 70,
    speed: 1,
    damage: 5,
    cooldown: 1,
    range: 1.2,
    vsBuilding: 2,
  },
  saboteur: {
    name: 'Saboteur',
    faction: 'Enfants du Noyau',
    hp: 45,
    speed: 2,
    damage: 12,
    cooldown: 1,
    range: 1.1,
    vsBuilding: 2.5,
  },
  drone: {
    name: 'Drone Vantor',
    faction: 'Consortium Vantor',
    hp: 55,
    speed: 2.2,
    damage: 6,
    cooldown: 1,
    range: 4,
    vsBuilding: 1,
  },
  nest: {
    name: 'Nid de la Faune',
    faction: 'Faune',
    hp: 320,
    speed: 0,
    damage: 0,
    cooldown: 1,
    range: 0,
    vsBuilding: 0,
    structure: { spawns: ['rongeur', 'rongeur', 'golem'], every: 28 },
  },
  outpost: {
    name: 'Avant-poste Vantor',
    faction: 'Consortium Vantor',
    hp: 520,
    speed: 0,
    damage: 8,
    cooldown: 1.2,
    range: 5,
    vsBuilding: 1,
    structure: { spawns: ['drone'], every: 24 },
  },
  heart: {
    name: 'Cœur du Dormeur',
    faction: 'Enfants du Noyau',
    hp: 2200,
    speed: 0,
    damage: 14,
    cooldown: 1.5,
    range: 6,
    vsBuilding: 1,
    structure: { spawns: ['larve', 'saboteur', 'golem'], every: 14 },
  },
};

export interface PolicyDef {
  name: string;
  desc: string;
  morale: number;
  /** Credits per second. */
  upkeep: number;
}

export const POLICIES: Record<PolicyId, PolicyDef> = {
  rationing: {
    name: 'Rationnement',
    desc: 'Consommation de nourriture réduite de 35 %.',
    morale: -10,
    upkeep: 0,
  },
  curfew: {
    name: 'Couvre-feu',
    desc: 'Divise par deux la progression du complot.',
    morale: -8,
    upkeep: 0,
  },
  propaganda: {
    name: 'Propagande',
    desc: 'Coûteuse, mais la foule y croit.',
    morale: 8,
    upkeep: 0.15,
  },
  overtime: {
    name: 'Heures supplémentaires',
    desc: 'Toute la production gagne 25 %.',
    morale: -9,
    upkeep: 0,
  },
};

export const TAX_LEVELS: readonly { name: string; rate: number; morale: number }[] = [
  { name: 'Aucun', rate: 0, morale: 6 },
  { name: 'Léger', rate: 0.012, morale: 0 },
  { name: 'Normal', rate: 0.024, morale: -6 },
  { name: 'Écrasant', rate: 0.042, morale: -16 },
];

export const INVESTIGATION_COST = 40;
