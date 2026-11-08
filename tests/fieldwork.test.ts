import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildersFor } from '../src/data/buildings';
import { CITY_STORAGE } from '../src/data/progression';
import { REGIONS, sectorAt } from '../src/data/regions';
import { STORY_EVENTS } from '../src/data/story';
import { updateContracts } from '../src/sim/contracts';
import { UNITS } from '../src/data/units';
import { computeLightMap } from '../src/render/lightMap';
import {
  airTrouble,
  appetitePerSecond,
  foodMinutesLeft,
  hasRoomFor,
  storageCapacity,
  updateNetwork,
  wouldConnect,
} from '../src/sim/economy';
import { createBuilding, spawnEnemy, spawnPickup } from '../src/sim/entities';
import { designateArea, placeBuilding, placePath, roadEnd } from '../src/sim/game';
import { idx } from '../src/sim/grid';
import { answerEvent, sabotage, STORY_GAP, updateStory } from '../src/sim/storyEngine';
import { spawnRaid } from '../src/sim/combat';
import { addJob, breakWall, crewCanReachWall } from '../src/sim/workers';
import type { GameState, Unit } from '../src/sim/types';
import { instantBuilding, newGame, run } from './helpers';

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

  it('ne commandent un chantier que si la colonie peut le payer', () => {
    let builds = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const state = newGame(seed);
      state.settlement!.reached = true;
      state.stock.crystal = 0;
      state.stock.ore = 20;
      state.stock.stone = 20;
      state.contracts = [];
      state.nextContractAt = 0;
      updateContracts(state);
      for (const c of state.contracts.filter((k) => k.kind === 'build')) {
        builds++;
        const cost = BUILDINGS[c.building!].cost;
        expect(cost.crystal ?? 0).toBe(0);
        expect(cost.ore ?? 0).toBeLessThanOrEqual(20);
      }
    }
    expect(builds).toBeGreaterThan(0);
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

describe('ce qu’on dit au joueur avant qu’il attende pour rien', () => {
  it('un bâtiment posé loin du courant est signalé hors réseau', () => {
    const state = newGame();
    const place = state.settlement!;
    place.reached = true;
    expect(wouldConnect(state, 'farm', place.x + 2, place.y)).toBe(true);
    expect(wouldConnect(state, 'farm', place.x + 12, place.y)).toBe(false);
  });

  it('une roche enfermée n’est accessible qu’une fois le passage marqué', () => {
    const { state, foreur } = loneMiner();
    const x = Math.floor(foreur.x) + 4;
    const y = Math.floor(foreur.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) state.tiles[idx(state, x + dx, y + dy)].k = 'dirt';
    }
    state.tiles[idx(state, x, y)].k = 'oreSeam';
    expect(crewCanReachWall(state, x - 1, y)).toBe(true);
    expect(crewCanReachWall(state, x, y)).toBe(false);
    addJob(state, 'drill', x - 1, y);
    expect(crewCanReachWall(state, x, y)).toBe(true);
  });
});

describe('les mineurs désœuvrés gardent la colonie', () => {
  it('un foreur sans tâche va au-devant d’un ennemi plus loin qu’un foreur occupé', () => {
    const { state, foreur } = loneMiner();
    foreur.hp = 500;
    spawnEnemy(state, 'rongeur', foreur.x + 8, foreur.y);
    run(state, 0.6);
    expect(foreur.chasing).toBe(true);
  });

  it('un foreur au travail ne lâche sa tâche que pour un ennemi tout proche', () => {
    const { state, foreur } = loneMiner();
    foreur.hp = 500;
    const x = Math.floor(foreur.x);
    const y = Math.floor(foreur.y);
    state.tiles[idx(state, x - 1, y - 1)].k = 'basalt';
    state.mods.drillPower = 3;
    addJob(state, 'drill', x - 1, y - 1);
    run(state, 0.5);
    expect(foreur.jobId).not.toBeNull();
    spawnEnemy(state, 'rongeur', foreur.x + 8, foreur.y);
    run(state, 0.6);
    expect(foreur.chasing).toBeFalsy();
  });
});

