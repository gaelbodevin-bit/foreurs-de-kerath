/**
 * Mission state. Everything here is plain JSON-serialisable data: saving a game
 * is `JSON.stringify(state)`, and the simulation runs without any renderer.
 */

export const RESOURCE_IDS = [
  'ore',
  'crystal',
  'stone',
  'ice',
  'sulfur',
  'gold',
  'relic',
  'metal',
  'water',
  'food',
  'alloy',
  'credits',
] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Stock = Record<ResourceId, number>;
export type Cost = Partial<Stock>;

export type TileKind =
  | 'floor'
  | 'rubble'
  | 'path'
  | 'fungus'
  | 'lava'
  | 'water'
  | 'dirt'
  | 'loose'
  | 'hard'
  | 'basalt'
  | 'solid'
  | 'oreSeam'
  | 'crystalSeam'
  | 'iceSeam'
  | 'sulfurSeam'
  | 'goldSeam'
  | 'relicVault';

export interface Tile {
  k: TileKind;
  /** Discovered by the player. */
  seen: boolean;
  /** Seconds of drilling already spent on this wall. */
  work: number;
  /** Remaining rubble levels. */
  rubble: number;
  /** Seconds before a harvested fungus patch can be harvested again. */
  regrow: number;
  /** Toxic gas in the air here, from 0 to about 1. Missing means none. */
  gas?: number;
  /** Floor of a monsters' lair: stained, so that the room reads as one at a glance. */
  lair?: boolean;
}

export type UnitType = 'foreur' | 'garde' | 'heavy' | 'hauler';
export type EnemyType =
  'rongeur' | 'golem' | 'larve' | 'saboteur' | 'drone' | 'nest' | 'outpost' | 'heart';
export type BuildingType =
  | 'hq'
  | 'depot'
  | 'generator'
  | 'oxygen'
  | 'habitat'
  | 'melter'
  | 'farm'
  | 'refinery'
  | 'foundry'
  | 'market'
  | 'clinic'
  | 'plaza'
  | 'lab'
  | 'security'
  | 'barracks'
  | 'workshop'
  | 'turret'
  | 'vent'
  | 'camp';

export type AdvisorId = 'orsa' | 'krell' | 'soum';
export type SeatId = 'engineering' | 'logistics' | 'science' | 'defense';
export type GovernorTraitId = 'builder' | 'prospector' | 'warlord';

/** Someone on the governor's council, or waiting to join it. */
export interface Councillor {
  id: number;
  name: string;
  seat: SeatId;
  /** Key into COUNCIL_TRAITS. */
  trait: string;
  /** Set for the expedition's own advisors, who are part of the plot. */
  advisor?: AdvisorId;
}
export type PolicyId = 'rationing' | 'curfew' | 'propaganda' | 'overtime';

export interface Unit {
  id: number;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  path: number[];
  jobId: number | null;
  carry: ResourceId | null;
  /** How many items of `carry` are being transported. */
  carryCount: number;
  /** Player move order; guards hold it until reached. */
  order: number | null;
  cooldown: number;
  targetId: number | null;
  /** Where a guard stands watch, and patrols around. Set the first time it needs one. */
  post?: { x: number; y: number };
  /** Ticks before this unit looks for a job again. */
  thinkIn: number;
  working: boolean;
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  hp: number;
  /** Construction progress, 0 to 1. */
  built: number;
  connected: boolean;
  /** Current output ratio, 0 to 1+. */
  eff: number;
  /** Progress in the current recipe cycle, in seconds. */
  progress: number;
  /** Fuel left in seconds (power plants). */
  fuel: number;
  sabotaged: number;
  queue: UnitType[];
  queueT: number;
  cooldown: number;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  path: number[];
  targetKind: 'building' | 'unit' | null;
  targetId: number | null;
  cooldown: number;
  repathIn: number;
  spawnIn: number;
  /** Asleep in its lair until someone comes near or hurts it. */
  dormant?: boolean;
}

export interface Pickup {
  id: number;
  res: ResourceId;
  x: number;
  y: number;
  /** Unit on its way to fetch this item. */
  claimedBy: number | null;
}

export type JobKind = 'build' | 'drill' | 'path' | 'unpath' | 'haul' | 'harvest' | 'clear';

export interface Job {
  id: number;
  kind: JobKind;
  x: number;
  y: number;
  unitId: number | null;
  /** Building or pickup this job refers to. */
  refId: number | null;
  deliver: boolean;
}

export interface LogEntry {
  t: number;
  text: string;
  level: 'info' | 'good' | 'warn' | 'bad';
}

