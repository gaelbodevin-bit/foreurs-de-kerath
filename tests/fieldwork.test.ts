import { describe, expect, it } from 'vitest';
import { CITY_STORAGE } from '../src/data/progression';
import { STORY_EVENTS } from '../src/data/story';
import { updateContracts } from '../src/sim/contracts';
import { UNITS } from '../src/data/units';
import { computeLightMap } from '../src/render/lightMap';
import {
  appetitePerSecond,
  foodMinutesLeft,
  hasRoomFor,
  storageCapacity,
  updateNetwork,
} from '../src/sim/economy';
import { createBuilding, spawnEnemy, spawnPickup } from '../src/sim/entities';
import { designateArea, placeBuilding, placePath, roadEnd } from '../src/sim/game';
import { idx } from '../src/sim/grid';
import { answerEvent, STORY_GAP, updateStory } from '../src/sim/storyEngine';
import { addJob } from '../src/sim/workers';
import type { GameState, Unit } from '../src/sim/types';
import { newGame, run } from './helpers';

/** Clears and reveals a square of ground, and stops the rest of the crew from interfering. */
function openGround(state: GameState, cx: number, cy: number, radius: number): void {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const tile = state.tiles[idx(state, x, y)];
      tile.k = 'floor';
      tile.seen = true;
      tile.gas = 0;
    }
  }
}

/** A lone miner out of reach of the HQ's turret, on open and known ground. */
function loneMiner(): { state: GameState; foreur: Unit } {
  const state = newGame();
  const hq = state.buildings.find((b) => b.type === 'hq')!;
  const foreur = state.units.find((u) => u.type === 'foreur')!;
  state.units = [foreur];
  foreur.x = hq.x + 20.5;
  foreur.y = hq.y + 0.5;
  openGround(state, Math.floor(foreur.x), Math.floor(foreur.y), 9);
  return { state, foreur };
}

describe('routes droites', () => {
  it('un tracé s’aligne sur la direction la plus proche', () => {
    expect(roadEnd(10, 10, 20, 12)).toEqual({ x: 20, y: 10 });
    expect(roadEnd(10, 10, 12, 20)).toEqual({ x: 10, y: 20 });
    expect(roadEnd(10, 10, 20, 18)).toEqual({ x: 20, y: 20 });
    expect(roadEnd(10, 10, 3, 16)).toEqual({ x: 3, y: 17 });
  });

  it('une diagonale ne pose qu’une case par pas, sans escalier', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const x = hq.x + 12;
    const y = hq.y + 12;
    openGround(state, x, y, 8);
    expect(placePath(state, x, y, x + 5, y - 5)).toBe(6);
    const laid = state.jobs.filter((j) => j.kind === 'path').map((j) => [j.x - x, j.y - y]);
    expect(laid).toEqual([
      [0, 0],
      [1, -1],
      [2, -2],
      [3, -3],
      [4, -4],
      [5, -5],
    ]);
  });

  it('le courant suit une diagonale de dalle à dalle, mais n’en sort pas vers un bâtiment', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x + 6, hq.y + 6, 6);
    const start = { x: hq.x + 2, y: hq.y + 1 };
    state.tiles[idx(state, start.x, start.y)].k = 'path';
    state.tiles[idx(state, start.x + 1, start.y + 1)].k = 'path';
    state.tiles[idx(state, start.x + 2, start.y + 2)].k = 'path';
    const beside = createBuilding(state, 'vent', start.x + 3, start.y + 3, 1);
    updateNetwork(state);
    expect(state.tiles[idx(state, start.x + 2, start.y + 2)].powered).toBe(true);
    expect(beside.connected).toBe(false);
  });
});

describe('le siège du conseil sert d’entrepôt', () => {
  it('il ne compte qu’une fois CITY rejointe', () => {
    const state = newGame();
    const before = storageCapacity(state);
    state.settlement!.reached = true;
    expect(storageCapacity(state)).toBe(before + CITY_STORAGE);
  });

  it('un foreur y dépose ce qu’il trouve à côté, sans retourner au Noyau', () => {
    const state = newGame();
    const place = state.settlement!;
    place.reached = true;
    openGround(state, place.x, place.y, 7);
    const foreur = state.units.find((u) => u.type === 'foreur')!;
    state.units = [foreur];
    foreur.x = place.x + 5.5;
    foreur.y = place.y + 0.5;
    const pickup = spawnPickup(state, 'stone', place.x + 5.5, place.y + 1.5);
    addJob(state, 'haul', place.x + 5, place.y + 1, pickup);
    const stock = state.stock.stone;
    run(state, 8);
    expect(state.stock.stone).toBe(stock + 1);
    // Twelve seconds of walking at least separate the city from the HQ, on any map.
    expect(Math.hypot(foreur.x - place.x, foreur.y - place.y)).toBeLessThan(8);
    expect(hasRoomFor(state, 'stone')).toBe(true);
  });
});

