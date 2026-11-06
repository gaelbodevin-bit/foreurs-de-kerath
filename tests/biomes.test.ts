import { describe, expect, it } from 'vitest';
import { readSave, writeSave, type SaveStorage } from '../src/campaign/save';
import { BUILDINGS } from '../src/data/buildings';
import { EDICT_COOLDOWN, EDICTS } from '../src/data/edicts';
import { REGIONS, sectorAt } from '../src/data/regions';
import { SKINS, skinLock } from '../src/data/skins';
import {
  appetitePerSecond,
  foodMinutesLeft,
  outputPerMinute,
  updateNetwork,
} from '../src/sim/economy';
import { createBuilding, spawnPickup, spawnUnit } from '../src/sim/entities';
import { addJob } from '../src/sim/workers';
import { edictLock, signEdict } from '../src/sim/edicts';
import { updateGas } from '../src/sim/gas';
import {
  canPlaceBuilding,
  createGame,
  designateArea,
  placeBridge,
  setCrewSkin,
  stepGame,
} from '../src/sim/game';
import { isWalkableKind, reveal } from '../src/sim/grid';
import { findPath } from '../src/sim/pathfinding';
import { buyTech } from '../src/sim/progress';
import { answerEvent } from '../src/sim/storyEngine';
import type { GameState, TileKind } from '../src/sim/types';

function run(state: GameState, seconds: number): void {
  for (let i = 0; i < seconds * 10; i++) {
    while (state.story.pending.length > 0) answerEvent(state, 0);
    stepGame(state);
    state.fx = [];
    state.dirty = [];
  }
}

const count = (state: GameState, kind: TileKind, sector?: string) =>
  state.tiles.filter((t, i) => {
    if (t.k !== kind) return false;
    if (!sector) return true;
    const at = sectorAt(i % state.w, Math.floor(i / state.w), state.w, state.h).index;
    return REGIONS[at].id === sector;
  }).length;

/** A wide strip of void, known to the crew, right beside the landing zone. */
function chasmBesideHq(state: GameState): { hx: number; hy: number } {
  const hq = state.buildings.find((b) => b.type === 'hq')!;
  const hx = hq.x + 1;
  const hy = hq.y + 1;
  for (let y = hy - 3; y <= hy + 3; y++) {
    for (let x = hx + 2; x <= hx + 8; x++) {
      const tile = state.tiles[y * state.w + x];
      tile.k = x >= hx + 4 && x <= hx + 6 ? 'chasm' : 'floor';
      tile.seen = true;
    }
  }
  return { hx, hy };
}

describe('géologie des secteurs', () => {
  it('chaque secteur a ce qu’il promet, sur plusieurs mondes', () => {
    for (const seed of [1, 7, 42]) {
      const state = createGame(seed);
      expect(count(state, 'chasm', 'abyss')).toBeGreaterThan(40);
      expect(count(state, 'oilSeep', 'abyss')).toBeGreaterThan(0);
      expect(count(state, 'moss', 'lumen')).toBeGreaterThan(40);
      expect(count(state, 'lava', 'magma')).toBeGreaterThan(40);
      expect(count(state, 'fumarole', 'sulfur')).toBeGreaterThan(0);
      expect(count(state, 'tungstenSeam', 'vantor')).toBeGreaterThan(0);
    }
  });

  it('aucun gouffre ne coupe le tunnel vers CITY', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = createGame(seed);
      const hq = state.buildings.find((b) => b.type === 'hq')!;
      const place = state.settlement!;
      const signX = Math.sign(place.x - hq.x);
      for (let d = 1; d < 14; d++) {
        const tile = state.tiles[(hq.y + 1 + d) * state.w + hq.x + 1 + signX * d];
        expect(['chasm', 'lava']).not.toContain(tile.k);
      }
    }
  });

  it('les nouveaux secteurs s’ouvrent en conquérant le premier', () => {
    const lumen = REGIONS.find((r) => r.id === 'lumen')!;
    const abyss = REGIONS.find((r) => r.id === 'abyss')!;
    expect(lumen.requires).toEqual(['ash']);
    expect(abyss.requires).toEqual(['ash']);
  });
});

