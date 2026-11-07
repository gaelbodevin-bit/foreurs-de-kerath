import { BUILDINGS, type BuildingDef } from '../data/buildings';
import {
  CITY_GRID_RADIUS,
  CITY_GRID_REACH,
  CITY_HOUSING,
  CITY_OXYGEN,
  CITY_STORAGE,
  gridReach,
} from '../data/progression';
import { REGIONS } from '../data/regions';
import { RESOURCES } from '../data/resources';
import { CORPSE_FOOD, edictById } from '../data/edicts';
import { POLICIES, RATIONS, TAX_LEVELS, UNITS } from '../data/units';
import { carriesCurrent, idx, NEIGHBORS8 } from './grid';
import { log, spawnUnit } from './entities';
import type { Building, BuildingType, Cost, GameState, MoraleFactor, ResourceId } from './types';
import { RESOURCE_IDS, TICK_SECONDS } from './types';

export const storageCapacity = (state: GameState): number =>
  state.buildings.reduce(
    (sum, b) => (b.built >= 1 ? sum + (BUILDINGS[b.type].storage ?? 0) : sum),
    state.settlement?.reached ? CITY_STORAGE : 0,
  );

export function hasRoomFor(state: GameState, res: ResourceId, amount = 1): boolean {
  return RESOURCES[res].uncapped || state.stock[res] + amount <= storageCapacity(state);
}

export function addStock(state: GameState, res: ResourceId, amount: number): void {
  const next = state.stock[res] + amount;
  const capped = RESOURCES[res].uncapped ? next : Math.min(next, storageCapacity(state));
  state.stock[res] = Math.max(0, capped);
}

export const canAfford = (state: GameState, cost: Cost): boolean =>
  RESOURCE_IDS.every((r) => state.stock[r] >= (cost[r] ?? 0));

export function pay(state: GameState, cost: Cost): void {
  for (const r of RESOURCE_IDS) state.stock[r] -= cost[r] ?? 0;
}

/** A plant only pushes the current further while it has something to burn. */
function isRunningSource(state: GameState, b: Building): boolean {
  const def = BUILDINGS[b.type];
  if (!def.powerOutput || b.built < 1 || b.sabotaged > 0) return false;
  return !def.burnTime || b.fuel > 0 || state.stock[def.fuel ?? 'crystal'] >= 1;
}

/**
 * Works out how far the current gets. It leaves the HQ, the outposts and CITY with a reach, loses a
 * tile of it at each step along roads and adjoining buildings, and every plant it reaches gives it
 * a fresh start. Roads beyond that stay dark, and whatever hangs off them gets no power.
 */
