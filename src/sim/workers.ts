import { BUILD_TIME_FACTOR, BUILDINGS, PATH_COST } from '../data/buildings';
import { WALLS } from '../data/resources';
import { UNITS } from '../data/units';
import { canAfford, hasRoomFor, addStock, pay } from './economy';
import { buildingCenter, log, newId, spawnPickup } from './entities';
import { idx, isWalkableKind, NEIGHBORS4, reveal, setTile, tileCenter } from './grid';
import { distanceField, findPath } from './pathfinding';
import { rand } from './rng';
import type { Building, GameState, Job, JobKind, Pickup, ResourceId, Unit } from './types';
import { TICK_SECONDS } from './types';

const CLEAR_TIME = 1.1;
const PATH_TIME = 3;
const HARVEST_TIME = 2.2;
const FUNGUS_REGROW = 75;
const REPAIR_RATE = 30;

const JOB_PRIORITY: Record<JobKind, number> = {
  build: 0,
  haul: 2,
  path: 3,
  clear: 3,
  drill: 4,
  harvest: 6,
};

export function addJob(
  state: GameState,
  kind: JobKind,
  x: number,
  y: number,
  refId: number | null = null,
): Job {
  const job: Job = { id: newId(state), kind, x, y, unitId: null, refId, deliver: false };
  state.jobs.push(job);
  return job;
}

export function removeJob(state: GameState, jobId: number): void {
  const i = state.jobs.findIndex((j) => j.id === jobId);
  if (i < 0) return;
  const job = state.jobs[i];
  state.jobs.splice(i, 1);
  const unit = state.units.find((u) => u.jobId === job.id);
  if (unit) {
    unit.jobId = null;
    unit.path = [];
    unit.working = false;
  }
}

/** Gives the job back to the pool, dropping anything the unit was carrying. */
export function releaseJob(state: GameState, unit: Unit): void {
  const job = state.jobs.find((j) => j.id === unit.jobId);
  if (job) {
    job.unitId = null;
    job.deliver = false;
    const pickup = state.pickups.find((p) => p.claimedBy === unit.id);
    if (pickup) pickup.claimedBy = null;
  }
  if (unit.carry) dropCarried(state, unit);
  unit.jobId = null;
  unit.path = [];
  unit.working = false;
}

export function dropCarried(state: GameState, unit: Unit): void {
  if (!unit.carry) return;
  for (let n = 0; n < unit.carryCount; n++) {
    const id = spawnPickup(state, unit.carry, unit.x, unit.y);
    addJob(state, 'haul', Math.floor(unit.x), Math.floor(unit.y), id);
  }
  unit.carry = null;
  unit.carryCount = 0;
}

export const drillPowerOf = (state: GameState, unit: Unit): number => {
  const base = UNITS[unit.type].drillPower;
  return unit.type === 'foreur' ? Math.max(base, state.mods.drillPower) : base;
};

/** Where a unit must stand to work this job, or null if nothing is in reach. */
function bestAccess(
  state: GameState,
  job: Job,
  dist: Int32Array,
): { tile: number; steps: number } | null {
  if (job.kind === 'drill') {
    let best: { tile: number; steps: number } | null = null;
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = job.x + dx;
      const ny = job.y + dy;
      if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
      const i = idx(state, nx, ny);
      if (dist[i] >= 0 && (!best || dist[i] < best.steps)) best = { tile: i, steps: dist[i] };
    }
    return best;
  }
  const i = idx(state, job.x, job.y);
  return dist[i] >= 0 ? { tile: i, steps: dist[i] } : null;
}

function jobIsOpen(state: GameState, unit: Unit, job: Job): boolean {
  if (job.unitId !== null) return false;
  if (!UNITS[unit.type].jobs.includes(job.kind)) return false;
  switch (job.kind) {
    case 'drill': {
      const wall = WALLS[state.tiles[idx(state, job.x, job.y)].k];
      return wall !== undefined && drillPowerOf(state, unit) >= wall.power;
    }
    case 'path':
      return canAfford(state, PATH_COST);
    case 'haul': {
      const pickup = state.pickups.find((p) => p.id === job.refId);
      return pickup !== undefined && hasRoomFor(state, pickup.res);
    }
    case 'harvest':
      return state.tiles[idx(state, job.x, job.y)].regrow <= 0;
    default:
      return true;
  }
}

