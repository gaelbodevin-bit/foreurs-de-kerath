import type { MapParams } from '../sim/mapgen';
import type { BuildingType, Cost, EnemyType, Modifiers, ResourceId } from '../sim/types';

export type Objective =
  | { kind: 'resource'; res: ResourceId; amount: number }
  | { kind: 'population'; amount: number }
  | { kind: 'build'; building: BuildingType; amount: number }
  | { kind: 'destroy'; enemy: EnemyType; amount: number }
  | { kind: 'survive'; seconds: number }
  | { kind: 'reach'; place: string };

export interface RegionDef {
  id: string;
  name: string;
  faction: string;
  blurb: string;
  /** How deep into the campaign this is. From rank 2, its borders take a laser. */
  tier: number;
  /** One conquered sector among these opens this one. Empty for the landing zone. */
  requires: string[];
  /** Share of the planet surface, in percent. All regions add up to 100. */
  control: number;
  /** Where this sector lies on the planet, 0 to 100. Also its centre on the map. */
  planet: { x: number; y: number };
  map: MapParams;
  waves: { first: number; every: number; pool: EnemyType[]; size: number; growth: number };
  /** Passive climb of the conspiracy meter, per second. */
  intrigue: number;
  /** Rate at which lava eats the ground around it. */
  erosion: number;
  objectives: Objective[];
  perk: { name: string; desc: string; stock?: Cost; mods?: Partial<Modifiers> };
}

