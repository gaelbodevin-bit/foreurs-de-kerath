import { describe, expect, it } from 'vitest';
import { hireCost, SEAT_IDS } from '../src/data/council';
import {
  recruitCandidate,
  dismissCouncillor,
  foundCouncil,
  updateCouncil,
} from '../src/sim/council';
import { sectorAt } from '../src/data/regions';
import { generateWorld } from '../src/sim/mapgen';
import { reveal } from '../src/sim/grid';
import { answerEvent } from '../src/sim/storyEngine';
import { stepGame } from '../src/sim/game';
import { newGame } from './helpers';
import type { GameState } from '../src/sim/types';

function play(state: GameState, ticks: number, choice = 0): void {
  for (let i = 0; i < ticks; i++) {
    while (state.story.pending.length > 0) answerEvent(state, choice);
    stepGame(state);
  }
}

describe('gouverneur et conseil', () => {
  it('pas de conseil avant d’avoir rejoint la cité', () => {
    const state = newGame(3);
    play(state, 100);
    expect(state.council).toEqual([]);
    expect(state.governorTrait).toBeFalsy();
  });

  it('rejoindre la cité nomme le gouverneur, son style s’applique', () => {
    const state = newGame(3);
    const place = state.settlement!;
    reveal(state, place.x, place.y);
    const speed = state.mods.buildSpeed;
    play(state, 15);
    expect(state.council.map((c) => c.advisor)).toEqual(['orsa', 'krell', 'soum']);
    expect(state.governorTrait).toBe('builder');
    expect(state.mods.buildSpeed).toBeCloseTo(speed + 0.2);
    expect(state.candidates.length).toBeGreaterThan(0);
    expect(state.candidates.some((c) => c.seat === 'defense')).toBe(true);
  });

  it('recruter remplace l’ancien du siège et échange leurs bonus', () => {
    const state = newGame(3);
    foundCouncil(state);
    const before = { ...state.mods };
    const candidate = state.candidates.find((c) => c.seat === 'defense')!;
    candidate.trait = 'veteran';
    candidate.level = 2;
    state.stock.credits = 500;
    expect(recruitCandidate(state, candidate.id).ok).toBe(true);
    expect(state.mods.combatDamage).toBeCloseTo(before.combatDamage + 0.2);
    expect(state.stock.credits).toBe(500 - hireCost(2));
    const orsa = state.council.find((c) => c.advisor === 'orsa')!;
    const rival = {
      ...candidate,
      id: 9001,
      seat: 'engineering' as const,
      trait: 'driller',
      level: 1,
    };
    state.candidates.push(rival);
    expect(recruitCandidate(state, 9001).ok).toBe(true);
    expect(state.council).not.toContain(orsa);
    expect(state.mods.hazard).toBeCloseTo(before.hazard + 0.1);
    expect(state.mods.drillSpeed).toBeCloseTo(before.drillSpeed + 0.1);
    expect(state.council.filter((c) => c.seat === 'engineering').length).toBe(1);
  });

  it('un recrutement sans crédits échoue sans rien changer', () => {
    const state = newGame(3);
    foundCouncil(state);
    state.stock.credits = 0;
    const size = state.council.length;
    expect(recruitCandidate(state, state.candidates[0].id).ok).toBe(false);
    expect(state.council.length).toBe(size);
  });

  it('renvoyer retire exactement le bonus, niveaux compris', () => {
    const state = newGame(3);
    foundCouncil(state);
    const soum = state.council.find((c) => c.advisor === 'soum')!;
    state.stock.credits = 9999;
    const research = state.mods.research;
    soum.tenure = 1e6;
    updateCouncil(state);
    expect(soum.level).toBe(2);
    expect(state.mods.research).toBeCloseTo(research + 0.15);
    dismissCouncillor(state, soum.id);
    expect(state.mods.research).toBeCloseTo(research - 0.15);
  });

  it('les sièges restent au nombre de quatre', () => {
    expect(SEAT_IDS.length).toBe(4);
  });
});

describe('gardes', () => {
  it('un garde au repos patrouille autour de son poste, sans s’en éloigner', () => {
    const state = newGame(2);
    const guard = state.units.find((u) => u.type === 'garde')!;
    const post = { x: guard.x, y: guard.y };
    let moved = 0;
    let farthest = 0;
    for (let i = 0; i < 1200; i++) {
      const before = [guard.x, guard.y];
      play(state, 1);
      if (before[0] !== guard.x || before[1] !== guard.y) moved++;
      farthest = Math.max(farthest, Math.hypot(guard.x - post.x, guard.y - post.y));
    }
    expect(moved).toBeGreaterThan(20);
    expect(farthest).toBeLessThan(8);
  });
});

describe('salles de monstres', () => {
  it('chaque partie en a, avec monstres endormis et butin enfermés', () => {
    for (const seed of [1, 2, 3]) {
      const state = newGame(seed);
      const dormant = state.enemies.filter((e) => e.dormant);
      expect(dormant.length).toBeGreaterThanOrEqual(3);
      for (const e of dormant) {
        expect(state.tiles[Math.floor(e.y) * state.w + Math.floor(e.x)].seen).toBe(false);
      }
      expect(state.pickups.length).toBeGreaterThan(0);
    }
    expect(generateWorld(1).lairs.length).toBeGreaterThan(0);
  });

  it('le premier secteur en a toujours une, loin de Port-Cendre', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateWorld(seed);
      const here = map.lairs.filter((l) => sectorAt(l.x, l.y, map.w, map.h).index === 0);
      expect(here.length, String(seed)).toBeGreaterThan(0);
      for (const l of here) {
        expect(Math.hypot(l.x - map.settlement!.x, l.y - map.settlement!.y)).toBeGreaterThan(9);
      }
    }
  });

  it('les monstres restent en place tant que personne n’approche', () => {
    const state = newGame(2);
    const dormant = state.enemies.filter((e) => e.dormant);
    const before = dormant.map((e) => [e.x, e.y]);
    play(state, 300);
    expect(dormant.map((e) => [e.x, e.y])).toEqual(before);
  });

  it('une unité qui entre réveille toute la salle', () => {
    const state = newGame(2);
    const first = state.enemies.find((e) => e.dormant)!;
    const group = state.enemies.filter(
      (e) => e.dormant && Math.hypot(e.x - first.x, e.y - first.y) < 7,
    );
    expect(group.length).toBeGreaterThan(1);
    reveal(state, Math.floor(first.x), Math.floor(first.y));
    const unit = state.units.find((u) => u.type === 'garde')!;
    unit.x = first.x + 2;
    unit.y = first.y;
    play(state, 5);
    expect(group.every((e) => !e.dormant)).toBe(true);
  });
});
