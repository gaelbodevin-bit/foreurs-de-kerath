import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/data/regions';
import { BUILDINGS, PATH_REFUND } from '../src/data/buildings';
import { STORY_EVENTS } from '../src/data/story';
import { UNITS } from '../src/data/units';
import { generateWorld } from '../src/sim/mapgen';
import { idx, isWalkableKind, reveal } from '../src/sim/grid';
import { findPath } from '../src/sim/pathfinding';
import { createBuilding, spawnEnemy } from '../src/sim/entities';
import {
  canPlaceBuilding,
  designateArea,
  placeBuilding,
  placePath,
  removePaths,
  straightEnd,
  stepGame,
  trainUnit,
} from '../src/sim/game';
import { updateNetwork } from '../src/sim/economy';
import { answerEvent, eventById, investigate, updateStory } from '../src/sim/storyEngine';
import { drillAround, instantBuilding, newGame, run, unlockEverything } from './helpers';

describe('génération de carte', () => {
  it.each([1, 2, 3, 4])('graine %i : tout reste accessible en forant', (seed) => {
    const map = generateWorld(seed);
    const passable = (x: number, y: number) => {
      const k = map.tiles[y * map.w + x].k;
      return k !== 'solid' && k !== 'lava' && k !== 'water';
    };
    const seen = new Set<number>([map.start.y * map.w + map.start.x]);
    const stack = [...seen];
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      const x = cur % map.w;
      const y = Math.floor(cur / map.w);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || !passable(nx, ny)) continue;
        const ni = ny * map.w + nx;
        if (!seen.has(ni)) {
          seen.add(ni);
          stack.push(ni);
        }
      }
    }
    for (const s of map.structures) expect(seen.has(s.y * map.w + s.x)).toBe(true);
    const found = map.tiles.map((t) => t.k);
    for (const kind of ['oreSeam', 'crystalSeam', 'iceSeam']) expect(found).toContain(kind);
  });

  it('est déterministe', () => {
    const a = generateWorld(11);
    const b = generateWorld(11);
    expect(a.tiles.map((t) => t.k)).toEqual(b.tiles.map((t) => t.k));
  });
});

describe('données', () => {
  it('le contrôle de toutes les régions fait 100 %', () => {
    expect(REGIONS.reduce((sum, r) => sum + r.control, 0)).toBe(100);
  });

  it('chaque région est accessible depuis le site d’atterrissage', () => {
    const reached = new Set(['ash']);
    for (let i = 0; i < REGIONS.length; i++) {
      for (const r of REGIONS) if (r.requires.some((q) => reached.has(q))) reached.add(r.id);
    }
    expect(reached.size).toBe(REGIONS.length);
  });

  it('les intrigues ne référencent que des régions existantes', () => {
    const ids = REGIONS.map((r) => r.id);
    for (const event of STORY_EVENTS) {
      for (const region of event.when.regions ?? []) expect(ids).toContain(region);
      expect(event.choices.length).toBeGreaterThan(0);
    }
  });
});

describe('forage et transport', () => {
  it('un filon foré finit dans les réserves', () => {
    const state = newGame();
    const before = state.stock.crystal;
    // Seen diagonally is not enough: a foreur has to be able to stand next to it.
    const seam = state.tiles.findIndex(
      (t, i) =>
        t.seen &&
        t.k === 'crystalSeam' &&
        [1, -1, state.w, -state.w].some((d) => isWalkableKind(state.tiles[i + d].k)),
    );
    expect(seam).toBeGreaterThan(-1);
    designateArea(
      state,
      seam % state.w,
      Math.floor(seam / state.w),
      seam % state.w,
      Math.floor(seam / state.w),
    );
    run(state, 60);
    expect(state.tiles[seam].k).not.toBe('crystalSeam');
    expect(state.stock.crystal).toBeGreaterThan(before);
  });

  it('forer une paroi révèle la zone qui se trouve derrière', () => {
    const state = newGame();
    const seenBefore = state.tiles.filter((t) => t.seen).length;
    drillAround(state, 7);
    run(state, 90);
    expect(state.tiles.filter((t) => t.seen).length).toBeGreaterThan(seenBefore);
  });

  it('un second glissement sur les mêmes parois annule le marquage', () => {
    const state = newGame();
    const seam = state.tiles.findIndex((t) => t.seen && t.k === 'oreSeam');
    const x = seam % state.w;
    const y = Math.floor(seam / state.w);
    expect(designateArea(state, x, y, x, y)).toBe(1);
    expect(designateArea(state, x, y, x, y)).toBe(0);
    expect(state.jobs.some((j) => j.kind === 'drill')).toBe(false);
  });

  it('les foreurs ne peuvent pas percer la roche dure sans équipement', () => {
    const state = newGame();
    const hard = state.tiles.findIndex((t) => t.k === 'dirt' && t.seen);
    state.tiles[hard].k = 'hard';
    designateArea(
      state,
      hard % state.w,
      Math.floor(hard / state.w),
      hard % state.w,
      Math.floor(hard / state.w),
    );
    run(state, 40);
    expect(state.tiles[hard].k).toBe('hard');
  });
});

