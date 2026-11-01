import { BUILDINGS, type BuildingDef } from '../data/buildings';
import { CITY_HOUSING } from '../data/progression';
import { REGIONS } from '../data/regions';
import { RESOURCES } from '../data/resources';
import { POLICIES, TAX_LEVELS, UNITS } from '../data/units';
import { idx, NEIGHBORS4 } from './grid';
import { log, spawnUnit } from './entities';
import type { Building, Cost, GameState, ResourceId } from './types';
import { RESOURCE_IDS, TICK_SECONDS } from './types';

export const storageCapacity = (state: GameState): number =>
  state.buildings.reduce(
    (sum, b) => (b.built >= 1 ? sum + (BUILDINGS[b.type].storage ?? 0) : sum),
    0,
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

/** Recomputes which buildings hang off the HQ or an outpost, through paths and adjoining buildings. */
export function updateNetwork(state: GameState): void {
  state.networkDirty = false;
  const owner = new Map<number, Building>();
  for (const b of state.buildings) {
    b.connected = false;
    if (b.built < 1) continue;
    const size = BUILDINGS[b.type].size;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) owner.set(idx(state, b.x + dx, b.y + dy), b);
    }
  }
  const roots = state.buildings.filter(
    (b) => b.type === 'hq' || (b.type === 'camp' && b.built >= 1),
  );
  const stack = roots.map((b) => idx(state, b.x, b.y));
  const seen = new Set(stack);
  while (stack.length > 0) {
    const cur = stack.pop() as number;
    const building = owner.get(cur);
    if (building) building.connected = true;
    const cx = cur % state.w;
    const cy = Math.floor(cur / state.w);
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
      const ni = idx(state, nx, ny);
      if (seen.has(ni)) continue;
      if (state.tiles[ni].k === 'path' || owner.has(ni)) {
        seen.add(ni);
        stack.push(ni);
      }
    }
  }
}

const needsGrid = (def: BuildingDef): boolean =>
  (def.power ?? 0) > 0 || def.powerOutput !== undefined;

function canRun(b: Building, def: BuildingDef): boolean {
  if (b.built < 1 || b.sabotaged > 0) return false;
  return !needsGrid(def) || b.connected;
}

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
      if (b.fuel <= 0 && state.stock.crystal >= 1) {
        state.stock.crystal -= 1;
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

  let oxygenFlow = 0;
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
const FOOD_PER_MOUTH_SECONDS = 360;
/** Warned at this stock: about four minutes' notice for a young colony. */
const LOW_FOOD = 12;
/** Seconds between two deaths, for as long as the colony goes hungry or breathless. */
const DEATH_EVERY = 60;

interface CityInputs {
  oxygenFlow: number;
  securityPressure: number;
  moraleBonus: number;
  taxBonus: number;
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
  const appetite = fed
    ? 0
    : (mouths / FOOD_PER_MOUTH_SECONDS) * (city.policies.rationing ? 0.65 : 1);
  const foodBefore = state.stock.food;
  state.stock.food = Math.max(0, foodBefore - appetite * dt);
  if (foodBefore >= LOW_FOOD && state.stock.food < LOW_FOOD) {
    log(
      state,
      'Nourriture presque épuisée : débloquez les cultures (touche R) et bâtissez une serre.',
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
  let target = 52 + inputs.moraleBonus + tax.morale + policyMorale + city.moraleShock;
  target -= state.city.conspiracy * 0.12;
  if (overcrowded) target -= 12;
  if (starving) target -= 28;
  if (city.oxygen < 25) target -= 18;
  if (unemployed > 0.5) target -= 6;
  city.morale += (Math.max(0, Math.min(100, target)) - city.morale) * 0.03 * dt;
  city.moraleShock *= 1 - 0.01 * dt;

  // Conspiracy.
  const unrest = city.morale < 40 ? 0.03 : 0;
  const mole = state.story.moleCaught ? 0 : 0.012;
  let gain = (regionIntrigue(state) + unrest + mole) * state.mods.conspiracyGain;
  if (city.policies.curfew) gain *= 0.5;
  city.conspiracy = Math.max(
    0,
    Math.min(100, city.conspiracy + (gain - inputs.securityPressure) * dt),
  );

  // Population.
  city.growthT += dt;
  const roomy = city.population < city.housing;
  const healthy = !starving && city.oxygen > 15 && city.morale >= 30;
  const growthEvery = 16 - city.morale / 10;
  if (roomy && healthy && city.growthT >= growthEvery) {
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
    state.fx.push({ kind: 'sound', id: 'alert' }, { kind: 'voice', id: 'citizenLost' });
  }
  if (city.oxygen <= 0 && state.tick % 10 === 0) {
    for (const u of state.units) {
      if (UNITS[u.type].citizens > 0) u.hp -= 1;
    }
  }
}

/** The plots of the deepest sector open so far are the ones that reach the city. */
const regionIntrigue = (state: GameState): number =>
  Math.max(
    0,
    ...REGIONS.filter((r) => state.sectorStart[r.id] !== undefined).map((r) => r.intrigue),
  );