/** Transient visual effects, drained by the renderer and never relevant to the rules. */
export type Fx =
  | { kind: 'laser'; x1: number; y1: number; x2: number; y2: number; hostile: boolean }
  | { kind: 'burst'; x: number; y: number; color: number }
  | { kind: 'sound'; id: SoundId; x?: number; y?: number; machine?: boolean }
  | { kind: 'voice'; id: VoiceId };

export type SoundId =
  'drill' | 'collect' | 'build' | 'alert' | 'laser' | 'collapse' | 'plot' | 'hit';

export type VoiceId =
  | 'ack'
  | 'ackGuard'
  | 'drill'
  | 'find'
  | 'built'
  | 'raid'
  | 'collapse'
  | 'destroyed'
  | 'citizenLost'
  | 'sabotage'
  | 'gas'
  | 'lair'
  | 'reunited'
  | 'contract'
  | 'contractDone'
  | 'sector'
  | 'levelUp'
  | 'win'
  | 'lose';

export interface Modifiers {
  drillSpeed: number;
  drillPower: number;
  buildSpeed: number;
  moveSpeed: number;
  combatDamage: number;
  housing: number;
  oxygen: number;
  powerOutput: number;
  production: number;
  research: number;
  taxes: number;
  conspiracyGain: number;
  hazard: number;
}

export interface CityState {
  population: number;
  morale: number;
  /** Eventful morale swing that decays over time. */
  moraleShock: number;
  oxygen: number;
  taxLevel: 0 | 1 | 2 | 3;
  policies: Record<PolicyId, boolean>;
  conspiracy: number;
  growthT: number;
  declineT: number;
  housing: number;
  jobs: number;
  /** Peak conspiracy threshold already punished, so each one only fires once per climb. */
  conspiracyStage: number;
}

export interface PowerState {
  produced: number;
  demand: number;
  ratio: number;
}

export interface WaveState {
  nextAt: number;
  count: number;
}

export interface StoryState {
  fired: string[];
  flags: Record<string, boolean>;
  /** Events waiting for a player decision, oldest first. */
  pending: string[];
  clues: string[];
  moleCaught: boolean;
  /** Set by the campaign when it starts the mission; never shown to the player. */
  mole: AdvisorId;
  accused: AdvisorId[];
}

/** A place the crew has to dig its way to. */
export interface Settlement {
  x: number;
  y: number;
  reached: boolean;
}

export type ContractKind = 'deliver' | 'build' | 'survey' | 'rescue' | 'defend' | 'refugees';

export interface ContractReward {
  stock: Cost;
  research: number;
  morale: number;
}

/** A request that turns up while playing, on top of the sector objectives. */
export interface Contract {
  id: number;
  kind: ContractKind;
  title: string;
  text: string;
  expiresAt: number;
  reward: ContractReward;
  res?: ResourceId;
  amount?: number;
  building?: BuildingType;
  x?: number;
  y?: number;
  /** Counter value when the contract started, for whatever it measures. */
  baseline?: number;
  goal?: number;
}

export interface GameState {
  version: 2;
  w: number;
  h: number;
  tiles: Tile[];
  /** Missing from older saves, and from missions with nowhere to reach. */
  settlement?: Settlement | null;
  tick: number;
  time: number;
  rng: number;
  nextId: number;
  stock: Stock;
  units: Unit[];
  buildings: Building[];
  enemies: Enemy[];
  pickups: Pickup[];
  jobs: Job[];
  city: CityState;
  power: PowerState;
  story: StoryState;
  waves: WaveState;
  kills: Partial<Record<EnemyType, number>>;
  /** Points waiting to be spent. */
  research: number;
  techs: string[];
  /** Index into CITY_LEVELS. It never goes back down, even if the population does. */
  cityLevel: number;
  conquered: string[];
  /** Time each sector opened. Sectors not listed haven't opened yet. */
  sectorStart: Record<string, number>;
  contracts: Contract[];
  nextContractAt: number;
  /** Empty until the expedition reaches the city and its leader becomes governor. */
  council: Councillor[];
  candidates: Councillor[];
  nextCandidatesAt: number;
  governorTrait: GovernorTraitId | null;
  outcome: 'playing' | 'won' | 'lost';
  outcomeReason: string;
  log: LogEntry[];
  fx: Fx[];
  /** Tile indices changed since the renderer last looked. */
  dirty: number[];
  mods: Modifiers;
  networkDirty: boolean;
}

export const TICK_SECONDS = 0.1;

export const baseModifiers = (): Modifiers => ({
  drillSpeed: 1,
  drillPower: 1,
  buildSpeed: 1,
  moveSpeed: 1,
  combatDamage: 1,
  housing: 0,
  oxygen: 1,
  powerOutput: 1,
  production: 1,
  research: 1,
  taxes: 1,
  conspiracyGain: 1,
  hazard: 1,
});

export const emptyStock = (): Stock => Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0])) as Stock;