describe('réseau et bâtiments', () => {
  const hqOf = (state: ReturnType<typeof newGame>) => state.buildings.find((b) => b.type === 'hq')!;

  it('refuse de bâtir sur une paroi ou en double', () => {
    const state = newGame();
    const hq = hqOf(state);
    expect(canPlaceBuilding(state, 'depot', hq.x, hq.y).ok).toBe(false);
    const wall = state.tiles.findIndex((t) => t.seen && t.k === 'oreSeam');
    expect(canPlaceBuilding(state, 'depot', wall % state.w, Math.floor(wall / state.w)).ok).toBe(
      false,
    );
  });

  it('un bâtiment isolé reste hors tension, une voie énergétique le raccorde', () => {
    const state = newGame();
    const hq = hqOf(state);
    instantBuilding(state, 'oxygen', hq.x + 3, hq.y);
    updateNetwork(state);
    const oxygen = state.buildings.find((b) => b.type === 'oxygen')!;
    expect(oxygen.connected).toBe(false);
    state.tiles[idx(state, hq.x + 2, hq.y)].k = 'path';
    updateNetwork(state);
    expect(oxygen.connected).toBe(true);
  });

  it('les foreurs construisent ce qui est posé et posent les voies', () => {
    const state = newGame();
    const hq = hqOf(state);
    unlockEverything(state);
    expect(placeBuilding(state, 'depot', hq.x + 3, hq.y).ok).toBe(true);
    expect(placePath(state, hq.x + 2, hq.y, hq.x + 2, hq.y)).toBe(1);
    run(state, 40);
    expect(state.buildings.find((b) => b.type === 'depot')?.built).toBe(1);
    expect(state.tiles[idx(state, hq.x + 2, hq.y)].k).toBe('path');
  });

  it('les recettes transforment les stocks seulement avec énergie et personnel', () => {
    const state = newGame();
    const hq = hqOf(state);
    instantBuilding(state, 'melter', hq.x + 2, hq.y);
    state.stock.ice = 10;
    const water = state.stock.water;
    state.city.population = 8;
    run(state, 30);
    expect(state.stock.water).toBeGreaterThan(water);
    expect(state.stock.ice).toBeLessThan(10);
  });

  it('la formation d’un foreur retire un citoyen', () => {
    const state = newGame();
    run(state, 1);
    const population = state.city.population;
    const units = state.units.length;
    expect(trainUnit(state, hqOf(state).id, 'foreur').ok).toBe(true);
    expect(state.city.population).toBe(population - 1);
    run(state, 8);
    expect(state.units.length).toBe(units + 1);
  });
});

describe('gravats et stock plein', () => {
  it('déblayer avec la roche au plafond ne laisse pas de tas impossibles à ramasser', () => {
    const state = newGame();
    state.stock.stone = 150;
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const i = idx(state, hq.x + 3, hq.y);
    state.tiles[i].k = 'rubble';
    state.tiles[i].rubble = 1;
    designateArea(state, hq.x + 3, hq.y, hq.x + 3, hq.y);
    run(state, 30);
    expect(state.tiles[i].k).toBe('floor');
    expect(
      state.pickups.filter((p) => p.res === 'stone' && Math.hypot(p.x - hq.x, p.y - hq.y) < 6),
    ).toEqual([]);
  });
});

describe('tracer le sol technique', () => {
  it('une voie suit l’axe le plus long, quel que soit l’angle du glisser', () => {
    expect(straightEnd(10, 10, 20, 13)).toEqual({ x: 20, y: 10 });
    expect(straightEnd(10, 10, 12, 2)).toEqual({ x: 10, y: 2 });
    expect(straightEnd(10, 10, 4, 10)).toEqual({ x: 4, y: 10 });
    expect(straightEnd(10, 10, 10, 10)).toEqual({ x: 10, y: 10 });
    // Parfaitement en diagonale : à l'horizontale, pour que le résultat ne dépende pas d'un pixel.
    expect(straightEnd(10, 10, 15, 15)).toEqual({ x: 15, y: 10 });
  });
});

