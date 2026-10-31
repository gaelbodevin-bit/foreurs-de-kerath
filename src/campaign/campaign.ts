import { regionById, REGIONS } from '../data/regions';
import { ADVISOR_IDS, ENDINGS } from '../data/story';
import { TECHS, techById } from '../data/techs';
import type { MissionContext } from '../sim/game';
import { Rng } from '../sim/rng';
import type { AdvisorId, Cost, GameState, Modifiers } from '../sim/types';
import { baseModifiers, RESOURCE_IDS } from '../sim/types';

/** Everything that outlives a single mission. */
export interface Campaign {
  version: 1;
  seed: number;
  conquered: string[];
  research: number;
  techs: string[];
  flags: Record<string, boolean>;
  clues: string[];
  mole: AdvisorId;
  moleCaught: boolean;
  accused: AdvisorId[];
  firedEvents: string[];
}

export function newCampaign(seed: number): Campaign {
  return {
    version: 1,
    seed,
    conquered: [],
    research: 0,
    techs: [],
    flags: {},
    clues: [],
    // The traitor is drawn once per campaign: replays cannot rely on memorising the culprit.
    mole: new Rng(seed).pick(ADVISOR_IDS),
    moleCaught: false,
    accused: [],
    firedEvents: [],
  };
}

export const planetControl = (c: Campaign): number =>
  c.conquered.reduce((sum, id) => sum + regionById(id).control, 0);

export const isRegionAvailable = (c: Campaign, regionId: string): boolean => {
  const region = regionById(regionId);
  if (c.conquered.includes(regionId)) return false;
  return region.requires.length === 0 || region.requires.some((r) => c.conquered.includes(r));
};

export function campaignModifiers(c: Campaign): Modifiers {
  const mods = baseModifiers();
  const apply = (extra: Partial<Modifiers> | undefined) => {
    if (!extra) return;
    for (const [key, value] of Object.entries(extra) as [keyof Modifiers, number][]) {
      mods[key] += value;
    }
  };
  for (const id of c.conquered) apply(regionById(id).perk.mods);
  for (const id of c.techs) apply(techById(id).mods);
  return mods;
}

export function startBonus(c: Campaign): Cost {
  const bonus: Cost = {};
  const add = (extra: Cost | undefined) => {
    for (const r of RESOURCE_IDS) {
      if (extra?.[r]) bonus[r] = (bonus[r] ?? 0) + (extra[r] ?? 0);
    }
  };
  for (const id of c.conquered) add(regionById(id).perk.stock);
  for (const id of c.techs) add(techById(id).stock);
  return bonus;
}

export const missionContext = (c: Campaign): MissionContext => ({
  seed: c.seed,
  mods: campaignModifiers(c),
  startBonus: startBonus(c),
  flags: c.flags,
  clues: c.clues,
  mole: c.mole,
  moleCaught: c.moleCaught,
  accused: c.accused,
  firedEvents: c.firedEvents,
});

/** Carries plot progress and research back to the campaign. Defeats keep what was learned. */
export function applyMissionResult(c: Campaign, state: GameState): Campaign {
  const conquered =
    state.outcome === 'won' && !c.conquered.includes(state.regionId)
      ? [...c.conquered, state.regionId]
      : c.conquered;
  const victoryBonus = state.outcome === 'won' ? 4 + regionById(state.regionId).tier * 2 : 0;
  return {
    ...c,
    conquered,
    research: c.research + Math.floor(state.research) + victoryBonus,
    flags: { ...state.story.flags },
    clues: [...state.story.clues],
    moleCaught: state.story.moleCaught,
    accused: [...state.story.accused],
    firedEvents: [...state.story.fired],
  };
}

export function buyTech(c: Campaign, techId: string): Campaign | null {
  const tech = techById(techId);
  if (c.techs.includes(techId) || c.research < tech.cost) return null;
  if (tech.requires && !c.techs.includes(tech.requires)) return null;
  return { ...c, research: c.research - tech.cost, techs: [...c.techs, techId] };
}

export const isCampaignWon = (c: Campaign): boolean =>
  REGIONS.every((r) => c.conquered.includes(r.id));

export function campaignEnding(c: Campaign): (typeof ENDINGS)[keyof typeof ENDINGS] {
  if (c.flags.endingMercy) return ENDINGS.mercy;
  if (c.flags.pactBroken) return ENDINGS.treason;
  return ENDINGS.conquest;
}

export { TECHS };
