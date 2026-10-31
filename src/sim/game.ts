import { BUILDINGS } from '../data/buildings';
import { regionById, type Objective } from '../data/regions';
import { RESOURCES, TILE_NAMES, WALLS } from '../data/resources';
import { ENEMIES, UNITS } from '../data/units';
import { updateCombat } from './combat';
import {
  addStock,
  canAfford,
  pay,
  registerRegionIntrigue,
  storageCapacity,
  updateEconomy,
  updateNetwork,
} from './economy';
import { createBuilding, log, spawnEnemy, spawnUnit } from './entities';
import { updateGas } from './gas';
import { idx, inBounds, isWalkableKind, NEIGHBORS4, reveal, setTile, tileAt } from './grid';
import { generateMap } from './mapgen';
import { findPath } from './pathfinding';
import { rand } from './rng';
import { updateStory } from './storyEngine';
import type {
  AdvisorId,
  BuildingType,
  Cost,
  GameState,
  Modifiers,
  PolicyId,
  StoryState,
  UnitType,
} from './types';
import { emptyStock, RESOURCE_IDS, TICK_SECONDS } from './types';
import { addJob, dropCarried, removeJob, updateRepairs } from './workers';

export interface MissionContext {
  seed: number;
  mods: Modifiers;
  startBonus: Cost;
  flags: Record<string, boolean>;
  clues: string[];
  mole: AdvisorId;
  moleCaught: boolean;
  accused: AdvisorId[];
  firedEvents: string[];
}

const SETTLEMENT_SURVIVORS = 8;
/** Keeps the crew from building over the settlement's own structures. */
const SETTLEMENT_CLEARANCE = 3.5;

export function createMission(regionId: string, ctx: MissionContext): GameState {
  const region = regionById(regionId);
  const map = generateMap({ ...region.map, seed: region.map.seed ^ ctx.seed });
  registerRegionIntrigue(regionId, region.intrigue);
  const stock = emptyStock();
  for (const r of RESOURCE_IDS) {
    stock[r] = (region.start.stock[r] ?? 0) + (ctx.startBonus[r] ?? 0);
  }
  const story: StoryState = {
    fired: [...ctx.firedEvents],
    flags: { ...ctx.flags },
    pending: [],
    clues: [...ctx.clues],
    moleCaught: ctx.moleCaught,
    mole: ctx.mole,
    accused: [...ctx.accused],
  };
  const state: GameState = {
    regionId,
    w: map.w,
    h: map.h,
    tiles: map.tiles,
    settlement: map.settlement ? { ...map.settlement, reached: false } : null,
    tick: 0,
    time: 0,
    rng: (region.map.seed * 31 + ctx.seed) | 0,
    nextId: 1,
    stock,
    units: [],
    buildings: [],
    enemies: [],
    pickups: [],
    jobs: [],
    city: {
      population: region.start.population,
      morale: 60,
      moraleShock: 0,
      oxygen: 100,
      taxLevel: 1,
      policies: { rationing: false, curfew: false, propaganda: false, overtime: false },
      conspiracy: 8,
      growthT: 0,
      declineT: 0,
      housing: 0,
      jobs: 0,
      conspiracyStage: 0,
    },
    power: { produced: 0, demand: 0, ratio: 1 },
    story,
    waves: { nextAt: region.waves.first, count: 0 },
    kills: {},
    research: 0,
    outcome: 'playing',
    outcomeReason: '',
    log: [],
    fx: [],
    dirty: [],
    mods: ctx.mods,
    networkDirty: true,
  };

  createBuilding(state, 'hq', map.start.x - 1, map.start.y - 1, 1);
  updateNetwork(state);
  reveal(state, map.start.x, map.start.y);
  for (let i = 0; i < region.start.foreurs; i++) {
    spawnUnit(
      state,
      'foreur',
      map.start.x + (i % 3) - 1 + 0.5,
      map.start.y + 1.5 + Math.floor(i / 3),
    );
  }
  for (let i = 0; i < (region.start.guards ?? 0); i++) {
    spawnUnit(state, 'garde', map.start.x + i - 1 + 0.5, map.start.y - 1.5);
  }
  for (const s of map.structures) spawnEnemy(state, s.type, s.x + 0.5, s.y + 0.5);
  log(state, `Arrivée : ${region.name}.`, 'info');
  return state;
}

export function stepGame(state: GameState): void {
  if (state.outcome !== 'playing' || state.story.pending.length > 0) return;
  state.tick++;
  state.time = state.tick * TICK_SECONDS;

  updateEconomy(state);
  updateCombat(state);

  if (state.tick % 10 === 0) {
    updateRepairs(state);
    updateHazards(state);
    updateSettlement(state);
    updateGas(state);
    updateStory(state);
    updateOutcome(state);
  }
}