describe('gouffres et ponts', () => {
  it('rien ne traverse un gouffre sans pont', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    // Sealed off on both sides of the strip, so that the only way across is the bridge.
    for (let x = hx + 2; x <= hx + 8; x++) {
      for (const y of [hy - 4, hy + 4]) state.tiles[y * state.w + x].k = 'solid';
    }
    for (let y = hy - 4; y <= hy + 4; y++) state.tiles[y * state.w + hx + 9].k = 'solid';
    expect(isWalkableKind('chasm')).toBe(false);
    expect(findPath(state, hx + 3, hy, hx + 7, hy)).toBeNull();
  });

  it('un foreur pose les travées depuis le bord, et on passe', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    expect(placeBridge(state, hx + 4, hy, hx + 6, hy)).toBe(3);
    const before = state.stock.stone;
    run(state, 60);
    for (let x = hx + 4; x <= hx + 6; x++) {
      expect(state.tiles[hy * state.w + x].k).toBe('bridge');
      expect(state.tiles[hy * state.w + x].under).toBe('chasm');
    }
    expect(state.stock.stone).toBeLessThan(before);
    expect(findPath(state, hx + 3, hy, hx + 7, hy)).not.toBeNull();
  });

  it('une équipe coupée de tout entrepôt jette son pont au lieu de tourner en rond', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    // On the far side of the void, with something lying around that can't be brought home.
    for (let y = hy - 4; y <= hy + 4; y++) {
      state.tiles[y * state.w + hx + 3].k = 'solid';
      state.tiles[y * state.w + hx + 9].k = 'solid';
    }
    for (let x = hx + 3; x <= hx + 9; x++) {
      state.tiles[(hy - 4) * state.w + x].k = 'solid';
      state.tiles[(hy + 4) * state.w + x].k = 'solid';
    }
    state.tiles[hy * state.w + hx + 3].k = 'floor';
    const unit = state.units.find((u) => u.type === 'foreur')!;
    unit.x = hx + 7.5;
    unit.y = hy + 0.5;
    const id = spawnPickup(state, 'crystal', hx + 7.5, hy + 1.5);
    addJob(state, 'haul', hx + 7, hy + 1, id);
    const firstFree = state.nextId;
    placeBridge(state, hx + 6, hy, hx + 6, hy);
    state.units = [unit];
    run(state, 20);
    expect(state.tiles[hy * state.w + hx + 6].k).toBe('bridge');
    expect(state.nextId - firstFree).toBeLessThan(5);
  });

  it('on ne pose un pont qu’au-dessus du vide, de l’eau ou de la lave', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    expect(placeBridge(state, hx + 2, hy, hx + 3, hy)).toBe(0);
    state.tiles[hy * state.w + hx + 3].k = 'lava';
    expect(placeBridge(state, hx + 2, hy, hx + 3, hy)).toBe(1);
  });

  it('repasser sur un pont prévu l’annule', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    placeBridge(state, hx + 4, hy, hx + 5, hy);
    expect(placeBridge(state, hx + 4, hy, hx + 5, hy)).toBe(0);
    expect(state.jobs.filter((j) => j.kind === 'bridge')).toHaveLength(0);
  });

  it('le courant passe par le pont', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    for (let x = hx + 1; x <= hx + 3; x++) state.tiles[hy * state.w + x].k = 'path';
    for (let x = hx + 4; x <= hx + 6; x++) {
      state.tiles[hy * state.w + x].under = 'chasm';
      state.tiles[hy * state.w + x].k = 'bridge';
    }
    updateNetwork(state);
    expect(state.tiles[hy * state.w + hx + 6].powered).toBe(true);
  });
});

