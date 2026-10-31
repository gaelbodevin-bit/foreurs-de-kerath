import {
  CANDIDATE_COUNT,
  CANDIDATE_FIRST_NAMES,
  CANDIDATE_LAST_NAMES,
  CANDIDATES_EVERY,
  COUNCIL_LEVEL_EVERY,
  COUNCIL_TRAITS,
  COUNCIL_UPKEEP,
  FOUNDING_COUNCIL,
  GOVERNOR_TRAITS,
  hireCost,
  MAX_COUNCIL_LEVEL,
  SEAT_IDS,
  SEATS,
} from '../data/council';
import { canAfford, pay } from './economy';
import { log, newId } from './entities';
import { applyMods } from './progress';
import { rand, randPick } from './rng';
import type { Councillor, GameState, GovernorTraitId, Modifiers, SeatId } from './types';
import { TICK_SECONDS } from './types';

/** Adds or removes what one level of a councillor's trait is worth. */
function applyTrait(state: GameState, c: Councillor, levels: number): void {
  const scaled: Partial<Modifiers> = {};
  const { perLevel } = COUNCIL_TRAITS[c.trait];
  for (const [key, value] of Object.entries(perLevel) as [keyof Modifiers, number][]) {
    scaled[key] = value * levels;
  }
  applyMods(state, scaled);
}

function makeCandidate(state: GameState, seat: SeatId): Councillor {
  const traits = Object.keys(COUNCIL_TRAITS).filter((t) => COUNCIL_TRAITS[t].seat === seat);
  return {
    id: newId(state),
    name: `${randPick(state, CANDIDATE_FIRST_NAMES)} ${randPick(state, CANDIDATE_LAST_NAMES)}`,
    seat,
    trait: randPick(state, traits),
    level: rand(state) < 0.3 ? 2 : 1,
    tenure: 0,
  };
}

/** Always at least one for a seat that's empty, so that the list never feels like a dead end. */
function refreshCandidates(state: GameState): void {
  const empty = SEAT_IDS.filter((s) => !state.council.some((c) => c.seat === s));
  state.candidates = [];
  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    state.candidates.push(makeCandidate(state, empty[i] ?? randPick(state, SEAT_IDS)));
  }
  state.nextCandidatesAt = state.time + CANDIDATES_EVERY;
}

/** The moment the expedition reaches the city: its leader becomes its governor. */
export function foundCouncil(state: GameState): void {
  if (state.council.length > 0) return;
  for (const founder of FOUNDING_COUNCIL) {
    const c: Councillor = {
      id: newId(state),
      name: founder.name,
      seat: founder.seat,
      trait: founder.trait,
      level: 1,
      tenure: 0,
      advisor: founder.advisor,
    };
    state.council.push(c);
    applyTrait(state, c, c.level);
  }
  refreshCandidates(state);
}

export function chooseGovernorTrait(state: GameState, trait: GovernorTraitId): void {
  if (state.governorTrait) return;
  state.governorTrait = trait;
  applyMods(state, GOVERNOR_TRAITS[trait].mods);
}

export function dismissCouncillor(state: GameState, id: number): boolean {
  const c = state.council.find((candidate) => candidate.id === id);
  if (!c) return false;
  applyTrait(state, c, -c.level);
  state.council.splice(state.council.indexOf(c), 1);
  log(state, `${c.name} quitte le siège ${SEATS[c.seat].name}.`, 'info');
  return true;
}

/** Whoever holds the seat steps down: there is one person per seat. */
export function recruitCandidate(state: GameState, id: number): { ok: boolean; reason?: string } {
  const c = state.candidates.find((candidate) => candidate.id === id);
  if (!c) return { ok: false, reason: 'Ce candidat n’est plus disponible.' };
  const cost = { credits: hireCost(c.level) };
  if (!canAfford(state, cost)) return { ok: false, reason: 'Pas assez de crédits.' };
  pay(state, cost);
  const previous = state.council.find((other) => other.seat === c.seat);
  if (previous) dismissCouncillor(state, previous.id);
  state.candidates.splice(state.candidates.indexOf(c), 1);
  state.council.push(c);
  applyTrait(state, c, c.level);
  log(state, `${c.name} rejoint le conseil : ${SEATS[c.seat].name}.`, 'good');
  state.fx.push({ kind: 'sound', id: 'build' });
  return { ok: true };
}

/** Called every tick, like the rest of the economy: wages are paid by the second. */
export function updateCouncil(state: GameState): void {
  if (state.council.length === 0) return;
  const levels = state.council.reduce((sum, c) => sum + c.level, 0);
  const wage = (levels * COUNCIL_UPKEEP * TICK_SECONDS) / 60;
  state.stock.credits = Math.max(0, state.stock.credits - wage);
  for (const c of state.council) {
    c.tenure += TICK_SECONDS;
    if (c.tenure < COUNCIL_LEVEL_EVERY || c.level >= MAX_COUNCIL_LEVEL) continue;
    c.tenure = 0;
    c.level += 1;
    applyTrait(state, c, 1);
    log(state, `${c.name} passe au niveau ${c.level}.`, 'good');
  }
  if (state.time >= state.nextCandidatesAt) refreshCandidates(state);
}