export function updateNetwork(state: GameState): void {
  state.networkDirty = false;
  const owner = new Map<number, Building>();
  const tilesOf = (b: Building): number[] => {
    const size = BUILDINGS[b.type].size;
    const tiles: number[] = [];
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) tiles.push(idx(state, b.x + dx, b.y + dy));
    }
    return tiles;
  };
  for (const b of state.buildings) {
    b.connected = false;
    if (b.built < 1) continue;
    for (const i of tilesOf(b)) owner.set(i, b);
  }

  const remaining = new Int16Array(state.tiles.length).fill(-1);
  // Strongest first, so that a tile is settled by the best current that can reach it.
  const queues: number[][] = [];
  let level = 0;
  const feed = (i: number, reach: number) => {
    if (reach <= remaining[i]) return;
    remaining[i] = reach;
    (queues[reach] ??= []).push(i);
    if (reach > level) level = reach;
  };
  const output = (b: Building) => (BUILDINGS[b.type].powerOutput ?? 0) * state.mods.powerOutput;
  for (const b of state.buildings) {
    if (b.type === 'hq' || (b.type === 'camp' && b.built >= 1)) {
      for (const i of tilesOf(b)) feed(i, gridReach(output(b)));
    }
  }
  const place = state.settlement;
  if (place?.reached) {
    for (let y = place.y - CITY_GRID_RADIUS; y <= place.y + CITY_GRID_RADIUS; y++) {
      for (let x = place.x - CITY_GRID_RADIUS; x <= place.x + CITY_GRID_RADIUS; x++) {
        if (x < 0 || y < 0 || x >= state.w || y >= state.h) continue;
        if (Math.hypot(x - place.x, y - place.y) <= CITY_GRID_RADIUS) {
          feed(idx(state, x, y), CITY_GRID_REACH);
        }
      }
    }
  }
  while (level >= 0) {
    const cur = queues[level]?.pop();
    if (cur === undefined) {
      level--;
      continue;
    }
    if (remaining[cur] !== level) continue;
    const building = owner.get(cur);
    if (building) {
      building.connected = true;
      if (isRunningSource(state, building)) {
        for (const i of tilesOf(building)) feed(i, gridReach(output(building)));
      }
    }
    const cx = cur % state.w;
    const cy = Math.floor(cur / state.w);
    for (const [dx, dy] of NEIGHBORS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
      const ni = idx(state, nx, ny);
      // Corner to corner, only a road goes on: a diagonal one has no other way of joining up.
      if (dx !== 0 && dy !== 0) {
        if (!carriesCurrent(state.tiles[cur].k) || !carriesCurrent(state.tiles[ni].k)) continue;
      }
      if (carriesCurrent(state.tiles[ni].k) || owner.has(ni)) feed(ni, remaining[cur] - 1);
    }
  }

  // Slabs lighting up or going dark have to be redrawn.
  let shortfall = false;
  state.tiles.forEach((tile, i) => {
    const road = carriesCurrent(tile.k);
    const powered = road && remaining[i] >= 0;
    if ((tile.powered ?? false) !== powered) {
      tile.powered = powered;
      state.dirty.push(i);
    }
    if (!road || powered || shortfall) return;
    // A stub laid far from anything isn't a shortage: this one has live road right next to it.
    const x = i % state.w;
    const y = Math.floor(i / state.w);
    shortfall = NEIGHBORS8.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) return false;
      const ni = idx(state, nx, ny);
      if (dx !== 0 && dy !== 0 && !carriesCurrent(state.tiles[ni].k)) return false;
      return remaining[ni] >= 0;
    });
  });
  const flags = state.story.flags;
  if (shortfall && !flags.gridShortNow) {
    log(state, 'Le sol technique s’éteint : le courant ne porte pas plus loin.', 'warn');
    state.fx.push({ kind: 'sound', id: 'alert' });
  }
  flags.gridShortNow = shortfall;
  // What brings the advisor to the player, once.
  if (shortfall) flags.gridShort = true;
}

export const needsGrid = (def: BuildingDef): boolean =>
  (def.power ?? 0) > 0 || def.powerOutput !== undefined;

/**
 * Whether a building put down here would be on the grid as things stand: inside the city's own reach,
 * or touching a live slab or a building that already has current.
 */
export function wouldConnect(state: GameState, type: BuildingType, x: number, y: number): boolean {
  const size = BUILDINGS[type].size;
  const place = state.settlement;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (place?.reached && Math.hypot(tx - place.x, ty - place.y) <= CITY_GRID_RADIUS) return true;
      for (const [nx, ny] of [
        [tx + 1, ty],
        [tx - 1, ty],
        [tx, ty + 1],
        [tx, ty - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
        if (state.tiles[idx(state, nx, ny)].powered) return true;
        const other = state.buildings.find(
          (b) =>
            b.connected &&
            nx >= b.x &&
            ny >= b.y &&
            nx < b.x + BUILDINGS[b.type].size &&
            ny < b.y + BUILDINGS[b.type].size,
        );
        if (other) return true;
      }
    }
  }
  return false;
}

function canRun(b: Building, def: BuildingDef): boolean {
  if (b.built < 1 || b.sabotaged > 0) return false;
  return !needsGrid(def) || b.connected;
}

const MORALE_BASE = 52;
/** Below this morale, discontent feeds the plot. */
const UNREST_MORALE = 40;

