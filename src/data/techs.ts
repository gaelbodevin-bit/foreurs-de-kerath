import type { Cost, Modifiers } from '../sim/types';

export interface TechDef {
  id: string;
  name: string;
  desc: string;
  /** A milestone: goods handed over to the headquarters, a little at a time if need be. */
  parts?: Cost;
  /** The tier a milestone belongs to. It can't be started before that tier opens. */
  tier?: number;
  /** A large delivery that opens the next tier. */
  opensTier?: number;
  /** Research branch: points from the laboratory. */
  cost?: number;
  requires?: string;
  mods?: Partial<Modifiers>;
  stock?: Cost;
}

export const TIERS: readonly { name: string; desc: string }[] = [
  { name: 'Installation', desc: 'De quoi tenir le coup.' },
  { name: 'Implantation', desc: 'S’ouvre en rejoignant Port-Cendre.' },
  { name: 'Industrie', desc: 'S’ouvre avec la phase 1.' },
  { name: 'Mécanisation', desc: 'S’ouvre avec la phase 2.' },
  { name: 'Grand forage', desc: 'S’ouvre avec la phase 3.' },
];

export const TECHS: TechDef[] = [
  {
    id: 'shelter',
    name: 'Abris',
    desc: 'Débloque l’habitat.',
    tier: 1,
    parts: { ore: 8, stone: 6 },
  },
  {
    id: 'air',
    name: 'Filtration de l’air',
    desc: 'Débloque l’extracteur d’oxygène.',
    tier: 1,
    parts: { ore: 10, crystal: 2 },
  },
  {
    id: 'food',
    name: 'Cultures de galerie',
    desc: 'Débloque le fondoir à glace et la serre fongique.',
    tier: 1,
    parts: { ore: 12, ice: 4 },
  },
  {
    id: 'power',
    name: 'Réseau de base',
    desc: 'Débloque la centrale à cristaux et l’entrepôt.',
    tier: 0,
    parts: { ore: 15, stone: 8 },
  },
  {
    id: 'guard',
    name: 'Sécurité du site',
    desc: 'Débloque la tourelle laser et le ventilateur.',
    tier: 0,
    parts: { ore: 12, crystal: 2 },
  },

  {
    id: 'lab',
    name: 'Laboratoire',
    desc: 'Débloque le laboratoire et sa branche de recherche.',
    tier: 1,
    parts: { ore: 30, crystal: 12 },
  },
  {
    id: 'barracks',
    name: 'Milice',
    desc: 'Débloque la caserne.',
    tier: 1,
    parts: { ore: 25, stone: 20 },
  },
  {
    id: 'commerce',
    name: 'Vie publique',
    desc: 'Débloque le marché et la place publique.',
    tier: 1,
    parts: { ore: 20, stone: 25 },
  },
  {
    id: 'drills1',
    name: 'Forets trempés',
    desc: 'Forage 25 % plus rapide.',
    tier: 1,
    parts: { ore: 30, stone: 30 },
    mods: { drillSpeed: 0.25 },
  },
  {
    id: 'phase1',
    name: 'Phase 1 : le puits d’extraction',
    desc: 'Grande livraison à la Charte. Ouvre le palier Industrie.',
    tier: 1,
    opensTier: 2,
    parts: { ore: 80, stone: 60, crystal: 25 },
  },

  {
    id: 'refining',
    name: 'Raffinage',
    desc: 'Débloque la raffinerie : le minerai devient du métal.',
    tier: 2,
    parts: { ore: 50, crystal: 10 },
  },
  {
    id: 'drills2',
    name: 'Marteau-piqueur',
    desc: 'Les foreurs percent la roche dure et l’or. Forage 25 % plus rapide.',
    tier: 2,
    parts: { metal: 20, crystal: 15 },
    mods: { drillPower: 1, drillSpeed: 0.25 },
  },
  {
    id: 'medicine',
    name: 'Médecine de galerie',
    desc: 'Débloque le dispensaire.',
    tier: 2,
    parts: { metal: 10, food: 20 },
  },
  {
    id: 'phase2',
    name: 'Phase 2 : les ateliers de la Charte',
    desc: 'Grande livraison à la Charte. Ouvre le palier Mécanisation.',
    tier: 2,
    opensTier: 3,
    parts: { ore: 100, metal: 60, crystal: 40 },
  },

  {
    id: 'vehicles',
    name: 'Atelier de véhicules',
    desc: 'Débloque l’atelier : foreuses lourdes et mules de transport.',
    tier: 3,
    parts: { metal: 40, crystal: 20 },
  },
  {
    id: 'outposts',
    name: 'Avant-postes',
    desc: 'Débloque l’avant-poste : un dépôt et un réseau électrique loin de la cité.',
    tier: 3,
    parts: { metal: 30, stone: 40 },
  },
  {
    id: 'alloys',
    name: 'Métallurgie',
    desc: 'Débloque la forge d’alliage.',
    tier: 3,
    parts: { metal: 50, crystal: 20 },
  },
  {
    id: 'phase3',
    name: 'Phase 3 : le grand forage',
    desc: 'Grande livraison à la Charte. Ouvre le dernier palier.',
    tier: 3,
    opensTier: 4,
    parts: { metal: 120, crystal: 60, gold: 10 },
  },

  {
    id: 'drills3',
    name: 'Foreuse laser',
    desc: 'Les foreurs percent le basalte. Forage 50 % plus rapide.',
    tier: 4,
    parts: { metal: 60, crystal: 40, gold: 10 },
    mods: { drillPower: 1, drillSpeed: 0.5 },
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
