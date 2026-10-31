import { describe, expect, it } from 'vitest';
import { clearSave, readSave, writeSave, type SaveStorage } from '../src/campaign/save';
import { BUILDINGS, CITY_BUILDINGS } from '../src/data/buildings';
import { CITY_LEVELS, cityRadius, MAX_CONTRACTS } from '../src/data/progression';
import { regionById, REGIONS, sectorAt, WORLD_SIZE } from '../src/data/regions';
import { DRILL_TOOLS, WALLS } from '../src/data/resources';
import { TECHS } from '../src/data/techs';
import { contractStatus, deliverContract, updateContracts } from '../src/sim/contracts';
import { updateNetwork } from '../src/sim/economy';
import { createBuilding } from '../src/sim/entities';
import { canPlaceBuilding, createGame, stepGame } from '../src/sim/game';
import {
  activeRegions,
  availableBuildings,
  buildingLock,
  buyTech,
  planetControl,
  updateProgress,
} from '../src/sim/progress';
import type { Contract } from '../src/sim/types';
import { reveal } from '../src/sim/grid';
import { newGame, run, unlockEverything } from './helpers';

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
  it('avant la cité, seule l’exploration est là, et pas de recherche', () => {
    const state = newGame(1);
    const available = availableBuildings(state);
    expect(available).toContain('generator');
    expect(available).toContain('turret');
    expect(available.some((t) => CITY_BUILDINGS.has(t))).toBe(false);
    expect(buildingLock(state, 'habitat')).toContain('Port-Cendre');
    state.research = 100;
    expect(buyTech(state, 'drills1')).toBe(false);
    expect(state.research).toBe(100);
  });

  it('rejoindre la cité ouvre la vie de la colonie et le laboratoire', () => {
    const state = newGame(1);
    state.settlement!.reached = true;
    const available = availableBuildings(state);
    for (const type of ['habitat', 'oxygen', 'farm', 'melter', 'lab'] as const) {
      expect(available).toContain(type);
    }
    expect(available).not.toContain('refinery');
    expect(available).not.toContain('workshop');
  });

  it('on commence à la pioche, le marteau-piqueur puis le laser se débloquent dans l’ordre', () => {
    const state = newGame(1);
    state.settlement!.reached = true;
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

  it('l’atelier de véhicules vient après le raffinage', () => {
    const state = newGame(1);
    state.settlement!.reached = true;
    state.research = 100;
    expect(buildingLock(state, 'workshop')).toContain('Atelier de véhicules');
    expect(buyTech(state, 'vehicles')).toBe(false);
    expect(buyTech(state, 'refining')).toBe(true);
    expect(buyTech(state, 'vehicles')).toBe(true);
    expect(buildingLock(state, 'workshop')).toBeNull();
  });

  it('une technologie coûte ses points, et n’agit qu’une fois', () => {
    const state = newGame(1);
    state.settlement!.reached = true;
    state.research = 4;
    expect(buyTech(state, 'drills1')).toBe(false);
    state.research = 5;
    expect(buyTech(state, 'drills1')).toBe(true);
    expect(state.research).toBe(0);
    state.research = 50;
    expect(buyTech(state, 'drills1')).toBe(false);
    expect(state.research).toBe(50);
  });

  it('le rang de la cité ne redescend pas et élargit la zone', () => {
    const state = newGame(1);
    const before = cityRadius(state.cityLevel);
    state.city.population = CITY_LEVELS[2].population;
    updateProgress(state);
    expect(state.cityLevel).toBe(2);
    expect(cityRadius(state.cityLevel)).toBeGreaterThan(before);
    state.city.population = 3;
    updateProgress(state);
    expect(state.cityLevel).toBe(2);
    expect(state.story.flags.level1).toBe(true);
  });

  it('chaque technologie citée existe', () => {
    const ids = TECHS.map((t) => t.id);
    for (const def of Object.values(BUILDINGS)) if (def.tech) expect(ids).toContain(def.tech);
    for (const tech of TECHS) if (tech.requires) expect(ids).toContain(tech.requires);
  });
});

describe('zone de la cité et avant-postes', () => {
  it('un bâtiment de cité refuse de sortir de la zone, l’exploration non', () => {
    const state = newGame(1);
    unlockEverything(state);
    state.cityLevel = 0;
    const hq = state.buildings[0];
    const x = hq.x + cityRadius(0) + 4;
    const y = hq.y;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tile = state.tiles[(y + dy) * state.w + x + dx];
        tile.k = 'floor';
        tile.seen = true;
      }
    }
    expect(CITY_BUILDINGS.has('habitat')).toBe(true);
    expect(canPlaceBuilding(state, 'habitat', x, y).ok).toBe(false);
    expect(canPlaceBuilding(state, 'depot', x, y).ok).toBe(true);
    expect(canPlaceBuilding(state, 'camp', x, y).ok).toBe(true);
    state.cityLevel = 3;
    expect(canPlaceBuilding(state, 'habitat', x, y).ok).toBe(true);
  });

  it('un avant-poste alimente son propre réseau, loin du Noyau', () => {
    const state = newGame(1);
    const hq = state.buildings[0];
    const x = hq.x + 16;
    const camp = createBuilding(state, 'camp', x, hq.y, 1);
    const turret = createBuilding(state, 'turret', x + 2, hq.y, 1);
    const lonely = createBuilding(state, 'turret', x + 8, hq.y, 1);
    updateNetwork(state);
    expect(camp.connected).toBe(true);
    expect(turret.connected).toBe(true);
    expect(lonely.connected).toBe(false);
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

  it('aucune n’arrive avant d’avoir rejoint la cité, puis elles commencent', () => {
    const state = newGame(4);
    run(state, 300);
    expect(state.contracts).toEqual([]);
    reveal(state, state.settlement!.x, state.settlement!.y);
    run(state, 200);
    expect(state.settlement!.reached).toBe(true);
    expect(state.contracts.length).toBeGreaterThan(0);
  });

  it('aucune incursion ne tombe sur une colonie sans défense', () => {
    const state = newGame(4);
    state.settlement!.reached = true;
    state.units = state.units.filter((u) => u.type !== 'garde');
    for (let t = 0; t < 3000; t += 5) {
      state.time = t;
      updateContracts(state);
      expect(state.contracts.some((c) => c.kind === 'defend')).toBe(false);
    }
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
    state.settlement!.reached = true;
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
