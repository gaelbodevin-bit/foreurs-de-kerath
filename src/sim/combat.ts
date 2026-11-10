import { BUILDINGS } from '../data/buildings';
import { REGIONS } from '../data/regions';
import { WALLS } from '../data/resources';
import { ENEMIES, UNITS } from '../data/units';
import { buildingCenter, log, spawnEnemy } from './entities';
import { idx, inBounds, isWalkableKind, isWallKind, NEIGHBORS4 } from './grid';
import { distanceField, findPath } from './pathfinding';
import { rand, randPick } from './rng';
import type { Building, Enemy, EnemyType, GameState, Unit } from './types';
import { TICK_SECONDS } from './types';
import { airTrouble } from './economy';
import { breakWall, moveAlongPath, releaseJob, updateWorker } from './workers';

const MAX_ROAMING_ENEMIES = 12;
const MAX_RAID = 10;
const PATROL_RADIUS = 4;
/** Tried once a second while the guard has nothing else to do. */
const PATROL_CHANCE = 0.3;
/** How near an enemy has to come for a miner to down tools, in tiles. */
const MINER_ALERT = 6;
/** A miner with nothing to do looks further: the colony's buildings need guarding too. */
const MINER_GUARD = 14;
/** Ticks between two looks at the way to an enemy. */
const MINER_REPATH = 5;
/** Share of its health under which a miner stops looking for a fight, and falls back to the HQ. */
const MINER_NERVE = 0.4;
/** Health a unit gets back each second near the HQ, and near a working clinic. */
export const REST_HEAL = 1.5;
export const CLINIC_HEAL = 5;
/** How close to the HQ or a clinic a unit must stand to be looked after, in tiles. */
const CARE_RADIUS = 4;

/**
 * The seen walls touching the settled area, away from the HQ, that a raid can burst out of. Never a
 * seam: what the miners came for doesn't vanish in a raid, and its drill mark would stay for ever.
 */
function emergePoints(state: GameState): number[] {
  const hq = state.buildings.find((b) => b.type === 'hq');
  if (!hq) return [];
  const dist = distanceField(state, hq.x, hq.y);
  const candidates: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    const tile = state.tiles[i];
    if (!tile.seen || !isWallKind(tile.k) || tile.k === 'solid') continue;
    if (WALLS[tile.k]?.yield) continue;
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
  return candidates;
}

export function spawnRaid(state: GameState, type: EnemyType, count: number): number {
  let spawned = 0;
  // Once per raid, not once per enemy: a whole-map search for each of ten made every wave stutter.
  const points = emergePoints(state);
  for (let n = 0; n < count && points.length > 0; n++) {
    const pick = randPick(state, points);
    points.splice(points.indexOf(pick), 1);
    const point = { x: pick % state.w, y: Math.floor(pick / state.w) };
    // Like a miner's drill: the mark goes, the rubble gets a clearing job, what lies behind is seen.
    breakWall(state, point.x, point.y, true);
    spawnEnemy(state, type, point.x + 0.5, point.y + 0.5);
    state.fx.push({ kind: 'burst', x: point.x + 0.5, y: point.y + 0.5, color: 0xc14b3a });
    spawned++;
  }
  return spawned;
}

