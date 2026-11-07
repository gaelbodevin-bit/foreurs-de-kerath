import type { BuildingType, Cost, ResourceId, TileKind, UnitType } from '../sim/types';

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
  /** The research that unlocks it. Without one, it is there from the start. */
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
  /** Tiles around it where tremors bring nothing down. */
  shoring?: number;
  /** Share of the colony's food it saves. */
  appetite?: number;
  /** What a power plant burns. Crystal, unless it says otherwise. */
  fuel?: ResourceId;
  /** The deposit it has to stand on. Anything else goes on bare floor. */
  on?: TileKind;
  /** The edict that allows it. */
  edict?: string;
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
    name: 'Entrepôt',
    desc: 'Augmente le stockage de chaque ressource et raccourcit les trajets des foreurs.',
    size: 1,
    cost: { ore: 12, stone: 4 },
    buildTime: 7,
    hp: 220,
    storage: 100,
  },
  generator: {
    name: 'Centrale à cristaux',
    desc: 'Brûle un cristal toutes les 45 s pour alimenter le réseau, et relance le courant plus loin le long du sol technique.',
    size: 2,
    cost: { ore: 18, stone: 6 },
    buildTime: 10,
    hp: 300,
    powerOutput: 14,
    burnTime: 45,
    jobs: 2,
  },
  oxygen: {
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
    desc: 'Remonte le moral général, et soigne vite les unités blessées qui passent à côté.',
    size: 2,
    cost: { ore: 15, crystal: 6, credits: 40 },
    buildTime: 10,
    hp: 200,
    power: 2,
    jobs: 2,
    morale: 9,
  },
  lab: {
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
    desc: 'Assemble la foreuse lourde (roche dure, or), la mule de transport et, avec des pneus, le camion.',
    size: 2,
    cost: { ore: 20, crystal: 5, stone: 8 },
    buildTime: 12,
    hp: 320,
    power: 3,
    jobs: 2,
    trains: ['heavy', 'hauler', 'truck'],
  },
  seismo: {
    tech: 'seismology',
    name: 'Station sismique',
    desc: 'Annonce les secousses à l’avance, avec leur magnitude et leur zone (touche T). Doit être reliée au réseau.',
    size: 1,
    cost: { ore: 10, crystal: 2, stone: 4 },
    buildTime: 7,
    hp: 150,
    power: 1,
  },
  lamp: {
    name: 'Lampadaire',
    desc: 'Le même que sur la place de CITY : il a sa propre pile et éclaire les alentours, sans réseau.',
    size: 1,
    cost: { ore: 2, stone: 1 },
    buildTime: 2,
    hp: 60,
  },
  prop: {
    tech: 'stability',
    name: 'Étai de soutènement',
    desc: 'Dans un rayon de 5 cases, rien ne s’éboule et les secousses abîment deux fois moins les bâtiments.',
    size: 1,
    cost: { ore: 6, stone: 10 },
    buildTime: 5,
    hp: 260,
    shoring: 5,
  },
  geothermal: {
    tech: 'grid',
    name: 'Centrale géothermique',
    desc: 'Tire son énergie des profondeurs : sans cristal, sans personnel, mais coûteuse à forer. Relance aussi le courant le long du sol technique.',
    size: 2,
    cost: { metal: 14, crystal: 8, stone: 14 },
    buildTime: 16,
    hp: 340,
    powerOutput: 10,
  },
  silo: {
    tech: 'logistics',
    name: 'Grand silo',
    desc: 'Stocke trois fois plus qu’un entrepôt, mais ne se pose qu’une fois la logistique maîtrisée.',
    size: 2,
    cost: { metal: 10, stone: 16 },
    buildTime: 12,
    hp: 320,
    storage: 300,
  },
  canteen: {
    name: 'Cantine',
    desc: 'Moins de gaspillage, de meilleurs repas : la colonie mange 15 % de moins et le moral monte.',
    size: 2,
    cost: { ore: 14, stone: 8, credits: 25 },
    buildTime: 8,
    hp: 170,
    power: 1,
    jobs: 2,
    morale: 5,
    appetite: 0.15,
  },
  academy: {
    tech: 'education',
    name: 'Académie',
    desc: 'Forme la relève : un peu de recherche, un peu de moral.',
    size: 2,
    cost: { ore: 16, crystal: 6, credits: 60 },
    buildTime: 12,
    hp: 190,
    power: 2,
    jobs: 2,
    morale: 3,
    research: 1 / 60,
  },
  derrick: {
    tech: 'petrochem',
    name: 'Derrick',
    desc: 'Pompe le pétrole. Ne se pose que sur un suintement, et doit être relié au réseau.',
    size: 1,
    cost: { metal: 8, stone: 6 },
    buildTime: 9,
    hp: 200,
    power: 2,
    jobs: 1,
    on: 'oilSeep',
    recipe: { inputs: {}, outputs: { oil: 1 }, cycle: 8 },
  },
  gascap: {
    tech: 'gascapture',
    name: 'Captage de gaz',
    desc: 'Coiffe une fumerolle : plus d’émanations, et de l’énergie sans combustible.',
    size: 1,
    cost: { metal: 6, ore: 8 },
    buildTime: 8,
    hp: 180,
    powerOutput: 9,
    on: 'fumarole',
  },
  fuelplant: {
    tech: 'petrochem',
    name: 'Centrale au fioul',
    desc: 'Brûle un baril de pétrole toutes les 30 s. Bien plus puissante que la centrale à cristaux, et elle porte le courant plus loin.',
    size: 2,
    cost: { metal: 14, stone: 10 },
    buildTime: 12,
    hp: 300,
    powerOutput: 26,
    burnTime: 30,
    fuel: 'oil',
    jobs: 2,
  },
  rubberworks: {
    tech: 'vulcanization',
    name: 'Usine de caoutchouc',
    desc: 'Vulcanise le pétrole au soufre.',
    size: 2,
    cost: { metal: 12, crystal: 4, stone: 8 },
    buildTime: 12,
    hp: 260,
    power: 3,
    jobs: 2,
    recipe: { inputs: { oil: 2, sulfur: 1 }, outputs: { rubber: 2 }, cycle: 12 },
  },
  tyreshop: {
    tech: 'vulcanization',
    name: 'Atelier de pneus',
    desc: 'Monte les pneus dont les camions ont besoin. Le tout-terrain sort d’ici.',
    size: 2,
    cost: { metal: 10, stone: 8 },
    buildTime: 10,
    hp: 240,
    power: 2,
    jobs: 2,
    recipe: { inputs: { rubber: 2, metal: 1 }, outputs: { tyres: 1 }, cycle: 14 },
  },
  algae: {
    tech: 'hydroponics',
    name: 'Cuve à algues',
    desc: 'Plus productive que la serre, mais gourmande en énergie.',
    size: 2,
    cost: { metal: 8, crystal: 3, stone: 4 },
    buildTime: 9,
    hp: 170,
    power: 4,
    jobs: 1,
    recipe: { inputs: { water: 1 }, outputs: { food: 5 }, cycle: 12 },
  },
  vivarium: {
    edict: 'larvae',
    name: 'Vivier à larves',
    desc: 'De la viande sans eau ni soin. Personne n’aime y travailler, ni savoir ce qu’il mange.',
    size: 1,
    cost: { ore: 10, stone: 6 },
    buildTime: 6,
    hp: 140,
    power: 1,
    jobs: 1,
    morale: -3,
    recipe: { inputs: {}, outputs: { food: 2 }, cycle: 12 },
  },
  bigturret: {
    tech: 'tungstenbits',
    name: 'Tourelle à obus',
    desc: 'Des obus à pointe de tungstène : portée et dégâts largement supérieurs.',
    size: 1,
    cost: { metal: 10, tungsten: 6, crystal: 3 },
    buildTime: 10,
    hp: 420,
    power: 4,
    turret: { range: 9.5, damage: 30, cooldown: 1.5 },
  },
  turret: {
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
/** What taking a stretch of road up gives back: half of the stone, and none of the ore. */
export const PATH_REFUND = 1;
/** Per tile: a bridge is laid from the edge, one span after the other. */
export const BRIDGE_COST: Cost = { stone: 3, ore: 2 };

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
      {
        name: 'Réseau',
        buildings: ['generator', 'fuelplant', 'geothermal', 'gascap', 'depot', 'silo'],
      },
      { name: 'Terrain', buildings: ['lamp', 'vent', 'seismo', 'prop', 'camp', 'derrick'] },
      { name: 'Véhicules', buildings: ['workshop'] },
      { name: 'Défense', buildings: ['turret', 'bigturret', 'barracks'] },
    ],
  },
  {
    id: 'city',
    name: 'Cité',
    groups: [
      { name: 'Vie', buildings: ['habitat', 'oxygen', 'plaza', 'canteen', 'clinic'] },
      { name: 'Vivres', buildings: ['melter', 'farm', 'algae', 'vivarium'] },
      { name: 'Industrie', buildings: ['refinery', 'foundry', 'rubberworks', 'tyreshop'] },
      { name: 'Administration', buildings: ['market', 'lab', 'academy', 'security'] },
    ],
  },
];

/** What belongs to the colony's life: only these are confined to the city zone. */
export const CITY_BUILDINGS: ReadonlySet<BuildingType> = new Set(
  BUILD_MENUS.filter((m) => m.id === 'city').flatMap((m) => m.groups.flatMap((g) => g.buildings)),
);

/** Every `buildTime` is multiplied by this: raising a colony is meant to take a while. */
export const BUILD_TIME_FACTOR = 4;