describe('retirer le sol technique', () => {
  const road = () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const x = hq.x + 3;
    const y = hq.y;
    state.tiles[idx(state, x, y)].k = 'path';
    return { state, x, y };
  };

  it('un foreur le démonte et récupère de la roche', () => {
    const { state, x, y } = road();
    const stone = state.stock.stone;
    expect(removePaths(state, x, y, x, y)).toBe(1);
    run(state, 25);
    expect(state.tiles[idx(state, x, y)].k).toBe('floor');
    expect(state.stock.stone).toBe(stone + PATH_REFUND);
    expect(state.jobs.some((j) => j.kind === 'unpath')).toBe(false);
  });

  it('repasser annule, et un sol prévu mais pas encore posé disparaît', () => {
    const { state, x, y } = road();
    expect(removePaths(state, x, y, x, y)).toBe(1);
    expect(removePaths(state, x, y, x, y)).toBe(1);
    expect(state.jobs.some((j) => j.kind === 'unpath')).toBe(false);
    const free = x + 1;
    state.tiles[idx(state, free, y)].k = 'floor';
    expect(placePath(state, free, y, free, y)).toBe(1);
    expect(removePaths(state, free, y, free, y)).toBe(1);
    expect(state.jobs.some((j) => j.kind === 'path')).toBe(false);
  });

  it('coupe le réseau derrière lui, et ne touche pas ce qui est sous un bâtiment', () => {
    const { state, x, y } = road();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    expect(removePaths(state, hq.x, hq.y, hq.x, hq.y)).toBe(0);
    const oxygen = createBuilding(state, 'oxygen', x + 1, y, 1);
    state.tiles[idx(state, x - 1, y)].k = 'path';
    updateNetwork(state);
    expect(oxygen.connected).toBe(true);
    removePaths(state, x - 1, y, x, y);
    run(state, 40);
    updateNetwork(state);
    expect(oxygen.connected).toBe(false);
  });
});

describe('champignons', () => {
  it('la récolte et la repousse redessinent la case', () => {
    const state = newGame();
    const i = state.tiles.findIndex((t) => t.k !== 'solid');
    state.tiles[i].k = 'fungus';
    state.tiles[i].regrow = 1;
    state.dirty = [];
    run(state, 1.1);
    expect(state.tiles[i].regrow).toBe(0);
    expect(state.dirty).toContain(i);
  });
});

describe('faim', () => {
  it('personne ne meurt de faim avant d’avoir rejoint la cité', () => {
    const state = newGame();
    state.stock.food = 0;
    const start = state.city.population;
    run(state, 400);
    expect(state.city.population).toBeGreaterThanOrEqual(start);
    expect(state.log.some((l) => l.text.includes('la faim'))).toBe(false);
  });

  it('la nourriture ne baisse qu’à partir de la cité', () => {
    const state = newGame();
    const food = state.stock.food;
    run(state, 60);
    expect(state.stock.food).toBe(food);
    state.settlement!.reached = true;
    run(state, 60);
    expect(state.stock.food).toBeLessThan(food);
  });

  it('en arrivant à CITY sans rien bâtir, la colonie a dix minutes avant le premier mort', () => {
    const state = newGame();
    reveal(state, state.settlement!.x, state.settlement!.y);
    run(state, 2);
    const population = state.city.population;
    run(state, 600);
    expect(state.stock.food).toBeGreaterThan(0);
    expect(state.city.population).toBeGreaterThanOrEqual(population);
  });
});

describe('cité', () => {
  it('la population croît tant qu’il reste des logements et de quoi manger', () => {
    const state = newGame();
    const population = state.city.population;
    run(state, 90);
    expect(state.city.population).toBeGreaterThan(population);
    expect(state.city.population).toBeLessThanOrEqual(state.city.housing);
  });

  it('les impôts rapportent des crédits mais pèsent sur le moral', () => {
    const light = newGame();
    const heavy = newGame();
    heavy.city.taxLevel = 3;
    light.city.taxLevel = 0;
    run(light, 120);
    run(heavy, 120);
    expect(heavy.stock.credits).toBeGreaterThan(light.stock.credits);
    expect(heavy.city.morale).toBeLessThan(light.city.morale);
  });

  it('la famine tue et le manque d’air aussi', () => {
    const state = newGame();
    state.settlement!.reached = true;
    state.stock.food = 0;
    state.city.oxygen = 0;
    const population = state.city.population;
    run(state, 60);
    expect(state.city.population).toBeLessThan(population);
  });
});