describe('lampadaire', () => {
  it('se pose sans réseau et éclaire autour de lui', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const x = hq.x < state.w / 2 ? hq.x + 25 : hq.x - 25;
    const y = hq.y < state.h / 2 ? hq.y + 25 : hq.y - 25;
    openGround(state, x, y, 8);
    const dark = new Float32Array(state.w * state.h);
    computeLightMap(state, dark);
    expect(dark[idx(state, x + 2, y)]).toBe(0);
    expect(placeBuilding(state, 'lamp', x, y).ok).toBe(true);
    state.buildings[state.buildings.length - 1].built = 1;
    const lit = new Float32Array(state.w * state.h);
    computeLightMap(state, lit);
    expect(lit[idx(state, x + 2, y)]).toBeGreaterThan(0.5);
    expect(lit[idx(state, x + 7, y)]).toBe(0);
  });
});

describe('les mineurs face à l’ennemi', () => {
  it('un foreur lâche sa tâche et va frapper l’ennemi qui approche', () => {
    const { state, foreur } = loneMiner();
    foreur.hp = 500;
    const x = Math.floor(foreur.x);
    const y = Math.floor(foreur.y);
    const wall = state.tiles[idx(state, x + 1, y - 4)];
    wall.k = 'loose';
    addJob(state, 'drill', x + 1, y - 4);
    run(state, 0.5);
    expect(foreur.jobId).not.toBeNull();
    const enemy = spawnEnemy(state, 'golem', foreur.x + 4, foreur.y + 3);
    const hp = enemy.hp;
    run(state, 0.3);
    expect(foreur.jobId).toBeNull();
    expect(foreur.working).toBe(false);
    run(state, 6);
    expect(enemy.hp).toBeLessThan(hp);
  });

  it('il retourne au travail une fois l’ennemi abattu', () => {
    const { state, foreur } = loneMiner();
    foreur.hp = 500;
    const enemy = spawnEnemy(state, 'rongeur', foreur.x + 3, foreur.y);
    const x = Math.floor(foreur.x);
    const y = Math.floor(foreur.y);
    state.tiles[idx(state, x, y - 4)].k = 'loose';
    addJob(state, 'drill', x, y - 4);
    run(state, 25);
    expect(state.enemies).not.toContain(enemy);
    expect(foreur.chasing).toBe(false);
    expect(state.tiles[idx(state, x, y - 4)].k).not.toBe('loose');
  });

  it('il ne quitte pas sa tâche pour un nid, ni blessé', () => {
    const { state, foreur } = loneMiner();
    const x = Math.floor(foreur.x);
    const y = Math.floor(foreur.y);
    spawnEnemy(state, 'nest', foreur.x + 4, foreur.y);
    addJob(state, 'clear', x, y - 1);
    state.tiles[idx(state, x, y - 1)].k = 'rubble';
    run(state, 0.5);
    expect(foreur.chasing).toBeFalsy();
    expect(foreur.jobId).not.toBeNull();
  });

  it('blessé, il cesse de chercher le combat', () => {
    const { state, foreur } = loneMiner();
    foreur.hp = UNITS.foreur.hp * 0.3;
    spawnEnemy(state, 'rongeur', foreur.x + 5, foreur.y);
    run(state, 0.3);
    expect(foreur.chasing).toBeFalsy();
  });

  it('un ordre du joueur passe avant le combat', () => {
    const { state, foreur } = loneMiner();
    const x = Math.floor(foreur.x);
    const y = Math.floor(foreur.y);
    foreur.order = idx(state, x - 6, y);
    foreur.path = [idx(state, x - 1, y), idx(state, x - 2, y), idx(state, x - 3, y)];
    spawnEnemy(state, 'golem', foreur.x + 4, foreur.y);
    const startX = foreur.x;
    run(state, 0.5);
    expect(foreur.x).toBeLessThan(startX);
    expect(foreur.chasing).toBeFalsy();
  });

  it('une foreuse lourde, elle, n’a pas d’arme et continue', () => {
    expect(UNITS.heavy.melee).toBeUndefined();
  });
});

