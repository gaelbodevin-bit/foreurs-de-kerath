import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { regionById, REGIONS } from '../src/data/regions';
import {
  applyMissionResult,
  missionContext,
  newCampaign,
  buyTech,
  TECHS,
  type Campaign,
} from '../src/campaign/campaign';
import {
  availableBuildings,
  canPlaceBuilding,
  createMission,
  designateArea,
  placeBuilding,
  objectiveProgress,
  orderMove,
  placePath,
  stepGame,
  trainUnit,
} from '../src/sim/game';
import { canAfford, hasRoomFor } from '../src/sim/economy';
import { WALLS } from '../src/data/resources';
import { answerEvent } from '../src/sim/storyEngine';
import type { BuildingType, GameState } from '../src/sim/types';

const TRACE = import.meta.env.VITE_TRACE === '1';

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

  // Drill: everything visible with a seam first, soft rock to expand.
  const openDrills = state.jobs.filter((j) => j.kind === 'drill').length;
  const drillers = state.units.filter((u) => u.type === 'foreur' || u.type === 'heavy').length;
  const backlog = state.pickups.filter((p) => hasRoomFor(state, p.res)).length;
  if (openDrills < drillers + 2 && backlog < 16) {
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
  const available = availableBuildings(state.regionId);
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
  if (count(state, 'turret') < 2 + state.waves.count) want.push('turret');
  if (count(state, 'barracks') < 1) want.push('barracks');
  if (count(state, 'refinery') < 2) want.push('refinery');
  if (count(state, 'workshop') < 1) want.push('workshop');
  if (count(state, 'lab') < 1) want.push('lab');
  if (count(state, 'security') < 1) want.push('security');
  if (count(state, 'foundry') < 1) want.push('foundry');
  if (count(state, 'clinic') < 1) want.push('clinic');
  // Once the city is big enough for the mission, stop spending and let the stocks fill up.
  const region = regionById(state.regionId);
  const goalPop = region.objectives.reduce((n, o) => (o.kind === 'population' ? o.amount : n), 12);
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

function playRegion(campaign: Campaign, regionId: string, maxMinutes: number): GameState {
  const state = createMission(regionId, missionContext(campaign));
  const ticks = maxMinutes * 600;
  for (let i = 0; i < ticks && state.outcome === 'playing'; i++) {
    botTurn(state);
    stepGame(state);
    if (TRACE && state.tick % 300 === 0) {
      const s = state.stock;
      console.info(
        `${regionId} t=${state.time} pop=${state.city.population}/${state.city.housing} mor=${state.city.morale.toFixed(0)} o2=${state.city.oxygen.toFixed(0)} cons=${state.city.conspiracy.toFixed(0)} ore=${s.ore} cry=${s.crystal} sto=${s.stone} ice=${s.ice} wat=${s.water} food=${s.food.toFixed(0)} cr=${s.credits.toFixed(0)} met=${s.metal} alloy=${s.alloy} P=${state.power.produced.toFixed(0)}/${state.power.demand} units=${state.units.length} en=${state.enemies.length} jobs=${state.jobs.length} b=${state.buildings.map((b) => b.type + (b.built < 1 ? '*' : '')).join(',')}`,
      );
    }
    state.fx = [];
    state.dirty = [];
  }
  return state;
}

describe('partie complète (joueur automatique)', () => {
  it('le Val de Cendre se gagne en moins de 25 minutes', () => {
    const state = playRegion(newCampaign(11), 'ash', 25);
    expect(state.outcomeReason).toContain(regionById('ash').name);
    expect(state.outcome).toBe('won');
  });

  it('la simulation est reproductible', () => {
    const a = playRegion(newCampaign(3), 'ash', 2);
    const b = playRegion(newCampaign(3), 'ash', 2);
    expect(a.stock).toEqual(b.stock);
    expect(a.rng).toBe(b.rng);
  });

  it('les régions suivantes tiennent la route sans plantage', () => {
    let campaign = newCampaign(11);
    const report: string[] = [];
    for (const region of REGIONS) {
      const state = playRegion(campaign, region.id, 30);
      const goals = region.objectives
        .map((o) => {
          const p = objectiveProgress(state, o);
          return `${p.label} ${p.value}/${p.goal}`;
        })
        .join(' | ');
      report.push(
        `${region.id}: ${state.outcome} t=${Math.round(state.time)} units=${state.units.length} en=${state.enemies.length} seen=${state.tiles.filter((t) => t.seen).length} :: ${goals}`,
      );
      state.outcome = 'won';
      campaign = applyMissionResult(campaign, state);
      for (const tech of TECHS) campaign = buyTech(campaign, tech.id) ?? campaign;
      expect(Number.isFinite(state.stock.credits)).toBe(true);
    }
    console.info(report.join('\n'));
  }, 240_000);
});
