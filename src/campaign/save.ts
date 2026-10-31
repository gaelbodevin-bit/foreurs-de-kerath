import { registerRegionIntrigue } from '../sim/economy';
import { regionById } from '../data/regions';
import type { GameState } from '../sim/types';
import type { Campaign } from './campaign';

const KEY = 'foreurs-de-kerath/save/v1';

export interface SaveData {
  campaign: Campaign;
  mission: GameState | null;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function writeSave(storage: SaveStorage, data: SaveData): boolean {
  try {
    // Visual effects and pending redraws do not need to survive a reload.
    const mission = data.mission ? { ...data.mission, fx: [], dirty: [] } : null;
    storage.setItem(KEY, JSON.stringify({ campaign: data.campaign, mission }));
    return true;
  } catch {
    return false;
  }
}

export function readSave(storage: SaveStorage): SaveData | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.campaign?.version !== 1) return null;
    if (data.mission)
      registerRegionIntrigue(data.mission.regionId, regionById(data.mission.regionId).intrigue);
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
