import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { WORLD_SIZE } from '../src/data/regions';
import { deliverContract, contractStatus } from '../src/sim/contracts';
import { TECHS } from '../src/data/techs';
import { activeRegions, availableBuildings, buyTech, planetControl } from '../src/sim/progress';
import {
  canPlaceBuilding,
  createGame,
  designateArea,
  placeBuilding,
  orderMove,
  placePath,
  stepGame,
  trainUnit,
} from '../src/sim/game';
import { canAfford, hasRoomFor } from '../src/sim/economy';
import { WALLS } from '../src/data/resources';
import { answerEvent } from '../src/sim/storyEngine';
import type { BuildingType, GameState } from '../src/sim/types';

const count = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t).length;

/** Finds a free spot next to the existing network, so everything stays connected. */
function spotNear(state: GameState, type: BuildingType): { x: number; y: number } | null {
  const hq = state.buildings.find((b) => b.type === 'hq')!;
  const size = BUILDINGS[type].size;
  for (let r = 2; r < 18; r++) {
    for (let y = hq.y - r; y <= hq.y + r; y++) {
      for (let x = hq.x - r; x <= hq.x + r; x++) {
        if (Math.max(Math.abs(x - hq.x), Math.abs(y - hq.y)) !== r) continue;
        if (!canPlaceBuilding(state, type, x, y).ok) continue;
        const touching = [
          [-1, 0],
          [size, 0],
          [0, -1],
          [0, size],
        ].some(
          ([dx, dy]) =>
            state.buildings.some((b) => {
              const s = BUILDINGS[b.type].size;
              return x + dx >= b.x && x + dx < b.x + s && y + dy >= b.y && y + dy < b.y + s;
            }) || state.tiles[(y + dy) * state.w + x + dx]?.k === 'path',
        );
        if (touching) return { x, y };
      }
    }
  }
  return null;
}