export function updateEconomy(state: GameState): void {
  const dt = TICK_SECONDS;
  if (state.networkDirty) updateNetwork(state);

  const city = state.city;
  city.jobs = 0;
  city.housing = 0;
  for (const b of state.buildings) {
    if (b.built < 1) continue;
    const def = BUILDINGS[b.type];
    city.jobs += def.jobs ?? 0;
    if (def.housing) {
      city.housing += def.housing + (b.type === 'habitat' ? state.mods.housing : 0);
    }
  }
  if (state.settlement?.reached) city.housing += CITY_HOUSING;
  const staff = city.jobs === 0 ? 1 : Math.min(1, Math.floor(city.population) / city.jobs);

  // Power comes first: every other building's output depends on it.
  let produced = 0;
  let demand = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!canRun(b, def)) continue;
    if (def.burnTime) {
      const fuel = def.fuel ?? 'crystal';
      if (b.fuel <= 0 && state.stock[fuel] >= 1) {
        state.stock[fuel] -= 1;
        b.fuel = def.burnTime;
      }
      if (b.fuel > 0) {
        b.fuel -= dt;
        produced += (def.powerOutput ?? 0) * staff * state.mods.powerOutput;
      }
    } else {
      produced += def.powerOutput ?? 0;
    }
    demand += def.power ?? 0;
  }
  const ratio = demand === 0 ? 1 : Math.min(1, produced / demand);
  state.power = { produced, demand, ratio };

  const strike = city.morale < 25 ? 0.5 : 1;
  const overtime = city.policies.overtime ? 1.25 : 1;

  let oxygenFlow = state.settlement?.reached ? CITY_OXYGEN : 0;
  let securityPressure = 0;
  let moraleBonus = 0;
  let taxBonus = 0;

  for (const b of state.buildings) {
    if (b.sabotaged > 0) b.sabotaged -= dt;
    const def = BUILDINGS[b.type];
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (!canRun(b, def)) {
      b.eff = 0;
      continue;
    }
    const powerFactor = (def.power ?? 0) > 0 ? ratio : 1;
    const staffFactor = (def.jobs ?? 0) > 0 ? staff : 1;
    b.eff = powerFactor * staffFactor * strike;
    if (b.type === 'hq') b.eff = 1;

    oxygenFlow += (def.oxygen ?? 0) * b.eff;
    securityPressure += (def.conspiracy ?? 0) * b.eff;
    moraleBonus += (def.morale ?? 0) * b.eff;
    taxBonus += (def.taxBonus ?? 0) * b.eff;

    if (def.research) state.research += def.research * b.eff * state.mods.research * dt;
    if (def.recipe && b.eff > 0) runRecipe(state, b, def, overtime * state.mods.production);
    if (b.queue.length > 0) runTraining(state, b);
  }

  updateCity(state, { oxygenFlow, securityPressure, moraleBonus, taxBonus });
}

function runRecipe(state: GameState, b: Building, def: BuildingDef, boost: number): void {
  const recipe = def.recipe;
  if (!recipe || !canAfford(state, recipe.inputs)) return;
  for (const r of RESOURCE_IDS) {
    if (recipe.outputs[r] && !hasRoomFor(state, r, recipe.outputs[r])) return;
  }
  b.progress += TICK_SECONDS * b.eff * boost;
  if (b.progress < recipe.cycle) return;
  b.progress -= recipe.cycle;
  pay(state, recipe.inputs);
  for (const r of RESOURCE_IDS) {
    if (recipe.outputs[r]) addStock(state, r, recipe.outputs[r]);
  }
}

function runTraining(state: GameState, b: Building): void {
  const type = b.queue[0];
  b.queueT += TICK_SECONDS;
  if (b.queueT < UNITS[type].trainTime) return;
  b.queueT = 0;
  b.queue.shift();
  const size = BUILDINGS[b.type].size;
  spawnUnit(state, type, b.x + size / 2, b.y + size + 0.5);
  state.fx.push({ kind: 'burst', x: b.x + size / 2, y: b.y + size + 0.5, color: 0x35e0c2 });
  log(state, `${UNITS[type].name} prêt au service.`, 'good');
}

