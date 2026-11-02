import { COUNCIL_TRAITS } from '../data/council';
import { REGIONS } from '../data/regions';
import { DEFAULT_SKIN } from '../data/skins';
import { TECHS } from '../data/techs';
import { foundCouncil } from '../sim/council';
import { spawnCityMiners } from '../sim/game';
import { paintBiomes } from '../sim/mapgen';
import { emptySeismic } from '../sim/seismic';
import type { Councillor, GameState, Modifiers, PolicyId } from '../sim/types';
import { RESOURCE_IDS } from '../sim/types';

/** The version moved when the game became a single continuous world: older saves don't load. */
const KEY = 'foreurs-de-kerath/save/v2';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function writeSave(storage: SaveStorage, state: GameState): boolean {
  try {
    // Visual effects and pending redraws do not need to survive a reload.
    storage.setItem(KEY, JSON.stringify({ ...state, fx: [], dirty: [] }));
    return true;
  } catch {
    return false;
  }
}

export function readSave(storage: SaveStorage): GameState | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GameState;
    if (data.version !== 2) return null;
    // Saves from when milestones existed: what was bought stays, what no longer exists goes.
    data.techs = data.techs.filter((id) => TECHS.some((t) => t.id === id));
    data.council ??= [];
    for (const c of data.council as (Councillor & { level?: number; tenure?: number })[]) {
      // Councillors used to level up: what those levels added to the modifiers has to come off.
      for (const [key, value] of Object.entries(COUNCIL_TRAITS[c.trait].mods)) {
        data.mods[key as keyof Modifiers] -= (value ?? 0) * ((c.level ?? 1) - 1);
      }
      delete c.level;
      delete c.tenure;
    }
    data.candidates ??= [];
    data.nextCandidatesAt ??= 0;
    data.governorTrait ??= null;
    data.seismic ??= emptySeismic();
    migrateBiomes(data);
    data.networkDirty = true;
    if (data.settlement?.reached) {
      foundCouncil(data);
      spawnCityMiners(data);
    }
    return data;
  } catch {
    return null;
  }
}

/** Saves from before the biomes, edicts and rations: what lies undiscovered gets its new geology. */
function migrateBiomes(data: GameState): void {
  for (const res of RESOURCE_IDS) data.stock[res] ??= 0;
  data.mods.appetite ??= 1;
  data.edicts ??= [];
  data.nextEdictAt ??= 0;
  data.crewSkins ??= { foreur: DEFAULT_SKIN, garde: DEFAULT_SKIN };
  const policies = data.city.policies as Record<PolicyId | 'rationing', boolean>;
  data.city.ration ??= policies.rationing ? 0 : 1;
  delete (policies as Partial<typeof policies>).rationing;
  if (data.settlement?.reached) data.settlement.reachedAt ??= 0;
  if (data.story.flags.biomes) return;
  data.story.flags.biomes = true;
  paintBiomes(data, data.rng, {
    keepClear: [
      ...data.buildings.map((b) => ({ x: b.x, y: b.y, r: 8 })),
      ...data.enemies.map((e) => ({ x: Math.floor(e.x), y: Math.floor(e.y), r: 4 })),
      ...(data.settlement ? [{ x: data.settlement.x, y: data.settlement.y, r: 10 }] : []),
    ],
  });
  // The new sectors open on a conquered neighbour, as they would have at the time.
  for (const region of REGIONS) {
    if (data.sectorStart[region.id] !== undefined) continue;
    if (region.requires.some((r) => data.conquered.includes(r))) {
      data.sectorStart[region.id] = data.time;
    }
  }
}

export function clearSave(storage: SaveStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