function assignJob(state: GameState, unit: Unit): void {
  const open = state.jobs.filter((j) => jobIsOpen(state, unit, j));
  if (open.length === 0) return;
  const dist = distanceField(state, Math.floor(unit.x), Math.floor(unit.y));
  let best: Job | null = null;
  let bestTile = -1;
  let bestScore = Infinity;
  for (const job of open) {
    const access = bestAccess(state, job, dist);
    if (!access) continue;
    let score = access.steps + JOB_PRIORITY[job.kind] * 4;
    // Whatever the colony is short of gets fetched first.
    if (job.kind === 'haul') {
      const res = state.pickups.find((p) => p.id === job.refId)?.res;
      if (res && state.stock[res] < 12) score -= 10;
    }
    if (score < bestScore) {
      best = job;
      bestTile = access.tile;
      bestScore = score;
    }
  }
  if (!best) return;
  const path = findPath(
    state,
    Math.floor(unit.x),
    Math.floor(unit.y),
    bestTile % state.w,
    Math.floor(bestTile / state.w),
  );
  if (!path) return;
  best.unitId = unit.id;
  unit.jobId = best.id;
  unit.path = path;
  if (best.kind === 'haul') {
    const pickup = state.pickups.find((p) => p.id === best.refId);
    if (pickup) pickup.claimedBy = unit.id;
  }
}

export function moveAlongPath(
  state: GameState,
  mover: { x: number; y: number; path: number[] },
  speed: number,
): void {
  if (mover.path.length === 0) return;
  let budget = speed * TICK_SECONDS;
  while (budget > 0 && mover.path.length > 0) {
    const next = mover.path[0];
    const target = tileCenter(next, state.w);
    const dx = target.x - mover.x;
    const dy = target.y - mover.y;
    const d = Math.hypot(dx, dy);
    const kind = state.tiles[next].k;
    const terrain = kind === 'path' ? 1.5 : kind === 'rubble' ? 0.75 : 1;
    const step = budget * terrain;
    if (d <= step) {
      mover.x = target.x;
      mover.y = target.y;
      mover.path.shift();
      budget -= d / terrain;
    } else {
      mover.x += (dx / d) * step;
      mover.y += (dy / d) * step;
      budget = 0;
    }
  }
}

const distTo = (u: Unit, x: number, y: number) => Math.hypot(u.x - x, u.y - y);

export function updateWorker(state: GameState, unit: Unit): void {
  const speed = UNITS[unit.type].speed * state.mods.moveSpeed;
  if (unit.order !== null) {
    // Player orders overrule jobs until the unit arrives.
    moveAlongPath(state, unit, speed);
    if (unit.path.length === 0) unit.order = null;
    return;
  }
  if (unit.jobId === null) {
    unit.working = false;
    if (--unit.thinkIn <= 0) {
      unit.thinkIn = 5;
      assignJob(state, unit);
    }
    return;
  }
  const job = state.jobs.find((j) => j.id === unit.jobId);
  if (!job) {
    unit.jobId = null;
    unit.path = [];
    return;
  }
  runJob(state, unit, job, speed);
}

/** Walks towards the job; returns true once the unit is close enough to work. */
function approach(state: GameState, unit: Unit, job: Job, reach: number, speed: number): boolean {
  if (distTo(unit, job.x + 0.5, job.y + 0.5) <= reach) {
    unit.path = [];
    return true;
  }
  if (unit.path.length === 0) {
    releaseJob(state, unit);
    unit.thinkIn = 15;
    return false;
  }
  moveAlongPath(state, unit, speed);
  return false;
}

