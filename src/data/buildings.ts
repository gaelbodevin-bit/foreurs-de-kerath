import type { BuildingType, Cost, UnitType } from '../sim/types';

export interface Recipe {
  inputs: Cost;
  outputs: Cost;
  /** Seconds per cycle at full efficiency. */
  cycle: number;
}

export interface BuildingDef {
  name: string;
  desc: string;
  /** Footprint is size x size tiles. */
  size: 1 | 2;
  cost: Cost;
  buildTime: number;
  hp: number;
  /** What unlocks it. Only the headquarters has none. */
  tech?: string;
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
    size: 2,
    cost: {},
    buildTime: 1,
    hp: 900,
    powerOutput: 4,
    storage: 150,
    housing: 8,
    oxygen: 0.15,
    trains: ['foreur'],
    turret: { range: 6, damage: 6, cooldown: 1 },
  },
  vent: {
    tech: 'guard',
    name: 'Ventilateur',
    desc: 'Aspire le gaz toxique dans un rayon de 6 cases. Doit être relié au réseau.',
    size: 1,
    cost: { ore: 10, stone: 6 },
    buildTime: 6,
    hp: 140,
    power: 1,
  },
  camp: {
    tech: 'outposts',
    name: 'Avant-poste',
    desc: 'Une base loin de la cité : dépôt pour les foreurs, source d’énergie pour un réseau à part, et une petite tourelle.',
    size: 2,
    cost: { metal: 10, crystal: 4, stone: 12 },
    buildTime: 12,
    hp: 380,
    storage: 40,
    powerOutput: 6,
    turret: { range: 5.5, damage: 6, cooldown: 1.2 },
  },
  depot: {
    tech: 'power',
    name: 'Entrepôt',
    desc: 'Augmente le stockage de chaque ressource et raccourcit les trajets des foreurs.',
    size: 1,
    cost: { ore: 12, stone: 4 },
    buildTime: 7,
    hp: 220,
    storage: 100,
  },
  generator: {
    tech: 'power',
    name: 'Centrale à cristaux',
    desc: 'Brûle un cristal toutes les 45 s pour alimenter le réseau.',
    size: 2,
    cost: { ore: 18, stone: 6 },
    buildTime: 10,
    hp: 300,
    powerOutput: 14,
    burnTime: 45,
    jobs: 2,
  },
  oxygen: {
    tech: 'air',
    name: "Extracteur d'oxygène",
    desc: 'Filtre la roche pour produire de quoi faire respirer 12 personnes.',
    size: 1,
    cost: { ore: 12, crystal: 3 },
    buildTime: 8,
    hp: 180,
    power: 3,
    jobs: 1,
    oxygen: 0.12,
  },
  habitat: {
    tech: 'shelter',
    name: 'Habitat',
    desc: 'Loge 10 citoyens. Sans logement libre, la cité cesse de croître.',
    size: 1,
    cost: { ore: 10, stone: 8 },
    buildTime: 7,
    hp: 160,
    power: 1,
    housing: 10,
  },
  melter: {
    tech: 'food',
    name: 'Fondoir à glace',
    desc: 'Transforme la glace en eau.',
    size: 1,
    cost: { ore: 10, stone: 3 },
    buildTime: 6,
    hp: 150,
    power: 2,
    jobs: 1,
    recipe: { inputs: { ice: 1 }, outputs: { water: 2 }, cycle: 8 },
  },
  farm: {
    tech: 'food',
    name: 'Serre fongique',
    desc: "Cultive de la nourriture à partir de l'eau.",
    size: 2,
    cost: { ore: 14, stone: 4 },
    buildTime: 8,
    hp: 170,
    power: 2,
    jobs: 2,
    recipe: { inputs: { water: 1 }, outputs: { food: 3 }, cycle: 12 },
  },
  refinery: {
    tech: 'refining',
    name: 'Raffinerie',
    desc: 'Affine le minerai en métal.',
    size: 2,
    cost: { ore: 20, crystal: 4, stone: 6 },
    buildTime: 12,
    hp: 280,
    power: 3,
    jobs: 2,
    recipe: { inputs: { ore: 2 }, outputs: { metal: 1 }, cycle: 9 },
  },
  foundry: {
    tech: 'alloys',
    name: "Forge d'alliage",
    desc: 'Combine métal et soufre en alliage, le matériau des grandes œuvres.',
    size: 2,
    cost: { metal: 15, crystal: 8, stone: 10 },
    buildTime: 16,
    hp: 320,
    power: 5,
    jobs: 3,
    recipe: { inputs: { metal: 2, sulfur: 1 }, outputs: { alloy: 1 }, cycle: 14 },
  },
  market: {
    tech: 'commerce',
    name: 'Marché',
    desc: "Vend l'or contre des crédits et augmente les recettes fiscales de 25 %.",
    size: 2,
    cost: { ore: 12, stone: 12, credits: 30 },
    buildTime: 9,
    hp: 180,
    power: 1,
    jobs: 2,
    taxBonus: 0.25,
    recipe: { inputs: { gold: 1 }, outputs: { credits: 30 }, cycle: 10 },
  },
  plaza: {
    tech: 'commerce',
    name: 'Place publique',
    desc: 'Un lieu où respirer. Le moral monte, sans consommer d’énergie.',
    size: 1,
    cost: { stone: 15, credits: 15 },
    buildTime: 6,
    hp: 80,
    morale: 5,
  },
  clinic: {
    tech: 'medicine',
    name: 'Dispensaire',
    desc: 'Soigne les habitants et remonte le moral général.',
    size: 2,
    cost: { ore: 15, crystal: 6, credits: 40 },
    buildTime: 10,
    hp: 200,
    power: 2,
    jobs: 2,
    morale: 9,
  },
  lab: {
    tech: 'lab',
    name: 'Laboratoire',
    desc: 'Produit des points de recherche, à dépenser pour débloquer outils, véhicules et usines.',
    size: 2,
    cost: { ore: 16, crystal: 8, credits: 40 },
    buildTime: 12,
    hp: 200,
    power: 4,
    jobs: 3,
    research: 1 / 30,
  },
  security: {
    tech: 'intel',
    name: 'Bureau de sûreté',
    desc: 'Fait reculer le complot en continu. Votre meilleur rempart contre les saboteurs.',
    size: 1,
    cost: { ore: 10, stone: 8, credits: 60 },
    buildTime: 9,
    hp: 220,
    power: 2,
    jobs: 2,
    conspiracy: 0.05,
  },
  barracks: {
    tech: 'barracks',
    name: 'Caserne',
    desc: 'Forme des gardes armés de lasers.',
    size: 2,
    cost: { ore: 16, stone: 8, credits: 30 },
    buildTime: 10,
    hp: 350,
    power: 2,
    jobs: 2,
    trains: ['garde'],
  },
  workshop: {
    tech: 'vehicles',
    name: 'Atelier de véhicules',
    desc: 'Assemble la foreuse lourde (roche dure, or) et la mule de transport.',
    size: 2,
    cost: { ore: 20, crystal: 5, stone: 8 },
    buildTime: 12,
    hp: 320,
    power: 3,
    jobs: 2,
    trains: ['heavy', 'hauler'],
  },
  turret: {
    tech: 'guard',
    name: 'Tourelle laser',
    desc: 'Tire automatiquement sur les ennemis, tant qu’elle est sous tension.',
    size: 1,
    cost: { ore: 12, crystal: 3 },
    buildTime: 6,
    hp: 240,
    power: 2,
    turret: { range: 7, damage: 11, cooldown: 0.9 },
  },
};

