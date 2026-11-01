import { describe, expect, it } from 'vitest';
import { readSave, writeSave, type SaveStorage } from '../src/campaign/save';
import { BUILDINGS, BUILD_MENUS } from '../src/data/buildings';
import { CITY_MINERS } from '../src/data/progression';
import { REGIONS } from '../src/data/regions';
import { updateEconomy, updateNetwork } from '../src/sim/economy';
import { createBuilding } from '../src/sim/entities';
import { createGame, stepGame } from '../src/sim/game';
import { isWalkableKind, reveal } from '../src/sim/grid';
import { hasSeismicStation, isShored, strike, tremorRadius } from '../src/sim/seismic';
import type { GameState } from '../src/sim/types';

const ash = REGIONS[0];

/** A known room far from the headquarters, with a wall along its north side. */
function room(state: GameState): { x: number; y: number } {
  const hq = state.buildings.find((b) => b.type === 'hq')!;
  const x = hq.x + 22;
  const y = hq.y;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const tile = state.tiles[(y + dy) * state.w + x + dx];
      tile.k = dy === -6 ? 'dirt' : 'floor';
      tile.seen = true;
    }
  }
  return { x, y: y - 3 };
}

const rubbleCount = (state: GameState): number =>
  state.tiles.filter((t) => t.k === 'rubble').length;

describe('secousses', () => {
  it('chaque zone a sa propre activité, et le sous-sol est plus violent en profondeur', () => {
    for (const region of REGIONS) {
      expect(region.seismic.magnitude[0]).toBeLessThan(region.seismic.magnitude[1]);
    }
    const peak = (id: string) => REGIONS.find((r) => r.id === id)!.seismic.magnitude[1];
    expect(peak('core')).toBeGreaterThan(peak('ash'));
    expect(tremorRadius(6)).toBeGreaterThan(tremorRadius(3));
  });

  it('surviennent de temps à autre, et restent dans l’historique avec leur magnitude', () => {
    const state = createGame(5);
    for (let i = 0; i < 12000 && state.seismic.history.length < 2; i++) {
      state.story.pending = [];
      stepGame(state);
    }
    expect(state.seismic.history.length).toBeGreaterThanOrEqual(2);
    const [first, second] = state.seismic.history;
    expect(first.t).toBeGreaterThanOrEqual(240);
    expect(second.t - first.t).toBeGreaterThan(100);
    expect(first.sector).toBe('ash');
    expect(first.magnitude).toBeGreaterThanOrEqual(ash.seismic.magnitude[0]);
    expect(first.magnitude).toBeLessThanOrEqual(ash.seismic.magnitude[1]);
  });

  it('une forte secousse fait tomber la roche au pied des murs, mais pas sur les routes', () => {
    const state = createGame(5);
    const { x, y } = room(state);
    const before = rubbleCount(state);
    const road = state.tiles[(y - 2) * state.w + x];
    road.k = 'path';
    const tremor = strike(state, ash, x, y, 7);
    expect(tremor.fallen).toBeGreaterThan(0);
    expect(rubbleCount(state)).toBeGreaterThan(before);
    expect(road.k).toBe('path');
    expect(state.jobs.some((j) => j.kind === 'clear')).toBe(true);
    for (const t of state.tiles) if (t.k === 'rubble') expect(isWalkableKind(t.k)).toBe(true);
  });

  it('une petite secousse ne fait que trembler le sol', () => {
    const state = createGame(5);
    const { x, y } = room(state);
    const before = rubbleCount(state);
    const tremor = strike(state, ash, x, y, 2.2);
    expect(tremor.fallen).toBe(0);
    expect(rubbleCount(state)).toBe(before);
  });

  it('abîme les bâtiments sans jamais les abattre, le Noyau compris', () => {
    const state = createGame(5);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    for (let i = 0; i < 30; i++) strike(state, ash, hq.x, hq.y, 7.8);
    expect(state.buildings).toContain(hq);
    expect(hq.hp).toBeGreaterThan(0);
    expect(hq.hp).toBeLessThan(BUILDINGS.hq.hp);
  });

  it('un étai protège ce qui l’entoure', () => {
    const state = createGame(5);
    const { x, y } = room(state);
    expect(isShored(state, x, y)).toBe(false);
    createBuilding(state, 'prop', x, y + 1, 1);
    expect(isShored(state, x, y)).toBe(true);
    strike(state, ash, x, y, 7);
    state.tiles.forEach((tile, i) => {
      if (isShored(state, i % state.w, Math.floor(i / state.w))) expect(tile.k).not.toBe('rubble');
    });
  });

  it('une station sous tension annonce la secousse à venir', () => {
    const state = createGame(5);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    expect(hasSeismicStation(state)).toBe(false);
    const station = createBuilding(state, 'seismo', hq.x + 2, hq.y, 1);
    updateNetwork(state);
    updateEconomy(state);
    expect(station.connected).toBe(true);
    expect(hasSeismicStation(state)).toBe(true);
    for (let i = 0; i < 6000 && !state.seismic.zones.ash?.warned; i++) {
      state.story.pending = [];
      stepGame(state);
    }
    expect(state.seismic.zones.ash.warned).toBe(true);
    expect(state.log.some((l) => l.text.startsWith('Station sismique'))).toBe(true);
    expect(state.seismic.history).toHaveLength(0);
  });
});

