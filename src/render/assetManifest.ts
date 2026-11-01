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

/** Each sound has several takes: one is picked at random whenever it plays. */
export const SOUND_FILES = {
  hit: ['audio/impact/impactMetal_heavy_000.ogg', 'audio/impact/impactMetal_heavy_002.ogg'],
  /** Synthesised: a sawtooth this low is heard as a rattle, not as a note. */
  rattle: [],
  drill: [
    'audio/impact/impactMining_000.ogg',
    'audio/impact/impactMining_001.ogg',
    'audio/impact/impactMining_002.ogg',
    'audio/impact/impactMining_003.ogg',
    'audio/impact/impactMining_004.ogg',
  ],
  collect: [
    'audio/impact/impactGlass_light_000.ogg',
    'audio/impact/impactGlass_light_001.ogg',
    'audio/impact/impactGlass_light_002.ogg',
  ],
  build: [
    'audio/impact/impactMetal_heavy_000.ogg',
    'audio/impact/impactMetal_heavy_001.ogg',
    'audio/impact/impactMetal_heavy_002.ogg',
  ],
  alert: ['audio/interface/error_006.ogg', 'audio/interface/error_007.ogg'],
  laser: [
    'audio/scifi/laserSmall_000.ogg',
    'audio/scifi/laserSmall_001.ogg',
    'audio/scifi/laserSmall_002.ogg',
    'audio/scifi/laserSmall_003.ogg',
  ],
  collapse: [
    'audio/scifi/explosionCrunch_000.ogg',
    'audio/scifi/explosionCrunch_001.ogg',
    'audio/scifi/explosionCrunch_002.ogg',
  ],
  plot: ['audio/jingles/jingles_PIZZI00.ogg'],
  click: ['audio/interface/click_001.ogg'],
  step: [
    'audio/impact/footstep_concrete_000.ogg',
    'audio/impact/footstep_concrete_001.ogg',
    'audio/impact/footstep_concrete_002.ogg',
    'audio/impact/footstep_concrete_003.ogg',
  ],
  win: ['audio/jingles/jingles_STEEL00.ogg'],
  lose: ['audio/jingles/jingles_PIZZI07.ogg'],
} as const;

export type SoundKey = keyof typeof SOUND_FILES;