describe('moral expliqué', () => {
  it('la cité affiche chaque raison du moral, et leur somme est la cible vers laquelle il tend', () => {
    const state = newGame();
    state.city.population = 30;
    state.city.housing = 20;
    state.city.jobs = 0;
    run(state, 1);
    const why = state.city.moraleWhy ?? [];
    const labels = why.map((f) => f.label);
    expect(labels.some((l) => l.startsWith('Surpopulation'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Chômage'))).toBe(true);
    const target = why.reduce((sum, f) => sum + f.value, 0);
    const before = state.city.morale;
    run(state, 30);
    // Drifting towards the target: the gap shrinks.
    expect(Math.abs(state.city.morale - target)).toBeLessThan(Math.abs(before - target) + 1e-9);
  });
});

describe('gaz toxique', () => {
  it('personne n’est envoyé travailler dans un nuage de gaz', () => {
    const { state, foreur } = loneMiner();
    const x = Math.floor(foreur.x) + 4;
    const y = Math.floor(foreur.y);
    spawnPickup(state, 'ore', x + 0.5, y + 0.5);
    state.tiles[idx(state, x, y)].gas = 0.9;
    run(state, 2);
    expect(foreur.jobId).toBeNull();
  });

  it('un foreur à moitié asphyxié lâche sa tâche et sort du gaz', () => {
    const { state, foreur } = loneMiner();
    const x = Math.floor(foreur.x);
    const y = Math.floor(foreur.y);
    state.tiles[idx(state, x - 1, y)].k = 'dirt';
    addJob(state, 'drill', x - 1, y);
    run(state, 0.5);
    expect(foreur.jobId).not.toBeNull();
    // The cloud settles on the miner after the job was handed out.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) state.tiles[idx(state, x + dx, y + dy)].gas = 0.9;
    }
    foreur.hp = 20;
    run(state, 3);
    expect(foreur.jobId).toBeNull();
    expect(
      state.tiles[idx(state, Math.floor(foreur.x), Math.floor(foreur.y))].gas ?? 0,
    ).toBeLessThan(0.2);
    expect(foreur.hp).toBeGreaterThan(0);
  });

  it('une mort dans le gaz est annoncée comme telle', () => {
    const { state, foreur } = loneMiner();
    foreur.hp = 1;
    // Gas wall to wall: no clean air to run to.
    for (const tile of state.tiles) if (tile.k === 'floor') tile.gas = 0.9;
    run(state, 1.5);
    expect(state.units).not.toContain(foreur);
    expect(state.log.some((l) => l.text === 'Foreur asphyxié par le gaz.')).toBe(true);
  });
});

describe('alertes de pénurie', () => {
  it('prévient une fois quand le cristal des centrales va manquer, puis quand l’air s’épuise', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x, hq.y, 8);
    instantBuilding(state, 'generator', hq.x + 2, hq.y);
    state.stock.crystal = 2;
    run(state, 2);
    const fuel = () => state.log.filter((l) => l.text.startsWith('Réserve de cristal')).length;
    expect(fuel()).toBe(1);
    run(state, 5);
    expect(fuel()).toBe(1);

    state.city.oxygen = 35;
    run(state, 1.1);
    expect(state.log.some((l) => l.text.startsWith('L’air de la cité s’épuise'))).toBe(true);
  });

  it('prévient quand le courant ne suffit plus', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x, hq.y, 8);
    for (const r of Object.keys(state.stock) as (keyof typeof state.stock)[]) state.stock[r] = 500;
    // Three labs against the HQ: far more demand than its own current.
    instantBuilding(state, 'lab', hq.x + 2, hq.y);
    instantBuilding(state, 'lab', hq.x - 2, hq.y);
    instantBuilding(state, 'lab', hq.x, hq.y + 2);
    run(state, 2);
    expect(state.power.ratio).toBeLessThan(0.8);
    expect(state.log.filter((l) => l.text.startsWith('Courant insuffisant')).length).toBe(1);
  });
});

describe('éboulements', () => {
  it('le journal ne parle d’un éboulement que s’il blesse quelqu’un, et nomme la cause d’une mort', () => {
    const { state, foreur } = loneMiner();
    const x = Math.floor(foreur.x);
    const y = Math.floor(foreur.y);
    state.mods.hazard = 100;
    // Far from anyone: nothing to report.
    for (const dx of [6, 7]) state.tiles[idx(state, x + dx, y)].k = 'loose';
    breakWall(state, x + 6, y);
    expect(state.log.some((l) => l.text.startsWith('Éboulement'))).toBe(false);

    // Right next to the miner, with the last of his strength.
    for (const dx of [-2, -1]) state.tiles[idx(state, x + dx, y)].k = 'loose';
    foreur.hp = 5;
    breakWall(state, x - 2, y);
    expect(state.log.some((l) => l.text === 'Éboulement : un blessé.')).toBe(true);
    run(state, 0.2);
    expect(state.log.some((l) => l.text === 'Foreur enseveli sous un éboulement.')).toBe(true);
  });
});