export const REGIONS: RegionDef[] = [
  {
    id: 'ash',
    name: 'Val de Cendre',
    faction: 'Terres vierges',
    blurb:
      'Un éboulement sépare l’expédition de CITY, la première cité de la Charte. Il faut la rejoindre.',
    tier: 0,
    requires: [],
    control: 8,
    planet: { x: 50, y: 74 },
    map: {
      caverns: 7,
      hardness: 0.05,
      seams: { oreSeam: 8, crystalSeam: 6, iceSeam: 3, goldSeam: 1 },
      gasZones: 1,
      lairs: { count: 1, monsters: ['rongeur', 'rongeur', 'rongeur'] },
      fungusPatches: 2,
      settlement: true,
    },
    waves: { first: 360, every: 180, pool: ['rongeur'], size: 2, growth: 0.35 },
    intrigue: 0.005,
    erosion: 0,
    objectives: [
      { kind: 'reach', place: 'CITY' },
      { kind: 'resource', res: 'crystal', amount: 20 },
      { kind: 'build', building: 'oxygen', amount: 1 },
      { kind: 'population', amount: 24 },
    ],
    perk: {
      name: 'Tête de pont',
      desc: 'Les colons de CITY livrent 15 minerais et 10 roches.',
      stock: { ore: 15, stone: 10 },
    },
  },
  {
    id: 'glass',
    name: 'Failles de Verre',
    faction: 'Faune',
    blurb: 'Des gorges tapissées de cristal, et la Faune qui s’en nourrit. Vantor y rôde déjà.',
    tier: 1,
    requires: ['ash'],
    control: 12,
    planet: { x: 28, y: 58 },
    map: {
      caverns: 9,
      hardness: 0.25,
      seams: { oreSeam: 8, crystalSeam: 14, iceSeam: 4, goldSeam: 2 },
      gasZones: 1,
      lairs: { count: 2, monsters: ['rongeur', 'rongeur', 'golem'] },
      fungusPatches: 2,
      structures: { nest: 1 },
    },
    waves: { first: 210, every: 130, pool: ['rongeur', 'rongeur', 'golem'], size: 2, growth: 0.45 },
    intrigue: 0.01,
    erosion: 0,
    objectives: [
      { kind: 'resource', res: 'crystal', amount: 50 },
      { kind: 'population', amount: 22 },
      { kind: 'destroy', enemy: 'nest', amount: 1 },
    ],
    perk: {
      name: 'Lentilles de verre',
      desc: 'Les centrales produisent 20 % d’énergie en plus.',
      mods: { powerOutput: 0.2 },
    },
  },
  {
    id: 'ice',
    name: 'Banquise Noire',
    faction: 'Enfants du Noyau',
    blurb: 'Un désert gelé sous la croûte. Des sectaires y prêchent le réveil du Dormeur.',
    tier: 1,
    requires: ['ash'],
    control: 12,
    planet: { x: 72, y: 58 },
    map: {
      caverns: 9,
      hardness: 0.3,
      seams: { oreSeam: 8, crystalSeam: 7, iceSeam: 14, goldSeam: 2 },
      gasZones: 1,
      lairs: { count: 2, monsters: ['rongeur', 'golem', 'golem'] },
      waterPools: 2,
      fungusPatches: 1,
      structures: { nest: 1 },
    },
    waves: { first: 240, every: 140, pool: ['saboteur', 'rongeur'], size: 2, growth: 0.45 },
    intrigue: 0.02,
    erosion: 0,
    objectives: [
      { kind: 'resource', res: 'food', amount: 50 },
      { kind: 'resource', res: 'water', amount: 30 },
      { kind: 'population', amount: 24 },
      { kind: 'destroy', enemy: 'nest', amount: 1 },
    ],
    perk: {
      name: 'Réserves gelées',
      desc: 'Les réserves saisies livrent 20 de nourriture et 15 d’eau.',
      stock: { food: 20, water: 15 },
    },
  },
  {
    id: 'sulfur',
    name: 'Bassin de Soufre',
    faction: 'Consortium Vantor',
    blurb: 'Le verrou industriel de Kerath. Celui qui tient le soufre tient l’alliage.',
    tier: 2,
    requires: ['glass', 'ice'],
    control: 16,
    planet: { x: 50, y: 46 },
    map: {
      caverns: 10,
      hardness: 0.4,
      seams: { oreSeam: 11, crystalSeam: 8, iceSeam: 6, sulfurSeam: 10, goldSeam: 3 },
      gasZones: 3,
      lairs: { count: 2, monsters: ['golem', 'larve', 'larve'] },
      lavaPools: 2,
      fungusPatches: 1,
    },
    waves: { first: 180, every: 110, pool: ['drone', 'drone', 'rongeur'], size: 3, growth: 0.5 },
    intrigue: 0.015,
    erosion: 0.01,
    objectives: [
      { kind: 'resource', res: 'alloy', amount: 10 },
      { kind: 'population', amount: 26 },
      { kind: 'survive', seconds: 480 },
    ],
    perk: {
      name: 'Procédé au soufre',
      desc: 'Toute la production industrielle gagne 15 %.',
      mods: { production: 0.15 },
    },
  },
  {
    id: 'vantor',
    name: 'Concession Vantor',
    faction: 'Consortium Vantor',
    blurb: 'La colonie du Consortium : ses avant-postes tiennent tout le nord-ouest.',
    tier: 3,
    requires: ['sulfur'],
    control: 18,
    planet: { x: 27, y: 28 },
    map: {
      caverns: 11,
      hardness: 0.5,
      seams: { oreSeam: 13, crystalSeam: 9, iceSeam: 6, sulfurSeam: 6, goldSeam: 5 },
      gasZones: 1,
      lairs: { count: 2, monsters: ['drone', 'drone', 'golem'] },
      fungusPatches: 1,
      relics: 1,
      structures: { outpost: 2 },
    },
    waves: { first: 150, every: 100, pool: ['drone'], size: 3, growth: 0.6 },
    intrigue: 0.02,
    erosion: 0,
    objectives: [
      { kind: 'destroy', enemy: 'outpost', amount: 2 },
      { kind: 'resource', res: 'metal', amount: 40 },
    ],
    perk: {
      name: 'Arsenal saisi',
      desc: 'Gardes et tourelles infligent 25 % de dégâts en plus.',
      mods: { combatDamage: 0.25 },
    },
  },
  {
    id: 'magma',
    name: 'Mer de Magma',
    faction: 'Enfants du Noyau',
    blurb:
      'Le sanctuaire des sectaires : une croûte qui fond, des caveaux plus vieux que la Charte.',
    tier: 3,
    requires: ['sulfur'],
    control: 18,
    planet: { x: 73, y: 28 },
    map: {
      caverns: 11,
      hardness: 0.5,
      seams: { oreSeam: 12, crystalSeam: 9, iceSeam: 7, sulfurSeam: 8, goldSeam: 3 },
      gasZones: 2,
      lairs: { count: 2, monsters: ['larve', 'larve', 'golem'] },
      lavaPools: 4,
      fungusPatches: 1,
      relics: 4,
    },
    waves: { first: 150, every: 100, pool: ['larve', 'saboteur', 'golem'], size: 3, growth: 0.55 },
    intrigue: 0.03,
    erosion: 0.04,
    objectives: [
      { kind: 'resource', res: 'relic', amount: 3 },
      { kind: 'population', amount: 30 },
    ],
    perk: {
      name: 'Savoir des caveaux',
      desc: 'La recherche progresse 50 % plus vite, le complot 20 % moins vite.',
      mods: { research: 0.5, conspiracyGain: -0.2 },
    },
  },
  {
    id: 'core',
    name: 'Le Noyau',
    faction: 'Le Dormeur',
    blurb: 'Le centre de Kerath. Ce qui s’y trouve décidera qui possède vraiment la planète.',
    tier: 4,
    requires: ['vantor', 'magma'],
    control: 16,
    planet: { x: 50, y: 13 },
    map: {
      caverns: 12,
      hardness: 0.6,
      seams: { oreSeam: 14, crystalSeam: 12, iceSeam: 8, sulfurSeam: 8, goldSeam: 4 },
      gasZones: 2,
      lairs: { count: 3, monsters: ['golem', 'golem', 'larve', 'larve'] },
      lavaPools: 4,
      fungusPatches: 1,
      relics: 2,
      structures: { heart: 1, nest: 2 },
    },
    waves: {
      first: 120,
      every: 90,
      pool: ['larve', 'saboteur', 'golem', 'drone'],
      size: 4,
      growth: 0.6,
    },
    intrigue: 0.03,
    erosion: 0.03,
    objectives: [{ kind: 'destroy', enemy: 'heart', amount: 1 }],
    perk: {
      name: 'Maître de Kerath',
      desc: 'La planète est à vous.',
    },
  },
];

/** Tiles along one side of the planet map. */
export const WORLD_SIZE = 140;

/**
 * Which sector a point belongs to: the nearest centre. `margin` is how far it is from the border
 * with `other`, the next nearest, in tiles.
 */
export function sectorAt(
  x: number,
  y: number,
  w: number,
  h: number,
): { index: number; other: number; margin: number } {
  let index = 0;
  let other = 0;
  let best = Infinity;
  let second = Infinity;
  REGIONS.forEach((region, i) => {
    const d = Math.hypot(x - (region.planet.x / 100) * w, y - (region.planet.y / 100) * h);
    if (d < best) {
      second = best;
      other = index;
      best = d;
      index = i;
    } else if (d < second) {
      second = d;
      other = i;
    }
  });
  return { index, other, margin: (second - best) / 2 };
}

export const regionById = (id: string): RegionDef => {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) throw new Error(`Région inconnue : ${id}`);
  return region;
};