describe('gisements', () => {
  it('le derrick ne se pose que sur un suintement', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    expect(canPlaceBuilding(state, 'derrick', hx + 3, hy).ok).toBe(false);
    state.tiles[hy * state.w + hx + 3].k = 'oilSeep';
    expect(canPlaceBuilding(state, 'derrick', hx + 3, hy).ok).toBe(true);
    expect(canPlaceBuilding(state, 'lab', hx + 3, hy).ok).toBe(false);
  });

  it('un derrick branché sort du pétrole, et une centrale au fioul le brûle', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    state.tiles[hy * state.w + hx + 3].k = 'oilSeep';
    for (let x = hx + 1; x <= hx + 2; x++) state.tiles[hy * state.w + x].k = 'path';
    createBuilding(state, 'derrick', hx + 3, hy, 1);
    state.city.population = 20;
    run(state, 30);
    expect(state.stock.oil).toBeGreaterThan(1);
    state.stock.oil = 5;
    const plant = createBuilding(state, 'fuelplant', hx + 2, hy + 1, 1);
    run(state, 2);
    expect(plant.fuel).toBeGreaterThan(0);
    expect(state.stock.oil).toBeLessThan(5);
  });

  it('une chaîne complète va du pétrole aux pneus', () => {
    const { recipe: rubber } = BUILDINGS.rubberworks;
    const { recipe: tyres } = BUILDINGS.tyreshop;
    expect(rubber?.inputs.oil).toBeGreaterThan(0);
    expect(rubber?.inputs.sulfur).toBeGreaterThan(0);
    expect(tyres?.inputs.rubber).toBeGreaterThan(0);
    expect(tyres?.outputs.tyres).toBeGreaterThan(0);
  });

  it('une recherche qui consomme des matériaux les exige, puis les prend', () => {
    const state = createGame(1);
    state.settlement!.reached = true;
    state.techs.push('drills1', 'drills2', 'drills3');
    state.research = 50;
    expect(buyTech(state, 'tungstenbits')).toBe(false);
    state.stock.tungsten = 12;
    expect(buyTech(state, 'tungstenbits')).toBe(true);
    expect(state.stock.tungsten).toBe(2);
  });

  it('une fumerolle découverte souffle, et plus du tout sous un captage', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    const i = hy * state.w + hx + 3;
    state.tiles[i].k = 'fumarole';
    state.time = 0;
    updateGas(state);
    expect(state.tiles[i].gas ?? 0).toBeGreaterThan(0.2);
    for (const tile of state.tiles) tile.gas = 0;
    createBuilding(state, 'gascap', hx + 3, hy, 1);
    updateGas(state);
    expect(state.tiles[i].gas ?? 0).toBe(0);
  });

  it('une mousse se récolte comme un champignon', () => {
    const state = createGame(1);
    const { hx, hy } = chasmBesideHq(state);
    state.tiles[hy * state.w + hx + 3].k = 'moss';
    expect(designateArea(state, hx + 3, hy, hx + 3, hy)).toBe(1);
    run(state, 20);
    expect(state.tiles[hy * state.w + hx + 3].regrow).toBeGreaterThan(0);
  });
});

describe('vivres', () => {
  it('on ne mange rien avant d’avoir rejoint CITY', () => {
    expect(appetitePerSecond(createGame(1))).toBe(0);
  });

  it('les rations changent ce qu’on mange et le moral', () => {
    const state = createGame(1);
    state.settlement!.reached = true;
    const normal = appetitePerSecond(state);
    state.city.ration = 0;
    expect(appetitePerSecond(state)).toBeCloseTo(normal * 0.6);
    state.city.ration = 2;
    expect(appetitePerSecond(state)).toBeCloseTo(normal * 1.4);

    const low = createGame(1);
    const high = createGame(1);
    low.city.ration = 0;
    high.city.ration = 2;
    run(low, 120);
    run(high, 120);
    expect(low.city.morale).toBeLessThan(high.city.morale);
  });

  it('le bilan compte ce qui sort des serres, seulement si elles ont de l’eau', () => {
    const state = createGame(1);
    state.settlement!.reached = true;
    const farm = createBuilding(state, 'farm', 2, 2, 1);
    farm.eff = 1;
    state.stock.water = 0;
    expect(outputPerMinute(state, 'food')).toBe(0);
    state.stock.water = 10;
    expect(outputPerMinute(state, 'food')).toBeCloseTo(15);
  });

  it('une réserve qui suffit à tout n’a pas de fin annoncée', () => {
    const state = createGame(1);
    state.settlement!.reached = true;
    expect(foodMinutesLeft(state)).toBeLessThan(Infinity);
    state.city.population = 0;
    state.units = [];
    expect(foodMinutesLeft(state)).toBe(Infinity);
  });

  it('Krell vient expliquer, puis revient quand les vivres manquent', () => {
    const state = createGame(1);
    reveal(state, state.settlement!.x, state.settlement!.y);
    // Krell waits for the pause after the arrival at the city before coming in.
    run(state, 60);
    expect(state.story.fired).toContain('food_intro');
    expect(state.story.fired).not.toContain('food_short');
    state.stock.food = 1;
    run(state, 2);
    expect(state.story.fired).toContain('food_short');
  });
});

