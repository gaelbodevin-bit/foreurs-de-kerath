import { describe, expect, it } from 'vitest';
import { PATH_COST } from '../src/data/buildings';
import { regionById } from '../src/data/regions';
import { drillToolFor, WALLS } from '../src/data/resources';
import { TECHS } from '../src/data/techs';
import { placePath, stepGame } from '../src/sim/game';
import { objectiveProgress } from '../src/sim/progress';
import { idx, reveal } from '../src/sim/grid';
import { answerEvent } from '../src/sim/storyEngine';
import type { GameState } from '../src/sim/types';
import { newGame } from './helpers';

const reachObjective = () => {
  const objective = regionById('ash').objectives.find((o) => o.kind === 'reach');
  if (!objective) throw new Error('La première mission doit demander de rejoindre la cité.');
  return objective;
};

/** Advances a few seconds, answering whatever dialog comes up. */
function play(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    while (state.story.pending.length > 0) answerEvent(state, 0);
    stepGame(state);
  }
}

describe('rejoindre Port-Cendre', () => {
  it('la cité existe, cachée derrière la roche', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = newGame(seed);
      const place = state.settlement;
      expect(place).toBeTruthy();
      expect(state.tiles[idx(state, place!.x, place!.y)].seen).toBe(false);
      expect(objectiveProgress(state, reachObjective()).value).toBe(0);
    }
  });

  it('le passage direct reste à la portée de la pioche', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = newGame(seed);
      const hq = state.buildings.find((b) => b.type === 'hq')!;
      const place = state.settlement!;
      const startX = hq.x + 1;
      const startY = hq.y + 1;
      const steps = Math.abs(place.x - startX);
      for (let d = 0; d <= steps; d++) {
        const x = startX + Math.sign(place.x - startX) * d;
        const y = startY + Math.sign(place.y - startY) * d;
        const wall = WALLS[state.tiles[idx(state, x, y)].k];
        expect(wall?.power ?? 1).toBeLessThanOrEqual(1);
      }
    }
  });

  it('ouvrir la galerie accomplit l’objectif et ramène des habitants', () => {
    const state = newGame(3);
    const place = state.settlement!;
    const before = state.city.population;
    reveal(state, place.x, place.y);
    play(state, 12);
    expect(state.settlement!.reached).toBe(true);
    expect(objectiveProgress(state, reachObjective()).value).toBe(1);
    expect(state.city.population).toBeGreaterThanOrEqual(before + 8);
    expect(state.story.fired).toContain('city_reached');
  });

  it('une partie sans cité à rejoindre compte l’objectif comme atteint', () => {
    const state = newGame(3);
    state.settlement = null;
    expect(objectiveProgress(state, { kind: 'reach', place: 'Nulle part' }).value).toBe(1);
  });
});

describe('outils de forage', () => {
  it('chaque niveau de puissance a son outil', () => {
    expect(drillToolFor(1)).toBe('pick');
    expect(drillToolFor(2)).toBe('hammer');
    expect(drillToolFor(3)).toBe('laser');
  });

  it('la recherche mène de la pioche au laser, de plus en plus vite', () => {
    const chain = ['drills1', 'drills2', 'drills3'].map((id) => TECHS.find((t) => t.id === id)!);
    let power = 1;
    for (const tech of chain) {
      expect(tech.mods?.drillSpeed).toBeGreaterThan(0);
      power += tech.mods?.drillPower ?? 0;
    }
    expect(drillToolFor(power)).toBe('laser');
  });

  it('une pioche n’entame ni la roche dure ni le basalte', () => {
    expect(WALLS.hard!.power).toBeGreaterThan(1);
    expect(WALLS.basalt!.power).toBeGreaterThan(WALLS.hard!.power);
  });
});

describe('sol technique', () => {
  it('se paie au prix fort à la pose', () => {
    const state = newGame(3);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const x = hq.x + 3;
    const y = hq.y + 1;
    expect(state.tiles[idx(state, x, y)].k).toBe('floor');
    const { stone, ore } = state.stock;
    expect(placePath(state, x, y, x, y)).toBe(1);
    play(state, 200);
    expect(state.tiles[idx(state, x, y)].k).toBe('path');
    expect(state.stock.stone).toBe(stone - (PATH_COST.stone ?? 0));
    expect(state.stock.ore).toBe(ore - (PATH_COST.ore ?? 0));
    expect((PATH_COST.stone ?? 0) + (PATH_COST.ore ?? 0)).toBeGreaterThan(1);
  });
});