/** A plain, greedy player: enough to prove each mission can be finished through the commands the UI uses. */
function botTurn(state: GameState): void {
  while (state.story.pending.length > 0) answerEvent(state, 0);
  if (state.tick % 40 !== 0) return;

  const hq = state.buildings.find((b) => b.type === 'hq');
  if (!hq) return;

  // First things first: the tunnel to CITY, one reachable stretch at a time.
  const place = state.settlement;
  if (place && !place.reached) {
    const startX = hq.x + 1;
    const startY = hq.y + 1;
    const signX = Math.sign(place.x - startX);
    for (let d = 1; d <= Math.abs(place.x - startX); d++) {
      for (const ox of [0, signX]) {
        const x = startX + signX * d + ox;
        const y = startY + d;
        const tile = state.tiles[y * state.w + x];
        if (!tile.seen || !WALLS[tile.k]) continue;
        if (!state.jobs.some((j) => j.kind === 'drill' && j.x === x && j.y === y)) {
          designateArea(state, x, y, x, y);
        }
      }
    }
  }

  // Drill: everything visible with a seam first, soft rock to expand.
  // A wall seen only diagonally can stay marked for ever: it mustn't stop all further digging.
  const marked = state.jobs.filter((j) => j.kind === 'drill');
  const openDrills = marked.filter((j) => j.unitId !== null).length;
  const drillers = state.units.filter((u) => u.type === 'foreur' || u.type === 'heavy').length;
  const backlog = state.pickups.filter(
    (p) =>
      hasRoomFor(state, p.res) && state.tiles[Math.floor(p.y) * state.w + Math.floor(p.x)].seen,
  ).length;
  if (openDrills < drillers + 2 && marked.length < 40 && backlog < 16) {
    const seams: number[] = [];
    const rock: number[] = [];
    state.tiles.forEach((t, i) => {
      const wall = WALLS[t.k];
      if (!t.seen || !wall) return;
      const x = i % state.w;
      const y = Math.floor(i / state.w);
      if (state.jobs.some((j) => j.kind === 'drill' && j.x === x && j.y === y)) return;
      const reach = Math.max(
        state.mods.drillPower,
        state.units.some((u) => u.type === 'heavy') ? 2 : 1,
      );
      if (wall.power > reach) return;
      (wall.yield ? seams : rock).push(i);
    });
    // Go for whatever the colony is shortest of; open new rock when none of it is in sight.
    const needs = [
      ['crystalSeam', state.stock.crystal, 25],
      ['iceSeam', state.stock.ice, 15],
      ['oreSeam', state.stock.ore, 45],
      ['sulfurSeam', state.stock.sulfur, 15],
      ['relicVault', state.stock.relic, 5],
    ] as const;
    const short = needs
      .filter(([, have, goal]) => have < goal)
      .sort((a, b) => a[1] / a[2] - b[1] / b[2]);
    const urgent = short.flatMap(([kind]) => seams.filter((i) => state.tiles[i].k === kind));
    const pick =
      urgent.length > 0 ? urgent : short.length > 0 ? rock : seams.length > 0 ? seams : rock;
    if (pick === rock || pick === seams)
      pick.sort((a, b) => {
        const da = Math.hypot((a % state.w) - hq.x, Math.floor(a / state.w) - hq.y);
        const db = Math.hypot((b % state.w) - hq.x, Math.floor(b / state.w) - hq.y);
        return da - db;
      });
    for (const i of pick.slice(0, 4))
      designateArea(
        state,
        i % state.w,
        Math.floor(i / state.w),
        i % state.w,
        Math.floor(i / state.w),
      );
  }

  // Build order: oxygen and housing track population; industry then defence.
  // Spend research as soon as it comes in, and hand in what can be handed in.
  for (const tech of TECHS) buyTech(state, tech.id);
  for (const c of [...state.contracts]) {
    if (contractStatus(state, c).ready && c.res && state.stock[c.res] > (c.amount ?? 0) + 15) {
      deliverContract(state, c.id);
    }
  }

  const available = availableBuildings(state);
  const want: BuildingType[] = [];
  const mouths = state.city.population + state.units.length;
  if (mouths > 13 + count(state, 'oxygen') * 12) want.push('oxygen');
  if (state.city.housing - state.city.population < 4) want.push('habitat');
  if (count(state, 'melter') < 1) want.unshift('melter');
  if (count(state, 'farm') < 1 + Math.floor(mouths / 25)) want.unshift('farm');
  if (
    state.power.demand + 3 > state.power.produced &&
    state.stock.crystal > 2 &&
    count(state, 'generator') < 1 + state.power.demand / 12
  )
    want.unshift('generator');
  if (count(state, 'turret') < Math.min(6, 2 + state.waves.count)) want.push('turret');
  if (count(state, 'barracks') < 1) want.push('barracks');
  if (count(state, 'refinery') < 2) want.push('refinery');
  if (count(state, 'workshop') < 1) want.push('workshop');
  if (count(state, 'lab') < 1) want.push('lab');
  if (count(state, 'security') < 1) want.push('security');
  if (count(state, 'foundry') < 1) want.push('foundry');
  if (count(state, 'clinic') < 1) want.push('clinic');
  // Once the city is big enough for the mission, stop spending and let the stocks fill up.
  const goalPop = activeRegions(state)
    .flatMap((r) => r.objectives)
    .reduce((n, o) => (o.kind === 'population' ? Math.max(n, o.amount) : n), 12);
  const settled = state.city.population >= goalPop && state.city.oxygen > 40;
  const shopping = settled
    ? want.filter((t) =>
        [
          'farm',
          'generator',
          'oxygen',
          'melter',
          'refinery',
          'foundry',
          'barracks',
          'workshop',
        ].includes(t),
      )
    : want;
  for (const type of shopping) {
    if (!available.includes(type) || !canAfford(state, BUILDINGS[type].cost)) continue;
    const spot = spotNear(state, type);
    if (spot) {
      placeBuilding(state, type, spot.x, spot.y);
      break;
    }
    // No room next to the network: clear the rubble around the HQ, it will open up.
    placePath(state, hq.x - 4, hq.y - 4, hq.x + 5, hq.y + 5);
  }

  // Units.
  if (state.units.filter((u) => u.type === 'foreur').length < 8) trainUnit(state, hq.id, 'foreur');
  const barracks = state.buildings.find((b) => b.type === 'barracks' && b.built >= 1);
  const raiders = state.units.filter((u) => u.type === 'garde').length;
  if (barracks && raiders < 4 + state.waves.count * 2 && barracks.queue.length < 2)
    trainUnit(state, barracks.id, 'garde');
  const workshop = state.buildings.find((b) => b.type === 'workshop' && b.built >= 1);
  if (
    workshop &&
    state.units.filter((u) => u.type === 'heavy').length < 2 &&
    workshop.queue.length < 1
  ) {
    trainUnit(state, workshop.id, 'heavy');
  }

  // Assault: send the whole guard to discovered enemy structures.
  const structure = state.enemies.find((e) => {
    const t = state.tiles[Math.floor(e.y) * state.w + Math.floor(e.x)];
    return t.seen && ['nest', 'outpost', 'heart'].includes(e.type);
  });
  if (structure && raiders >= 4 && state.tick % 200 === 0) {
    const guards = state.units
      .filter((u) => u.type === 'garde' && u.order === null)
      .map((u) => u.id);
    const ex = Math.floor(structure.x);
    const ey = Math.floor(structure.y);
    for (const [dx, dy] of [
      [3, 0],
      [-3, 0],
      [0, 3],
      [0, -3],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      if (orderMove(state, guards, ex + dx, ey + dy)) break;
    }
  }
}

function playGame(seed: number, minutes: number): GameState {
  const state = createGame(seed);
  const ticks = minutes * 600;
  for (let i = 0; i < ticks && state.outcome === 'playing'; i++) {
    botTurn(state);
    stepGame(state);
    state.fx = [];
    state.dirty = [];
  }
  return state;
}

describe('partie complète (joueur automatique)', () => {
  it('le premier secteur tombe en moins de 25 minutes, et la cité a grandi', () => {
    let state = createGame(11);
    for (let i = 0; i < 25 * 600 && !state.conquered.includes('ash'); i++) {
      botTurn(state);
      stepGame(state);
      state.fx = [];
      state.dirty = [];
    }
    expect(state.conquered).toContain('ash');
    expect(state.cityLevel).toBeGreaterThanOrEqual(1);
    state = createGame(11);
    expect(state.conquered).toEqual([]);
  });

  it('la simulation est reproductible', () => {
    const a = playGame(3, 3);
    const b = playGame(3, 3);
    expect(a.stock).toEqual(b.stock);
    expect(a.rng).toBe(b.rng);
    expect(a.contracts.map((c) => c.id)).toEqual(b.contracts.map((c) => c.id));
  });

  it('une longue partie tient la route sur une seule carte, sans plantage', () => {
    const state = playGame(11, 60);
    console.info(
      `${state.outcome} t=${Math.round(state.time)} pop=${Math.floor(state.city.population)} rang=${state.cityLevel} contrôle=${planetControl(state)} % secteurs=${state.conquered.join(',')} techs=${state.techs.length} bât=${state.buildings.length} unités=${state.units.length} vu=${state.tiles.filter((t) => t.seen).length} raison=${state.outcomeReason}`,
    );
    expect(Number.isFinite(state.stock.credits)).toBe(true);
    expect(state.w).toBe(WORLD_SIZE);
  }, 240_000);
});