export const PATH_COST: Cost = { stone: 2, ore: 1 };

export type BuildMenuId = 'explore' | 'city';

export interface BuildMenu {
  id: BuildMenuId;
  name: string;
  groups: { name: string; buildings: BuildingType[] }[];
}

/** Digging outward on one side, the life of the colony on the other. */
export const BUILD_MENUS: BuildMenu[] = [
  {
    id: 'explore',
    name: 'Exploration',
    groups: [
      { name: 'Réseau', buildings: ['generator', 'depot'] },
      { name: 'Terrain', buildings: ['vent', 'camp'] },
      { name: 'Véhicules', buildings: ['workshop'] },
      { name: 'Défense', buildings: ['turret', 'barracks'] },
    ],
  },
  {
    id: 'city',
    name: 'Cité',
    groups: [
      { name: 'Vie', buildings: ['habitat', 'oxygen', 'plaza', 'clinic'] },
      { name: 'Production', buildings: ['melter', 'farm', 'refinery', 'foundry'] },
      { name: 'Administration', buildings: ['market', 'lab', 'security'] },
    ],
  },
];

/** What belongs to the colony's life: only these are confined to the city zone. */
export const CITY_BUILDINGS: ReadonlySet<BuildingType> = new Set(
  BUILD_MENUS.filter((m) => m.id === 'city').flatMap((m) => m.groups.flatMap((g) => g.buildings)),
);