describe('combat', () => {
  /** A lone miner out of range of the headquarters' turret, on open and known ground. */
  const loneMiner = () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const foreur = state.units.find((u) => u.type === 'foreur')!;
    state.units = [foreur];
    foreur.x = hq.x + 20.5;
    foreur.y = hq.y + 0.5;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const tile = state.tiles[idx(state, Math.floor(foreur.x) + dx, Math.floor(foreur.y) + dy)];
        tile.k = 'floor';
        tile.seen = true;
      }
    }
    return { state, foreur };
  };

  it('un foreur rend les coups, un peu, et plus fort avec de meilleurs outils', () => {
    const hitWith = (drillPower: number) => {
      const { state, foreur } = loneMiner();
      state.mods.drillPower = drillPower;
      const enemy = spawnEnemy(state, 'golem', foreur.x + 0.5, foreur.y);
      const hp = enemy.hp;
      run(state, 0.3);
      return hp - enemy.hp;
    };
    expect(hitWith(1)).toBe(UNITS.foreur.melee!.damage);
    expect(hitWith(3)).toBe(UNITS.foreur.melee!.damage * 3);
  });

  it('un foreur finit par abattre un rongeur', () => {
    const { state, foreur } = loneMiner();
    foreur.hp = 500;
    spawnEnemy(state, 'rongeur', foreur.x + 0.5, foreur.y);
    run(state, 15);
    expect(state.kills.rongeur).toBe(1);
  });

  it('un foreur ne frappe ni à distance, ni ce qu’il ne voit pas', () => {
    const { state, foreur } = loneMiner();
    const far = spawnEnemy(state, 'golem', foreur.x + 5, foreur.y);
    far.dormant = true;
    const hidden = spawnEnemy(state, 'golem', foreur.x + 0.5, foreur.y);
    hidden.dormant = true;
    state.tiles[idx(state, Math.floor(hidden.x), Math.floor(hidden.y))].seen = false;
    const hp = far.hp;
    run(state, 3);
    expect(far.hp).toBe(hp);
    expect(hidden.hp).toBe(hp);
  });

  it('une tourelle sous tension abat un rongeur', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    instantBuilding(state, 'turret', hq.x + 2, hq.y);
    state.city.population = 8;
    run(state, 1);
    spawnEnemy(state, 'rongeur', hq.x + 3.5, hq.y + 0.5);
    run(state, 8);
    expect(state.kills.rongeur).toBe(1);
  });

  it('la perte du Noyau de commande met fin à la mission', () => {
    const state = newGame();
    state.buildings.find((b) => b.type === 'hq')!.hp = 0.1;
    state.buildings.splice(0, 1);
    run(state, 2);
    expect(state.outcome).toBe('lost');
  });

  it('les ennemis trouvent un chemin jusqu’à la cité', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const open = state.tiles.findIndex((t) => t.seen && isWalkableKind(t.k));
    const path = findPath(state, open % state.w, Math.floor(open / state.w), hq.x, hq.y);
    expect(path).not.toBeNull();
  });
});

describe('intrigues', () => {
  it('un événement suspend la partie jusqu’à la décision', () => {
    const state = newGame();
    run(state, 3, false);
    expect(state.story.pending).toContain('landing');
    const tick = state.tick;
    stepGame(state);
    expect(state.tick).toBe(tick);
    answerEvent(state, 0);
    stepGame(state);
    expect(state.tick).toBe(tick + 1);
  });

  it('les indices désignent le vrai traître', () => {
    for (const mole of ['orsa', 'krell', 'soum'] as const) {
      const state = newGame();
      state.story.mole = mole;
      state.story.flags.cityReached = true;
      state.time = 500;
      state.tick = 5000;
      updateStory(state);
      expect(state.story.clues).toContain(eventById('missing_crates').clue![mole]);
    }
  });

  it('accuser juste démantèle le complot, accuser à tort l’aggrave', () => {
    const right = newGame();
    const moleIndex = ['orsa', 'krell', 'soum'].indexOf(right.story.mole);
    right.city.conspiracy = 60;
    right.story.pending = ['accusation'];
    answerEvent(right, moleIndex);
    expect(right.story.moleCaught).toBe(true);
    expect(right.city.conspiracy).toBe(15);

    const wrong = newGame();
    wrong.city.conspiracy = 60;
    wrong.story.pending = ['accusation'];
    answerEvent(wrong, (moleIndex + 1) % 3);
    expect(wrong.story.moleCaught).toBe(false);
    expect(wrong.city.conspiracy).toBe(85);
  });

  it('un complot à son comble déclenche un soulèvement', () => {
    const state = newGame();
    drillAround(state, 6);
    run(state, 30);
    state.city.conspiracy = 100;
    updateStory(state);
    expect(state.city.conspiracy).toBe(55);
    expect(state.enemies.some((e) => e.type === 'saboteur')).toBe(true);
  });

  it('enquêter fait reculer le complot et coûte des crédits', () => {
    const state = newGame();
    state.city.conspiracy = 50;
    state.stock.credits = 100;
    expect(investigate(state).ok).toBe(true);
    expect(state.city.conspiracy).toBe(36);
    expect(state.stock.credits).toBe(60);
    state.stock.credits = 5;
    expect(investigate(state).ok).toBe(false);
  });
});

describe('équilibrage', () => {
  it('chaque bâtiment constructible a un coût', () => {
    for (const [id, def] of Object.entries(BUILDINGS)) {
      if (id !== 'hq') expect(Object.keys(def.cost).length).toBeGreaterThan(0);
    }
  });
});
