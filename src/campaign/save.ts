import { TECHS } from '../data/techs';
import { foundCouncil } from '../sim/council';
import type { GameState } from '../sim/types';

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
    data.candidates ??= [];
    data.nextCandidatesAt ??= 0;
    data.governorTrait ??= null;
    if (data.settlement?.reached) foundCouncil(data);
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
