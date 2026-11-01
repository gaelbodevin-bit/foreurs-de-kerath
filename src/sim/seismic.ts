import { BUILDINGS } from '../data/buildings';
import { REGIONS, sectorAt, type RegionDef } from '../data/regions';
import { buildingCenter, log } from './entities';
import { idx, isWalkableKind, isWallKind, NEIGHBORS4, setTile, tileAt } from './grid';
import { rand } from './rng';
import type { GameState, SeismicState, SeismicZone, Tremor } from './types';
import { addJob, breakWall } from './workers';

/** Nothing shakes before the crew has had time to settle in. */
const FIRST_TREMOR_AT = 240;
const HISTORY_LENGTH = 40;
/** How long before a tremor a station gives warning, in seconds. */
const WARNING = 20;
/** Below this, the ground only shudders. */
const FALLS_FROM = 2.8;
const HARMS_BUILDINGS_FROM = 3.5;
const UNIT_DAMAGE = 8;
const BUILDING_DAMAGE = 22;
/** A tremor weakens a building but never brings it down: the crew always gets to repair it. */
const BUILDING_FLOOR = 0.2;
const SHORED_DAMAGE = 0.5;
const MAX_FALLS = 40;
/** CITY's own ground is reinforced: nothing falls where its people walk. */
const SETTLEMENT_SOLID = 5.5;

export const emptySeismic = (): SeismicState => ({ zones: {}, history: [] });

/** With a decimal comma: this is what the player reads. */
export const formatMagnitude = (magnitude: number): string =>
  magnitude.toFixed(1).replace('.', ',');

/** How far a tremor of this magnitude is felt, in tiles. */
export const tremorRadius = (magnitude: number): number => 1 + (magnitude - 1.5) * 1.3;

export const riskName = (region: RegionDef): string => {
  const peak = region.seismic.magnitude[1];
  return peak < 5 ? 'Faible' : peak < 6 ? 'Modéré' : peak < 7 ? 'Élevé' : 'Extrême';
};

/** A station on the grid reads the crust: it is what makes the next tremor known in advance. */
export const hasSeismicStation = (state: GameState): boolean =>
  state.buildings.some((b) => b.type === 'seismo' && b.built >= 1 && b.eff > 0);

/** Small tremors are the rule, and the top of a zone's range the exception. */
function schedule(state: GameState, region: RegionDef): SeismicZone {
  const { every, magnitude } = region.seismic;
  const [low, high] = magnitude;
  const draw = rand(state);
  return {
    nextAt: Math.max(FIRST_TREMOR_AT, state.time + every * (0.7 + rand(state) * 0.6)),
    nextMagnitude: Math.round((low + (high - low) * draw * draw) * 10) / 10,
    warned: false,
  };
}

/** Runs once a second. Only the sectors already open shake: the others are too far to be felt. */
export function updateSeismic(state: GameState): void {
  for (const region of REGIONS) {
    if (state.sectorStart[region.id] === undefined) continue;
    const zone = (state.seismic.zones[region.id] ??= schedule(state, region));
    if (!zone.warned && state.time >= zone.nextAt - WARNING && hasSeismicStation(state)) {
      zone.warned = true;
      log(
        state,
        `Station sismique : magnitude ${formatMagnitude(zone.nextMagnitude)} attendue sous peu, ${region.name}.`,
        'warn',
      );
      state.fx.push({ kind: 'sound', id: 'alert' });
    }
    if (state.time < zone.nextAt) continue;
    const epicentre = pickEpicentre(state, region);
    if (epicentre) strike(state, region, epicentre.x, epicentre.y, zone.nextMagnitude);
    state.seismic.zones[region.id] = schedule(state, region);
  }
}

/** Where the colony has been: a tremor in rock nobody has seen would be felt by nobody. */
function pickEpicentre(state: GameState, region: RegionDef): { x: number; y: number } | null {
  const sector = REGIONS.indexOf(region);
  const known: number[] = [];
  state.tiles.forEach((tile, i) => {
    if (!tile.seen || !isWalkableKind(tile.k)) return;
    if (sectorAt(i % state.w, Math.floor(i / state.w), state.w, state.h).index === sector) {
      known.push(i);
    }
  });
  if (known.length === 0) return null;
  const i = known[Math.floor(rand(state) * known.length)];
  return { x: i % state.w, y: Math.floor(i / state.w) };
}

/** Within reach of a built prop, nothing falls and buildings take half the damage. */
export function isShored(state: GameState, x: number, y: number): boolean {
  return state.buildings.some((b) => {
    const reach = BUILDINGS[b.type].shoring;
    if (!reach || b.built < 1) return false;
    const center = buildingCenter(b);
    return Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y) <= reach;
  });
}

