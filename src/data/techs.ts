import type { Cost, Modifiers } from '../sim/types';

export interface TechDef {
  id: string;
  name: string;
  desc: string;
  /** Research points. */
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
    name: 'Marteau-piqueur',
    desc: 'Les foreurs percent la roche dure et l’or. Forage 25 % plus rapide.',
    cost: 12,
    requires: 'drills1',
    mods: { drillPower: 1, drillSpeed: 0.25 },
  },
  {
    id: 'drills3',
    name: 'Foreuse laser',
    desc: 'Les foreurs percent le basalte. Forage 50 % plus rapide.',
    cost: 24,
    requires: 'drills2',
    mods: { drillPower: 1, drillSpeed: 0.5 },
  },
  {
    id: 'refining',
    name: 'Raffinage',
    desc: 'Débloque la raffinerie : le minerai devient du métal.',
    cost: 6,
  },
  {
    id: 'vehicles',
    name: 'Atelier de véhicules',
    desc: 'Débloque l’atelier : foreuses lourdes et mules de transport.',
    cost: 10,
    requires: 'refining',
  },
  {
    id: 'outposts',
    name: 'Avant-postes',
    desc: 'Débloque l’avant-poste : un dépôt et un réseau électrique loin de la cité.',
    cost: 9,
    requires: 'refining',
  },
  {
    id: 'alloys',
    name: 'Métallurgie',
    desc: 'Débloque la forge d’alliage.',
    cost: 12,
    requires: 'refining',
  },
  {
    id: 'medicine',
    name: 'Médecine de galerie',
    desc: 'Débloque le dispensaire.',
    cost: 5,
  },
  {
    id: 'logistics',
    name: 'Logistique de terrain',
    desc: 'Déplacements 15 % plus rapides, construction 25 % plus rapide. Débloque le grand silo.',
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
    desc: 'Les centrales produisent 25 % d’énergie de plus. Débloque la centrale géothermique.',
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
    desc: 'Recettes fiscales +30 %, et 60 crédits tout de suite.',
    cost: 8,
    mods: { taxes: 0.3 },
    stock: { credits: 60 },
  },
  {
    id: 'intel',
    name: 'Contre-espionnage',
    desc: 'Le complot progresse 30 % moins vite. Débloque le bureau de sûreté.',
    cost: 9,
    mods: { conspiracyGain: -0.3 },
  },
  {
    id: 'seismology',
    name: 'Sismologie',
    desc: 'Débloque la station sismique, qui annonce les secousses à l’avance.',
    cost: 3,
  },
  {
    id: 'education',
    name: 'Instruction publique',
    desc: 'Débloque l’académie.',
    cost: 7,
  },
  {
    id: 'stability',
    name: 'Étais renforcés',
    desc: 'Éboulements et érosion de la lave réduits de moitié. Débloque l’étai de soutènement.',
    cost: 6,
    mods: { hazard: -0.5 },
  },
];

export const techById = (id: string): TechDef => {
  const tech = TECHS.find((t) => t.id === id);
  if (!tech) throw new Error(`Technologie inconnue : ${id}`);
  return tech;
};