function runJob(state: GameState, unit: Unit, job: Job, speed: number): void {
  const dt = TICK_SECONDS;
  unit.working = false;
  const tile = state.tiles[idx(state, job.x, job.y)];
  switch (job.kind) {
    case 'drill': {
      const wall = WALLS[tile.k];
      if (!wall) return removeJob(state, job.id);
      if (!approach(state, unit, job, 1.25, speed)) return;
      unit.working = true;
      tile.work += dt * UNITS[unit.type].drillSpeed * state.mods.drillSpeed;
      if (state.tick % 12 === 0) {
        const machine = unit.type === 'heavy';
        state.fx.push({ kind: 'sound', id: 'drill', x: job.x, y: job.y, machine });
      }
      if (tile.work >= wall.drillTime) breakWall(state, job.x, job.y);
      return;
    }
    case 'clear': {
      if (tile.k !== 'rubble') return removeJob(state, job.id);
      if (!approach(state, unit, job, 0.9, speed)) return;
      unit.working = true;
      tile.work += dt;
      if (tile.work >= CLEAR_TIME) {
        tile.work = 0;
        tile.rubble -= 1;
        state.dirty.push(idx(state, job.x, job.y));
        if (tile.rubble <= 0) {
          // With the stores full, it would only be a pile nobody can ever bring in.
          if (hasRoomFor(state, 'stone')) dropAround(state, 'stone', job.x, job.y);
          setTile(state, job.x, job.y, 'floor');
          removeJob(state, job.id);
        }
      }
      return;
    }
    case 'path': {
      if (tile.k === 'path') return removeJob(state, job.id);
      if (!isWalkableKind(tile.k)) return removeJob(state, job.id);
      if (!approach(state, unit, job, 1.1, speed)) return;
      unit.working = true;
      tile.work += dt;
      if (tile.work >= PATH_TIME) {
        tile.work = 0;
        if (!canAfford(state, PATH_COST)) {
          releaseJob(state, unit);
          return;
        }
        pay(state, PATH_COST);
        setTile(state, job.x, job.y, 'path');
        state.networkDirty = true;
        removeJob(state, job.id);
      }
      return;
    }
    case 'harvest': {
      if (tile.k !== 'fungus') return removeJob(state, job.id);
      if (!approach(state, unit, job, 1, speed)) return;
      unit.working = true;
      tile.work += dt;
      if (tile.work >= HARVEST_TIME) {
        tile.work = 0;
        tile.regrow = FUNGUS_REGROW;
        for (let i = 0; i < 3; i++) dropAround(state, 'food', job.x, job.y);
        removeJob(state, job.id);
      }
      return;
    }
    case 'build': {
      const building = state.buildings.find((b) => b.id === job.refId);
      if (!building) return removeJob(state, job.id);
      return runBuild(state, unit, job, building, speed);
    }
    case 'haul':
      return runHaul(state, unit, job, speed);
  }
}

function runBuild(state: GameState, unit: Unit, job: Job, b: Building, speed: number): void {
  const def = BUILDINGS[b.type];
  const center = buildingCenter(b);
  if (distTo(unit, center.x, center.y) > def.size / 2 + 0.9) {
    if (unit.path.length === 0) {
      releaseJob(state, unit);
      unit.thinkIn = 15;
      return;
    }
    moveAlongPath(state, unit, speed);
    return;
  }
  unit.path = [];
  unit.working = true;
  const dt = TICK_SECONDS;
  if (b.built < 1) {
    const duration = def.buildTime * BUILD_TIME_FACTOR;
    b.built = Math.min(1, b.built + (dt * state.mods.buildSpeed) / duration);
    if (b.built >= 1) {
      b.hp = def.hp;
      state.networkDirty = true;
      log(state, `${def.name} : construction terminée.`, 'good');
      state.fx.push({ kind: 'sound', id: 'build', x: b.x, y: b.y }, { kind: 'voice', id: 'built' });
      removeJob(state, job.id);
    }
  } else {
    b.hp = Math.min(def.hp, b.hp + REPAIR_RATE * dt);
    if (b.hp >= def.hp) removeJob(state, job.id);
  }
}

