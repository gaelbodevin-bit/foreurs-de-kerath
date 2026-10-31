import type { ResourceId, TileKind } from '../sim/types';

export interface ResourceDef {
  name: string;
  color: number;
  group: 'raw' | 'refined' | 'money';
  /** Exempt from storage capacity. */
  uncapped?: boolean;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  ore: { name: 'Minerai', color: 0xb5713c, group: 'raw' },
  crystal: { name: 'Cristal', color: 0x35e0c2, group: 'raw' },
  stone: { name: 'Roche', color: 0x8d8a84, group: 'raw' },
  ice: { name: 'Glace', color: 0x9fd8ff, group: 'raw' },
  sulfur: { name: 'Soufre', color: 0xe6d13c, group: 'raw' },
  gold: { name: 'Or', color: 0xffc23d, group: 'raw' },
  relic: { name: 'Relique', color: 0xc77dff, group: 'raw', uncapped: true },
  metal: { name: 'Métal', color: 0xaab6c4, group: 'refined' },
  water: { name: 'Eau', color: 0x4ea8f0, group: 'refined' },
  food: { name: 'Nourriture', color: 0x9ccc5a, group: 'refined' },
  alloy: { name: 'Alliage', color: 0xff7d54, group: 'refined' },
  credits: { name: 'Crédits', color: 0xf5f0a8, group: 'money', uncapped: true },
};

export interface WallDef {
  /** Seconds of drilling at base speed. */
  drillTime: number;
  /** Minimum drill power needed. */
  power: number;
  yield?: { res: ResourceId; min: number; max: number };
}

export type DrillTool = 'pick' | 'hammer' | 'laser';

/** The tool that goes with each level of drill power. */
export const DRILL_TOOLS: Record<DrillTool, { name: string; power: number }> = {
  pick: { name: 'Pioche', power: 1 },
  hammer: { name: 'Marteau-piqueur', power: 2 },
  laser: { name: 'Foreuse laser', power: 3 },
};

export const drillToolFor = (power: number): DrillTool =>
  power >= DRILL_TOOLS.laser.power
    ? 'laser'
    : power >= DRILL_TOOLS.hammer.power
      ? 'hammer'
      : 'pick';

export const WALLS: Partial<Record<TileKind, WallDef>> = {
  dirt: { drillTime: 3.5, power: 1 },
  loose: { drillTime: 6, power: 1 },
  hard: { drillTime: 14, power: 2 },
  basalt: { drillTime: 20, power: 3 },
  oreSeam: { drillTime: 7, power: 1, yield: { res: 'ore', min: 6, max: 9 } },
  crystalSeam: { drillTime: 8, power: 1, yield: { res: 'crystal', min: 3, max: 5 } },
  iceSeam: { drillTime: 5, power: 1, yield: { res: 'ice', min: 4, max: 7 } },
  sulfurSeam: { drillTime: 9, power: 1, yield: { res: 'sulfur', min: 3, max: 5 } },
  goldSeam: { drillTime: 11, power: 2, yield: { res: 'gold', min: 2, max: 4 } },
  relicVault: { drillTime: 16, power: 1, yield: { res: 'relic', min: 1, max: 1 } },
};

export const TILE_NAMES: Record<TileKind, string> = {
  floor: 'Sol',
  rubble: 'Gravats',
  path: 'Voie énergétique',
  fungus: 'Champignons sauvages',
  lava: 'Lave',
  water: 'Eau souterraine',
  dirt: 'Terre meuble',
  loose: 'Roche friable',
  hard: 'Roche dure',
  basalt: 'Basalte',
  solid: 'Roche inviolable',
  oreSeam: 'Filon de minerai',
  crystalSeam: 'Filon de cristal',
  iceSeam: 'Poche de glace',
  sulfurSeam: 'Veine de soufre',
  goldSeam: "Filon d'or",
  relicVault: 'Caveau scellé',
};