/** Seconds one person takes to eat one unit of food. */
const FOOD_PER_MOUTH_SECONDS = 180;
/** However many canteens: people still have to eat. */
const MAX_APPETITE_CUT = 0.5;
/** Warned at this stock: about a minute's notice for a young colony. */
const LOW_FOOD = 12;
/** The steward comes knocking when the stores would run out in this many minutes. */
const FOOD_ALARM_MINUTES = 3;
/** Warning time before the plants burn their last fuel. */
const FUEL_ALARM_MINUTES = 3;
/** Seconds between two deaths, for as long as the colony goes hungry or breathless. */
const DEATH_EVERY = 60;
/** Population at which births come twice as fast as in a fresh colony. */
const GROWTH_CROWD = 40;
/** Air level under which no child is born. */
const BIRTH_AIR = 50;
/** Minutes of food ahead under which no child is born. */
const BIRTH_FOOD_MINUTES = 8;

interface CityInputs {
  oxygenFlow: number;
  securityPressure: number;
  moraleBonus: number;
  taxBonus: number;
}

/** Food eaten per second by the whole colony, once it has a city to feed. */
export function appetitePerSecond(state: GameState): number {
  if (!(state.settlement?.reached ?? false)) return 0;
  const workers = state.units.filter((u) => UNITS[u.type].citizens > 0).length;
  const cut = state.buildings.reduce(
    (sum, b) => sum + (BUILDINGS[b.type].appetite ?? 0) * b.eff,
    0,
  );
  return (
    ((state.city.population + workers) / FOOD_PER_MOUTH_SECONDS) *
    RATIONS[state.city.ration].eat *
    state.mods.appetite *
    (1 - Math.min(MAX_APPETITE_CUT, cut))
  );
}

/** How much of a resource comes out per minute, with the buildings working right now. */
export function outputPerMinute(state: GameState, res: ResourceId): number {
  const boost = (state.city.policies.overtime ? 1.25 : 1) * state.mods.production;
  return state.buildings.reduce((sum, b) => {
    const recipe = BUILDINGS[b.type].recipe;
    if (!recipe?.outputs[res] || b.built < 1 || !canAfford(state, recipe.inputs)) return sum;
    return sum + ((recipe.outputs[res] ?? 0) / recipe.cycle) * 60 * b.eff * boost;
  }, 0);
}

/** What the running buildings draw from the stores each minute. */
function usePerMinute(state: GameState, res: ResourceId): number {
  return state.buildings.reduce((sum, b) => {
    const recipe = BUILDINGS[b.type].recipe;
    if (!recipe?.inputs[res] || b.built < 1 || !canAfford(state, recipe.inputs)) return sum;
    return sum + ((recipe.inputs[res] ?? 0) / recipe.cycle) * 60 * b.eff;
  }, 0);
}

/**
 * Minutes the stores last at this rate. Infinite only when more comes in than goes out for good:
 * a greenhouse whose water is running out stops feeding anyone once the tank is empty.
 */
export function foodMinutesLeft(state: GameState): number {
  const eaten = appetitePerSecond(state) * 60;
  const grown = outputPerMinute(state, 'food');
  // How long the growers keep going on what feeds them.
  let lasts = Infinity;
  for (const res of RESOURCE_IDS) {
    const drain = usePerMinute(state, res) - outputPerMinute(state, res);
    if (drain > 0 && feedsGrowers(state, res)) lasts = Math.min(lasts, state.stock[res] / drain);
  }
  const net = grown - eaten;
  if (lasts === Infinity) return net >= 0 ? Infinity : state.stock.food / -net;
  if (net < 0 && state.stock.food / -net <= lasts) return state.stock.food / -net;
  const after = state.stock.food + net * lasts;
  return eaten <= 0 ? Infinity : lasts + after / eaten;
}

/** Whether some food producer runs on this resource. */
function feedsGrowers(state: GameState, res: ResourceId): boolean {
  return state.buildings.some((b) => {
    const recipe = BUILDINGS[b.type].recipe;
    return b.built >= 1 && !!recipe?.outputs.food && !!recipe.inputs[res];
  });
}

/** Once a second: what brings the steward to the governor's door. */
export function updateFoodWatch(state: GameState): void {
  if (!(state.settlement?.reached ?? false)) return;
  const flags = state.story.flags;
  if (foodMinutesLeft(state) < FOOD_ALARM_MINUTES) flags.foodShort = true;
  if (state.stock.food <= 0) flags.starved = true;
  updateSupplyWatch(state);
}

