import { describe, expect, it } from 'vitest';
import {
  applyMissionResult,
  buyTech,
  campaignEnding,
  campaignModifiers,
  isCampaignWon,
  isRegionAvailable,
  missionContext,
  newCampaign,
  planetControl,
  startBonus,
} from '../src/campaign/campaign';
import { clearSave, readSave, writeSave, type SaveStorage } from '../src/campaign/save';
import { REGIONS } from '../src/data/regions';
import { ENDINGS } from '../src/data/story';
import { createMission, stepGame } from '../src/sim/game';
import { newMission } from './helpers';

const memoryStorage = (): SaveStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

describe('campagne', () => {
  it('démarre par le Val de Cendre, puis déverrouille ses voisines', () => {
    let c = newCampaign(1);
    expect(isRegionAvailable(c, 'ash')).toBe(true);
    expect(isRegionAvailable(c, 'glass')).toBe(false);
    const mission = newMission('ash', 1);
    mission.outcome = 'won';
    c = applyMissionResult(c, mission);
    expect(c.conquered).toContain('ash');
    expect(isRegionAvailable(c, 'ash')).toBe(false);
    expect(isRegionAvailable(c, 'glass')).toBe(true);
    expect(isRegionAvailable(c, 'ice')).toBe(true);
    expect(planetControl(c)).toBe(8);
  });

  it('une défaite garde la recherche et l’enquête, mais pas la région', () => {
    let c = newCampaign(1);
    const mission = newMission('ash', 1);
    mission.outcome = 'lost';
    mission.research = 3.7;
    mission.story.clues.push('un indice');
    c = applyMissionResult(c, mission);
    expect(c.conquered).toEqual([]);
    expect(c.research).toBe(3);
    expect(c.clues).toContain('un indice');
  });

  it('les conquêtes et technologies renforcent les missions suivantes', () => {
    const c = { ...newCampaign(1), conquered: ['ash', 'glass'], research: 10 };
    expect(startBonus(c).ore).toBe(15);
    expect(campaignModifiers(c).powerOutput).toBeCloseTo(1.2);
    const after = buyTech(c, 'drills1');
    expect(after?.research).toBe(5);
    expect(campaignModifiers(after!).drillSpeed).toBeCloseTo(1.25);
  });

  it('une technologie demande son prérequis et ses points', () => {
    const c = { ...newCampaign(1), research: 100 };
    expect(buyTech(c, 'drills2')).toBeNull();
    expect(buyTech({ ...c, research: 0 }, 'drills1')).toBeNull();
  });

  it('le traître reste identique pour une même graine', () => {
    expect(newCampaign(7).mole).toBe(newCampaign(7).mole);
    const moles = new Set(Array.from({ length: 40 }, (_, i) => newCampaign(i).mole));
    expect(moles.size).toBe(3);
  });

  it('la campagne est gagnée quand toute la planète est conquise', () => {
    const c = { ...newCampaign(1), conquered: REGIONS.map((r) => r.id) };
    expect(isCampaignWon(c)).toBe(true);
    expect(planetControl(c)).toBe(100);
    expect(campaignEnding(c)).toBe(ENDINGS.conquest);
    expect(campaignEnding({ ...c, flags: { endingMercy: true } })).toBe(ENDINGS.mercy);
  });

  it('les intrigues déjà vécues ne se rejouent pas après une défaite', () => {
    let c = newCampaign(1);
    const mission = createMission('ash', missionContext(c));
    mission.story.fired.push('landing');
    mission.outcome = 'lost';
    c = applyMissionResult(c, mission);
    expect(createMission('ash', missionContext(c)).story.fired).toContain('landing');
  });
});

describe('sauvegarde', () => {
  it('une partie relue continue à l’identique', () => {
    const storage = memoryStorage();
    const c = newCampaign(5);
    const mission = createMission('ash', missionContext(c));
    for (let i = 0; i < 100; i++) stepGame(mission);
    expect(writeSave(storage, { campaign: c, mission })).toBe(true);
    const loaded = readSave(storage);
    expect(loaded?.campaign.seed).toBe(5);
    const reloaded = loaded?.mission;
    expect(reloaded).toBeTruthy();
    if (!reloaded) return;
    mission.fx = [];
    mission.dirty = [];
    for (let i = 0; i < 300; i++) {
      stepGame(mission);
      stepGame(reloaded);
      mission.story.pending = [];
      reloaded.story.pending = [];
    }
    expect(reloaded.units.map((u) => [u.x, u.y])).toEqual(mission.units.map((u) => [u.x, u.y]));
    expect(reloaded.stock).toEqual(mission.stock);
  });

  it('ignore les données corrompues', () => {
    const storage = memoryStorage();
    storage.setItem('foreurs-de-kerath/save/v1', '{pas du json');
    expect(readSave(storage)).toBeNull();
    clearSave(storage);
    expect(readSave(storage)).toBeNull();
  });
});
