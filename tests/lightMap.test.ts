import { describe, expect, it } from 'vitest';
import { computeLightMap } from '../src/render/lightMap';
import { createBuilding } from '../src/sim/entities';
import { createGame } from '../src/sim/game';
import type { GameState } from '../src/sim/types';

function lit(state: GameState): (x: number, y: number) => number {
  const levels = new Float32Array(state.w * state.h);
  computeLightMap(state, levels);
  return (x, y) => levels[y * state.w + x];
}

describe('lumière de la caverne', () => {
  it('baisse en s’éloignant du Noyau, jusqu’au noir', () => {
    const state = createGame(1);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const light = lit(state);
    expect(light(hq.x, hq.y)).toBe(1);
    expect(light(hq.x + 7, hq.y)).toBeLessThan(light(hq.x + 3, hq.y));
    expect(light(hq.x + 20, hq.y)).toBe(0);
  });

  it('le sol technique éclaire autour de lui, une fois découvert et sous tension', () => {
    const state = createGame(1);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const x = hq.x + 25;
    const road = state.tiles[hq.y * state.w + x];
    road.k = 'path';
    road.seen = false;
    expect(lit(state)(x, hq.y)).toBe(0);
    road.seen = true;
    expect(lit(state)(x, hq.y)).toBe(0);
    road.powered = true;
    const light = lit(state);
    expect(light(x, hq.y)).toBe(1);
    expect(light(x + 2, hq.y)).toBeGreaterThan(0);
    expect(light(x + 6, hq.y)).toBe(0);
  });

  it('un bâtiment sans courant n’éclaire presque plus, et un chantier pas du tout', () => {
    const state = createGame(1);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const x = hq.x + 25;
    const site = createBuilding(state, 'lab', x, hq.y, 0);
    expect(lit(state)(x, hq.y)).toBe(0);
    site.built = 1;
    site.eff = 1;
    const on = lit(state)(x + 5, hq.y);
    site.eff = 0;
    const off = lit(state)(x + 5, hq.y);
    expect(off).toBeLessThan(on);
    expect(lit(state)(x, hq.y)).toBeCloseTo(0.6);
  });
});
