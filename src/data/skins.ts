import type { GameState } from '../sim/types';

export type HeadgearId = 'hardhat' | 'dome' | 'hood' | 'goggles' | 'cap';

export interface SkinDef {
  id: string;
  name: string;
  desc: string;
  /** Multiplies the model's colours. Null leaves the outfit as it comes. */
  suit: number | null;
  hat: number;
  headgear: HeadgearId;
  /** The colour of the head lamp. */
  lamp: number;
  /** Shown until it's earned. */
  unlock?: { sector?: string; kills?: number; edict?: string; hint: string };
}

export const SKINS: SkinDef[] = [
  {
    id: 'ash',
    name: 'Cendre',
    desc: 'La tenue de l’expédition, encore propre sur les photos.',
    suit: null,
    hat: 0xf0c24b,
    headgear: 'hardhat',
    lamp: 0xffb347,
  },
  {
    id: 'coal',
    name: 'Gueule noire',
    desc: 'Le noir de la roche, qui ne part plus au lavage.',
    suit: 0x4a4a52,
    hat: 0x2a2a30,
    headgear: 'hardhat',
    lamp: 0xfff2d0,
  },
  {
    id: 'rust',
    name: 'Bleu de chauffe',
    desc: 'Un bleu de travail qui a connu d’autres mains.',
    suit: 0x6f94c9,
    hat: 0xc9673f,
    headgear: 'cap',
    lamp: 0xffb347,
  },
  {
    id: 'surveyor',
    name: 'Arpenteur',
    desc: 'Le gilet des équipes de relevé, qu’on repère de loin.',
    suit: 0xe88a3a,
    hat: 0xf5f0e0,
    headgear: 'dome',
    lamp: 0xfff2d0,
  },
  {
    id: 'lumen',
    name: 'Lueur',
    desc: 'Tissée de fibres qui gardent la lumière des Jardins.',
    suit: 0x4fc8b8,
    hat: 0x7a5cff,
    headgear: 'dome',
    lamp: 0x7ffcff,
    unlock: { sector: 'lumen', hint: 'Conquérir les Jardins de Lueur' },
  },
  {
    id: 'abyss',
    name: 'Cordée',
    desc: 'Le harnais de ceux qui posent les ponts au-dessus du vide.',
    suit: 0x8a7a5e,
    hat: 0xa83a2a,
    headgear: 'hardhat',
    lamp: 0xffd98a,
    unlock: { sector: 'abyss', hint: 'Conquérir le Gouffre d’Ombre' },
  },
  {
    id: 'glass',
    name: 'Verrier',
    desc: 'Lunettes taillées dans le cristal des Failles.',
    suit: 0x9fb8d8,
    hat: 0x35e0c2,
    headgear: 'goggles',
    lamp: 0x35e0c2,
    unlock: { sector: 'glass', hint: 'Conquérir les Failles de Verre' },
  },
  {
    id: 'ice',
    name: 'Parka noire',
    desc: 'Doublée de fourrure de golem, on préfère ne pas savoir comment.',
    suit: 0xd8e2ec,
    hat: 0x3a4a5a,
    headgear: 'hood',
    lamp: 0x9fd8ff,
    unlock: { sector: 'ice', hint: 'Conquérir la Banquise Noire' },
  },
  {
    id: 'sulfur',
    name: 'Masque à gaz',
    desc: 'Le jaune du bassin, et un masque qui ne filtre pas tout.',
    suit: 0xd8c23c,
    hat: 0x3a3d42,
    headgear: 'goggles',
    lamp: 0xe6d13c,
    unlock: { sector: 'sulfur', hint: 'Conquérir le Bassin de Soufre' },
  },
  {
    id: 'vantor',
    name: 'Prise de guerre',
    desc: 'L’uniforme du Consortium, le logo arraché.',
    suit: 0x7a808a,
    hat: 0xc23a3a,
    headgear: 'cap',
    lamp: 0xff6a5a,
    unlock: { sector: 'vantor', hint: 'Conquérir la Concession Vantor' },
  },
  {
    id: 'magma',
    name: 'Braise',
    desc: 'Une combinaison qui a survécu à la Mer de Magma, pas son premier porteur.',
    suit: 0xb0482a,
    hat: 0x2a1a18,
    headgear: 'dome',
    lamp: 0xff7a2a,
    unlock: { sector: 'magma', hint: 'Conquérir la Mer de Magma' },
  },
  {
    id: 'veteran',
    name: 'Vétéran',
    desc: 'Ceux qui ont vu la Faune de près et sont revenus le raconter.',
    suit: 0x8a3030,
    hat: 0xd8dde2,
    headgear: 'hardhat',
    lamp: 0xfff2d0,
    unlock: { kills: 40, hint: 'Abattre 40 ennemis' },
  },
  {
    id: 'vigil',
    name: 'Veilleur',
    desc: 'La capuche des veillées, et la lampe qu’on ne doit pas éteindre.',
    suit: 0x4a3a5e,
    hat: 0x2a2030,
    headgear: 'hood',
    lamp: 0xc77dff,
    unlock: { edict: 'vigil', hint: 'Signer l’édit « Veillée du Dormeur »' },
  },
];

export const DEFAULT_SKIN = SKINS[0].id;

export const skinById = (id: string | undefined): SkinDef =>
  SKINS.find((s) => s.id === id) ?? SKINS[0];

/** What is still missing to wear this, or null once it can be worn. */
export function skinLock(state: GameState, id: string): string | null {
  const unlock = skinById(id).unlock;
  if (!unlock) return null;
  if (unlock.sector && state.conquered.includes(unlock.sector)) return null;
  if (unlock.edict && state.edicts.includes(unlock.edict)) return null;
  const kills = Object.values(state.kills).reduce((sum, n) => sum + (n ?? 0), 0);
  if (unlock.kills && kills >= unlock.kills) return null;
  return unlock.hint;
}
