import {
  applyMissionResult,
  missionContext,
  newCampaign,
  planetControl,
  type Campaign,
} from './campaign/campaign';
import { clearSave, readSave, writeSave, type SaveStorage } from './campaign/save';
import { loadAssets } from './render/assets';
import { audio } from './render/audio';
import { createMission } from './sim/game';
import type { GameState } from './sim/types';
import { clear } from './ui/dom';
import { MissionScreen } from './ui/mission';
import { PlanetScreen, renderOutcome, renderTitle } from './ui/planet';
import './ui/styles.css';

const host = document.getElementById('app') as HTMLElement;

/** Falls back to memory in private windows and other places where localStorage throws. */
function pickStorage(): SaveStorage {
  try {
    localStorage.setItem('foreurs-de-kerath/test', '1');
    localStorage.removeItem('foreurs-de-kerath/test');
    return localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => void memory.set(k, v),
      removeItem: (k) => void memory.delete(k),
    };
  }
}
const storage = pickStorage();

let campaign: Campaign | null = null;
/** A mission left unfinished: resumed from the planet screen, kept across reloads. */
let suspended: GameState | null = null;
let teardown: () => void = () => undefined;

const save = () => {
  if (campaign) writeSave(storage, { campaign, mission: suspended });
};

function showPlanet(): void {
  teardown();
  if (!campaign) return;
  const screen = new PlanetScreen(
    host,
    campaign,
    {
      onStart: (regionId) => {
        if (!campaign) return;
        startMission(createMission(regionId, missionContext(campaign)));
      },
      onResume: () => {
        if (suspended) startMission(suspended);
      },
      onCampaignChange: (next) => {
        campaign = next;
        save();
      },
      onNewCampaign: () => {
        clearSave(storage);
        beginCampaign();
      },
    },
    suspended?.regionId ?? null,
  );
  teardown = () => screen.destroy();
}

function startMission(state: GameState): void {
  teardown();
  suspended = state;
  save();
  // Handy for checking rendering by hand: the state is out of reach in production builds.
  if (import.meta.env.DEV) Object.assign(window, { kerath: state });
  const screen = new MissionScreen(host, state, {
    onSave: (current) => {
      suspended = current;
      save();
    },
    onQuit: (current) => {
      suspended = current;
      save();
      showPlanet();
    },
    onEnd: (current) => showOutcome(current),
  });
  teardown = () => screen.destroy();
}

function showOutcome(state: GameState): void {
  teardown();
  if (!campaign) return;
  const before = campaign.research;
  campaign = applyMissionResult(campaign, state);
  suspended = null;
  save();
  const root = renderOutcome(host, {
    won: state.outcome === 'won',
    reason: state.outcomeReason,
    research: campaign.research - before,
    control: planetControl(campaign),
    onContinue: showPlanet,
  });
  teardown = () => root.remove();
}

function beginCampaign(): void {
  campaign = newCampaign(Math.floor(Math.random() * 1_000_000));
  suspended = null;
  save();
  showPlanet();
}

function showTitle(): void {
  clear(host);
  const saved = readSave(storage);
  const root = renderTitle(host, {
    hasSave: saved !== null,
    onContinue: () => {
      if (!saved) return;
      campaign = saved.campaign;
      suspended = saved.mission;
      showPlanet();
    },
    onNew: beginCampaign,
  });
  teardown = () => root.remove();
}

host.innerHTML = '<div class="title-screen"><p class="tagline">Chargement…</p></div>';
const progress = { assets: 0, sounds: 0 };
const showProgress = () => {
  const label = host.querySelector('.tagline');
  const ratio = (progress.assets + progress.sounds) / 2;
  if (label) label.textContent = `Chargement… ${Math.round(ratio * 100)} %`;
};
void Promise.all([
  loadAssets((ratio) => {
    progress.assets = ratio;
    showProgress();
  }),
  audio.preload((ratio) => {
    progress.sounds = ratio;
    showProgress();
  }),
]).then(showTitle);

// Any first touch opens the sound, and every button in the game answers with a click.
addEventListener('pointerdown', () => audio.unlock());
addEventListener('keydown', () => audio.unlock());
addEventListener('click', (e) => {
  if ((e.target as Element).closest?.('button')) audio.play('click');
});
