import { COUNCIL_TRAITS } from '../data/council';
import { TECHS } from '../data/techs';
import { foundCouncil } from '../sim/council';
import { spawnCityMiners } from '../sim/game';
import { emptySeismic } from '../sim/seismic';
import type { Councillor, GameState, Modifiers } from '../sim/types';

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
    if (data.settlement?.reached) {
      foundCouncil(data);
      spawnCityMiners(data);
    }
    return data;
  } catch {
    return null;
  }
}

export function clearSave(storage: SaveStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