describe('charges lâchées en route', () => {
  it('un mineur qui pose sa charge pour se battre ne laisse pas de tâche fantôme', () => {
    const { state, foreur } = loneMiner();
    foreur.hp = 500;
    const x = Math.floor(foreur.x);
    const y = Math.floor(foreur.y);
    // Already on the way back with a load: the item has left the ground.
    const pickup = spawnPickup(state, 'ore', foreur.x, foreur.y);
    addJob(state, 'haul', x, y, pickup);
    const job = state.jobs[state.jobs.length - 1];
    state.pickups = state.pickups.filter((p) => p.id !== pickup);
    job.deliver = true;
    job.unitId = foreur.id;
    foreur.jobId = job.id;
    foreur.carry = 'ore';
    foreur.carryCount = 1;
    spawnEnemy(state, 'rongeur', foreur.x + 4, foreur.y);
    run(state, 0.5);
    expect(foreur.carry).toBeNull();
    for (const job of state.jobs.filter((j) => j.kind === 'haul')) {
      expect(state.pickups.some((p) => p.id === job.refId)).toBe(true);
    }
  });
});

describe('fenêtres d’histoire', () => {
  it('une seule à la fois, et un temps de jeu entre deux', () => {
    const state = newGame();
    state.story.flags.cityReached = true;
    state.settlement!.reached = true;
    state.settlement!.reachedAt = 0;
    state.time = 2000;
    state.tick = 20000;
    // The urgent ones aside, which never wait.
    state.story.fired = STORY_EVENTS.filter((e) => e.urgent).map((e) => e.id);
    updateStory(state);
    expect(state.story.pending).toHaveLength(1);
    answerEvent(state, 0);
    updateStory(state);
    expect(state.story.pending).toHaveLength(0);
    state.time += STORY_GAP;
    updateStory(state);
    expect(state.story.pending).toHaveLength(1);
  });

  it('une urgence passe sans attendre', () => {
    const state = newGame();
    state.story.fired = STORY_EVENTS.filter((e) => e.id !== 'starving').map((e) => e.id);
    state.story.answeredAt = state.time;
    state.story.flags.starved = true;
    updateStory(state);
    expect(state.story.pending).toEqual(['starving']);
  });
});

describe('réserve de vivres', () => {
  it('une serre qui va manquer d’eau ne promet pas des vivres à l’infini', () => {
    const state = newGame();
    state.settlement!.reached = true;
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x + 6, hq.y, 4);
    for (let i = 0; i < 3; i++) {
      const farm = createBuilding(state, 'farm', hq.x + 4 + i * 3, hq.y, 1);
      farm.eff = 1;
    }
    state.stock.food = 100;
    state.stock.water = 1000;
    const rich = foodMinutesLeft(state);
    state.stock.water = 5;
    const left = foodMinutesLeft(state);
    expect(left).toBeLessThan(Infinity);
    expect(left).toBeLessThan(rich);
    expect(left).toBeGreaterThan(state.stock.food / (appetitePerSecond(state) * 60));
  });
});

describe('commandes de la Charte', () => {
  it('ne réclament jamais beaucoup plus que ce qu’on a déjà en main', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = newGame(seed);
      state.settlement!.reached = true;
      state.cityLevel = 2;
      for (const r of Object.keys(state.stock) as (keyof typeof state.stock)[]) state.stock[r] = 0;
      state.stock.ice = 3;
      state.contracts = [];
      state.nextContractAt = 0;
      updateContracts(state);
      for (const c of state.contracts.filter((k) => k.kind === 'deliver')) {
        expect(c.amount).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('marquage du forage', () => {
  it('la roche que personne ne peut percer n’est pas marquée', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const x = hq.x + 15;
    const y = hq.y;
    openGround(state, x, y, 3);
    state.tiles[idx(state, x, y)].k = 'hard';
    state.tiles[idx(state, x + 1, y)].k = 'loose';
    expect(designateArea(state, x, y, x + 1, y)).toBe(1);
    expect(state.jobs.some((j) => j.kind === 'drill' && j.x === x)).toBe(false);
    state.mods.drillPower = 2;
    expect(designateArea(state, x, y, x, y)).toBe(1);
  });
});
