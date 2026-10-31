import type { BuildingType, Cost, UnitType } from '../sim/types';

export type BuildingCategory = 'infrastructure' | 'industry' | 'city' | 'defense';

export interface Recipe {
  inputs: Cost;
  outputs: Cost;
  /** Seconds per cycle at full efficiency. */
  cycle: number;
}

export interface BuildingDef {
  name: string;
  desc: string;
  category: BuildingCategory;
  /** Footprint is size x size tiles. */
  size: 1 | 2;
  cost: Cost;
  buildTime: number;
  hp: number;
  /** Region tier from which the building is available. */
  tier: number;
  power?: number;
  powerOutput?: number;
  /** Seconds one crystal burns for. */
  burnTime?: number;
  jobs?: number;
  storage?: number;
  housing?: number;
  oxygen?: number;
  morale?: number;
  recipe?: Recipe;
  research?: number;
  conspiracy?: number;
  taxBonus?: number;
  trains?: UnitType[];
  turret?: { range: number; damage: number; cooldown: number };
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hq: {
    name: 'Noyau de commande',
    desc: 'Le cœur de la colonie : stockage, oxygène, énergie de secours. Sa chute met fin à la mission.',
    category: 'infrastructure',
    size: 2,
    cost: {},
    buildTime: 1,
    hp: 900,
    tier: 99,
    powerOutput: 4,
    storage: 150,
    housing: 8,
    oxygen: 0.15,
    trains: ['foreur'],
    turret: { range: 6, damage: 6, cooldown: 1 },
  },
  depot: {
    name: 'Entrepôt',
    desc: 'Augmente le stockage de chaque ressource et raccourcit les trajets des foreurs.',
    category: 'infrastructure',
    size: 1,
    cost: { ore: 12, stone: 4 },
    buildTime: 7,
    hp: 220,
    tier: 0,
    storage: 100,
  },
  generator: {
    name: 'Centrale à cristaux',
    desc: 'Brûle un cristal toutes les 45 s pour alimenter le réseau.',
    category: 'infrastructure',
    size: 2,
    cost: { ore: 18, stone: 6 },
    buildTime: 10,
    hp: 300,
    tier: 0,
    powerOutput: 14,
    burnTime: 45,
    jobs: 2,
  },
  oxygen: {
    name: "Extracteur d'oxygène",
    desc: 'Filtre la roche pour produire de quoi faire respirer 12 personnes.',
    category: 'infrastructure',
    size: 1,
    cost: { ore: 12, crystal: 3 },
    buildTime: 8,
    hp: 180,
    tier: 0,
    power: 3,
    jobs: 1,
    oxygen: 0.12,
  },
  habitat: {
    name: 'Habitat',
    desc: 'Loge 10 citoyens. Sans logement libre, la cité cesse de croître.',
    category: 'city',
    size: 1,
    cost: { ore: 10, stone: 8 },
    buildTime: 7,
    hp: 160,
    tier: 0,
    power: 1,
    housing: 10,
  },
  melter: {
    name: 'Fondoir à glace',
    desc: 'Transforme la glace en eau.',
    category: 'industry',
    size: 1,
    cost: { ore: 10, stone: 3 },
    buildTime: 6,
    hp: 150,
    tier: 0,
    power: 2,
    jobs: 1,
    recipe: { inputs: { ice: 1 }, outputs: { water: 2 }, cycle: 8 },
  },
  farm: {
    name: 'Serre fongique',
    desc: "Cultive de la nourriture à partir de l'eau.",
    category: 'industry',
    size: 2,
    cost: { ore: 14, stone: 4 },
    buildTime: 8,
    hp: 170,
    tier: 0,
    power: 2,
    jobs: 2,
    recipe: { inputs: { water: 1 }, outputs: { food: 3 }, cycle: 12 },
  },
  refinery: {
    name: 'Raffinerie',
    desc: 'Affine le minerai en métal.',
    category: 'industry',
    size: 2,
    cost: { ore: 20, crystal: 4, stone: 6 },
    buildTime: 12,
    hp: 280,
    tier: 1,
    power: 3,
    jobs: 2,
    recipe: { inputs: { ore: 2 }, outputs: { metal: 1 }, cycle: 9 },
  },
  foundry: {
    name: "Forge d'alliage",
    desc: 'Combine métal et soufre en alliage, le matériau des grandes œuvres.',
    category: 'industry',
    size: 2,
    cost: { metal: 15, crystal: 8, stone: 10 },
    buildTime: 16,
    hp: 320,
    tier: 2,
    power: 5,
    jobs: 3,
    recipe: { inputs: { metal: 2, sulfur: 1 }, outputs: { alloy: 1 }, cycle: 14 },
  },
  market: {
    name: 'Marché',
    desc: "Vend l'or contre des crédits et augmente les recettes fiscales de 25 %.",
    category: 'city',
    size: 2,
    cost: { ore: 12, stone: 12, credits: 30 },
    buildTime: 9,
    hp: 180,
    tier: 0,
    power: 1,
    jobs: 2,
    taxBonus: 0.25,
    recipe: { inputs: { gold: 1 }, outputs: { credits: 30 }, cycle: 10 },
  },
  plaza: {
    name: 'Place publique',
    desc: 'Un lieu où respirer. Le moral monte, sans consommer d’énergie.',
    category: 'city',
    size: 1,
    cost: { stone: 15, credits: 15 },
    buildTime: 6,
    hp: 80,
    tier: 0,
    morale: 5,
  },
  clinic: {
    name: 'Dispensaire',
    desc: 'Soigne les habitants et remonte le moral général.',
    category: 'city',
    size: 2,
    cost: { ore: 15, crystal: 6, credits: 40 },
    buildTime: 10,
    hp: 200,
    tier: 1,
    power: 2,
    jobs: 2,
    morale: 9,
  },
  lab: {
    name: 'Laboratoire',
    desc: 'Produit des points de recherche, conservés à travers toute la campagne.',
    category: 'city',
    size: 2,
    cost: { ore: 16, crystal: 8, credits: 40 },
    buildTime: 12,
    hp: 200,
    tier: 1,
    power: 4,
    jobs: 3,
    research: 1 / 30,
  },
  security: {
    name: 'Bureau de sûreté',
    desc: 'Fait reculer le complot en continu. Votre meilleur rempart contre les saboteurs.',
    category: 'city',
    size: 1,
    cost: { ore: 10, stone: 8, credits: 60 },
    buildTime: 9,
    hp: 220,
    tier: 1,
    power: 2,
    jobs: 2,
    conspiracy: 0.05,
  },
  barracks: {
    name: 'Caserne',
    desc: 'Forme des gardes armés de lasers.',
    category: 'defense',
    size: 2,
    cost: { ore: 16, stone: 8, credits: 30 },
    buildTime: 10,
    hp: 350,
    tier: 0,
    power: 2,
    jobs: 2,
    trains: ['garde'],
  },
  workshop: {
    name: 'Atelier mécanique',
    desc: 'Assemble la foreuse lourde (roche dure, or) et la mule de transport.',
    category: 'defense',
    size: 2,
    cost: { ore: 20, crystal: 5, stone: 8 },
    buildTime: 12,
    hp: 320,
    tier: 1,
    power: 3,
    jobs: 2,
    trains: ['heavy', 'hauler'],
  },
  turret: {
    name: 'Tourelle laser',
    desc: 'Tire automatiquement sur les ennemis, tant qu’elle est sous tension.',
    category: 'defense',
    size: 1,
    cost: { ore: 12, crystal: 3 },
    buildTime: 6,
    hp: 240,
    tier: 0,
    power: 2,
    turret: { range: 7, damage: 11, cooldown: 0.9 },
  },
};

export const PATH_COST: Cost = { stone: 1 };