describe('les mineurs de CITY', () => {
  const miners = (state: GameState) => state.units.filter((u) => u.type === 'foreur').length;

  it(`rejoindre la cité donne au moins ${CITY_MINERS} mineurs, sur un sol praticable`, () => {
    expect(CITY_MINERS).toBeGreaterThanOrEqual(10);
    const state = createGame(1);
    const before = miners(state);
    const place = state.settlement!;
    reveal(state, place.x, place.y);
    for (let i = 0; i < 20; i++) {
      state.story.pending = [];
      stepGame(state);
    }
    expect(miners(state)).toBe(before + CITY_MINERS);
    for (const u of state.units) {
      expect(isWalkableKind(state.tiles[Math.floor(u.y) * state.w + Math.floor(u.x)].k)).toBe(true);
    }
  });

  it('une partie déjà à CITY les reçoit au chargement, une seule fois', () => {
    const memory = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => void memory.set(k, v),
      removeItem: (k) => void memory.delete(k),
    };
    const state = createGame(1);
    const before = miners(state);
    state.settlement!.reached = true;
    writeSave(storage, state);
    const loaded = readSave(storage)!;
    expect(miners(loaded)).toBe(before + CITY_MINERS);
    writeSave(storage, loaded);
    expect(miners(readSave(storage)!)).toBe(before + CITY_MINERS);
  });
});

describe('nouveaux bâtiments', () => {
  it('figurent tous au menu', () => {
    const listed = BUILD_MENUS.flatMap((m) => m.groups.flatMap((g) => g.buildings));
    for (const type of ['seismo', 'prop', 'canteen', 'academy', 'geothermal', 'silo'] as const) {
      expect(listed).toContain(type);
    }
  });

  it('la cantine fait durer la nourriture, et le silo agrandit les réserves', () => {
    const eaten = (withCanteen: boolean) => {
      const state = createGame(1);
      state.settlement!.reached = true;
      const hq = state.buildings.find((b) => b.type === 'hq')!;
      if (withCanteen) createBuilding(state, 'canteen', hq.x + 2, hq.y, 1);
      updateNetwork(state);
      state.stock.food = 100;
      for (let i = 0; i < 100; i++) updateEconomy(state);
      return 100 - state.stock.food;
    };
    expect(eaten(true)).toBeLessThan(eaten(false));
    expect(BUILDINGS.silo.storage).toBeGreaterThan(BUILDINGS.depot.storage!);
  });
});