function nearestStorage(state: GameState, unit: Unit): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of state.buildings) {
    if (b.built < 1 || !BUILDINGS[b.type].storage) continue;
    const c = buildingCenter(b);
    const d = Math.hypot(c.x - unit.x, c.y - unit.y);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

function runHaul(state: GameState, unit: Unit, job: Job, speed: number): void {
  if (!job.deliver) {
    const pickup: Pickup | undefined = state.pickups.find((p) => p.id === job.refId);
    if (!pickup) return removeJob(state, job.id);
    if (Math.hypot(unit.x - pickup.x, unit.y - pickup.y) > 1) {
      if (unit.path.length === 0) {
        const path = findPath(
          state,
          Math.floor(unit.x),
          Math.floor(unit.y),
          Math.floor(pickup.x),
          Math.floor(pickup.y),
        );
        if (!path || path.length === 0) {
          // Whatever is out of reach is not lost, it waits for a new route.
          pickup.claimedBy = null;
          job.unitId = null;
          unit.jobId = null;
          unit.thinkIn = 30;
          return;
        }
        unit.path = path;
      }
      moveAlongPath(state, unit, speed);
      return;
    }
    state.pickups.splice(state.pickups.indexOf(pickup), 1);
    unit.carry = pickup.res;
    unit.carryCount = 1;
    gatherNearby(state, unit, pickup.res);
    job.deliver = true;
    unit.path = [];
  }
  const res: ResourceId | null = unit.carry;
  if (!res) return removeJob(state, job.id);
  const storage = nearestStorage(state, unit);
  if (!storage) return;
  const center = buildingCenter(storage);
  if (distTo(unit, center.x, center.y) <= BUILDINGS[storage.type].size / 2 + 0.9) {
    addStock(state, res, unit.carryCount);
    unit.carry = null;
    unit.carryCount = 0;
    state.fx.push({ kind: 'sound', id: 'collect', x: unit.x, y: unit.y });
    removeJob(state, job.id);
    return;
  }
  if (unit.path.length === 0) {
    const path = findPath(state, Math.floor(unit.x), Math.floor(unit.y), storage.x, storage.y);
    if (!path) {
      releaseJob(state, unit);
      unit.thinkIn = 30;
      return;
    }
    unit.path = path;
  }
  moveAlongPath(state, unit, speed);
}

/** Scoops up identical items lying nearby, so one trip clears a whole seam. */
function gatherNearby(state: GameState, unit: Unit, res: ResourceId): void {
  const limit = UNITS[unit.type].carryLimit;
  for (const other of [...state.pickups]) {
    if (unit.carryCount >= limit) return;
    if (other.res !== res || other.claimedBy !== null) continue;
    if (Math.hypot(other.x - unit.x, other.y - unit.y) > 1.6) continue;
    state.pickups.splice(state.pickups.indexOf(other), 1);
    const otherJob = state.jobs.find((j) => j.kind === 'haul' && j.refId === other.id);
    if (otherJob) state.jobs.splice(state.jobs.indexOf(otherJob), 1);
    unit.carryCount++;
  }
}

function dropAround(state: GameState, res: ResourceId, x: number, y: number): void {
  const px = x + 0.2 + rand(state) * 0.6;
  const py = y + 0.2 + rand(state) * 0.6;
  const id = spawnPickup(state, res, px, py);
  addJob(state, 'haul', x, y, id);
}

/** Turns a wall into rubble, spilling its contents and opening what lies behind. */
export function breakWall(state: GameState, x: number, y: number, silent = false): void {
  const i = idx(state, x, y);
  const tile = state.tiles[i];
  const wall = WALLS[tile.k];
  if (!wall) return;
  const drillJob = state.jobs.find((j) => j.kind === 'drill' && j.x === x && j.y === y);
  if (drillJob) removeJob(state, drillJob.id);

  if (wall.yield) {
    const { res, min, max } = wall.yield;
    const count = min + Math.floor(rand(state) * (max - min + 1));
    for (let n = 0; n < count; n++) dropAround(state, res, x, y);
    if (!silent) state.fx.push({ kind: 'voice', id: 'find' });
    if (res === 'relic') log(state, 'Un caveau scellé cède : une relique apparaît !', 'good');
  }
  const wasLoose = tile.k === 'loose';
  setTile(state, x, y, 'rubble');
  tile.rubble = 2;
  tile.work = 0;
  addJob(state, 'clear', x, y);
  const opened = reveal(state, x, y);
  if (!silent) {
    state.fx.push({ kind: 'burst', x: x + 0.5, y: y + 0.5, color: 0x8d8a84 });
    if (opened > 6) log(state, 'Une nouvelle galerie vient de s’ouvrir.', 'info');
  }

  // Loose rock tends to bring its neighbours down.
  if (wasLoose) {
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      const neighbour = state.tiles[idx(state, nx, ny)];
      if (neighbour?.k === 'loose' && rand(state) < 0.06 * state.mods.hazard)
        collapse(state, nx, ny);
    }
  }
}

function collapse(state: GameState, x: number, y: number): void {
  breakWall(state, x, y, true);
  log(state, 'Éboulement !', 'warn');
  state.fx.push(
    { kind: 'sound', id: 'collapse', x, y },
    { kind: 'voice', id: 'collapse' },
    { kind: 'burst', x: x + 0.5, y: y + 0.5, color: 0xa08a6e },
  );
  for (const unit of state.units) {
    if (Math.hypot(unit.x - x - 0.5, unit.y - y - 0.5) < 1.6) unit.hp -= 14;
  }
}

/** Queues repairs for damaged buildings. */
export function updateRepairs(state: GameState): void {
  for (const b of state.buildings) {
    if (b.built < 1 || b.hp >= BUILDINGS[b.type].hp * 0.9) continue;
    if (state.jobs.some((j) => j.kind === 'build' && j.refId === b.id)) continue;
    addJob(state, 'build', b.x, b.y, b.id);
  }
}
