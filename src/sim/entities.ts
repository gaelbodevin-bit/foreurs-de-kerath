import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { ENEMIES } from '../data/units';
import type {
  Building,
  BuildingType,
  Enemy,
  EnemyType,
  GameState,
  LogEntry,
  ResourceId,
  Unit,
  UnitType,
} from './types';

export const newId = (state: GameState): number => state.nextId++;

export function log(state: GameState, text: string, level: LogEntry['level'] = 'info'): void {
  state.log.push({ t: state.time, text, level });
  if (state.log.length > 60) state.log.shift();
}

export function spawnUnit(state: GameState, type: UnitType, x: number, y: number): Unit {
  const unit: Unit = {
    id: newId(state),
    type,
    x,
    y,
    hp: UNITS[type].hp,
    path: [],
    jobId: null,
    carry: null,
    carryCount: 0,
    order: null,
    cooldown: 0,
    targetId: null,
    thinkIn: 0,
    working: false,
  };
  state.units.push(unit);
  return unit;
}

export function createBuilding(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  built: number,
): Building {
  const building: Building = {
    id: newId(state),
    type,
    x,
    y,
    hp: BUILDINGS[type].hp,
    built,
    connected: false,
    eff: 0,
    progress: 0,
    fuel: 0,
    sabotaged: 0,
    queue: [],
    queueT: 0,
    cooldown: 0,
  };
  state.buildings.push(building);
  state.networkDirty = true;
  state.dirty.push(y * state.w + x);
  return building;
}

export function spawnEnemy(state: GameState, type: EnemyType, x: number, y: number): Enemy {
  const enemy: Enemy = {
    id: newId(state),
    type,
    x,
    y,
    hp: ENEMIES[type].hp,
    path: [],
    targetKind: null,
    targetId: null,
    cooldown: 0,
    repathIn: 0,
    spawnIn: ENEMIES[type].structure?.every ?? 0,
  };
  state.enemies.push(enemy);
  return enemy;
}

export function spawnPickup(state: GameState, res: ResourceId, x: number, y: number): number {
  const id = newId(state);
  state.pickups.push({ id, res, x, y, claimedBy: null });
  return id;
}

export const buildingCenter = (b: Building): { x: number; y: number } => {
  const half = BUILDINGS[b.type].size / 2;
  return { x: b.x + half, y: b.y + half };
};
