import { BUILDINGS, CITY_BUILDINGS } from '../data/buildings';
import { REGIONS, sectorAt } from '../data/regions';
import { CITY_MINERS, CITY_SETTLERS, cityRadius, FIRST_CONTRACT_AT } from '../data/progression';
import { ADVISOR_IDS } from '../data/story';
import { RESOURCES, TILE_NAMES, WALLS } from '../data/resources';
import { UNITS } from '../data/units';
import { updateCombat } from './combat';
import { addStock, canAfford, pay, storageCapacity, updateEconomy, updateNetwork } from './economy';
import { updateCouncil, foundCouncil } from './council';
import { createBuilding, log, spawnEnemy, spawnPickup, spawnUnit } from './entities';
import { updateGas } from './gas';
import { emptySeismic, updateSeismic } from './seismic';
import { idx, inBounds, isWalkableKind, NEIGHBORS4, reveal, setTile, tileAt } from './grid';
import { generateWorld } from './mapgen';
import { findPath } from './pathfinding';
import { buildingLock, isWorldConquered, updateProgress } from './progress';
import { rand, Rng } from './rng';
import { updateContracts } from './contracts';
import { updateStory } from './storyEngine';
import type {
  BuildingType,
  Cost,
  GameState,
  PolicyId,
  ResourceId,
  StoryState,
  UnitType,
} from './types';
import { baseModifiers, emptyStock, RESOURCE_IDS, TICK_SECONDS } from './types';
import { addJob, dropCarried, removeJob, updateRepairs } from './workers';

/** Keeps the crew from building over the settlement's own structures. */
const SETTLEMENT_CLEARANCE = 5.5;
const START_STOCK: Cost = { ore: 32, crystal: 6, stone: 20, food: 45, water: 8, credits: 80 };
const START_POPULATION = 6;
const START_FOREURS = 4;
const START_GUARDS = 1;
const FIRST_RAID_AT = 360;
const LAIR_LOOT: ResourceId[] = ['gold', 'crystal', 'crystal', 'ore'];

