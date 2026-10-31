import { describe, expect, it } from 'vitest';
import { clearSave, readSave, writeSave, type SaveStorage } from '../src/campaign/save';
import { BUILDINGS } from '../src/data/buildings';
import { CITY_LEVELS, MAX_CONTRACTS } from '../src/data/progression';
import { regionById, REGIONS, sectorAt, WORLD_SIZE } from '../src/data/regions';
import { DRILL_TOOLS, WALLS } from '../src/data/resources';
import { TECHS } from '../src/data/techs';
import { contractStatus, deliverContract, updateContracts } from '../src/sim/contracts';
import { createGame, placeBuilding, stepGame } from '../src/sim/game';
import {
  activeRegions,
  availableBuildings,
  buildingLock,
  buyTech,
  planetControl,
  updateProgress,
} from '../src/sim/progress';
import type { Contract } from '../src/sim/types';
import { newGame, run } from './helpers';

const memoryStorage = (): SaveStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

describe('monde unique', () => {
  it('tous les secteurs sont sur la même carte, séparés par de la roche résistante', () => {
    const state = newGame(3);
    expect(state.w).toBe(WORLD_SIZE);
    const found = new Set<number>();
    let weakBorder = 0;
    state.tiles.forEach((t, i) => {
      const x = i % state.w;
      const y = Math.floor(i / state.w);
      const sector = sectorAt(x, y, state.w, state.h);
      found.add(sector.index);
      if (sector.margin < 0.5 && t.k !== 'solid' && !t.seen && (WALLS[t.k]?.power ?? 0) < 2) {
        weakBorder++;
      }
    });
    expect(found.size).toBe(REGIONS.length);
    expect(weakBorder).toBe(0);
  });

  it('le traître reste identique pour une même graine', () => {
    expect(createGame(7).story.mole).toBe(createGame(7).story.mole);
    const moles = new Set(Array.from({ length: 40 }, (_, i) => createGame(i).story.mole));
    expect(moles.size).toBe(3);
  });

  it('le contrôle de la planète monte quand un secteur tombe, sans changer de carte', () => {
    const state = newGame(1);
    const tiles = state.tiles;
    expect(activeRegions(state).map((r) => r.id)).toEqual(['ash']);
    state.settlement!.reached = true;
    state.stock.crystal = 20;
    state.city.population = 24;
    state.buildings.push({ ...state.buildings[0], id: 999, type: 'oxygen', built: 1 });
    updateProgress(state);
    expect(state.conquered).toEqual(['ash']);
    expect(planetControl(state)).toBe(regionById('ash').control);
    expect(activeRegions(state).map((r) => r.id)).toEqual(['glass', 'ice']);
    expect(state.tiles).toBe(tiles);
  });

  it('un objectif de destruction ne compte que dans son secteur', () => {
    const state = newGame(1);
    const nests = state.enemies.filter((e) => e.type === 'nest');
    expect(nests.length).toBeGreaterThanOrEqual(2);
    state.sectorStart.glass = 0;
    state.sectorStart.ice = 0;
    state.conquered.push('ash');
    state.settlement!.reached = true;
    const inGlass = nests.filter(
      (e) => sectorAt(e.x, e.y, state.w, state.h).index === REGIONS.indexOf(regionById('glass')),
    );
    state.enemies = state.enemies.filter((e) => !inGlass.includes(e));
    state.stock.crystal = 60;
    state.stock.food = 0;
    state.city.population = 22;
    updateProgress(state);
    expect(state.conquered).toContain('glass');
    expect(state.conquered).not.toContain('ice');
  });
});

