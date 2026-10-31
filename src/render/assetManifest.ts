/** Every file the game loads, relative to `public/assets`. See `public/assets/CREDITS.md`. */

const character = (name: string) => `models/characters/character-${name}.glb`;
const space = (name: string) => `models/space/${name}.glb`;
const survival = (name: string) => `models/survival/${name}.glb`;

export const MODEL_FILES = {
  foreurA: character('male-e'),
  foreurB: character('female-e'),
  garde: character('male-c'),
  saboteur: character('male-d'),
  saboteurB: character('female-d'),
  hangarRoundA: space('hangar_roundA'),
  hangarRoundB: space('hangar_roundB'),
  hangarGlass: space('hangar_roundGlass'),
  hangarSmallA: space('hangar_smallA'),
  hangarSmallB: space('hangar_smallB'),
  hangarLargeA: space('hangar_largeA'),
  hangarLargeB: space('hangar_largeB'),
  generator: space('machine_generatorLarge'),
  barrelLarge: space('machine_barrelLarge'),
  barrelMachine: space('machine_barrel'),
  wireless: space('machine_wireless'),
  platformLarge: space('platform_large'),
  platformSmall: space('platform_small'),
  structure: space('structure_closed'),
  turret: space('turret_double'),
  chimney: space('chimney_detailed'),
  dish: space('satelliteDish_large'),
  barrels: space('barrels'),
  computer: space('desk_computer'),
  miner: space('craft_miner'),
  rover: space('rover'),
  speeder: space('craft_speederD'),
  crystals: space('rock_crystalsLargeA'),
  rocksSmall: space('rocks_smallA'),
  rockLarge: space('rock_largeA'),
  rock: space('rock'),
  rifle: space('weapon_rifle'),
  pickaxe: survival('tool-pickaxe'),
  stone: survival('resource-stone'),
} as const;

export const TEXTURE_FILES = {
  groundColor: 'textures/rock_ground_diff_1k.jpg',
  groundNormal: 'textures/rock_ground_nor_gl_1k.jpg',
  wallColor: 'textures/rock_face_diff_1k.jpg',
  wallNormal: 'textures/rock_face_nor_gl_1k.jpg',
} as const;

export type ModelId = keyof typeof MODEL_FILES;
export type TextureId = keyof typeof TEXTURE_FILES;