describe('édits', () => {
  const governed = () => {
    const state = createGame(1);
    state.settlement!.reached = true;
    return state;
  };

  it('chaque renvoi pointe vers un édit qui existe, et les exclusions vont par paires', () => {
    for (const edict of EDICTS) {
      if (edict.requires) expect(EDICTS.some((e) => e.id === edict.requires)).toBe(true);
      if (edict.excludes) {
        const other = EDICTS.find((e) => e.id === edict.excludes);
        expect(other?.excludes).toBe(edict.id);
      }
    }
  });

  it('rien ne se signe avant CITY', () => {
    const state = createGame(1);
    expect(edictLock(state, 'soup')).not.toBeNull();
    expect(signEdict(state, 'soup')).toBe(false);
  });

  it('signer applique l’effet, ferme l’autre voie et impose un délai', () => {
    const state = governed();
    const before = state.mods.appetite;
    expect(signEdict(state, 'soup')).toBe(true);
    expect(state.mods.appetite).toBeCloseTo(before - 0.2);
    expect(edictLock(state, 'fullplates')).toMatch(/Exclu/);
    expect(signEdict(state, 'watch')).toBe(false);
    state.time += EDICT_COOLDOWN;
    expect(signEdict(state, 'watch')).toBe(true);
    expect(signEdict(state, 'soup')).toBe(false);
  });

  it('un édit de suite attend le premier', () => {
    const state = governed();
    expect(edictLock(state, 'tribunal')).toMatch(/Après/);
  });

  it('« Rien ne se perd » rend de la nourriture à chaque mort', () => {
    const state = governed();
    state.edicts.push('larvae', 'corpses');
    state.stock.food = 0;
    state.city.oxygen = 0;
    state.city.population = 10;
    const before = state.city.population;
    run(state, 61);
    expect(state.city.population).toBeLessThan(before);
    expect(state.stock.food).toBeGreaterThan(0);
  });

  it('le vivier attend son édit', () => {
    const state = governed();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    expect(state.buildings.some((b) => b.type === 'vivarium')).toBe(false);
    expect(BUILDINGS.vivarium.edict).toBe('larvae');
    expect(hq).toBeDefined();
  });
});

describe('tenues', () => {
  it('les tenues à gagner sont fermées au départ, les autres ouvertes', () => {
    const state = createGame(1);
    for (const skin of SKINS) {
      expect(skinLock(state, skin.id) === null).toBe(!skin.unlock);
    }
  });

  it('conquérir un secteur ouvre sa tenue', () => {
    const state = createGame(1);
    expect(setCrewSkin(state, 'foreur', 'lumen')).toBe(false);
    state.conquered.push('lumen');
    expect(setCrewSkin(state, 'foreur', 'lumen')).toBe(true);
    expect(state.crewSkins.foreur).toBe('lumen');
  });

  it('habiller l’équipe remet dans le rang ceux qui avaient leur propre tenue', () => {
    const state = createGame(1);
    const unit = spawnUnit(state, 'foreur', 1, 1);
    unit.skin = 'coal';
    setCrewSkin(state, 'foreur', 'rust');
    expect(unit.skin).toBeUndefined();
  });
});

describe('anciennes sauvegardes', () => {
  const memory = (): SaveStorage => {
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
  };

  it('reçoivent la nouvelle géologie sans toucher à ce qui est découvert', () => {
    const state = createGame(5);
    // As saved before all this existed.
    for (const tile of state.tiles) {
      if (['chasm', 'moss', 'oilSeep', 'fumarole', 'tungstenSeam'].includes(tile.k))
        tile.k = 'loose';
    }
    const old = state as unknown as Record<string, unknown>;
    delete old.edicts;
    delete old.nextEdictAt;
    delete old.crewSkins;
    delete (state.stock as Partial<GameState['stock']>).oil;
    delete (state.mods as Partial<GameState['mods']>).appetite;
    delete (state.city as Partial<GameState['city']>).ration;
    (state.city.policies as Record<string, boolean>).rationing = true;
    state.story.flags.biomes = false;
    state.conquered.push('ash');
    const seen = state.tiles.map((t, i) => (t.seen ? `${i}${t.k}` : '')).join();

    const storage = memory();
    writeSave(storage, state);
    const loaded = readSave(storage)!;
    expect(loaded.stock.oil).toBe(0);
    expect(loaded.city.ration).toBe(0);
    expect(loaded.edicts).toEqual([]);
    expect(count(loaded, 'oilSeep')).toBeGreaterThan(0);
    expect(loaded.tiles.map((t, i) => (t.seen ? `${i}${t.k}` : '')).join()).toBe(seen);
    expect(loaded.sectorStart.lumen).toBeDefined();
    run(loaded, 3);
    expect(Number.isFinite(loaded.city.morale)).toBe(true);
  });
});