/** The flood fill of `reveal` only gets to the settlement once a tunnel actually connects it. */
function updateSettlement(state: GameState): void {
  const place = state.settlement;
  if (!place || place.reached || !tileAt(state, place.x, place.y)?.seen) return;
  place.reached = true;
  state.city.population += SETTLEMENT_SURVIVORS;
  addStock(state, 'ore', 20);
  addStock(state, 'stone', 15);
  state.research += 3;
  state.story.flags.cityReached = true;
  log(state, `La cité est rejointe : ${SETTLEMENT_SURVIVORS} habitants arrivent.`, 'good');
  state.fx.push(
    { kind: 'sound', id: 'plot' },
    { kind: 'voice', id: 'reunited' },
    { kind: 'burst', x: place.x + 0.5, y: place.y + 0.5, color: 0x35e0c2 },
  );
}

function updateHazards(state: GameState): void {
  const erosion = regionById(state.regionId).erosion * state.mods.hazard;
  for (let i = 0; i < state.tiles.length; i++) {
    const tile = state.tiles[i];
    if (tile.regrow > 0) tile.regrow -= 1;
    if (erosion === 0 || tile.k !== 'lava' || !tile.seen) continue;
    if (rand(state) >= erosion) continue;
    const [dx, dy] = NEIGHBORS4[Math.floor(rand(state) * 4)];
    const x = (i % state.w) + dx;
    const y = Math.floor(i / state.w) + dy;
    const target = tileAt(state, x, y);
    // Energy paths are reinforced: they hold the lava back.
    if (!target || (target.k !== 'floor' && target.k !== 'rubble' && target.k !== 'fungus'))
      continue;
    if (state.buildings.some((b) => tileIsUnder(b.type, b.x, b.y, x, y))) continue;
    setTile(state, x, y, 'lava');
    const job = state.jobs.find((j) => j.x === x && j.y === y);
    if (job) removeJob(state, job.id);
    log(state, 'La lave gagne du terrain.', 'warn');
  }
}

const tileIsUnder = (type: BuildingType, bx: number, by: number, x: number, y: number): boolean => {
  const size = BUILDINGS[type].size;
  return x >= bx && y >= by && x < bx + size && y < by + size;
};

export function objectiveProgress(
  state: GameState,
  o: Objective,
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
    case 'destroy':
      return {
        value: state.kills[o.enemy] ?? 0,
        goal: o.amount,
        label: `Détruire : ${ENEMIES[o.enemy].name}`,
      };
    case 'survive':
      return {
        value: Math.floor(state.time),
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

function updateOutcome(state: GameState): void {
  if (!state.buildings.some((b) => b.type === 'hq')) {
    state.outcome = 'lost';
    state.outcomeReason = 'Le Noyau de commande est tombé.';
    return;
  }
  if (state.city.population <= 0 && state.units.length === 0) {
    state.outcome = 'lost';
    state.outcomeReason = 'Il ne reste plus personne dans la colonie.';
    return;
  }
  const region = regionById(state.regionId);
  const done = region.objectives.every((o) => {
    const p = objectiveProgress(state, o);
    return p.value >= p.goal;
  });
  if (done && state.story.pending.length === 0) {
    state.outcome = 'won';
    state.outcomeReason = `${region.name} est sous votre contrôle.`;
  }
}

// --- Player commands. Every UI action goes through one of these. ---

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export const availableBuildings = (regionId: string): BuildingType[] => {
  const tier = regionById(regionId).tier;
  return (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => BUILDINGS[t].tier <= tier);
};

/** Marks a rectangle for work: walls to drill, rubble to clear, fungus to harvest. Dragging over marked tiles cancels them. */
export function designateArea(
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const [minX, maxX] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [minY, maxY] = y0 < y1 ? [y0, y1] : [y1, y0];
  const targets: { x: number; y: number; kind: 'drill' | 'clear' | 'harvest' }[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = tileAt(state, x, y);
      if (!t || !t.seen) continue;
      if (WALLS[t.k]) targets.push({ x, y, kind: 'drill' });
      else if (t.k === 'rubble') targets.push({ x, y, kind: 'clear' });
      else if (t.k === 'fungus') targets.push({ x, y, kind: 'harvest' });
    }
  }
  const unmarked = targets.filter(
    (t) => !state.jobs.some((j) => j.kind === t.kind && j.x === t.x && j.y === t.y),
  );
  if (unmarked.length === 0) {
    // Everything was already marked: this drag is a cancellation.
    for (const t of targets) {
      const job = state.jobs.find((j) => j.kind === t.kind && j.x === t.x && j.y === t.y);
      if (job) removeJob(state, job.id);
    }
    return 0;
  }
  for (const t of unmarked) addJob(state, t.kind, t.x, t.y);
  return unmarked.length;
}

export function canPlaceBuilding(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
): CommandResult {
  const def = BUILDINGS[type];
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const t = tileAt(state, x + dx, y + dy);
      if (!t || !t.seen) return { ok: false, reason: 'Zone inexplorée.' };
      if (t.k !== 'floor' && t.k !== 'path') {
        return { ok: false, reason: `Impossible de bâtir ici : ${TILE_NAMES[t.k]}.` };
      }
      if (state.buildings.some((b) => tileIsUnder(b.type, b.x, b.y, x + dx, y + dy))) {
        return { ok: false, reason: 'Un bâtiment occupe déjà cet espace.' };
      }
      const place = state.settlement;
      if (place && Math.hypot(x + dx - place.x, y + dy - place.y) < SETTLEMENT_CLEARANCE) {
        return { ok: false, reason: 'Cet espace appartient à la cité.' };
      }
    }
  }
  return { ok: true };
}

