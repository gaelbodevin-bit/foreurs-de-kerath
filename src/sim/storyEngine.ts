import { BUILDINGS } from '../data/buildings';
import {
  ADVISORS,
  INVESTIGATION_CLUES,
  STORY_EVENTS,
  type Effect,
  type StoryEvent,
} from '../data/story';
import { INVESTIGATION_COST } from '../data/units';
import { damageBuilding, spawnRaid } from './combat';
import { chooseGovernorTrait } from './council';
import { addStock } from './economy';
import { log } from './entities';
import { rand, randPick } from './rng';
import type { AdvisorId, GameState } from './types';

export const eventById = (id: string): StoryEvent => {
  const event = STORY_EVENTS.find((e) => e.id === id);
  if (!event) throw new Error(`Événement inconnu : ${id}`);
  return event;
};

function triggerMet(state: GameState, event: StoryEvent): boolean {
  const w = event.when;
  const s = state.story;
  // A sector's events count their time from the moment that sector opened.
  if (w.regions) {
    const opened = w.regions.flatMap((r) => state.sectorStart[r] ?? []);
    if (opened.length === 0) return false;
    if (state.time - Math.min(...opened) < (w.minTime ?? 0)) return false;
  } else if (w.minTime !== undefined && state.time < w.minTime) {
    return false;
  }
  if (w.flags && !w.flags.every((f) => s.flags[f])) return false;
  if (w.noFlags && w.noFlags.some((f) => s.flags[f])) return false;
  if (w.minClues !== undefined && s.clues.length < w.minClues) return false;
  if (w.minConspiracy !== undefined && state.city.conspiracy < w.minConspiracy) return false;
  if (w.minPopulation !== undefined && state.city.population < w.minPopulation) return false;
  if (w.moleAtLarge && s.moleCaught) return false;
  if (w.built && !state.buildings.some((b) => b.type === w.built && b.built >= 1)) return false;
  return true;
}

/** Text for the dialog, including the evidence this event just revealed. */
export function eventText(state: GameState, event: StoryEvent): string {
  return event.clue ? `${event.text}\n\nIndice : ${event.clue[state.story.mole]}` : event.text;
}

export function updateStory(state: GameState): void {
  const s = state.story;
  for (const event of STORY_EVENTS) {
    if (s.fired.includes(event.id) || !triggerMet(state, event)) continue;
    s.fired.push(event.id);
    s.pending.push(event.id);
    if (event.clue) s.clues.push(event.clue[s.mole]);
    state.fx.push({ kind: 'sound', id: 'plot' });
  }
  updateConspiracyStages(state);
}

/** Climbing past each threshold costs the player a blow; a full meter means an uprising. */
function updateConspiracyStages(state: GameState): void {
  const city = state.city;
  const stage =
    city.conspiracy >= 100 ? 3 : city.conspiracy >= 70 ? 2 : city.conspiracy >= 40 ? 1 : 0;
  if (stage <= city.conspiracyStage) {
    city.conspiracyStage = stage;
    return;
  }
  city.conspiracyStage = stage;
  if (stage === 3) {
    log(state, 'Soulèvement ! Le complot passe à l’action dans toute la cité.', 'bad');
    spawnRaid(state, 'saboteur', 5);
    sabotage(state, 2);
    city.moraleShock -= 15;
    city.conspiracy = 55;
    city.conspiracyStage = 1;
  } else {
    sabotage(state, stage);
  }
}

export function sabotage(state: GameState, count: number): void {
  const targets = state.buildings.filter((b) => b.built >= 1 && b.type !== 'hq');
  for (let i = 0; i < count && targets.length > 0; i++) {
    const b = randPick(state, targets);
    b.sabotaged = 40;
    damageBuilding(state, b, BUILDINGS[b.type].hp * 0.3);
    state.fx.push({ kind: 'burst', x: b.x + 0.5, y: b.y + 0.5, color: 0xffa040 });
    log(state, `Sabotage : ${BUILDINGS[b.type].name} hors service pour 40 s.`, 'bad');
  }
  state.fx.push({ kind: 'sound', id: 'alert' }, { kind: 'voice', id: 'sabotage' });
}

function accuse(state: GameState, advisor: AdvisorId): void {
  const s = state.story;
  s.accused.push(advisor);
  const name = ADVISORS[advisor].name;
  if (advisor === s.mole) {
    s.moleCaught = true;
    state.city.conspiracy = Math.max(0, state.city.conspiracy - 45);
    state.research += 8;
    state.city.moraleShock += 10;
    s.flags.moleCaught = true;
    log(state, `${name} démasqué·e : le réseau s'effondre. Vous aviez vu juste.`, 'good');
  } else {
    state.city.conspiracy = Math.min(100, state.city.conspiracy + 25);
    state.city.moraleShock -= 14;
    s.flags.wrongAccusation = true;
    log(state, `${name} était innocent·e. Le vrai traître court toujours.`, 'bad');
  }
}

function applyEffect(state: GameState, effect: Effect): void {
  switch (effect.kind) {
    case 'governor':
      chooseGovernorTrait(state, effect.trait);
      break;
    case 'stock':
      addStock(state, effect.res, effect.amount);
      break;
    case 'morale':
      state.city.moraleShock += effect.amount;
      state.city.morale = Math.max(0, Math.min(100, state.city.morale + effect.amount / 2));
      break;
    case 'conspiracy':
      state.city.conspiracy = Math.max(0, Math.min(100, state.city.conspiracy + effect.amount));
      break;
    case 'population':
      state.city.population = Math.max(0, state.city.population + effect.amount);
      break;
    case 'research':
      state.research += effect.amount;
      break;
    case 'flag':
      state.story.flags[effect.flag] = true;
      break;
    case 'spawn':
      spawnRaid(state, effect.enemy, effect.count);
      break;
    case 'sabotage':
      sabotage(state, effect.count);
      break;
    case 'accuse':
      accuse(state, effect.advisor);
      break;
  }
}

/** Resolves the oldest pending decision. */
export function answerEvent(state: GameState, choiceIndex: number): void {
  const id = state.story.pending.shift();
  if (!id) return;
  const choice = visibleChoices(state, eventById(id))[choiceIndex];
  if (!choice) return;
  for (const effect of choice.effects) applyEffect(state, effect);
}

export const visibleChoices = (state: GameState, event: StoryEvent) =>
  event.choices.filter((c) => !c.needsFlags || c.needsFlags.every((f) => state.story.flags[f]));

/** Pays investigators: pushes the plot back and sometimes turns up new evidence. */
export function investigate(state: GameState): { ok: boolean; found: boolean } {
  if (state.stock.credits < INVESTIGATION_COST) return { ok: false, found: false };
  state.stock.credits -= INVESTIGATION_COST;
  state.city.conspiracy = Math.max(0, state.city.conspiracy - 14);
  const pool = INVESTIGATION_CLUES[state.story.mole].filter((c) => !state.story.clues.includes(c));
  const found = !state.story.moleCaught && pool.length > 0 && rand(state) < 0.45;
  if (found) {
    state.story.clues.push(pool[0]);
    log(state, 'Vos enquêteurs ont trouvé un nouvel indice. Consultez le dossier.', 'good');
  } else {
    log(state, 'L’enquête fait reculer le complot, sans nouvelle piste.', 'info');
  }
  return { ok: true, found };
}
