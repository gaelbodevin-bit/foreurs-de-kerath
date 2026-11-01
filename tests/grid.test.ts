import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { gridReach } from '../src/data/progression';
import { updateNetwork } from '../src/sim/economy';
import { createBuilding } from '../src/sim/entities';
import { createGame, stepGame } from '../src/sim/game';
import type { Building, GameState } from '../src/sim/types';

/** A long road heading east from the headquarters, on open and known ground. */
function longRoad(length: number): { state: GameState; hq: Building; y: number } {
  const state = createGame(1);
  const hq = state.buildings.find((b) => b.type === 'hq')!;
  const y = hq.y;
  for (let dx = 2; dx < 2 + length; dx++) {
    const tile = state.tiles[y * state.w + hq.x + dx];
    tile.k = 'path';
    tile.seen = true;
  }
  return { state, hq, y };
}

describe('portée du réseau', () => {
  it('le courant s’épuise le long du sol technique', () => {
    const { state, hq, y } = longRoad(40);
    updateNetwork(state);
    const reach = gridReach(BUILDINGS.hq.powerOutput!);
    const road = (dx: number) => state.tiles[y * state.w + hq.x + dx];
    expect(road(2).powered).toBe(true);
    expect(road(1 + reach).powered).toBe(true);
    expect(road(2 + reach).powered).toBeFalsy();
    expect(road(30).powered).toBeFalsy();
  });

  it('un bâtiment au bout d’une voie éteinte reste hors réseau', () => {
    const { state, hq, y } = longRoad(40);
    const near = createBuilding(state, 'turret', hq.x + 5, y + 1, 1);
    const far = createBuilding(state, 'turret', hq.x + 30, y + 1, 1);
    updateNetwork(state);
    expect(near.connected).toBe(true);
    expect(far.connected).toBe(false);
  });

  it('une centrale en marche relance le courant, à l’arrêt elle ne porte plus rien', () => {
    const { state, hq, y } = longRoad(40);
    createBuilding(state, 'generator', hq.x + 8, y + 1, 1);
    const far = state.tiles[y * state.w + hq.x + 30];
    state.stock.crystal = 5;
    updateNetwork(state);
    expect(far.powered).toBe(true);
    state.stock.crystal = 0;
    updateNetwork(state);
    expect(far.powered).toBe(false);
  });

  it('une centrale hors de portée ne démarre pas toute seule', () => {
    const { state, hq, y } = longRoad(40);
    const plant = createBuilding(state, 'generator', hq.x + 30, y + 1, 1);
    state.stock.crystal = 5;
    updateNetwork(state);
    expect(plant.connected).toBe(false);
  });

  it('les dalles qui changent d’état sont redessinées', () => {
    const { state, hq, y } = longRoad(4);
    updateNetwork(state);
    state.dirty = [];
    updateNetwork(state);
    expect(state.dirty).toEqual([]);
    state.tiles[y * state.w + hq.x + 2].k = 'floor';
    updateNetwork(state);
    expect(state.dirty).toContain(y * state.w + hq.x + 3);
  });

  it('une conseillère prévient, une seule fois, quand le courant ne porte plus', () => {
    const { state } = longRoad(40);
    const hasAsked = () => state.story.fired.filter((id) => id === 'grid_short').length;
    expect(hasAsked()).toBe(0);
    for (let i = 0; i < 40; i++) {
      state.story.pending = [];
      stepGame(state);
    }
    expect(hasAsked()).toBe(1);
    expect(state.log.some((l) => l.text.includes('sol technique s’éteint'))).toBe(true);
    for (let i = 0; i < 40; i++) {
      state.story.pending = [];
      stepGame(state);
    }
    expect(hasAsked()).toBe(1);
  });

  it('une voie isolée, encore loin de tout, ne donne pas l’alerte', () => {
    const state = createGame(1);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const tile = state.tiles[hq.y * state.w + hq.x + 40];
    tile.k = 'path';
    tile.seen = true;
    updateNetwork(state);
    expect(tile.powered).toBeFalsy();
    expect(state.story.flags.gridShort).toBeFalsy();
  });
});
