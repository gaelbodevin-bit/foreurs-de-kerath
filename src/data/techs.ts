import type { Cost, Modifiers } from '../sim/types';

export interface TechDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires?: string;
  mods?: Partial<Modifiers>;
  stock?: Cost;
}

export const TECHS: TechDef[] = [
  {
    id: 'drills1',
    name: 'Forets trempés',
    desc: 'Forage 25 % plus rapide.',
    cost: 5,
    mods: { drillSpeed: 0.25 },
  },
  {
    id: 'drills2',
    name: 'Forets au diamant',
    desc: 'Les foreurs percent la roche dure et l’or sans machine.',
    cost: 14,
    requires: 'drills1',
    mods: { drillPower: 1 },
  },
  {
    id: 'logistics',
    name: 'Logistique de terrain',
    desc: 'Déplacements 15 % plus rapides, construction 25 % plus rapide.',
    cost: 8,
    mods: { moveSpeed: 0.15, buildSpeed: 0.25 },
  },
  {
    id: 'housing',
    name: 'Habitats modulaires',
    desc: 'Chaque habitat loge 4 citoyens de plus.',
    cost: 7,
    mods: { housing: 4 },
  },
  {
    id: 'scrubbers',
    name: 'Épurateurs',
    desc: 'Les sources d’oxygène produisent 30 % de plus.',
    cost: 6,
    mods: { oxygen: 0.3 },
  },
  {
    id: 'grid',
    name: 'Réseau optimisé',
    desc: 'Les centrales produisent 25 % d’énergie de plus.',
    cost: 8,
    mods: { powerOutput: 0.25 },
  },
  {
    id: 'lasers',
    name: 'Lasers focalisés',
    desc: 'Gardes et tourelles infligent 30 % de dégâts de plus.',
    cost: 10,
    mods: { combatDamage: 0.3 },
  },
  {
    id: 'finance',
    name: 'Fiscalité planétaire',
    desc: 'Recettes fiscales +30 %, 60 crédits de départ.',
    cost: 8,
    mods: { taxes: 0.3 },
    stock: { credits: 60 },
  },
  {
    id: 'intel',
    name: 'Contre-espionnage',
    desc: 'Le complot progresse 30 % moins vite.',
    cost: 9,
    mods: { conspiracyGain: -0.3 },
  },
  {
    id: 'stability',
    name: 'Étais renforcés',
    desc: 'Éboulements et érosion de la lave réduits de moitié.',
    cost: 6,
    mods: { hazard: -0.5 },
  },
];

export const techById = (id: string): TechDef => {
  const tech = TECHS.find((t) => t.id === id);
  if (!tech) throw new Error(`Technologie inconnue : ${id}`);
  return tech;
};