export function strike(
  state: GameState,
  region: RegionDef,
  x: number,
  y: number,
  magnitude: number,
): Tremor {
  const radius = tremorRadius(magnitude);
  const hazard = state.mods.hazard;
  const fallenTiles = magnitude >= FALLS_FROM ? bringDownRock(state, x, y, magnitude, radius) : [];

  // Whoever stands under what falls gets hit, once.
  for (const unit of state.units) {
    const hit = fallenTiles.some((i) => {
      const tx = i % state.w;
      const ty = Math.floor(i / state.w);
      return Math.hypot(unit.x - tx - 0.5, unit.y - ty - 0.5) < 1;
    });
    if (hit) unit.hp -= (magnitude - 2) * UNIT_DAMAGE * hazard;
  }

  let damaged = 0;
  if (magnitude >= HARMS_BUILDINGS_FROM) {
    for (const b of state.buildings) {
      const center = buildingCenter(b);
      const falloff = 1 - Math.hypot(center.x - x, center.y - y) / radius;
      if (falloff <= 0) continue;
      const shored = isShored(state, Math.floor(center.x), Math.floor(center.y));
      const damage =
        (magnitude - HARMS_BUILDINGS_FROM + 1) *
        BUILDING_DAMAGE *
        falloff *
        hazard *
        (shored ? SHORED_DAMAGE : 1);
      b.hp = Math.max(Math.min(b.hp, BUILDINGS[b.type].hp * BUILDING_FLOOR), b.hp - damage);
      damaged++;
    }
  }

  const tremor: Tremor = {
    t: state.time,
    x,
    y,
    magnitude,
    sector: region.id,
    fallen: fallenTiles.length,
  };
  state.seismic.history.push(tremor);
  if (state.seismic.history.length > HISTORY_LENGTH) state.seismic.history.shift();

  const heavy = fallenTiles.length > 0 || damaged > 0;
  const effects = [
    fallenTiles.length > 0 ? `${fallenTiles.length} cases éboulées` : '',
    damaged > 0
      ? `${damaged} bâtiment${damaged > 1 ? 's' : ''} touché${damaged > 1 ? 's' : ''}`
      : '',
  ].filter(Boolean);
  log(
    state,
    `Secousse de magnitude ${formatMagnitude(magnitude)}, ${region.name}${effects.length > 0 ? ` : ${effects.join(', ')}` : ''}.`,
    heavy ? 'warn' : 'info',
  );
  state.fx.push({ kind: 'quake', x: x + 0.5, y: y + 0.5, magnitude });
  state.fx.push({ kind: 'sound', id: 'collapse', x: x + 0.5, y: y + 0.5 });
  if (heavy) state.fx.push({ kind: 'voice', id: 'collapse' });
  fallenTiles.slice(0, 6).forEach((i) => {
    state.fx.push({
      kind: 'burst',
      x: (i % state.w) + 0.5,
      y: Math.floor(i / state.w) + 0.5,
      color: 0xa08a6e,
    });
  });
  return tremor;
}

/**
 * The rock lets go along the walls: rubble comes down at their feet, to be cleared, and loose rock
 * caves in. Roads are reinforced and hold. Returns the tiles that took a fall.
 */
function bringDownRock(
  state: GameState,
  x: number,
  y: number,
  magnitude: number,
  radius: number,
): number[] {
  const occupied = new Set<number>();
  for (const b of state.buildings) {
    const size = BUILDINGS[b.type].size;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) occupied.add(idx(state, b.x + dx, b.y + dy));
    }
  }
  const place = state.settlement;
  const fallen: number[] = [];
  const reach = Math.ceil(radius);
  for (let ty = y - reach; ty <= y + reach; ty++) {
    for (let tx = x - reach; tx <= x + reach; tx++) {
      if (fallen.length >= MAX_FALLS) return fallen;
      const tile = tileAt(state, tx, ty);
      if (!tile?.seen) continue;
      const distance = Math.hypot(tx - x, ty - y);
      if (distance > radius) continue;
      if (place && Math.hypot(tx - place.x, ty - place.y) < SETTLEMENT_SOLID) continue;
      if (tile.k !== 'floor' && tile.k !== 'loose') continue;
      const i = idx(state, tx, ty);
      if (occupied.has(i) || isShored(state, tx, ty)) continue;
      const atWall = NEIGHBORS4.some(([dx, dy]) => {
        const next = tileAt(state, tx + dx, ty + dy);
        return next !== undefined && isWallKind(next.k);
      });
      if (!atWall) continue;
      const chance = (1 - distance / radius) * (magnitude / 8) * state.mods.hazard;
      if (rand(state) >= chance) continue;
      if (tile.k === 'loose') {
        breakWall(state, tx, ty, true);
      } else {
        setTile(state, tx, ty, 'rubble');
        tile.rubble = 1;
        tile.work = 0;
        addJob(state, 'clear', tx, ty);
      }
      fallen.push(i);
    }
  }
  return fallen;
}
