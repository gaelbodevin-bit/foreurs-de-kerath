import { clearSave, readSave, writeSave, type SaveStorage } from './campaign/save';
import { loadAssets } from './render/assets';
import { audio } from './render/audio';
import { createGame } from './sim/game';
import type { GameState } from './sim/types';
import { clear } from './ui/dom';
import { MissionScreen } from './ui/mission';
import { renderOutcome, renderTitle } from './ui/planet';
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

let teardown: () => void = () => undefined;

function startGame(state: GameState): void {
  teardown();
  writeSave(storage, state);
  // Handy for checking rendering by hand: the state is out of reach in production builds.
  if (import.meta.env.DEV) Object.assign(window, { kerath: state });
  const screen = new MissionScreen(host, state, {
    onSave: (current) => void writeSave(storage, current),
    onQuit: (current) => {
      writeSave(storage, current);
      showTitle();
    },
    onEnd: (current) => showOutcome(current),
  });
  teardown = () => screen.destroy();
}

function showOutcome(state: GameState): void {
  teardown();
  clearSave(storage);
  const root = renderOutcome(host, state, showTitle);
  teardown = () => root.remove();
}

function showTitle(): void {
  teardown();
  clear(host);
  const saved = readSave(storage);
  const root = renderTitle(host, {
    hasSave: saved !== null,
    onContinue: () => {
      if (saved) startGame(saved);
    },
    onNew: () => startGame(createGame(Math.floor(Math.random() * 1_000_000))),
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
