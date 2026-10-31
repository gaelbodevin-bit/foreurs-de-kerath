import { BUILDINGS } from '../data/buildings';
import { CONTRACT_INTERVAL, MAX_CONTRACTS, FIRST_CONTRACT_AT } from '../data/progression';
import { RESOURCES, WALLS } from '../data/resources';
import { spawnRaid } from './combat';
import { addStock, canAfford, pay } from './economy';
import { log, newId, spawnUnit } from './entities';
import { idx } from './grid';
import { activeRegions, availableBuildings } from './progress';
import { rand, randPick } from './rng';
import type { BuildingType, Contract, ContractReward, EnemyType, GameState } from './types';

const totalKills = (state: GameState): number =>
  Object.values(state.kills).reduce((sum, n) => sum + (n ?? 0), 0);

const randInt = (state: GameState, min: number, max: number): number =>
  min + Math.floor(rand(state) * (max - min + 1));

/** A rock tile close to what is already known, that the crew's current tools can actually reach. */
function frontierTile(state: GameState): { x: number; y: number } | null {
  for (let tries = 0; tries < 120; tries++) {
    const x = randInt(state, 3, state.w - 4);
    const y = randInt(state, 3, state.h - 4);
    const tile = state.tiles[idx(state, x, y)];
    if (tile.seen || (WALLS[tile.k]?.power ?? 99) > state.mods.drillPower) continue;
    let near = false;
    for (let dy = -7; dy <= 7 && !near; dy++) {
      for (let dx = -7; dx <= 7 && !near; dx++) {
        const other = state.tiles[idx(state, x + dx, y + dy)];
        if (other?.seen && !WALLS[other.k] && other.k !== 'solid') near = true;
      }
    }
    if (near) return { x, y };
  }
  return null;
}

type Draft = Omit<Contract, 'id' | 'expiresAt'> & { seconds: number };

function deliverDraft(state: GameState): Draft | null {
  const pool = (
    ['ore', 'stone', 'crystal', 'ice', 'food', 'water', 'metal', 'alloy'] as const
  ).filter((r) => state.stock[r] >= 3);
  if (pool.length === 0) return null;
  const res = randPick(state, [...pool]);
  const scale = 1 + state.cityLevel * 0.6;
  const rare = res === 'metal' || res === 'alloy' || res === 'crystal';
  const amount = Math.round(randInt(state, rare ? 4 : 8, rare ? 8 : 18) * scale);
  return {
    kind: 'deliver',
    title: `Commande : ${RESOURCES[res].name}`,
    text: `La Charte réclame ${amount} ${RESOURCES[res].name.toLowerCase()}.`,
    res,
    amount,
    seconds: 150,
    reward: { stock: { credits: amount * (rare ? 6 : 3) }, research: 0.5, morale: 0 },
  };
}

function buildDraft(state: GameState): Draft | null {
  const missing = availableBuildings(state).filter(
    (t) => t !== 'hq' && !state.buildings.some((b) => b.type === t),
  );
  const options: BuildingType[] = missing.length > 0 ? missing : ['habitat', 'depot'];
  const building = randPick(state, options);
  return {
    kind: 'build',
    title: `Chantier : ${BUILDINGS[building].name}`,
    text: 'Le conseil veut voir ce chantier sortir de terre.',
    building,
    baseline: state.buildings.filter((b) => b.type === building && b.built >= 1).length,
    seconds: 180,
    reward: { stock: { credits: 30 + state.cityLevel * 15 }, research: 1, morale: 1 },
  };
}

function surveyDraft(state: GameState): Draft | null {
  const spot = frontierTile(state);
  if (!spot) return null;
  return {
    kind: 'survey',
    title: 'Relevé sismique',
    text: 'Quelque chose résonne dans la roche. Forez jusqu’au point marqué.',
    x: spot.x,
    y: spot.y,
    seconds: 200,
    reward: { stock: { crystal: 4, ore: 8 }, research: 1.5, morale: 0 },
  };
}

function rescueDraft(state: GameState): Draft | null {
  const spot = frontierTile(state);
  if (!spot) return null;
  // A small pocket that nobody has seen yet: the survivors are waiting in it.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tile = state.tiles[idx(state, spot.x + dx, spot.y + dy)];
      if (tile.k !== 'solid' && !tile.seen) tile.k = 'floor';
    }
  }
  return {
    kind: 'rescue',
    title: 'Équipe ensevelie',
    text: 'Une équipe de prospection ne répond plus. Creusez vite jusqu’à elle.',
    x: spot.x,
    y: spot.y,
    seconds: 220,
    reward: { stock: { ore: 6 }, research: 0.5, morale: 4 },
  };
}

function defendDraft(state: GameState): Draft | null {
  const hasDefence = state.buildings.some((b) => b.type === 'turret' || b.type === 'barracks');
  if (!hasDefence && state.units.every((u) => u.type !== 'garde')) return null;
  const pool = activeRegions(state).flatMap((r) => r.waves.pool);
  const type: EnemyType = randPick(state, pool.length > 0 ? pool : ['rongeur']);
  const goal = Math.min(8, 2 + state.cityLevel);
  const spawned = spawnRaid(state, type, goal);
  if (spawned === 0) return null;
  state.fx.push({ kind: 'sound', id: 'alert' }, { kind: 'voice', id: 'raid' });
  return {
    kind: 'defend',
    title: 'Incursion',
    text: 'Des ennemis percent nos galeries. Abattez-les.',
    goal: spawned,
    baseline: totalKills(state),
    seconds: 150,
    reward: { stock: { credits: 25 + spawned * 8 }, research: 1, morale: 2 },
  };
}