describe('progression', () => {
  it('on commence à la pioche, le marteau-piqueur puis le laser se débloquent dans l’ordre', () => {
    const state = newGame(1);
    expect(state.mods.drillPower).toBe(DRILL_TOOLS.pick.power);
    state.research = 100;
    expect(buyTech(state, 'drills2')).toBe(false);
    expect(buyTech(state, 'drills3')).toBe(false);
    expect(buyTech(state, 'drills1')).toBe(true);
    expect(buyTech(state, 'drills2')).toBe(true);
    expect(state.mods.drillPower).toBe(DRILL_TOOLS.hammer.power);
    expect(buyTech(state, 'drills3')).toBe(true);
    expect(state.mods.drillPower).toBe(DRILL_TOOLS.laser.power);
    expect(state.mods.drillSpeed).toBeCloseTo(2);
  });

  it('une technologie coûte ses points, et n’agit qu’une fois', () => {
    const state = newGame(1);
    state.research = 4;
    expect(buyTech(state, 'drills1')).toBe(false);
    state.research = 5;
    expect(buyTech(state, 'drills1')).toBe(true);
    expect(state.research).toBe(0);
    state.research = 50;
    expect(buyTech(state, 'drills1')).toBe(false);
    expect(state.research).toBe(50);
  });

  it('le laboratoire vient avec le rang, puis la recherche ouvre l’atelier de véhicules', () => {
    const state = newGame(1);
    expect(availableBuildings(state)).not.toContain('lab');
    expect(availableBuildings(state)).not.toContain('workshop');
    expect(placeBuilding(state, 'lab', 1, 1).ok).toBe(false);
    state.city.population = CITY_LEVELS[1].population;
    updateProgress(state);
    expect(state.cityLevel).toBe(1);
    expect(availableBuildings(state)).toContain('lab');
    expect(buildingLock(state, 'workshop')).toContain('Atelier de véhicules');
    state.research = 100;
    expect(buyTech(state, 'vehicles')).toBe(false);
    expect(buyTech(state, 'refining')).toBe(true);
    expect(buyTech(state, 'vehicles')).toBe(true);
    expect(availableBuildings(state)).toContain('workshop');
  });

  it('le rang de la cité ne redescend pas', () => {
    const state = newGame(1);
    state.city.population = CITY_LEVELS[2].population;
    updateProgress(state);
    expect(state.cityLevel).toBe(2);
    state.city.population = 3;
    updateProgress(state);
    expect(state.cityLevel).toBe(2);
    expect(state.story.flags.level1).toBe(true);
  });

  it('chaque technologie débloquante existe', () => {
    const ids = TECHS.map((t) => t.id);
    for (const def of Object.values(BUILDINGS)) if (def.tech) expect(ids).toContain(def.tech);
    for (const tech of TECHS) if (tech.requires) expect(ids).toContain(tech.requires);
  });
});

describe('missions en continu', () => {
  it('il en arrive sans cesse, sans jamais dépasser la limite', () => {
    const state = newGame(4);
    state.settlement!.reached = true;
    let seen = 0;
    let previous = new Set<number>();
    for (let t = 0; t < 900; t += 5) {
      state.time = t;
      state.city.morale = 60;
      updateContracts(state);
      const ids = new Set(state.contracts.map((c) => c.id));
      for (const id of ids) if (!previous.has(id)) seen++;
      previous = ids;
      expect(state.contracts.length).toBeLessThanOrEqual(MAX_CONTRACTS);
    }
    expect(seen).toBeGreaterThanOrEqual(8);
  });

  it('une commande se livre à la main, se paie et récompense', () => {
    const state = newGame(4);
    const contract: Contract = {
      id: 500,
      kind: 'deliver',
      title: 'Commande',
      text: '',
      res: 'ore',
      amount: 10,
      expiresAt: 500,
      reward: { stock: { credits: 40 }, research: 1, morale: 0 },
    };
    state.contracts.push(contract);
    state.stock.ore = 5;
    expect(contractStatus(state, contract).ready).toBe(false);
    expect(deliverContract(state, 500)).toBe(false);
    state.stock.ore = 12;
    const credits = state.stock.credits;
    expect(deliverContract(state, 500)).toBe(true);
    expect(state.stock.ore).toBe(2);
    expect(state.stock.credits).toBe(credits + 40);
    expect(state.research).toBe(1);
    expect(state.contracts).toEqual([]);
  });

  it('une mission manquée disparaît et pèse sur le moral', () => {
    const state = newGame(4);
    state.nextContractAt = 1e9;
    state.contracts.push({
      id: 501,
      kind: 'deliver',
      title: 'Commande',
      text: '',
      res: 'ore',
      amount: 999,
      expiresAt: 10,
      reward: { stock: {}, research: 0, morale: 0 },
    });
    state.time = 11;
    const shock = state.city.moraleShock;
    updateContracts(state);
    expect(state.contracts).toEqual([]);
    expect(state.city.moraleShock).toBeLessThan(shock);
  });
});

describe('sauvegarde', () => {
  it('une partie relue continue à l’identique', () => {
    const storage = memoryStorage();
    const game = createGame(5);
    run(game, 10);
    expect(writeSave(storage, game)).toBe(true);
    const reloaded = readSave(storage);
    expect(reloaded).toBeTruthy();
    if (!reloaded) return;
    game.fx = [];
    game.dirty = [];
    for (let i = 0; i < 300; i++) {
      stepGame(game);
      stepGame(reloaded);
      game.story.pending = [];
      reloaded.story.pending = [];
    }
    expect(reloaded.units.map((u) => [u.x, u.y])).toEqual(game.units.map((u) => [u.x, u.y]));
    expect(reloaded.stock).toEqual(game.stock);
  });

  it('ignore les données corrompues et les anciennes versions', () => {
    const storage = memoryStorage();
    storage.setItem('foreurs-de-kerath/save/v2', '{pas du json');
    expect(readSave(storage)).toBeNull();
    storage.setItem('foreurs-de-kerath/save/v2', JSON.stringify({ version: 1 }));
    expect(readSave(storage)).toBeNull();
    clearSave(storage);
    expect(readSave(storage)).toBeNull();
  });
});