describe('commandes distinctes', () => {
  it('jamais deux commandes de la même ressource en même temps', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame(seed);
      state.settlement!.reached = true;
      state.stock.food = 200;
      state.contracts = [];
      for (let i = 0; i < 8; i++) {
        state.nextContractAt = 0;
        updateContracts(state);
      }
      const orders = state.contracts.filter((c) => c.kind === 'deliver').map((c) => c.res);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});

describe('complot expliqué', () => {
  it('le dossier donne la vitesse du complot et ses causes, qui collent à ce qui se passe', () => {
    const state = newGame();
    state.settlement!.reached = true;
    state.city.morale = 20;
    state.city.conspiracy = 30;
    run(state, 0.1);
    const why = state.city.conspiracyWhy ?? [];
    expect(why.map((f) => f.label)).toContain('Moral sous 40');
    expect(why.map((f) => f.label)).toContain('Traître en liberté');
    const perMinute = why.reduce((sum, f) => sum + f.value, 0);
    const before = state.city.conspiracy;
    run(state, 6);
    expect(state.city.conspiracy - before).toBeCloseTo(perMinute / 10, 0);
  });
});

describe('journal des pertes', () => {
  it('un mineur mort faute d’air n’est pas annoncé « perdu au combat »', () => {
    const state = newGame();
    state.enemies = [];
    const foreur = state.units.find((u) => u.type === 'foreur')!;
    foreur.hp = 0.5;
    state.mods.oxygen = 0;
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    for (let i = 0; i < 20 && state.units.includes(foreur); i++) {
      // Away from the HQ, where wounds would close up as fast as the air runs out.
      foreur.x = hq.x + 15.5;
      state.city.oxygen = 0;
      run(state, 0.1);
    }
    expect(state.units).not.toContain(foreur);
    const texts = state.log.map((l) => l.text);
    expect(texts.some((t) => t.includes('faute d’air'))).toBe(true);
    expect(texts.some((t) => t.includes('perdu au combat'))).toBe(false);
  });

  it('la lave qui avance ne s’annonce qu’une fois par minute', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const cx = hq.x + 14;
    const cy = hq.y;
    openGround(state, cx, cy, 6);
    state.tiles[idx(state, cx, cy)].k = 'lava';
    const sector = sectorAt(cx, cy, state.w, state.h).index;
    const erosion = REGIONS[sector].erosion;
    REGIONS[sector].erosion = 1;
    try {
      run(state, 8);
    } finally {
      REGIONS[sector].erosion = erosion;
    }
    expect(state.tiles.filter((t) => t.k === 'lava').length).toBeGreaterThan(3);
    expect(state.log.filter((l) => l.text === 'La lave gagne du terrain.').length).toBe(1);
  });
});

describe('blessés', () => {
  /** A miner ten tiles from the HQ, on open ground all the way there, and nobody else around. */
  function minerOutside(): { state: GameState; foreur: Unit; home: { x: number; y: number } } {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const foreur = state.units.find((u) => u.type === 'foreur')!;
    state.units = [foreur];
    state.enemies = [];
    for (let x = hq.x - 2; x <= hq.x + 14; x++) openGround(state, x, hq.y + 1, 2);
    foreur.x = hq.x + 12.5;
    foreur.y = hq.y + 1.5;
    return { state, foreur, home: { x: hq.x + 1, y: hq.y + 1 } };
  }

  it('un foreur blessé et menacé se replie vers le QG au lieu de retourner au travail', () => {
    const { state, foreur, home } = minerOutside();
    foreur.hp = 15;
    spawnEnemy(state, 'rongeur', foreur.x + 2, foreur.y);
    const before = Math.hypot(foreur.x - home.x, foreur.y - home.y);
    run(state, 2);
    expect(Math.hypot(foreur.x - home.x, foreur.y - home.y)).toBeLessThan(before - 2);
  });

  it('les blessés guérissent près du QG, pas au fond des galeries', () => {
    const { state, foreur } = minerOutside();
    const max = UNITS.foreur.hp;
    foreur.hp = 10;
    run(state, 5);
    expect(foreur.hp).toBe(10);
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    foreur.x = hq.x + 1.5;
    foreur.y = hq.y + 2.5;
    run(state, 10);
    expect(foreur.hp).toBeGreaterThan(20);
    run(state, 60);
    expect(foreur.hp).toBe(max);
  });
});