/**
 * Raises the alarm once when something vital tips over, and again only after it has recovered:
 * fuel for the plants, current for the grid, air for the city.
 */
function updateSupplyWatch(state: GameState): void {
  const flags = state.story.flags;
  const alarm = (key: string, on: boolean, off: boolean, text: string) => {
    if (on && !flags[key]) {
      flags[key] = true;
      log(state, text, 'warn');
      state.fx.push({ kind: 'sound', id: 'alert' });
    } else if (off) {
      flags[key] = false;
    }
  };

  const burn: Partial<Record<ResourceId, number>> = {};
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (b.built < 1 || !def.burnTime) continue;
    const fuel = def.fuel ?? 'crystal';
    burn[fuel] = (burn[fuel] ?? 0) + 60 / def.burnTime;
  }
  for (const [fuel, perMinute] of Object.entries(burn) as [ResourceId, number][]) {
    const minutes = state.stock[fuel] / perMinute;
    const name = RESOURCES[fuel].name.toLowerCase();
    alarm(
      `fuelShort_${fuel}`,
      minutes < FUEL_ALARM_MINUTES,
      minutes > FUEL_ALARM_MINUTES * 2,
      `Réserve de ${name} : moins de ${FUEL_ALARM_MINUTES} min pour les centrales. Sans elles, plus de courant ni d’oxygène.`,
    );
  }

  const { produced, demand, ratio } = state.power;
  alarm(
    'powerShort',
    ratio < 0.8,
    ratio >= 1,
    `Courant insuffisant (${Math.round(produced)}/${Math.round(demand)}) : les bâtiments tournent au ralenti.`,
  );

  if (state.settlement?.reached) {
    alarm(
      'airShort',
      state.city.oxygen < 40,
      state.city.oxygen > 60,
      'L’air de la cité s’épuise : il faut des extracteurs d’oxygène alimentés en courant.',
    );
  }
}