function refugeesDraft(state: GameState): Draft | null {
  const amount = randInt(state, 3, 5 + state.cityLevel * 2);
  return {
    kind: 'refugees',
    title: 'Réfugiés à la porte',
    text: `${amount} rescapés d’un convoi cherchent un toit. Il faut des logements libres.`,
    amount,
    seconds: 160,
    reward: { stock: {}, research: 0, morale: 3 },
  };
}

const DRAFTS = [
  deliverDraft,
  deliverDraft,
  buildDraft,
  surveyDraft,
  rescueDraft,
  defendDraft,
  refugeesDraft,
];

function spawnContract(state: GameState): void {
  const taken = new Set(state.contracts.map((c) => c.kind));
  // A few tries: several kinds may not make sense at this stage of the game.
  for (let tries = 0; tries < 8; tries++) {
    const make = randPick(state, DRAFTS);
    const draft = make(state);
    if (!draft) continue;
    if (taken.has(draft.kind) && draft.kind !== 'deliver') continue;
    const { seconds, ...rest } = draft;
    state.contracts.push({ ...rest, id: newId(state), expiresAt: state.time + seconds });
    log(state, `Nouvelle mission : ${draft.title}.`, 'info');
    state.fx.push({ kind: 'sound', id: 'collect' }, { kind: 'voice', id: 'contract' });
    return;
  }
}

/** Where a contract stands: what's left to do, and whether the player can hand it in. */
export function contractStatus(state: GameState, c: Contract): { label: string; ready: boolean } {
  switch (c.kind) {
    case 'deliver': {
      const have = Math.floor(state.stock[c.res ?? 'ore']);
      return {
        label: `${Math.min(have, c.amount ?? 0)} / ${c.amount}`,
        ready: have >= (c.amount ?? 0),
      };
    }
    case 'build':
      return { label: 'À construire', ready: false };
    case 'survey':
    case 'rescue':
      return { label: 'Point marqué sur la carte', ready: false };
    case 'defend':
      return {
        label: `${Math.min(totalKills(state) - (c.baseline ?? 0), c.goal ?? 0)} / ${c.goal} abattus`,
        ready: false,
      };
    case 'refugees':
      return {
        label: `${Math.max(0, state.city.housing - Math.floor(state.city.population))} / ${c.amount} logements libres`,
        ready: false,
      };
  }
}

function isComplete(state: GameState, c: Contract): boolean {
  switch (c.kind) {
    case 'deliver':
      return false;
    case 'build':
      return (
        state.buildings.filter((b) => b.type === c.building && b.built >= 1).length >
        (c.baseline ?? 0)
      );
    case 'survey':
    case 'rescue':
      return state.tiles[idx(state, c.x ?? 0, c.y ?? 0)].seen;
    case 'defend':
      return totalKills(state) - (c.baseline ?? 0) >= (c.goal ?? 0);
    case 'refugees':
      return state.city.housing - state.city.population >= (c.amount ?? 0);
  }
}

function payReward(state: GameState, reward: ContractReward): void {
  for (const [res, amount] of Object.entries(reward.stock)) {
    addStock(state, res as keyof typeof RESOURCES, amount ?? 0);
  }
  state.research += reward.research * state.mods.research;
  state.city.moraleShock += reward.morale;
}

function complete(state: GameState, c: Contract): void {
  payReward(state, c.reward);
  if (c.kind === 'refugees') state.city.population += c.amount ?? 0;
  if (c.kind === 'rescue') {
    state.city.population += 1;
    spawnUnit(state, 'foreur', (c.x ?? 0) + 0.5, (c.y ?? 0) + 0.5);
  }
  state.contracts.splice(state.contracts.indexOf(c), 1);
  log(state, `Mission accomplie : ${c.title}.`, 'good');
  state.fx.push({ kind: 'sound', id: 'build' }, { kind: 'voice', id: 'contractDone' });
}

/** The player hands over the goods. Separate from the rest, so that no stock vanishes by surprise. */
export function deliverContract(state: GameState, id: number): boolean {
  const c = state.contracts.find((candidate) => candidate.id === id);
  if (!c || c.kind !== 'deliver' || !c.res || !c.amount) return false;
  const cost = { [c.res]: c.amount };
  if (!canAfford(state, cost)) return false;
  pay(state, cost);
  complete(state, c);
  return true;
}

/** Once a second: new requests keep coming, whatever the player is busy with. */
export function updateContracts(state: GameState): void {
  for (const c of [...state.contracts]) {
    if (isComplete(state, c)) {
      complete(state, c);
    } else if (state.time >= c.expiresAt) {
      state.contracts.splice(state.contracts.indexOf(c), 1);
      state.city.moraleShock -= 2;
      log(state, `Mission manquée : ${c.title}.`, 'warn');
    }
  }
  if (state.time < state.nextContractAt) return;
  const [min, max] = CONTRACT_INTERVAL;
  state.nextContractAt = state.time + min + rand(state) * (max - min);
  if (state.contracts.length < MAX_CONTRACTS) spawnContract(state);
}

export { FIRST_CONTRACT_AT };
