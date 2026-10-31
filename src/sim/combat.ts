import { BUILDINGS } from '../data/buildings';
import { regionById } from '../data/regions';
import { ENEMIES, UNITS } from '../data/units';
import { buildingCenter, log, spawnEnemy } from './entities';
import { idx, inBounds, isWallKind, NEIGHBORS4, setTile } from './grid';
import { distanceField, findPath } from './pathfinding';
import { rand, randPick } from './rng';
import type { Building, Enemy, EnemyType, GameState, Unit } from './types';
import { TICK_SECONDS } from './types';
import { breakWall, moveAlongPath, releaseJob, updateWorker } from './workers';

const MAX_ROAMING_ENEMIES = 12;

/** Picks a seen wall touching the settled area, away from the HQ, and lets it burst open. */
function findEmergePoint(state: GameState): { x: number; y: number } | null {
  const hq = state.buildings.find((b) => b.type === 'hq');
  if (!hq) return null;
  const dist = distanceField(state, hq.x, hq.y);
  const candidates: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    const tile = state.tiles[i];
    if (!tile.seen || !isWallKind(tile.k) || tile.k === 'solid') continue;
    const x = i % state.w;
    const y = Math.floor(i / state.w);
    if (
      NEIGHBORS4.some(
        ([dx, dy]) => inBounds(state, x + dx, y + dy) && dist[idx(state, x + dx, y + dy)] >= 7,
      )
    ) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return null;
  const pick = randPick(state, candidates);
  return { x: pick % state.w, y: Math.floor(pick / state.w) };
}

export function spawnRaid(state: GameState, type: EnemyType, count: number): number {
  let spawned = 0;
  for (let n = 0; n < count; n++) {
    const point = findEmergePoint(state);
    if (!point) break;
    const tile = state.tiles[idx(state, point.x, point.y)];
    if (tile.k === 'dirt' || tile.k === 'loose' || tile.k === 'hard') {
      breakWall(state, point.x, point.y, true);
    } else {
      setTile(state, point.x, point.y, 'rubble');
      tile.rubble = 1;
    }
    spawnEnemy(state, type, point.x + 0.5, point.y + 0.5);
    state.fx.push({ kind: 'burst', x: point.x + 0.5, y: point.y + 0.5, color: 0xc14b3a });
    spawned++;
  }
  return spawned;
}

function updateWaves(state: GameState): void {
  if (state.time < state.waves.nextAt) return;
  const def = regionById(state.regionId).waves;
  const size = Math.round(def.size + def.growth * state.waves.count);
  const hordes = new Map<EnemyType, number>();
  for (let i = 0; i < size; i++) {
    const type = randPick(state, def.pool);
    hordes.set(type, (hordes.get(type) ?? 0) + 1);
  }
  let total = 0;
  for (const [type, count] of hordes) total += spawnRaid(state, type, count);
  state.waves.count += 1;
  state.waves.nextAt = state.time + def.every;
  if (total > 0) {
    log(state, `Alerte : ${total} ennemis percent les galeries !`, 'bad');
    state.fx.push({ kind: 'sound', id: 'alert' }, { kind: 'voice', id: 'raid' });
  }
}

const nearestBuilding = (state: GameState, e: Enemy): Building | null => {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of state.buildings) {
    const c = buildingCenter(b);
    const penalty = e.type === 'saboteur' && b.type === 'hq' ? 40 : 0;
    const generatorBias = e.type === 'larve' && b.type === 'generator' ? -15 : 0;
    const d = Math.hypot(c.x - e.x, c.y - e.y) + penalty + generatorBias;
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
};