export function placeBuilding(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
): CommandResult {
  const def = BUILDINGS[type];
  if (def.tier > regionById(state.regionId).tier)
    return { ok: false, reason: 'Technologie indisponible ici.' };
  const placement = canPlaceBuilding(state, type, x, y);
  if (!placement.ok) return placement;
  if (!canAfford(state, def.cost)) return { ok: false, reason: 'Ressources insuffisantes.' };
  pay(state, def.cost);
  const b = createBuilding(state, type, x, y, 0);
  b.hp = def.hp * 0.3;
  addJob(state, 'build', x, y, b.id);
  // Work scheduled under the new walls would never finish.
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const job = state.jobs.find((j) => j.kind === 'path' && j.x === x + dx && j.y === y + dy);
      if (job) removeJob(state, job.id);
    }
  }
  return { ok: true };
}

export function placePath(
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const [minX, maxX] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [minY, maxY] = y0 < y1 ? [y0, y1] : [y1, y0];
  let count = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = tileAt(state, x, y);
      if (!t || !t.seen || t.k !== 'floor') continue;
      if (state.jobs.some((j) => j.kind === 'path' && j.x === x && j.y === y)) continue;
      if (state.buildings.some((b) => tileIsUnder(b.type, b.x, b.y, x, y))) continue;
      addJob(state, 'path', x, y);
      count++;
    }
  }
  return count;
}

export function demolish(state: GameState, buildingId: number): CommandResult {
  const b = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!b) return { ok: false, reason: 'Bâtiment introuvable.' };
  if (b.type === 'hq') return { ok: false, reason: 'Le Noyau de commande ne se démolit pas.' };
  const def = BUILDINGS[b.type];
  for (const r of RESOURCE_IDS) {
    state.stock[r] = Math.min(
      RESOURCES[r].uncapped ? Infinity : storageCapacity(state),
      state.stock[r] + Math.floor((def.cost[r] ?? 0) / 2),
    );
  }
  for (const job of [...state.jobs]) {
    if (job.kind === 'build' && job.refId === b.id) removeJob(state, job.id);
  }
  state.buildings.splice(state.buildings.indexOf(b), 1);
  state.networkDirty = true;
  return { ok: true };
}

export function trainUnit(state: GameState, buildingId: number, type: UnitType): CommandResult {
  const b = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!b || b.built < 1) return { ok: false, reason: 'Bâtiment indisponible.' };
  if (!BUILDINGS[b.type].trains?.includes(type))
    return { ok: false, reason: 'Formation impossible ici.' };
  if (b.eff <= 0) return { ok: false, reason: 'Le bâtiment est à l’arrêt.' };
  const def = UNITS[type];
  if (!canAfford(state, def.cost)) return { ok: false, reason: 'Ressources insuffisantes.' };
  if (state.city.population < def.citizens) return { ok: false, reason: 'Pas assez de citoyens.' };
  pay(state, def.cost);
  state.city.population -= def.citizens;
  b.queue.push(type);
  return { ok: true };
}

export function orderMove(state: GameState, unitIds: number[], x: number, y: number): boolean {
  if (!inBounds(state, x, y) || !isWalkableKind(state.tiles[idx(state, x, y)].k)) return false;
  let any = false;
  for (const id of unitIds) {
    const unit = state.units.find((u) => u.id === id);
    if (!unit) continue;
    const path = findPath(state, Math.floor(unit.x), Math.floor(unit.y), x, y);
    if (!path) continue;
    // A unit on a job drops it: the order wins.
    const job = state.jobs.find((j) => j.id === unit.jobId);
    if (job) {
      job.unitId = null;
      job.deliver = false;
      const pickup = state.pickups.find((p) => p.claimedBy === unit.id);
      if (pickup) pickup.claimedBy = null;
    }
    dropCarried(state, unit);
    unit.jobId = null;
    unit.path = path;
    unit.order = idx(state, x, y);
    any = true;
  }
  return any;
}

export const setTaxLevel = (state: GameState, level: 0 | 1 | 2 | 3): void => {
  state.city.taxLevel = level;
};

export const togglePolicy = (state: GameState, policy: PolicyId): void => {
  state.city.policies[policy] = !state.city.policies[policy];
};