describe('fourmilière', () => {
  it('un chantier accueille plusieurs ouvriers, trois au plus', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x + 6, hq.y + 1, 3);
    state.cityLevel = 4;
    state.settlement!.reached = true;
    expect(placeBuilding(state, 'depot', hq.x + 5, hq.y).ok).toBe(true);
    const depot = state.buildings[state.buildings.length - 1];
    expect(state.jobs.filter((j) => j.kind === 'build' && j.refId === depot.id).length).toBe(
      Math.min(3, BUILDINGS.depot.size ** 2 + 1),
    );
  });

  it('pas de naissance quand l’air ne suffit plus, même avec des logements libres', () => {
    const state = newGame();
    state.settlement!.reached = true;
    state.city.population = 40;
    state.city.housing = 200;
    state.city.morale = 60;
    state.stock.food = 500;
    state.mods.oxygen = 0;
    state.city.oxygen = 100;
    run(state, 30);
    expect(state.city.population).toBeLessThanOrEqual(40);
  });
});

describe('fourmilière, suite', () => {
  it('un chantier fini libère tous ses ouvriers d’un coup', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x + 6, hq.y + 1, 3);
    state.cityLevel = 4;
    state.settlement!.reached = true;
    state.units = [state.units.find((u) => u.type === 'foreur')!];
    expect(placeBuilding(state, 'generator', hq.x + 5, hq.y).ok).toBe(true);
    const site = state.buildings[state.buildings.length - 1];
    for (let i = 0; i < 4000 && site.built < 1; i++) run(state, 0.1);
    expect(site.built).toBe(1);
    expect(state.jobs.filter((j) => j.kind === 'build' && j.refId === site.id)).toEqual([]);
  });

  it('un chantier d’une ancienne sauvegarde retrouve toute son équipe', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x + 6, hq.y + 1, 3);
    state.cityLevel = 4;
    state.settlement!.reached = true;
    expect(placeBuilding(state, 'generator', hq.x + 5, hq.y).ok).toBe(true);
    const site = state.buildings[state.buildings.length - 1];
    const slots = () => state.jobs.filter((j) => j.kind === 'build' && j.refId === site.id).length;
    // An old save had a single job per site.
    state.jobs = state.jobs.filter(
      (j) =>
        j.kind !== 'build' ||
        j.refId !== site.id ||
        j === state.jobs.find((k) => k.refId === site.id),
    );
    expect(slots()).toBe(1);
    run(state, 1.1);
    expect(slots()).toBe(buildersFor('generator'));
  });

  it('personne ne guérit quand la colonie n’a plus d’air', () => {
    const state = newGame();
    state.enemies = [];
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    const foreur = state.units.find((u) => u.type === 'foreur')!;
    state.mods.oxygen = 0;
    foreur.hp = 30;
    for (let i = 0; i < 50; i++) {
      foreur.x = hq.x + 1.5;
      foreur.y = hq.y + 2.5;
      state.city.oxygen = 0;
      run(state, 0.1);
    }
    expect(foreur.hp).toBeLessThan(30);
  });

  it('pas de naissance sans serres qui suivent, même avec des vivres en stock', () => {
    const state = newGame();
    state.settlement!.reached = true;
    state.city.population = 40;
    state.city.housing = 200;
    state.city.morale = 60;
    state.stock.food = 500;
    state.city.oxygen = 100;
    state.mods.oxygen = 10;
    run(state, 30);
    expect(state.city.population).toBeLessThanOrEqual(40);
  });

  it('la réserve de vivres compte la glace qui fait tourner les serres', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x + 5, hq.y + 1, 3);
    Object.assign(state.stock, { ore: 200, stone: 200, crystal: 50, credits: 500 });
    instantBuilding(state, 'farm', hq.x + 3, hq.y);
    instantBuilding(state, 'farm', hq.x + 3, hq.y + 2);
    instantBuilding(state, 'melter', hq.x + 5, hq.y);
    state.city.population = 20;
    state.stock.food = 20;
    state.stock.water = 6;
    state.stock.ice = 4;
    expect(foodMinutesLeft(state)).toBeLessThan(Infinity);
  });
});

