import { BUILDINGS, CITY_BUILDINGS } from '../data/buildings';
import { CITY_LEVELS } from '../data/progression';
import { regionById, REGIONS, sectorAt, type Objective, type RegionDef } from '../data/regions';
import { RESOURCES } from '../data/resources';
import { techById, TECHS } from '../data/techs';
import { ENEMIES } from '../data/units';
import { addStock } from './economy';
import { log } from './entities';
import type { BuildingType, GameState, Modifiers, ResourceId } from './types';
import { RESOURCE_IDS } from './types';

/** Research handed out when a sector falls: more for the harder ones. */
const SECTOR_RESEARCH = (region: RegionDef) => 4 + region.tier * 2;

export const isOpen = (state: GameState, region: RegionDef): boolean =>
  state.sectorStart[region.id] !== undefined;

/** The sectors being fought over right now. */
export const activeRegions = (state: GameState): RegionDef[] =>
  REGIONS.filter((r) => isOpen(state, r) && !state.conquered.includes(r.id));

export const planetControl = (state: GameState): number =>
  state.conquered.reduce((sum, id) => sum + regionById(id).control, 0);

export function objectiveProgress(
  state: GameState,
  o: Objective,
  region: RegionDef = REGIONS[0],
): { value: number; goal: number; label: string } {
  switch (o.kind) {
    case 'resource':
      return {
        value: Math.floor(state.stock[o.res]),
        goal: o.amount,
        label: `Stocker : ${RESOURCES[o.res].name}`,
      };
    case 'population':
      return {
        value: Math.floor(state.city.population),
        goal: o.amount,
        label: 'Population de la cité',
      };
    case 'build':
      return {
        value: state.buildings.filter((b) => b.type === o.building && b.built >= 1).length,
        goal: o.amount,
        label: `Construire : ${BUILDINGS[o.building].name}`,
      };
    case 'destroy': {
      // Counted in this sector only: the nest of a neighbouring one is another objective.
      const index = REGIONS.indexOf(region);
      const alive = state.enemies.filter(
        (e) => e.type === o.enemy && sectorAt(e.x, e.y, state.w, state.h).index === index,
      ).length;
      return {
        value: Math.max(0, o.amount - alive),
        goal: o.amount,
        label: `Détruire : ${ENEMIES[o.enemy].name}`,
      };
    }
    case 'survive':
      return {
        value: Math.floor(state.time - (state.sectorStart[region.id] ?? state.time)),
        goal: o.seconds,
        label: 'Tenir la position (secondes)',
      };
    case 'reach':
      return {
        value: (state.settlement?.reached ?? true) ? 1 : 0,
        goal: 1,
        label: `Rejoindre ${o.place}`,
      };
  }
}

export const applyMods = (state: GameState, extra: Partial<Modifiers> | undefined): void => {
  for (const [key, value] of Object.entries(extra ?? {}) as [keyof Modifiers, number][]) {
    state.mods[key] += value;
  }
};

const giveStock = (state: GameState, stock: Partial<Record<ResourceId, number>> | undefined) => {
  for (const r of RESOURCE_IDS) if (stock?.[r]) addStock(state, r, stock[r] ?? 0);
};

function conquer(state: GameState, region: RegionDef): void {
  state.conquered.push(region.id);
  applyMods(state, region.perk.mods);
  giveStock(state, region.perk.stock);
  state.research += SECTOR_RESEARCH(region);
  log(state, `${region.name} est sous contrôle : ${region.perk.name}.`, 'good');
  state.fx.push({ kind: 'sound', id: 'plot' }, { kind: 'voice', id: 'sector' });
  for (const next of REGIONS) {
    if (isOpen(state, next) || !next.requires.some((r) => state.conquered.includes(r))) continue;
    state.sectorStart[next.id] = state.time;
    log(state, `Nouveau front : ${next.name}. ${next.blurb}`, 'info');
  }
}

/** Once a second: sectors falling, and a city that grows into its next rank. */
export function updateProgress(state: GameState): void {
  for (const region of activeRegions(state)) {
    const done = region.objectives.every((o) => {
      const p = objectiveProgress(state, o, region);
      return p.value >= p.goal;
    });
    if (done) conquer(state, region);
  }
  while (
    state.cityLevel + 1 < CITY_LEVELS.length &&
    state.city.population >= CITY_LEVELS[state.cityLevel + 1].population
  ) {
    state.cityLevel += 1;
    const level = CITY_LEVELS[state.cityLevel];
    state.story.flags[`level${state.cityLevel}`] = true;
    log(state, `Votre colonie devient : ${level.name}.`, 'good');
    state.fx.push({ kind: 'sound', id: 'plot' }, { kind: 'voice', id: 'levelUp' });
  }
}

export const hasReachedCity = (state: GameState): boolean => state.settlement?.reached ?? true;

/** Why a building can't be placed yet, or null once it can. */
export function buildingLock(state: GameState, type: BuildingType): string | null {
  const def = BUILDINGS[type];
  if (type === 'hq') return 'Indisponible';
  if (CITY_BUILDINGS.has(type) && !hasReachedCity(state)) return 'Rejoignez d’abord CITY';
  if (def.tech && !state.techs.includes(def.tech)) return `Recherche : ${techById(def.tech).name}`;
  return null;
}

/** What the panel shows: the expedition has only one goal until it reaches the city. */
export const visibleObjectives = (state: GameState, region: RegionDef): Objective[] =>
  region.objectives.filter((o) => hasReachedCity(state) || o.kind === 'reach');

export const availableBuildings = (state: GameState): BuildingType[] =>
  (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => buildingLock(state, t) === null);

export function techLock(state: GameState, id: string): string | null {
  const tech = techById(id);
  if (state.techs.includes(id)) return 'Acquis';
  if (!hasReachedCity(state)) return 'Rejoignez d’abord CITY';
  if (tech.requires && !state.techs.includes(tech.requires)) {
    return `Après : ${techById(tech.requires).name}`;
  }
  return null;
}

function completeTech(state: GameState, id: string): void {
  const tech = techById(id);
  state.techs.push(id);
  applyMods(state, tech.mods);
  giveStock(state, tech.stock);
  log(state, `Débloqué : ${tech.name}.`, 'good');
  state.fx.push({ kind: 'sound', id: 'build' });
}

/** Spent from the laboratory's points, with immediate effect. */
export function buyTech(state: GameState, id: string): boolean {
  const tech = techById(id);
  if (techLock(state, id) !== null || state.research < tech.cost) return false;
  state.research -= tech.cost;
  completeTech(state, id);
  return true;
}

export const isWorldConquered = (state: GameState): boolean =>
  REGIONS.every((r) => state.conquered.includes(r.id));

export { TECHS };
