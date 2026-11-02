import { edictById, EDICT_COOLDOWN, EDICTS } from '../data/edicts';
import { INVESTIGATION_CLUES } from '../data/story';
import { addStock } from './economy';
import { log } from './entities';
import { applyMods, hasReachedCity } from './progress';
import type { GameState, ResourceId } from './types';

/** Why this edict can't be signed, for good or for now. Null once it can. */
export function edictLock(state: GameState, id: string): string | null {
  const edict = edictById(id);
  if (state.edicts.includes(id)) return 'Signé';
  if (!hasReachedCity(state)) return 'Rejoignez d’abord CITY';
  const closed = edict.excludes && state.edicts.includes(edict.excludes);
  if (closed) return `Exclu par : ${edictById(edict.excludes as string).name}`;
  if (edict.requires && !state.edicts.includes(edict.requires)) {
    return `Après : ${edictById(edict.requires).name}`;
  }
  return null;
}

/** Seconds until the next signature is possible. */
export const edictWait = (state: GameState): number =>
  Math.max(0, Math.ceil(state.nextEdictAt - state.time));

/** The lasting weight of everything signed so far. */
export const edictMorale = (state: GameState): number =>
  state.edicts.reduce((sum, id) => sum + (edictById(id).morale ?? 0), 0);

/** Signed once and for all: there is no way back, and the galleries remember. */
export function signEdict(state: GameState, id: string): boolean {
  const edict = edictById(id);
  if (edictLock(state, id) !== null || edictWait(state) > 0) return false;
  const stock = Object.entries(edict.stock ?? {}) as [ResourceId, number][];
  if (stock.some(([res, amount]) => amount < 0 && state.stock[res] < -amount)) return false;
  for (const [res, amount] of stock) addStock(state, res, amount);
  state.edicts.push(id);
  state.nextEdictAt = state.time + EDICT_COOLDOWN;
  state.story.flags[`edict_${id}`] = true;
  applyMods(state, edict.mods);
  state.city.moraleShock += edict.shock ?? 0;
  state.city.conspiracy = Math.max(
    0,
    Math.min(100, state.city.conspiracy + (edict.conspiracy ?? 0)),
  );
  if (id === 'informers') revealClue(state);
  log(state, `Édit signé : ${edict.name}. ${edict.reaction}`, 'warn');
  state.fx.push({ kind: 'sound', id: 'plot' });
  return true;
}

function revealClue(state: GameState): void {
  const clue = INVESTIGATION_CLUES[state.story.mole].find((c) => !state.story.clues.includes(c));
  if (clue && !state.story.moleCaught) state.story.clues.push(clue);
}

export const canSignAny = (state: GameState): boolean =>
  edictWait(state) === 0 && EDICTS.some((e) => edictLock(state, e.id) === null);