function updateWaves(state: GameState): void {
  if (state.time < state.waves.nextAt) return;
  // The raids come from the deepest front open at the moment, and never grow past a limit.
  const open = REGIONS.filter((r) => state.sectorStart[r.id] !== undefined);
  const def = open[open.length - 1].waves;
  const size = Math.min(MAX_RAID, Math.round(def.size + def.growth * state.waves.count));
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

/** How close a unit has to come before a lair's monsters notice it. */
const WAKE_RANGE = 7;
/** Everyone sleeping within this distance wakes up with the first one. */
const LAIR_SIZE = 7;

function wakeLair(state: GameState, e: Enemy): void {
  for (const other of state.enemies) {
    if (other.dormant && Math.hypot(other.x - e.x, other.y - e.y) <= LAIR_SIZE) {
      other.dormant = false;
    }
  }
  log(state, 'Une salle infestée se réveille !', 'bad');
  state.fx.push({ kind: 'sound', id: 'alert' }, { kind: 'voice', id: 'lair' });
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
  const at = state.buildings.indexOf(b);
  // Already gone: splice(-1) would take down whatever building was last in the list.
  if (at < 0) return;
  state.buildings.splice(at, 1);
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
  log(state, `Bâtiment détruit : ${BUILDINGS[b.type].name}.`, 'bad');
}

export function damageBuilding(state: GameState, b: Building, amount: number): void {
  b.hp -= amount;
  if (b.hp <= 0) destroyBuilding(state, b);
}

function updateEnemy(state: GameState, e: Enemy): void {
  const def = ENEMIES[e.type];
  e.cooldown = Math.max(0, e.cooldown - TICK_SECONDS);

  if (e.dormant) {
    const seen = state.tiles[idx(state, Math.floor(e.x), Math.floor(e.y))].seen;
    if (!seen) return;
    if (e.hp >= def.hp && !nearestUnit(state, e, WAKE_RANGE)) return;
    wakeLair(state, e);
  }

  if (def.structure) {
    // Dormant until the player discovers it.
    if (!state.tiles[idx(state, Math.floor(e.x), Math.floor(e.y))].seen) return;
    e.spawnIn -= TICK_SECONDS;
    if (e.spawnIn <= 0) {
      e.spawnIn = def.structure.every;
      // A structure left alone must stay a threat, not bury the map under its spawn.
      const roaming = state.enemies.filter(
        (other) => !ENEMIES[other.type].structure && !other.dormant,
      ).length;
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

/**
 * The enemies in sight this tick, worked out once: most of a big planet's enemies sleep in the dark,
 * and every unit asking about each of them, every tick, adds up.
 */
let inSight: Enemy[] = [];

function nearestEnemy(_state: GameState, x: number, y: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = range;
  for (const e of inSight) {
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

/** Every now and then, a short walk around the post: a guard on watch doesn't stand like a statue. */
function patrol(state: GameState, unit: Unit): void {
  unit.post ??= { x: unit.x, y: unit.y };
  if (rand(state) >= PATROL_CHANCE) return;
  const x = Math.floor(unit.post.x + (rand(state) * 2 - 1) * PATROL_RADIUS);
  const y = Math.floor(unit.post.y + (rand(state) * 2 - 1) * PATROL_RADIUS);
  if (!inBounds(state, x, y)) return;
  const tile = state.tiles[idx(state, x, y)];
  // Only on ground already known: a patrol shouldn't wander into a monsters' room.
  if (!tile.seen || !isWalkableKind(tile.k) || tile.lair) return;
  const path = findPath(state, Math.floor(unit.x), Math.floor(unit.y), x, y);
  if (path && path.length <= PATROL_RADIUS * 3) unit.path = path;
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
    if (unit.path.length === 0) {
      unit.order = null;
      // Sent here by the player: this is the new post.
      unit.post = { x: unit.x, y: unit.y };
    }
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
    } else {
      patrol(state, unit);
    }
  }
}

/** The nearest thing a miner would drop everything for. Lairs and sleepers can wait. */
const alertRadius = (unit: Unit): number =>
  unit.jobId === null && !unit.carry ? MINER_GUARD : MINER_ALERT;

function nearestThreat(_state: GameState, unit: Unit): Enemy | null {
  let best: Enemy | null = null;
  let bestD = alertRadius(unit);
  for (const e of inSight) {
    if (e.dormant || ENEMIES[e.type].structure) continue;
    const d = Math.hypot(e.x - unit.x, e.y - unit.y);
    if (d <= bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/**
 * With an enemy near, a miner downs tools and goes for it. Returns whether that took up the tick:
 * an enemy with no way through to it leaves the miner at work, and the player's orders come first.
 */
function minerDefence(state: GameState, unit: Unit): boolean {
  const melee = UNITS[unit.type].melee;
  if (!melee) return false;
  unit.cooldown = Math.max(0, unit.cooldown - TICK_SECONDS);
  const inReach = nearestEnemy(state, unit.x, unit.y, melee.range);
  if (inReach && unit.cooldown <= 0) {
    unit.cooldown = melee.cooldown;
    unit.targetId = inReach.id;
    hurtEnemy(state, inReach, melee.damage * state.mods.drillPower);
    state.fx.push({ kind: 'sound', id: 'hit', x: inReach.x, y: inReach.y });
  }
  if (unit.order !== null) return false;
  const shaken = unit.hp < UNITS[unit.type].hp * MINER_NERVE;
  if (shaken) return fallBack(state, unit);
  const threat = nearestThreat(state, unit);
  if (!threat) {
    if (unit.chasing) {
      unit.chasing = false;
      unit.path = [];
    }
    return false;
  }
  const close = Math.hypot(threat.x - unit.x, threat.y - unit.y) <= melee.range;
  if (!close && !unit.chasing && (state.tick + unit.id) % MINER_REPATH !== 0) return false;
  if (close) {
    unit.path = [];
  } else if (
    !unit.chasing ||
    unit.path.length === 0 ||
    (state.tick + unit.id) % MINER_REPATH === 0
  ) {
    const limit = alertRadius(unit) * 2;
    const path = findPath(
      state,
      Math.floor(unit.x),
      Math.floor(unit.y),
      Math.floor(threat.x),
      Math.floor(threat.y),
      // Crowded tiles cost more than one step: a little slack so a crowd doesn't hide the way.
      limit * 3,
    );
    if (!path || path.length > limit) {
      if (unit.chasing) unit.path = [];
      unit.chasing = false;
      return false;
    }
    unit.path = path;
  }
  // Whatever was in hand stays where it falls, and someone comes back for it.
  if (unit.jobId !== null) {
    const path = unit.path;
    releaseJob(state, unit);
    unit.path = path;
  }
  unit.chasing = true;
  unit.working = false;
  moveAlongPath(state, unit, UNITS[unit.type].speed * state.mods.moveSpeed);
  return true;
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

/**
 * A wounded miner with an enemy close by heads for the HQ, under the turrets, instead of going back to work
 * to be finished off. Out of danger, it works again, and heals once back at the HQ.
 */
function fallBack(state: GameState, unit: Unit): boolean {
  const danger = inSight.some(
    (e) =>
      !e.dormant &&
      !ENEMIES[e.type].structure &&
      Math.hypot(e.x - unit.x, e.y - unit.y) <= MINER_ALERT,
  );
  const hq = state.buildings.find((b) => b.type === 'hq');
  if (!danger || !hq) {
    if (unit.chasing) unit.path = [];
    unit.chasing = false;
    return false;
  }
  const home = buildingCenter(hq);
  // With the fight at the HQ itself, running there means running into it: better carry on where it is.
  const besieged = inSight.some(
    (e) =>
      !e.dormant &&
      !ENEMIES[e.type].structure &&
      Math.hypot(e.x - home.x, e.y - home.y) <= MINER_ALERT,
  );
  if (besieged) {
    if (unit.chasing) unit.path = [];
    unit.chasing = false;
    return false;
  }
  if (Math.hypot(home.x - unit.x, home.y - unit.y) <= CARE_RADIUS - 1) {
    unit.path = [];
    return true;
  }
  if (
    !unit.chasing ||
    unit.path.length === 0 ||
    (state.tick + unit.id) % (MINER_REPATH * 4) === 0
  ) {
    const path = findPath(
      state,
      Math.floor(unit.x),
      Math.floor(unit.y),
      Math.floor(home.x),
      Math.floor(home.y),
    );
    if (!path) return false;
    unit.path = path;
  }
  if (unit.jobId !== null) {
    const path = unit.path;
    releaseJob(state, unit);
    unit.path = path;
  }
  unit.chasing = true;
  unit.working = false;
  moveAlongPath(state, unit, UNITS[unit.type].speed * state.mods.moveSpeed);
  return true;
}

/** Once a second: wounds close up at the HQ, and faster at a clinic that has power and staff. */
function healUnits(state: GameState): void {
  const carers = state.buildings.filter(
    (b) => b.built >= 1 && (b.type === 'hq' || (b.type === 'clinic' && b.eff > 0)),
  );
  if (carers.length === 0) return;
  const choking = state.city.oxygen <= 0;
  for (const unit of state.units) {
    const max = UNITS[unit.type].hp;
    if (unit.hp >= max) continue;
    if (choking && UNITS[unit.type].citizens > 0) continue;
    let rate = 0;
    for (const b of carers) {
      const c = buildingCenter(b);
      if (Math.hypot(c.x - unit.x, c.y - unit.y) > CARE_RADIUS) continue;
      rate = Math.max(rate, b.type === 'clinic' ? CLINIC_HEAL * b.eff : REST_HEAL);
    }
    unit.hp = Math.min(max, unit.hp + rate);
  }
}

export function updateCombat(state: GameState): void {
  updateWaves(state);
  // Enemies and units can both add to these lists, so walk over stable copies.
  for (const e of [...state.enemies]) updateEnemy(state, e);
  inSight = state.enemies.filter((e) => canSeeEnemy(state, e));
  for (const unit of [...state.units]) {
    if (UNITS[unit.type].attack) updateGuard(state, unit);
    else {
      if (!minerDefence(state, unit)) updateWorker(state, unit);
    }
  }
  updateTurrets(state);
  if (state.tick % 10 === 0) healUnits(state);

  for (const e of [...state.enemies]) {
    if (e.hp > 0) continue;
    state.enemies.splice(state.enemies.indexOf(e), 1);
    state.kills[e.type] = (state.kills[e.type] ?? 0) + 1;
    state.fx.push({ kind: 'burst', x: e.x, y: e.y, color: 0xc14b3a });
    if (ENEMIES[e.type].structure) {
      log(state, `${ENEMIES[e.type].name} détruit !`, 'good');
    }
  }
  // When the air runs out, the whole crew goes within seconds: one line for all of them, not fifty.
  for (const unit of [...state.units]) {
    if (unit.hp > 0) continue;
    releaseJob(state, unit);
    state.units.splice(state.units.indexOf(unit), 1);
    state.fx.push({ kind: 'burst', x: unit.x, y: unit.y, color: 0xff5050 });
    if (UNITS[unit.type].citizens > 0) state.city.moraleShock -= 4;
    const name = UNITS[unit.type].name;
    if (unit.fatal === 'air') {
      const tally = (state.airDeaths ??= { names: {}, since: state.time });
      tally.names[name] = (tally.names[name] ?? 0) + 1;
      continue;
    }
    const how =
      unit.fatal === 'gas'
        ? 'asphyxié par le gaz'
        : unit.fatal === 'rock'
          ? 'enseveli sous un éboulement'
          : 'perdu au combat';
    log(state, `${name} ${how}.`, 'bad');
  }
  reportAirDeaths(state);
}

/** Seconds of deaths gathered into one line: the crew doesn't all run out of breath on the same tick. */
const AIR_DEATHS_WINDOW = 20;

/** One line for the crew lost to a want of air, once the air is back or the window is over. */
function reportAirDeaths(state: GameState): void {
  const tally = state.airDeaths;
  if (!tally) return;
  if (state.city.oxygen <= 0 && state.time - tally.since < AIR_DEATHS_WINDOW) return;
  state.airDeaths = undefined;
  const entries = Object.entries(tally.names);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return;
  const who = entries.map(([name, n]) =>
    n === 1 ? `1 ${name.toLowerCase()}` : `${n} ${name.toLowerCase()}s`,
  );
  const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} et ${who[who.length - 1]}` : who[0];
  log(state, `${list} mort${total > 1 ? 's' : ''} faute d’air : ${airTrouble(state)}.`, 'bad');
}