/** The one and only game: a single map, a single city, from the landing to the end of the campaign. */
export function createGame(seed: number): GameState {
  const map = generateWorld(seed);
  const stock = emptyStock();
  for (const r of RESOURCE_IDS) stock[r] = START_STOCK[r] ?? 0;
  const story: StoryState = {
    fired: [],
    flags: {},
    pending: [],
    clues: [],
    moleCaught: false,
    // The traitor is drawn once per game: replays cannot rely on memorising the culprit.
    mole: new Rng(seed).pick(ADVISOR_IDS),
    accused: [],
  };
  const state: GameState = {
    version: 2,
    w: map.w,
    h: map.h,
    tiles: map.tiles,
    settlement: map.settlement ? { ...map.settlement, reached: false } : null,
    tick: 0,
    time: 0,
    rng: (seed * 31 + 1101) | 0,
    nextId: 1,
    stock,
    units: [],
    buildings: [],
    enemies: [],
    pickups: [],
    jobs: [],
    city: {
      population: START_POPULATION,
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
    waves: { nextAt: FIRST_RAID_AT, count: 0 },
    seismic: emptySeismic(),
    kills: {},
    research: 0,
    techs: [],
    cityLevel: 0,
    conquered: [],
    sectorStart: { [REGIONS[0].id]: 0 },
    contracts: [],
    nextContractAt: FIRST_CONTRACT_AT,
    council: [],
    candidates: [],
    nextCandidatesAt: 0,
    governorTrait: null,
    outcome: 'playing',
    outcomeReason: '',
    log: [],
    fx: [],
    dirty: [],
    mods: baseModifiers(),
    networkDirty: true,
  };

  createBuilding(state, 'hq', map.start.x - 1, map.start.y - 1, 1);
  updateNetwork(state);
  reveal(state, map.start.x, map.start.y);
  for (let i = 0; i < START_FOREURS; i++) {
    spawnUnit(
      state,
      'foreur',
      map.start.x + (i % 3) - 1 + 0.5,
      map.start.y + 1.5 + Math.floor(i / 3),
    );
  }
  for (let i = 0; i < START_GUARDS; i++) {
    spawnUnit(state, 'garde', map.start.x + i - 1 + 0.5, map.start.y - 1.5);
  }
  for (const s of map.structures) spawnEnemy(state, s.type, s.x + 0.5, s.y + 0.5);
  for (const lair of map.lairs) {
    lair.monsters.forEach((type, i) => {
      const [dx, dy] = NEIGHBORS4[i % NEIGHBORS4.length];
      const monster = spawnEnemy(state, type, lair.x + dx + 0.5, lair.y + dy + 0.5);
      monster.dormant = true;
    });
    // What the room is worth. Nobody can reach it before a tunnel does.
    for (const res of LAIR_LOOT) {
      const id = spawnPickup(
        state,
        res,
        lair.x + 0.2 + rand(state) * 0.6,
        lair.y + 0.2 + rand(state) * 0.6,
      );
      addJob(state, 'haul', lair.x, lair.y, id);
    }
  }
  log(state, 'Arrivée sur Kerath.', 'info');
  return state;
}

export function stepGame(state: GameState): void {
  if (state.outcome !== 'playing' || state.story.pending.length > 0) return;
  state.tick++;
  state.time = state.tick * TICK_SECONDS;

  updateEconomy(state);
  updateCouncil(state);
  updateCombat(state);

  if (state.tick % 10 === 0) {
    updateRepairs(state);
    updateHazards(state);
    updateSettlement(state);
    updateGas(state);
    updateSeismic(state);
    updateProgress(state);
    updateContracts(state);
    updateStory(state);
    updateOutcome(state);
  }
}

/** Standing around the council's seat. A flag, for saves that reached the city before they came. */
export function spawnCityMiners(state: GameState): void {
  const place = state.settlement;
  if (!place || state.story.flags.cityMiners) return;
  state.story.flags.cityMiners = true;
  for (let i = 0; i < CITY_MINERS; i++) {
    const angle = (i / CITY_MINERS) * Math.PI * 2;
    for (let radius = 3.4; radius >= 0; radius -= 0.4) {
      const x = place.x + 0.5 + Math.cos(angle) * radius;
      const y = place.y + 0.5 + Math.sin(angle) * radius;
      const tile = tileAt(state, Math.floor(x), Math.floor(y));
      if (radius > 0.4 && (!tile || !isWalkableKind(tile.k))) continue;
      spawnUnit(state, 'foreur', x, y);
      break;
    }
  }
}

/** The flood fill of `reveal` only gets to the settlement once a tunnel actually connects it. */
function updateSettlement(state: GameState): void {
  const place = state.settlement;
  if (!place || place.reached || !tileAt(state, place.x, place.y)?.seen) return;
  place.reached = true;
  state.city.population += CITY_SETTLERS;
  addStock(state, 'ore', 20);
  addStock(state, 'stone', 15);
  addStock(state, 'food', 40);
  spawnCityMiners(state);
  // The city's requests start now that there is a city to ask.
  state.nextContractAt = state.time + FIRST_CONTRACT_AT;
  state.research += 5;
  state.story.flags.cityReached = true;
  state.networkDirty = true;
  foundCouncil(state);
  log(
    state,
    `La cité est rejointe : ${CITY_SETTLERS} habitants et ${CITY_MINERS} mineurs s’ajoutent à la colonie.`,
    'good',
  );
  state.fx.push(
    { kind: 'sound', id: 'plot' },
    { kind: 'voice', id: 'reunited' },
    { kind: 'burst', x: place.x + 0.5, y: place.y + 0.5, color: 0x35e0c2 },
  );
}

function updateHazards(state: GameState): void {
  for (let i = 0; i < state.tiles.length; i++) {
    const tile = state.tiles[i];
    if (tile.regrow > 0) {
      tile.regrow -= 1;
      // Grown back: the mushrooms on it need redrawing.
      if (tile.regrow <= 0) state.dirty.push(i);
    }
    if (tile.k !== 'lava' || !tile.seen) continue;
    // Each sector has its own lava: some crusts over, some keeps eating the ground.
    const sector = sectorAt(i % state.w, Math.floor(i / state.w), state.w, state.h).index;
    if (rand(state) >= REGIONS[sector].erosion * state.mods.hazard) continue;
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
  if (isWorldConquered(state) && state.story.pending.length === 0) {
    state.outcome = 'won';
    state.outcomeReason = 'Kerath est sous votre contrôle.';
  }
}

// --- Player commands. Every UI action goes through one of these. ---

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

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

export function inCityZone(state: GameState, x: number, y: number): boolean {
  const radius = cityRadius(state.cityLevel);
  const place = state.settlement;
  if (place?.reached && Math.hypot(x - place.x, y - place.y) <= radius) return true;
  const hq = state.buildings.find((b) => b.type === 'hq');
  if (!hq) return false;
  const half = BUILDINGS.hq.size / 2;
  return Math.hypot(x - hq.x - half, y - hq.y - half) <= radius;
}

export function canPlaceBuilding(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
): CommandResult {
  const def = BUILDINGS[type];
  if (CITY_BUILDINGS.has(type) && !inCityZone(state, x + def.size / 2, y + def.size / 2)) {
    return {
      ok: false,
      reason:
        'Ce bâtiment ne se pose que près du Noyau ou de CITY. Le rang de la cité élargit ces zones.',
    };
  }
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
        return { ok: false, reason: 'Cet espace appartient à CITY.' };
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
  const lock = buildingLock(state, type);
  if (lock) return { ok: false, reason: `Pas encore disponible : ${lock}.` };
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
      const job = state.jobs.find(
        (j) => (j.kind === 'path' || j.kind === 'unpath') && j.x === x + dx && j.y === y + dy,
      );
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
  const queued: number[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = tileAt(state, x, y);
      if (!t || !t.seen || t.k !== 'floor') continue;
      const job = state.jobs.find((j) => j.kind === 'path' && j.x === x && j.y === y);
      if (job) {
        queued.push(job.id);
        continue;
      }
      if (state.buildings.some((b) => tileIsUnder(b.type, b.x, b.y, x, y))) continue;
      addJob(state, 'path', x, y);
      count++;
    }
  }
  // Everything was already queued: this drag is a cancellation, as it is for drilling.
  if (count === 0) for (const id of queued) removeJob(state, id);
  return count;
}

/**
 * Marks the roads in a rectangle to be taken up, and drops roads still waiting to be laid there.
 * Dragging over what is already marked cancels it. Returns how many tiles changed.
 */
export function removePaths(
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const [minX, maxX] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [minY, maxY] = y0 < y1 ? [y0, y1] : [y1, y0];
  let changed = 0;
  const marked: number[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = tileAt(state, x, y);
      if (!t || !t.seen) continue;
      const planned = state.jobs.find((j) => j.kind === 'path' && j.x === x && j.y === y);
      if (planned) {
        removeJob(state, planned.id);
        changed++;
      }
      if (t.k !== 'path') continue;
      // Under a building, the road is part of its foundations.
      if (state.buildings.some((b) => tileIsUnder(b.type, b.x, b.y, x, y))) continue;
      const job = state.jobs.find((j) => j.kind === 'unpath' && j.x === x && j.y === y);
      if (job) {
        marked.push(job.id);
        continue;
      }
      addJob(state, 'unpath', x, y);
      changed++;
    }
  }
  if (changed === 0) {
    for (const id of marked) removeJob(state, id);
    return marked.length;
  }
  return changed;
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