describe('peaufinage des parties longues', () => {
  it('une centrale sans personne ne brûle pas son cristal', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x + 5, hq.y + 1, 3);
    Object.assign(state.stock, { ore: 200, stone: 200, crystal: 50, credits: 500 });
    instantBuilding(state, 'generator', hq.x + 3, hq.y);
    state.city.population = 0;
    const crystal = state.stock.crystal;
    run(state, 120);
    expect(state.stock.crystal).toBe(crystal);
  });

  it('un sabotage ne frappe pas deux fois le même bâtiment, et ne fait disparaître rien d’autre', () => {
    const state = newGame();
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    openGround(state, hq.x + 5, hq.y + 1, 3);
    Object.assign(state.stock, { ore: 200, stone: 200, crystal: 50, credits: 500 });
    instantBuilding(state, 'farm', hq.x + 3, hq.y);
    const farm = state.buildings[state.buildings.length - 1];
    farm.hp = BUILDINGS.farm.hp * 0.25;
    const site = createBuilding(state, 'habitat', hq.x + 6, hq.y, 0.3);
    sabotage(state, 2);
    expect(state.buildings).toContain(hq);
    expect(state.buildings).toContain(site);
    expect(state.buildings).not.toContain(farm);
    expect(state.log.filter((l) => l.text.includes('Sabotage')).length).toBe(0);
    expect(state.log.filter((l) => l.text.includes('Bâtiment détruit')).length).toBe(1);
  });

  it('quand l’air manque, les morts de l’équipe tiennent en une ligne avec la vraie cause', () => {
    const state = newGame();
    state.enemies = [];
    const hq = state.buildings.find((b) => b.type === 'hq')!;
    state.mods.oxygen = 0;
    for (const u of state.units) u.hp = 0.5;
    for (let i = 0; i < 20 && state.units.some((u) => UNITS[u.type].citizens > 0); i++) {
      for (const u of state.units) u.x = hq.x + 15.5;
      state.city.oxygen = 0;
      run(state, 0.1);
    }
    const lines = state.log.filter((l) => l.text.includes('faute d’air'));
    expect(lines.length).toBe(1);
    expect(lines[0].text).toMatch(/^\d+ \S+ .*morts faute d’air : /);
    expect(lines[0].text).toContain(airTrouble(state));
  });

  it('l’alerte nourriture ne sonne qu’une fois par pénurie', () => {
    const state = newGame();
    state.settlement!.reached = true;
    state.city.population = 20;
    for (let i = 0; i < 6; i++) {
      state.stock.food = 13;
      run(state, 10);
    }
    expect(state.log.filter((l) => l.text.startsWith('Nourriture presque épuisée')).length).toBe(1);
  });

  it('un raid ne sort jamais d’un filon, et ne laisse pas de marque de forage orpheline', () => {
    const state = newGame(23);
    run(state, 30);
    for (let n = 0; n < 6; n++) spawnRaid(state, 'rongeur', 3);
    for (const job of state.jobs.filter((j) => j.kind === 'drill')) {
      expect(state.tiles[idx(state, job.x, job.y)].k).not.toBe('rubble');
    }
  });

  it('un foreur posé de travers près de la roche marquée va se placer au lieu de tourner en rond', () => {
    const { state, foreur } = loneMiner();
    const tx = Math.floor(foreur.x);
    const ty = Math.floor(foreur.y);
    state.tiles[idx(state, tx + 1, ty)].k = 'dirt';
    // On the access tile, but at its far edge: 1.49 from the wall's middle.
    foreur.x = tx + 0.01;
    foreur.y = ty + 0.5;
    designateArea(state, tx + 1, ty, tx + 1, ty);
    run(state, 12);
    expect(state.tiles[idx(state, tx + 1, ty)].k).not.toBe('dirt');
  });

  it('les réfugiés demandent plus de logements qu’il n’y en a, et restent dehors sans air', () => {
    const state = newGame();
    state.settlement!.reached = true;
    state.city.housing = 60;
    state.city.population = 20;
    state.city.oxygen = 20;
    state.contracts = [];
    for (let i = 0; i < 40; i++) {
      state.nextContractAt = 0;
      updateContracts(state);
    }
    expect(state.contracts.filter((c) => c.kind === 'refugees')).toEqual([]);
  });
});