const nearestUnit = (state: GameState, e: Enemy, range: number): Unit | null => {
  let best: Unit | null = null;
  let bestD = range;
  for (const u of state.units) {
    const d = Math.hypot(u.x - e.x, u.y - e.y);
    if (d < bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
};

function destroyBuilding(state: GameState, b: Building): void {
  state.buildings.splice(state.buildings.indexOf(b), 1);
  state.networkDirty = true;
  state.jobs = state.jobs.filter((j) => {
    if (j.kind !== 'build' || j.refId !== b.id) return true;
    const unit = state.units.find((u) => u.jobId === j.id);
    if (unit) {
      unit.jobId = null;
      unit.path = [];
    }
    return false;
  });
  const center = buildingCenter(b);
  state.fx.push(
    { kind: 'burst', x: center.x, y: center.y, color: 0xff7d54 },
    { kind: 'sound', id: 'collapse', x: center.x, y: center.y },
    { kind: 'voice', id: 'destroyed' },
  );
  state.city.moraleShock -= 3;
  log(state, `${BUILDINGS[b.type].name} détruit !`, 'bad');
}

export function damageBuilding(state: GameState, b: Building, amount: number): void {
  b.hp -= amount;
  if (b.hp <= 0) destroyBuilding(state, b);
}

function updateEnemy(state: GameState, e: Enemy): void {
  const def = ENEMIES[e.type];
  e.cooldown = Math.max(0, e.cooldown - TICK_SECONDS);

  if (def.structure) {
    // Dormant until the player discovers it.
    if (!state.tiles[idx(state, Math.floor(e.x), Math.floor(e.y))].seen) return;
    e.spawnIn -= TICK_SECONDS;
    if (e.spawnIn <= 0) {
      e.spawnIn = def.structure.every;
      // A structure left alone must stay a threat, not bury the map under its spawn.
      const roaming = state.enemies.filter((other) => !ENEMIES[other.type].structure).length;
      if (roaming < MAX_ROAMING_ENEMIES) {
        spawnEnemy(state, randPick(state, def.structure.spawns), e.x, e.y + 1);
      }
    }
  }

  e.repathIn -= TICK_SECONDS;
  let targetX: number | null = null;
  let targetY: number | null = null;
  let targetUnit: Unit | undefined;
  let targetBuilding: Building | undefined;
  if (e.targetKind === 'unit') {
    targetUnit = state.units.find((u) => u.id === e.targetId);
    if (targetUnit) {
      targetX = targetUnit.x;
      targetY = targetUnit.y;
    }
  } else if (e.targetKind === 'building') {
    targetBuilding = state.buildings.find((b) => b.id === e.targetId);
    if (targetBuilding) {
      const c = buildingCenter(targetBuilding);
      targetX = c.x;
      targetY = c.y;
    }
  }

  if (e.repathIn <= 0 || targetX === null) {
    e.repathIn = 2 + rand(state);
    const unit = nearestUnit(state, e, def.prefersUnits ? 9 : def.structure ? def.range : 3.5);
    const building = def.structure ? null : nearestBuilding(state, e);
    if (unit) {
      e.targetKind = 'unit';
      e.targetId = unit.id;
      targetUnit = unit;
      targetBuilding = undefined;
      targetX = unit.x;
      targetY = unit.y;
    } else if (building) {
      const c = buildingCenter(building);
      e.targetKind = 'building';
      e.targetId = building.id;
      targetBuilding = building;
      targetUnit = undefined;
      targetX = c.x;
      targetY = c.y;
    } else {
      e.targetKind = null;
      e.targetId = null;
      targetX = null;
    }
    if (targetX !== null && !def.structure) {
      const toX = targetBuilding ? targetBuilding.x : Math.floor(targetX);
      const toY = targetBuilding ? targetBuilding.y : Math.floor(targetY as number);
      e.path = findPath(state, Math.floor(e.x), Math.floor(e.y), toX, toY) ?? [];
    }
  }
  if (targetX === null || targetY === null) return;

  const reach = def.range + (targetBuilding ? BUILDINGS[targetBuilding.type].size / 2 : 0);
  const d = Math.hypot(targetX - e.x, targetY - e.y);
  if (d <= reach) {
    if (e.cooldown <= 0 && def.damage > 0) {
      e.cooldown = def.cooldown;
      if (targetBuilding) {
        damageBuilding(state, targetBuilding, def.damage * def.vsBuilding);
      } else if (targetUnit) {
        targetUnit.hp -= def.damage;
      }
      if (def.range > 2) {
        state.fx.push({ kind: 'laser', x1: e.x, y1: e.y, x2: targetX, y2: targetY, hostile: true });
      }
    }
  } else if (def.speed > 0) {
    moveAlongPath(state, e, def.speed);
  }
}

const canSeeEnemy = (state: GameState, e: Enemy): boolean =>
  state.tiles[idx(state, Math.floor(e.x), Math.floor(e.y))].seen;

function nearestEnemy(state: GameState, x: number, y: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = range;
  for (const e of state.enemies) {
    if (!canSeeEnemy(state, e)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function hurtEnemy(state: GameState, e: Enemy, amount: number): void {
  e.hp -= amount * state.mods.combatDamage;
}

function updateGuard(state: GameState, unit: Unit): void {
  const def = UNITS[unit.type];
  const attack = def.attack;
  if (!attack) return;
  unit.cooldown = Math.max(0, unit.cooldown - TICK_SECONDS);
  const speed = def.speed * state.mods.moveSpeed;

  const target = nearestEnemy(state, unit.x, unit.y, attack.range);
  if (target && unit.order === null) unit.path = [];
  if (target && unit.cooldown <= 0) {
    unit.cooldown = attack.cooldown;
    hurtEnemy(state, target, attack.damage);
    state.fx.push(
      { kind: 'laser', x1: unit.x, y1: unit.y, x2: target.x, y2: target.y, hostile: false },
      { kind: 'sound', id: 'laser', x: unit.x, y: unit.y },
    );
  }
  if (unit.order !== null) {
    moveAlongPath(state, unit, speed);
    if (unit.path.length === 0) unit.order = null;
    return;
  }
  if (target) return;
  moveAlongPath(state, unit, speed);
  // Chase whatever comes near, without leaving the post for long.
  if (unit.path.length === 0 && --unit.thinkIn <= 0) {
    unit.thinkIn = 10;
    const prey = nearestEnemy(state, unit.x, unit.y, 11);
    if (prey) {
      const path = findPath(
        state,
        Math.floor(unit.x),
        Math.floor(unit.y),
        Math.floor(prey.x),
        Math.floor(prey.y),
      );
      if (path) unit.path = path.slice(0, 6);
    }
  }
}

function updateTurrets(state: GameState): void {
  for (const b of state.buildings) {
    const turret = BUILDINGS[b.type].turret;
    if (!turret || b.eff <= 0 || b.cooldown > 0) continue;
    const c = buildingCenter(b);
    const target = nearestEnemy(state, c.x, c.y, turret.range);
    if (!target) continue;
    b.cooldown = turret.cooldown;
    hurtEnemy(state, target, turret.damage * b.eff);
    state.fx.push(
      { kind: 'laser', x1: c.x, y1: c.y, x2: target.x, y2: target.y, hostile: false },
      { kind: 'sound', id: 'laser', x: c.x, y: c.y },
    );
  }
}

export function updateCombat(state: GameState): void {
  updateWaves(state);
  // Enemies and units can both add to these lists, so walk over stable copies.
  for (const e of [...state.enemies]) updateEnemy(state, e);
  for (const unit of [...state.units]) {
    if (UNITS[unit.type].attack) updateGuard(state, unit);
    else updateWorker(state, unit);
  }
  updateTurrets(state);

  for (const e of [...state.enemies]) {
    if (e.hp > 0) continue;
    state.enemies.splice(state.enemies.indexOf(e), 1);
    state.kills[e.type] = (state.kills[e.type] ?? 0) + 1;
    state.fx.push({ kind: 'burst', x: e.x, y: e.y, color: 0xc14b3a });
    if (ENEMIES[e.type].structure) {
      log(state, `${ENEMIES[e.type].name} détruit !`, 'good');
    }
  }
  for (const unit of [...state.units]) {
    if (unit.hp > 0) continue;
    releaseJob(state, unit);
    state.units.splice(state.units.indexOf(unit), 1);
    state.fx.push({ kind: 'burst', x: unit.x, y: unit.y, color: 0xff5050 });
    if (UNITS[unit.type].citizens > 0) state.city.moraleShock -= 4;
    log(state, `${UNITS[unit.type].name} perdu au combat.`, 'bad');
  }
}
