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
    return data.version === 2 ? data : null;
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
