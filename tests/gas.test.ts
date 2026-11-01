import { describe, expect, it } from 'vitest';
import { BUILD_MENUS, BUILDINGS } from '../src/data/buildings';
import { VOICE_LINES } from '../src/data/voiceLines';
import { WALLS } from '../src/data/resources';
import { createBuilding } from '../src/sim/entities';
import { designateArea, stepGame } from '../src/sim/game';
import { updateGas } from '../src/sim/gas';
import { generateWorld } from '../src/sim/mapgen';
import { answerEvent } from '../src/sim/storyEngine';
import type { BuildingType, GameState } from '../src/sim/types';
import { newGame } from './helpers';

const totalGas = (state: GameState) => state.tiles.reduce((sum, t) => sum + (t.gas ?? 0), 0);

/** Fills the ground around a unit with gas. */
function gasAround(state: GameState, x: number, y: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) state.tiles[(y + dy) * state.w + x + dx].gas = 1;
  }
}

describe('zones de gaz', () => {
  it('la carte en contient, enfermées loin du départ', () => {
    const map = generateWorld(3);
    const gas = map.tiles.flatMap((t, i) => (t.gas ? [i] : []));
    expect(gas.length).toBeGreaterThan(0);
    for (const i of gas) {
      const distance = Math.hypot((i % map.w) - map.start.x, Math.floor(i / map.w) - map.start.y);
      expect(distance).toBeGreaterThan(4);
    }
  });

  it('empoisonne les foreurs, pas les machines', () => {
    const state = newGame(3);
    const foreur = state.units.find((u) => u.type === 'foreur')!;
    const before = foreur.hp;
    gasAround(state, Math.floor(foreur.x), Math.floor(foreur.y));
    updateGas(state);
    expect(foreur.hp).toBeLessThan(before);
    expect(state.fx.some((f) => f.kind === 'voice' && f.id === 'gas')).toBe(true);
  });

  it('un ventilateur alimenté l’aspire, pas un ventilateur éteint', () => {
    const state = newGame(3);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    // Only the gas in reach counts: the map has a sealed cavern of its own.
    for (const tile of state.tiles) tile.gas = 0;
    gasAround(state, hq.x + 4, hq.y + 3);
    const vent = createBuilding(state, 'vent', hq.x + 3, hq.y + 2, 1);
    vent.eff = 0;
    const start = totalGas(state);
    updateGas(state);
    expect(totalGas(state)).toBeCloseTo(start, 3);
    vent.eff = 1;
    for (let i = 0; i < 30; i++) updateGas(state);
    expect(totalGas(state)).toBeLessThan(start * 0.2);
  });
});

describe('gravats', () => {
  it('se déblaient même quand il reste de la roche à forer', () => {
    const state = newGame(3);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const walls: number[] = [];
    state.tiles.forEach((t, i) => {
      if (t.seen && WALLS[t.k]?.power === 1) walls.push(i);
    });
    walls.sort(
      (a, b) =>
        Math.hypot((a % state.w) - hq.x, Math.floor(a / state.w) - hq.y) -
        Math.hypot((b % state.w) - hq.x, Math.floor(b / state.w) - hq.y),
    );
    let worst = 0;
    for (let t = 0; t < 1800; t++) {
      while (state.story.pending.length > 0) answerEvent(state, 0);
      // The player keeps marking rock: the crew always has something left to drill.
      if (t % 100 === 0) {
        for (const i of walls.splice(0, 4)) {
          designateArea(
            state,
            i % state.w,
            Math.floor(i / state.w),
            i % state.w,
            Math.floor(i / state.w),
          );
        }
      }
      stepGame(state);
      worst = Math.max(worst, state.tiles.filter((x) => x.k === 'rubble').length);
    }
    expect(worst).toBeLessThan(10);
  });
});

describe('menus de construction', () => {
  it('rangent chaque bâtiment une seule fois', () => {
    const listed = BUILD_MENUS.flatMap((m) => m.groups.flatMap((g) => g.buildings));
    const expected = (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => t !== 'hq');
    expect([...listed].sort()).toEqual([...expected].sort());
  });
});

describe('répliques', () => {
  it('ne promettent rien que le jeu ne fasse pas à ce moment-là', () => {
    const text = (id: keyof typeof VOICE_LINES) =>
      VOICE_LINES[id].lines.map((l) => l.text).join(' ');
    // Heard when the rock is marked, before anyone has got there.
    expect(text('drill')).not.toMatch(/en cours|je commence/i);
    // Not every mission pays, not every building needs the network, relic vaults aren't seams.
    expect(text('contractDone')).not.toMatch(/récompense/i);
    expect(text('built')).not.toMatch(/réseau/i);
    expect(text('find')).not.toMatch(/filon/i);
    // The rank goes up in the same second as the arrival at the city: it must give way.
    expect(VOICE_LINES.levelUp.urgent).toBeFalsy();
    expect(VOICE_LINES.reunited.urgent).toBe(true);
  });

  it('chaque événement a plusieurs répliques, sans doublon', () => {
    const all = Object.values(VOICE_LINES).flatMap((set) => set.lines.map((l) => l.text));
    expect(new Set(all).size).toBe(all.length);
    for (const [id, set] of Object.entries(VOICE_LINES)) {
      expect(set.lines.length, id).toBeGreaterThanOrEqual(2);
    }
    expect(all.length).toBeGreaterThanOrEqual(40);
  });
});

it('la simulation avance avec du gaz sur la carte', () => {
  const state = newGame(5);
  for (let t = 0; t < 300; t++) {
    while (state.story.pending.length > 0) answerEvent(state, 0);
    stepGame(state);
  }
  expect(totalGas(state)).toBeGreaterThan(0);
});
