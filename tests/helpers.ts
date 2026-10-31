import { missionContext, newCampaign } from '../src/campaign/campaign';
import { createMission, designateArea, placeBuilding, placePath, stepGame } from '../src/sim/game';
import { WALLS } from '../src/data/resources';
import { answerEvent } from '../src/sim/storyEngine';
import type { BuildingType, GameState } from '../src/sim/types';

export const newMission = (regionId = 'ash', seed = 42): GameState =>
  createMission(regionId, missionContext(newCampaign(seed)));

export function run(state: GameState, seconds: number, answer = true): void {
  for (let i = 0; i < seconds * 10; i++) {
    if (answer) while (state.story.pending.length > 0) answerEvent(state, 0);
    stepGame(state);
  }
}

/** Puts a finished, staffed building on open ground near the HQ, without playing out construction. */
export function instantBuilding(state: GameState, type: BuildingType, x: number, y: number): void {
  const result = placeBuilding(state, type, x, y);
  if (!result.ok) throw new Error(result.reason);
  const b = state.buildings[state.buildings.length - 1];
  b.built = 1;
  state.jobs = state.jobs.filter((j) => j.refId !== b.id);
  state.networkDirty = true;
}

/** Marks every visible wall worth drilling within a radius of the HQ. */
export function drillAround(state: GameState, radius: number): void {
  const hq = state.buildings.find((b) => b.type === 'hq');
  if (!hq) return;
  for (let y = hq.y - radius; y <= hq.y + radius; y++) {
    for (let x = hq.x - radius; x <= hq.x + radius; x++) {
      const t = state.tiles[y * state.w + x];
      if (
        t?.seen &&
        WALLS[t.k] &&
        !state.jobs.some((j) => j.kind === 'drill' && j.x === x && j.y === y)
      ) {
        designateArea(state, x, y, x, y);
      }
    }
  }
}

export { placePath };