function updateCity(state: GameState, inputs: CityInputs): void {
  const dt = TICK_SECONDS;
  const city = state.city;
  const workers = state.units.filter((u) => UNITS[u.type].citizens > 0).length;
  const mouths = city.population + workers;

  // Oxygen.
  const o2Flow = inputs.oxygenFlow * state.mods.oxygen - mouths * 0.01;
  city.oxygen = Math.min(100, Math.max(0, city.oxygen + o2Flow * dt));

  // Food.
  // The expedition lives on its rations: hunger only starts once there is a city to feed.
  const fed = !(state.settlement?.reached ?? true);
  const foodBefore = state.stock.food;
  state.stock.food = Math.max(0, foodBefore - appetitePerSecond(state) * dt);
  if (foodBefore >= LOW_FOOD && state.stock.food < LOW_FOOD) {
    log(
      state,
      'Nourriture presque épuisée : il faut de la glace, un fondoir et une serre (touche N).',
      'warn',
    );
    state.fx.push({ kind: 'sound', id: 'alert' });
  }
  const starving = !fed && state.stock.food <= 0;

  // Taxes and upkeep.
  const tax = TAX_LEVELS[city.taxLevel];
  const taxes = city.population * tax.rate * (1 + inputs.taxBonus) * state.mods.taxes;
  let policyMorale = 0;
  let upkeep = 0;
  for (const [id, active] of Object.entries(city.policies)) {
    if (!active) continue;
    const def = POLICIES[id as keyof typeof POLICIES];
    policyMorale += def.morale;
    upkeep += def.upkeep;
  }
  state.stock.credits = Math.max(0, state.stock.credits + (taxes - upkeep) * dt);

  // Morale drifts towards a target built from living conditions.
  const unemployed =
    city.population > 0 ? Math.max(0, city.population - city.jobs) / city.population : 0;
  const overcrowded = city.population > city.housing;
  const signed = state.edicts.reduce((sum, id) => sum + (edictById(id).morale ?? 0), 0);
  const why: MoraleFactor[] = [
    { label: 'Base', value: MORALE_BASE },
    { label: 'Bâtiments (place, cantine…)', value: inputs.moraleBonus },
    { label: `Impôts : ${tax.name.toLowerCase()}`, value: tax.morale },
    { label: 'Décrets', value: policyMorale },
    { label: 'Édits signés', value: signed },
    {
      label: `Rations : ${RATIONS[city.ration].name.toLowerCase()}`,
      value: RATIONS[city.ration].morale,
    },
    { label: 'Événements récents', value: city.moraleShock },
    { label: 'Complot', value: -state.city.conspiracy * 0.12 },
    { label: 'Surpopulation : pas assez de logements', value: overcrowded ? -12 : 0 },
    { label: 'Famine', value: starving ? -28 : 0 },
    { label: 'Air vicié', value: city.oxygen < 25 ? -18 : 0 },
    { label: 'Chômage : moins d’un emploi pour deux', value: unemployed > 0.5 ? -6 : 0 },
  ];
  city.moraleWhy = why.filter((f) => f.label === 'Base' || Math.abs(f.value) >= 0.5);
  const target = why.reduce((sum, f) => sum + f.value, 0);
  city.morale += (Math.max(0, Math.min(100, target)) - city.morale) * 0.03 * dt;
  city.moraleShock *= 1 - 0.01 * dt;

  // Conspiracy.
  const unrest = city.morale < UNREST_MORALE ? 0.03 : 0;
  const mole = state.story.moleCaught ? 0 : 0.012;
  const scale = state.mods.conspiracyGain * (city.policies.curfew ? 0.5 : 1);
  const plot: MoraleFactor[] = [
    { label: 'Secteurs ouverts', value: regionIntrigue(state) * scale * 60 },
    { label: `Moral sous ${UNREST_MORALE}`, value: unrest * scale * 60 },
    { label: 'Traître en liberté', value: mole * scale * 60 },
    { label: 'Sûreté', value: -inputs.securityPressure * 60 },
  ];
  city.conspiracyWhy = plot.filter((f) => Math.abs(f.value) >= 0.05);
  const perSecond = plot.reduce((sum, f) => sum + f.value, 0) / 60;
  city.conspiracy = Math.max(0, Math.min(100, city.conspiracy + perSecond * dt));

  // Population.
  city.growthT += dt;
  const roomy = city.population < city.housing;
  // Births need air to spare, not just air left: a colony that outgrows its extractors suffocates.
  const healthy = !starving && o2Flow > 0 && city.oxygen > BIRTH_AIR && city.morale >= 30;
  // Like an anthill: the more people, the more births. Housing, air and food are what hold it back.
  const growthEvery = (16 - city.morale / 10) / (1 + city.population / GROWTH_CROWD);
  // Nor without food ahead: an anthill grows on what it has stored, not on what it hopes to find.
  if (
    roomy &&
    healthy &&
    city.growthT >= growthEvery &&
    foodMinutesLeft(state) > BIRTH_FOOD_MINUTES
  ) {
    city.growthT = 0;
    city.population += 1;
  }
  city.declineT += dt;
  const dying = starving || city.oxygen <= 0 || city.morale < 10;
  if (dying && city.population > 0 && city.declineT >= DEATH_EVERY) {
    city.declineT = 0;
    city.population -= 1;
    const why = city.oxygen <= 0 ? 'asphyxie' : starving ? 'la faim' : 'le désespoir';
    log(state, `Un citoyen perdu : ${why}.`, 'bad');
    // Nobody says it out loud.
    if (state.edicts.includes('corpses')) addStock(state, 'food', CORPSE_FOOD);
    state.fx.push({ kind: 'sound', id: 'alert' }, { kind: 'voice', id: 'citizenLost' });
  }
  if (city.oxygen <= 0 && state.tick % 10 === 0) {
    for (const u of state.units) {
      if (UNITS[u.type].citizens > 0) u.hp -= 1;
      if (u.hp <= 0) u.fatal = 'air';
    }
  }
}

/** The plots of the deepest sector open so far are the ones that reach the city. */
const regionIntrigue = (state: GameState): number =>
  Math.max(
    0,
    ...REGIONS.filter((r) => state.sectorStart[r.id] !== undefined).map((r) => r.intrigue),
  );
