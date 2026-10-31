import {
  BUILD_MENUS,
  BUILDINGS,
  CITY_BUILDINGS,
  PATH_COST,
  type BuildMenuId,
} from '../data/buildings';
import {
  COUNCIL_TRAITS,
  COUNCIL_UPKEEP,
  GOVERNOR_TRAITS,
  hireCost,
  SEAT_IDS,
  SEATS,
} from '../data/council';
import { CITY_LEVELS } from '../data/progression';
import { TECHS, TIERS, type TechDef } from '../data/techs';
import { DRILL_TOOLS, drillToolFor, RESOURCES, TILE_NAMES, WALLS } from '../data/resources';
import { ADVISORS } from '../data/story';
import { ENEMIES, INVESTIGATION_COST, POLICIES, TAX_LEVELS, UNITS } from '../data/units';
import { audio } from '../render/audio';
import { MissionView } from '../render/view';
import { voice } from '../render/voice';
import { canAfford, storageCapacity } from '../sim/economy';
import { GAS_HARMFUL } from '../sim/gas';
import {
  canPlaceBuilding,
  demolish,
  designateArea,
  orderMove,
  placeBuilding,
  placePath,
  setTaxLevel,
  stepGame,
  togglePolicy,
  trainUnit,
} from '../sim/game';
import { contractStatus, deliverContract } from '../sim/contracts';
import { dismissCouncillor, recruitCandidate } from '../sim/council';
import {
  activeRegions,
  buildingLock,
  buyTech,
  canDeliver,
  currentTier,
  deliverParts,
  hasReachedCity,
  objectiveProgress,
  techLock,
} from '../sim/progress';
import { answerEvent, eventById, eventText, investigate, visibleChoices } from '../sim/storyEngine';
import type {
  BuildingType,
  Cost,
  Councillor,
  GameState,
  PolicyId,
  ResourceId,
  SoundId,
  VoiceId,
} from '../sim/types';
import { RESOURCE_IDS, TICK_SECONDS } from '../sim/types';
import { clear, h } from './dom';
import { resourceIcon } from './icons';
import { renderPlanetMap, renderSectorList } from './planet';

type Modal = 'city' | 'council' | 'dossier' | 'research' | 'planet';
type Tool = { kind: 'select' } | { kind: 'path' } | { kind: 'build'; type: BuildingType };

function costLabel(cost: Cost): DocumentFragment {
  const label = document.createDocumentFragment();
  for (const r of RESOURCE_IDS) {
    if (cost[r]) label.append(String(cost[r]), resourceIcon(r));
  }
  return label;
}

const shadeHex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export interface MissionCallbacks {
  onSave(state: GameState): void;
  onEnd(state: GameState): void;
  onQuit(state: GameState): void;
}

/** One running mission: the render loop, the mouse and keyboard, and every panel on screen. */
export class MissionScreen {
  private readonly root: HTMLElement;
  private readonly view: MissionView;
  private readonly audio = audio;
  private readonly topBarWatch: ResizeObserver;
  private stepTimer = 0;
  private tool: Tool = { kind: 'select' };
  private selectedUnits: number[] = [];
  private selectedBuilding: number | null = null;
  private speed = 1;
  private paused = false;
  private running = true;
  private accumulator = 0;
  private lastFrame = performance.now();
  private hudTimer = 0;
  private saveTimer = 0;
  private drag: { x0: number; y0: number; x1: number; y1: number; sx: number; sy: number } | null =
    null;
  private panning: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private modal: Modal | null = null;
  private shownEvent: string | null = null;
  private toastTimer = 0;
  private barkTimer = 0;
  private hover: { x: number; y: number } | null = null;

  private readonly resBar = h('div', { class: 'res-bar' });
  private readonly vitals = h('div', { class: 'vitals' });
  private readonly objectives = h('div', { class: 'panel objectives' });
  private readonly contracts = h('div', { class: 'panel contracts' });
  private readonly levelBadge = h('div', { class: 'region-name' });
  private readonly selection = h('div', { class: 'panel selection' });
  private readonly logBox = h('div', { class: 'log' });
  private readonly toast = h('div', { class: 'toast' });
  private readonly bark = h('div', { class: 'bark' });
  private readonly hint = h('div', { class: 'hint' });
  private readonly cancelTool = h(
    'button',
    { class: 'chip cancel-tool', onclick: () => this.setTool({ kind: 'select' }) },
    '✕ Annuler (Échap)',
  );
  private readonly overlay = h('div', { class: 'overlay' });
  private readonly minimap = h('canvas', { class: 'minimap', width: 180, height: 180 });
  private readonly buildButtons = new Map<BuildingType | 'path', HTMLButtonElement>();
  private readonly buildLocks = new Map<BuildingType, HTMLElement>();
  private cityTab: HTMLButtonElement | null = null;
  private readonly speedButtons: HTMLButtonElement[] = [];

  constructor(
    host: HTMLElement,
    private readonly state: GameState,
    private readonly callbacks: MissionCallbacks,
  ) {
    const canvas = h('canvas', { class: 'game-canvas' });
    this.root = h('div', { class: 'mission' }, canvas);
    host.append(this.root);
    const topBar = this.buildTopBar();
    this.topBarWatch = new ResizeObserver(() => {
      this.root.style.setProperty('--top-bar', `${topBar.offsetHeight}px`);
    });
    this.topBarWatch.observe(topBar);
    this.root.append(
      topBar,
      this.buildBuildMenu(),
      this.buildRightColumn(),
      this.logBox,
      this.hint,
      this.cancelTool,
      this.toast,
      this.bark,
      this.minimap,
      this.overlay,
    );
    this.view = new MissionView(canvas, state);
    this.bindInput(canvas);
    addEventListener('resize', this.onResize);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    this.updateHud();
    this.audio.startAmbience();
    requestAnimationFrame(this.frame);
  }

  private readonly onResize = () => this.view.resize();

  destroy(): void {
    this.running = false;
    this.topBarWatch.disconnect();
    removeEventListener('resize', this.onResize);
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    this.audio.stopAmbience();
    this.view.dispose();
    this.root.remove();
  }

  // --- Layout -------------------------------------------------------------------------------

  private buildTopBar(): HTMLElement {
    const speeds = [1, 2, 4].map((s) => {
      const b = h(
        'button',
        { class: 'chip', title: `Vitesse ×${s}`, onclick: () => this.setSpeed(s) },
        `×${s}`,
      );
      this.speedButtons.push(b);
      return b;
    });
    const pause = h(
      'button',
      { class: 'chip', title: 'Pause (Espace)', onclick: () => this.togglePause() },
      '⏸',
    );
    return h(
      'header',
      { class: 'top-bar' },
      this.levelBadge,
      this.resBar,
      this.vitals,
      h(
        'div',
        { class: 'top-actions' },
        h('button', { class: 'chip accent', onclick: () => this.openModal('city') }, 'Cité (C)'),
        h(
          'button',
          { class: 'chip accent', onclick: () => this.openModal('research') },
          'Progression (R)',
        ),
        h(
          'button',
          { class: 'chip accent', onclick: () => this.openModal('council') },
          'Conseil (K)',
        ),
        h(
          'button',
          { class: 'chip accent', onclick: () => this.openModal('planet') },
          'Planète (M)',
        ),
        h(
          'button',
          { class: 'chip accent', onclick: () => this.openModal('dossier') },
          'Enquête (J)',
        ),
        pause,
        ...speeds,
        h(
          'button',
          {
            class: 'chip',
            title: 'Son',
            onclick: (e: MouseEvent) => {
              this.audio.muted = !this.audio.muted;
              (e.currentTarget as HTMLElement).textContent = this.audio.muted ? '🔇' : '🔊';
            },
          },
          this.audio.muted ? '🔇' : '🔊',
        ),
        h('button', { class: 'chip', onclick: () => this.callbacks.onQuit(this.state) }, 'Menu'),
      ),
    );
  }

  private buildBuildMenu(): HTMLElement {
    const pathButton = h(
      'button',
      {
        class: 'build-btn',
        onclick: () =>
          this.setTool(this.tool.kind === 'path' ? { kind: 'select' } : { kind: 'path' }),
      },
      h('span', { class: 'b-name' }, 'Sol technique'),
      h('span', { class: 'b-cost' }, costLabel(PATH_COST)),
    );
    pathButton.title =
      'Sol technique : relie les bâtiments au réseau. Glissez pour tracer. Les foreurs y marchent plus vite et la lave ne le ronge pas.';
    this.buildButtons.set('path', pathButton);

    const pages = new Map<BuildMenuId, HTMLElement>();
    const tabs = new Map<BuildMenuId, HTMLElement>();
    const show = (id: BuildMenuId) => {
      for (const [key, page] of pages) page.hidden = key !== id;
      for (const [key, tab] of tabs) tab.classList.toggle('on', key === id);
    };
    for (const menu of BUILD_MENUS) {
      const page = h('div', { class: 'build-page' });
      if (menu.id === 'explore') page.append(pathButton);
      for (const group of menu.groups) {
        page.append(h('h4', {}, group.name));
        for (const type of group.buildings) {
          const def = BUILDINGS[type];
          const button = h(
            'button',
            { class: 'build-btn', onclick: () => this.pickBuilding(type) },
            h('span', { class: 'b-name' }, def.name),
            h('span', { class: 'b-cost' }, costLabel(def.cost)),
          );
          button.title = def.desc;
          const lock = h('span', { class: 'b-lock' });
          button.append(lock);
          this.buildLocks.set(type, lock);
          this.buildButtons.set(type, button);
          page.append(button);
        }
      }
      pages.set(menu.id, page);
      const tab = h('button', { class: 'menu-tab', onclick: () => show(menu.id) }, menu.name);
      if (menu.id === 'city') this.cityTab = tab;
      tabs.set(menu.id, tab);
    }
    show('explore');
    return h(
      'nav',
      { class: 'panel build-menu' },
      h('h3', {}, 'Construire'),
      h('div', { class: 'menu-tabs' }, ...tabs.values()),
      ...pages.values(),
    );
  }

  private buildRightColumn(): HTMLElement {
    return h('aside', { class: 'right-col' }, this.objectives, this.contracts, this.selection);
  }

  // --- Main loop ----------------------------------------------------------------------------

  private readonly frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    this.moveCamera(dt);

    const halted = this.paused || this.modal !== null || this.state.story.pending.length > 0;
    if (!halted && this.state.outcome === 'playing') {
      this.accumulator += dt * this.speed;
      let steps = 0;
      while (this.accumulator >= TICK_SECONDS && steps < 8) {
        stepGame(this.state);
        this.accumulator -= TICK_SECONDS;
        steps++;
      }
    }
    const alpha = halted ? 1 : this.accumulator / TICK_SECONDS;
    this.view.render(alpha, dt, now / 1000);

    for (const fx of this.state.fx) {
      if (fx.kind === 'sound') this.playSound(fx.id, fx.x, fx.y, fx.machine);
      else if (fx.kind === 'voice') this.speak(fx.id);
    }
    this.state.fx.length = 0;
    for (const strike of this.view.takeStrikes()) this.audio.play('drill', strike.x, strike.y);
    this.updateSound(dt, halted);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.updateHud();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      this.callbacks.onSave(this.state);
    }
    if (this.barkTimer > 0) {
      this.barkTimer -= dt;
      if (this.barkTimer <= 0) this.bark.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }

    if (this.state.outcome !== 'playing') {
      this.running = false;
      this.audio.play(this.state.outcome === 'won' ? 'win' : 'lose');
      this.speak(this.state.outcome === 'won' ? 'win' : 'lose');
      this.callbacks.onEnd(this.state);
      return;
    }
    requestAnimationFrame(this.frame);
  };

  /** Drilling sounds like the tool in the crew's hands. A pickaxe is heard from its animation. */
  private playSound(id: SoundId, x?: number, y?: number, machine?: boolean): void {
    const tool = drillToolFor(this.state.mods.drillPower);
    if (id !== 'drill') this.audio.play(id, x, y);
    else if (machine || tool === 'hammer') this.audio.play('rattle', x, y);
    else if (tool === 'laser') this.audio.play('laser', x, y);
  }

  private speak(id: VoiceId): void {
    const line = voice.say(id);
    if (!line) return;
    clear(this.bark);
    this.bark.append(h('b', {}, line.name), line.text);
    this.bark.classList.add('show');
    this.barkTimer = Math.max(2.4, line.seconds + 0.8);
  }

  private updateSound(dt: number, halted: boolean): void {
    const { focus, heading, distance } = this.view;
    this.audio.listen(focus.x, focus.z, heading, distance);
    const near = (x: number, y: number, range: number) =>
      Math.hypot(x - focus.x, y - focus.z) < range;
    const threats = this.state.enemies.filter(
      (e) => !ENEMIES[e.type].structure && !e.dormant && near(e.x, e.y, 16),
    ).length;
    this.audio.updateAmbience(dt, Math.min(1, threats / 4));
    this.stepTimer -= dt;
    const walker = this.view.nearestWalker;
    if (!halted && walker && this.stepTimer <= 0) {
      this.stepTimer = 0.3;
      this.audio.play('step', walker.x, walker.y);
    }
  }

  private moveCamera(dt: number): void {
    const speed = this.view.distance * 0.9 * dt;
    const k = this.keys;
    const dx =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const dy =
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (dx || dy) this.view.pan(dx * speed, dy * speed);
    if (k.has('KeyQ')) this.view.heading += dt * 1.4;
    if (k.has('KeyE')) this.view.heading -= dt * 1.4;
  }

  // --- Input --------------------------------------------------------------------------------

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.view.zoom(e.deltaY * 0.012);
      },
      { passive: false },
    );
    canvas.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (e.button === 1) {
        this.panning = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 2) {
        this.onRightClick(e);
        return;
      }
      const tile = this.view.pickTile(e.clientX, e.clientY);
      if (!tile) return;
      this.drag = { x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y, sx: e.clientX, sy: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.panning) {
        const scale = this.view.distance * 0.0016;
        this.view.pan(-(e.clientX - this.panning.x) * scale, -(e.clientY - this.panning.y) * scale);
        this.panning = { x: e.clientX, y: e.clientY };
        return;
      }
      const tile = this.view.pickTile(e.clientX, e.clientY);
      this.hover = tile;
      this.updateGhost();
      if (this.drag && tile) {
        this.drag.x1 = tile.x;
        this.drag.y1 = tile.y;
        const isArea = this.tool.kind !== 'build';
        const moved = tile.x !== this.drag.x0 || tile.y !== this.drag.y0;
        this.view.setDragBox(isArea && moved ? this.drag : null);
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (this.panning) {
        this.panning = null;
        return;
      }
      if (!this.drag) return;
      const drag = this.drag;
      this.drag = null;
      this.view.setDragBox(null);
      this.onLeftRelease(drag, e);
    });
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.view.setGhost(null, 0, 0, false);
    });
    this.minimap.addEventListener('pointerdown', (e) => {
      const rect = this.minimap.getBoundingClientRect();
      this.view.focus.x = ((e.clientX - rect.left) / rect.width) * this.state.w;
      this.view.focus.z = ((e.clientY - rect.top) / rect.height) * this.state.h;
    });
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.togglePause();
        break;
      case 'Escape':
        if (this.modal) this.openModal(null);
        else {
          this.setTool({ kind: 'select' });
          this.selectedUnits = [];
          this.selectedBuilding = null;
        }
        break;
      case 'KeyC':
        this.openModal(this.modal === 'city' ? null : 'city');
        break;
      case 'KeyK':
        this.openModal(this.modal === 'council' ? null : 'council');
        break;
      case 'KeyR':
        this.openModal(this.modal === 'research' ? null : 'research');
        break;
      case 'KeyM':
        this.openModal(this.modal === 'planet' ? null : 'planet');
        break;
      case 'KeyJ':
        this.openModal(this.modal === 'dossier' ? null : 'dossier');
        break;
      case 'KeyP':
        this.setTool({ kind: 'path' });
        break;
      case 'Digit1':
        this.setSpeed(1);
        break;
      case 'Digit2':
        this.setSpeed(2);
        break;
      case 'Digit3':
        this.setSpeed(4);
        break;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onLeftRelease(drag: NonNullable<MissionScreen['drag']>, e: PointerEvent): void {
    const { state } = this;
    const { tool } = this;
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6;

    if (tool.kind === 'build') {
      const result = placeBuilding(state, tool.type, drag.x1, drag.y1);
      if (!result.ok) {
        this.say(result.reason ?? 'Construction impossible.');
        // Clicking again wouldn't help: the left button goes back to its usual job.
        if (!canAfford(state, BUILDINGS[tool.type].cost)) this.setTool({ kind: 'select' });
        return;
      }
      this.speak('ack');
      // Shift keeps the tool in hand to place a series.
      if (!e.shiftKey || !canAfford(state, BUILDINGS[tool.type].cost)) {
        this.setTool({ kind: 'select' });
      }
      return;
    }
    if (tool.kind === 'path') {
      const n = placePath(state, drag.x0, drag.y0, drag.x1, drag.y1);
      if (n === 0) this.say('Une voie se pose sur un sol dégagé (déblayez les gravats d’abord).');
      return;
    }

    if (!moved) {
      const unitId = this.view.pickUnit(e.clientX, e.clientY);
      if (unitId !== null) {
        this.selectedUnits = e.shiftKey ? [...this.selectedUnits, unitId] : [unitId];
        this.selectedBuilding = null;
        return;
      }
      const b = state.buildings.find((candidate) => {
        const size = BUILDINGS[candidate.type].size;
        return (
          drag.x1 >= candidate.x &&
          drag.x1 < candidate.x + size &&
          drag.y1 >= candidate.y &&
          drag.y1 < candidate.y + size
        );
      });
      if (b) {
        this.selectedBuilding = b.id;
        this.selectedUnits = [];
        return;
      }
    } else {
      const guards = state.units.filter((u) => {
        const x = Math.floor(u.x);
        const y = Math.floor(u.y);
        return (
          x >= Math.min(drag.x0, drag.x1) &&
          x <= Math.max(drag.x0, drag.x1) &&
          y >= Math.min(drag.y0, drag.y1) &&
          y <= Math.max(drag.y0, drag.y1) &&
          UNITS[u.type].attack
        );
      });
      if (guards.length > 0) {
        this.selectedUnits = guards.map((u) => u.id);
        this.selectedBuilding = null;
        return;
      }
    }
    this.selectedBuilding = null;
    this.selectedUnits = [];
    const count = designateArea(state, drag.x0, drag.y0, drag.x1, drag.y1);
    if (count > 0) this.speak('drill');
    this.explainUndrillable(drag, count);
  }

  /** Spells out why nothing happens on hard rock, rather than leaving the player guessing. */
  private explainUndrillable(drag: NonNullable<MissionScreen['drag']>, count: number): void {
    if (count === 0) return;
    const { state } = this;
    const tile = state.tiles[drag.y1 * state.w + drag.x1];
    const wall = WALLS[tile.k];
    if (!wall) return;
    const best = Math.max(
      state.mods.drillPower,
      ...state.units.filter((u) => u.type === 'heavy').map((u) => UNITS[u.type].drillPower),
    );
    if (best >= wall.power) return;
    const needed = DRILL_TOOLS[drillToolFor(wall.power)].name;
    this.say(
      wall.power === DRILL_TOOLS.hammer.power
        ? `${TILE_NAMES[tile.k]} : la pioche n’y suffit pas. Il faut le ${needed.toLowerCase()} (recherche) ou une foreuse lourde (Atelier).`
        : `${TILE_NAMES[tile.k]} : seule la ${needed.toLowerCase()} en vient à bout (recherche).`,
    );
  }

  private onRightClick(e: PointerEvent): void {
    if (this.tool.kind !== 'select') {
      this.setTool({ kind: 'select' });
      return;
    }
    if (this.selectedUnits.length === 0) return;
    const tile = this.view.pickTile(e.clientX, e.clientY);
    if (!tile) return;
    if (orderMove(this.state, this.selectedUnits, tile.x, tile.y)) this.speak('ack');
    else this.say('Destination inaccessible.');
  }

  /** The same button puts the tool away, and nobody picks up what they can't pay for. */
  private pickBuilding(type: BuildingType): void {
    if (this.tool.kind === 'build' && this.tool.type === type) {
      this.setTool({ kind: 'select' });
    } else if (canAfford(this.state, BUILDINGS[type].cost)) {
      this.setTool({ kind: 'build', type });
    } else {
      this.setTool({ kind: 'select' });
      this.say(`${BUILDINGS[type].name} : ressources insuffisantes.`);
    }
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.updateGhost();
    this.hudTimer = 0;
  }

  private setSpeed(speed: number): void {
    this.speed = speed;
    this.paused = false;
    this.hudTimer = 0;
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.hudTimer = 0;
  }

  private updateGhost(): void {
    const { tool, hover } = this;
    this.view.setCityZone(tool.kind === 'build' && CITY_BUILDINGS.has(tool.type));
    if (tool.kind === 'select' || !hover) {
      this.view.setGhost(null, 0, 0, false);
      return;
    }
    if (tool.kind === 'path') {
      const t = this.state.tiles[hover.y * this.state.w + hover.x];
      this.view.setGhost('path', hover.x, hover.y, t.seen && t.k === 'floor');
      return;
    }
    const valid =
      canPlaceBuilding(this.state, tool.type, hover.x, hover.y).ok &&
      canAfford(this.state, BUILDINGS[tool.type].cost);
    this.view.setGhost(tool.type, hover.x, hover.y, valid);
  }

  private say(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastTimer = 3.5;
  }

  // --- HUD ----------------------------------------------------------------------------------

  private updateHud(): void {
    this.updateResources();
    this.updateVitals();
    this.updateBuildMenu();
    this.updateObjectives();
    this.updateContracts();
    this.updateLevel();
    this.updateSelection();
    this.updateLog();
    this.updateHint();
    this.updateMinimap();
    this.updateOverlay();
    this.speedButtons.forEach((b, i) =>
      b.classList.toggle('on', !this.paused && this.speed === [1, 2, 4][i]),
    );
  }

  /** Rebuilds a panel only when its content changed, so buttons keep working under the cursor. */
  private patch(el: HTMLElement, signature: string, build: () => (Node | string)[]): void {
    if (el.dataset.sig === signature) return;
    el.dataset.sig = signature;
    clear(el);
    el.append(...build());
  }

  private updateResources(): void {
    const { stock } = this.state;
    const cap = storageCapacity(this.state);
    const shown = RESOURCE_IDS.filter(
      (r) =>
        stock[r] >= 1 ||
        r === 'ore' ||
        r === 'crystal' ||
        r === 'stone' ||
        r === 'credits' ||
        r === 'food',
    );
    const sig = shown.map((r) => `${r}${Math.floor(stock[r])}`).join() + cap;
    this.patch(this.resBar, sig, () =>
      shown.map((r: ResourceId) => {
        const def = RESOURCES[r];
        const full = !def.uncapped && stock[r] >= cap;
        return h(
          'span',
          {
            class: full ? 'res full' : 'res',
            title: def.uncapped ? def.name : `${def.name} (max ${cap})`,
          },
          resourceIcon(r),
          Math.floor(stock[r]),
        );
      }),
    );
  }

  private updateLevel(): void {
    const { state } = this;
    const next = CITY_LEVELS[state.cityLevel + 1];
    const text = CITY_LEVELS[state.cityLevel].name;
    if (this.levelBadge.textContent !== text) this.levelBadge.textContent = text;
    this.levelBadge.title = next
      ? `Prochain palier : ${next.name}, à ${next.population} habitants`
      : 'Le plus haut rang de la colonie';
  }

  private updateVitals(): void {
    const { city, power } = this.state;
    const low = (bad: boolean) => (bad ? 'vital bad' : 'vital');
    const sig = [
      Math.floor(city.population),
      city.housing,
      Math.floor(city.morale),
      Math.floor(city.oxygen),
      Math.round(power.produced),
      power.demand,
      Math.floor(city.conspiracy),
    ].join();
    this.patch(this.vitals, sig, () => [
      h(
        'span',
        { class: low(city.population >= city.housing), title: 'Citoyens / logements' },
        '👥 ',
        Math.floor(city.population),
        `/${city.housing}`,
      ),
      h('span', { class: low(city.morale < 35), title: 'Moral' }, '☺ ', Math.floor(city.morale)),
      h(
        'span',
        { class: low(city.oxygen < 30), title: 'Oxygène' },
        'O₂ ',
        Math.floor(city.oxygen),
        '%',
      ),
      h(
        'span',
        { class: low(power.ratio < 1), title: 'Énergie produite / demandée' },
        '⚡ ',
        Math.round(power.produced),
        `/${power.demand}`,
      ),
      h(
        'span',
        { class: low(city.conspiracy >= 40), title: 'Complot : à 40, 70 et 100, il frappe' },
        '🕯 ',
        Math.floor(city.conspiracy),
        '%',
      ),
    ]);
  }

  private updateBuildMenu(): void {
    if (this.cityTab) {
      const closed = !hasReachedCity(this.state);
      this.cityTab.disabled = closed;
      this.cityTab.title = closed ? 'S’ouvre en rejoignant Port-Cendre' : '';
    }
    for (const [key, button] of this.buildButtons) {
      const cost = key === 'path' ? PATH_COST : BUILDINGS[key].cost;
      button.classList.toggle('poor', !canAfford(this.state, cost));
      const active =
        key === 'path'
          ? this.tool.kind === 'path'
          : this.tool.kind === 'build' && this.tool.type === key;
      button.classList.toggle('on', active);
      if (key === 'path') continue;
      const lock = buildingLock(this.state, key);
      button.disabled = lock !== null;
      button.classList.toggle('locked', lock !== null);
      const label = this.buildLocks.get(key);
      if (label && label.textContent !== (lock ?? '')) label.textContent = lock ?? '';
    }
  }

  private updateObjectives(): void {
    const { state } = this;
    const groups = activeRegions(state).map((region) => ({
      region,
      rows: region.objectives.map((o) => objectiveProgress(state, o, region)),
    }));
    const sig = groups.map((g) => g.region.id + g.rows.map((r) => r.value).join()).join();
    this.patch(this.objectives, sig, () =>
      groups.flatMap(({ region, rows }) => [
        h('h3', {}, region.name),
        ...rows.map((r) =>
          h(
            'div',
            { class: r.value >= r.goal ? 'obj done' : 'obj' },
            h('span', {}, r.label),
            h('b', {}, `${Math.min(r.value, r.goal)} / ${r.goal}`),
            h(
              'div',
              { class: 'bar' },
              h('i', { style: `width:${Math.min(100, (r.value / r.goal) * 100)}%` }),
            ),
          ),
        ),
      ]),
    );
  }

  private updateContracts(): void {
    const { state } = this;
    const rows = state.contracts.map((c) => ({ c, status: contractStatus(state, c) }));
    const sig = rows
      .map(
        ({ c, status }) =>
          `${c.id}${status.label}${status.ready}${Math.ceil((c.expiresAt - state.time) / 5)}`,
      )
      .join();
    this.contracts.hidden = rows.length === 0;
    this.patch(this.contracts, sig, () => [
      h('h3', {}, 'Missions'),
      ...rows.map(({ c, status }) =>
        h(
          'div',
          {
            class: c.x === undefined ? 'contract' : 'contract placed',
            title: c.text,
            onclick: () => {
              if (c.x === undefined || c.y === undefined) return;
              this.view.focus.x = c.x;
              this.view.focus.z = c.y;
            },
          },
          h('b', {}, c.title),
          h('em', {}, `${Math.max(0, Math.ceil(c.expiresAt - state.time))} s`),
          h('span', { class: 'dim' }, status.label),
          h(
            'span',
            { class: 'reward' },
            costLabel(c.reward.stock),
            c.reward.research > 0 ? ` ${c.reward.research} 🔬` : null,
          ),
          status.ready
            ? h(
                'button',
                {
                  class: 'chip accent',
                  onclick: () => {
                    deliverContract(state, c.id);
                    this.hudTimer = 0;
                  },
                },
                'Livrer',
              )
            : null,
        ),
      ),
    ]);
  }

  private updateSelection(): void {
    const { state } = this;
    this.selectedUnits = this.selectedUnits.filter((id) => state.units.some((u) => u.id === id));
    const building = state.buildings.find((b) => b.id === this.selectedBuilding);
    if (this.selectedBuilding !== null && !building) this.selectedBuilding = null;

    const rings = this.selectedUnits.flatMap((id) => {
      const u = state.units.find((c) => c.id === id);
      return u ? [{ x: u.x, y: u.y, size: 0.9 }] : [];
    });
    if (building) {
      const size = BUILDINGS[building.type].size;
      rings.push({ x: building.x + size / 2, y: building.y + size / 2, size: size * 1.5 });
    }
    this.view.setSelection(rings);

    if (building) {
      const def = BUILDINGS[building.type];
      const needsGrid = (def.power ?? 0) > 0 || def.powerOutput !== undefined;
      const status =
        building.built < 1
          ? `En chantier : ${Math.floor(building.built * 100)} %`
          : building.sabotaged > 0
            ? `Saboté (${Math.ceil(building.sabotaged)} s)`
            : needsGrid && !building.connected
              ? 'Hors réseau : tracez une voie énergétique jusqu’au Noyau de commande.'
              : `Rendement : ${Math.round(building.eff * 100)} %`;
      const sig = `b${building.id}${status}${Math.floor(building.hp)}${building.queue.length}${state.city.population}${Math.floor(state.stock.credits)}`;
      this.patch(
        this.selection,
        sig,
        () =>
          [
            h('h3', {}, def.name),
            h('p', { class: 'dim' }, def.desc),
            h('p', {}, status),
            h('p', { class: 'dim' }, `Intégrité : ${Math.floor(building.hp)} / ${def.hp}`),
            def.recipe &&
              h(
                'p',
                { class: 'dim' },
                costLabel(def.recipe.inputs),
                ' → ',
                costLabel(def.recipe.outputs),
                ` (${def.recipe.cycle} s)`,
              ),
            ...(def.trains ?? []).map((type) => {
              const unit = UNITS[type];
              return h(
                'button',
                {
                  class: 'build-btn',
                  title: unit.desc,
                  onclick: () => {
                    const r = trainUnit(state, building.id, type);
                    if (!r.ok) this.say(r.reason ?? 'Impossible.');
                    this.hudTimer = 0;
                  },
                },
                h('span', { class: 'b-name' }, `Former : ${unit.name}`),
                h(
                  'span',
                  { class: 'b-cost' },
                  costLabel(unit.cost),
                  unit.citizens ? ' 1 👥' : null,
                ),
              );
            }),
            building.queue.length > 0 &&
              h('p', { class: 'dim' }, `En formation : ${building.queue.length}`),
            building.type !== 'hq' &&
              h(
                'button',
                {
                  class: 'chip danger',
                  onclick: () => {
                    demolish(state, building.id);
                    this.selectedBuilding = null;
                  },
                },
                'Démolir (rend la moitié du coût)',
              ),
          ].filter(Boolean) as (Node | string)[],
      );
      return;
    }
    if (this.selectedUnits.length > 0) {
      const units = state.units.filter((u) => this.selectedUnits.includes(u.id));
      const sig = `u${units.map((u) => `${u.id}:${Math.floor(u.hp)}:${u.jobId}`).join()}`;
      this.patch(this.selection, sig, () => {
        const first = units[0];
        const def = UNITS[first.type];
        return [
          h('h3', {}, units.length > 1 ? `${units.length} unités` : def.name),
          h('p', { class: 'dim' }, def.desc),
          h('p', {}, `Santé : ${Math.floor(first.hp)} / ${def.hp}`),
          h('p', { class: 'dim' }, 'Clic droit pour déplacer.'),
        ];
      });
      return;
    }
    const hover = this.hover;
    const tile = hover ? state.tiles[hover.y * state.w + hover.x] : null;
    const hardness = tile?.seen ? (WALLS[tile.k]?.power ?? 0) : 0;
    const label =
      tile?.seen && (tile.gas ?? 0) >= GAS_HARMFUL
        ? `${TILE_NAMES[tile.k]} · gaz toxique`
        : tile?.seen
          ? `${TILE_NAMES[tile.k]}${hardness > 1 ? ` · ${DRILL_TOOLS[drillToolFor(hardness)].name.toLowerCase()}` : ''}`
          : '';
    const enemy = hover
      ? state.enemies.find(
          (e) =>
            Math.hypot(e.x - hover.x - 0.5, e.y - hover.y - 0.5) < 1 &&
            state.tiles[Math.floor(e.y) * state.w + Math.floor(e.x)].seen,
        )
      : null;
    const enemyLabel = enemy
      ? `${ENEMIES[enemy.type].name} (${ENEMIES[enemy.type].faction}) : ${Math.floor(enemy.hp)} PV`
      : '';
    this.patch(this.selection, `h${label}${enemyLabel}`, () => [
      h('h3', {}, label || 'Sélection'),
      enemyLabel
        ? h('p', { class: 'bad-text' }, enemyLabel)
        : h('p', { class: 'dim' }, 'Cliquez sur une unité ou un bâtiment.'),
    ]);
  }

  private updateLog(): void {
    const recent = this.state.log.slice(-5);
    this.patch(this.logBox, recent.map((l) => l.t + l.text).join(), () =>
      recent.map((l) => h('div', { class: `log-${l.level}` }, l.text)),
    );
  }

  private updateHint(): void {
    const { tool } = this;
    this.cancelTool.hidden = tool.kind === 'select';
    const text =
      tool.kind === 'path'
        ? 'Glissez pour tracer la voie. Clic droit pour finir.'
        : tool.kind === 'build'
          ? `${BUILDINGS[tool.type].name} : cliquez pour poser, Maj pour enchaîner, clic droit pour annuler.`
          : this.paused
            ? '⏸ Pause. Espace pour reprendre.'
            : 'Glissez sur la roche pour forer · Clic droit : déplacer · ZQSD/WASD et molette : caméra · A/E ou Q/E : rotation';
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  private updateMinimap(): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const { state } = this;
    const sx = this.minimap.width / state.w;
    const sy = this.minimap.height / state.h;
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, this.minimap.width, this.minimap.height);
    state.tiles.forEach((t, i) => {
      if (!t.seen) return;
      const wall = WALLS[t.k];
      ctx.fillStyle = wall?.yield
        ? shadeHex(RESOURCES[wall.yield.res].color)
        : t.k === 'lava'
          ? '#ff5a1f'
          : t.k === 'water'
            ? '#1f5f8f'
            : t.k === 'path'
              ? '#35e0c2'
              : wall || t.k === 'solid'
                ? '#3a3640'
                : '#6e6054';
      if ((t.gas ?? 0) >= GAS_HARMFUL) ctx.fillStyle = '#a5b83a';
      ctx.fillRect((i % state.w) * sx, Math.floor(i / state.w) * sy, Math.ceil(sx), Math.ceil(sy));
    });
    ctx.fillStyle = '#ffffff';
    for (const b of state.buildings)
      ctx.fillRect(b.x * sx, b.y * sy, sx * BUILDINGS[b.type].size, sy * BUILDINGS[b.type].size);
    ctx.fillStyle = '#35e0c2';
    for (const u of state.units) ctx.fillRect(u.x * sx - 1, u.y * sy - 1, 3, 3);
    ctx.fillStyle = '#ff4040';
    for (const e of state.enemies) {
      if (state.tiles[Math.floor(e.y) * state.w + Math.floor(e.x)].seen)
        ctx.fillRect(e.x * sx - 1, e.y * sy - 1, 3, 3);
    }
    // Where to dig: shown from the start, or the player would have no idea which way to go.
    const place = state.settlement;
    if (place && !place.reached) {
      ctx.strokeStyle = '#35e0c2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((place.x + 0.5) * sx, (place.y + 0.5) * sy, 3 * sx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.strokeStyle = '#ffb347';
    for (const c of state.contracts) {
      if (c.x === undefined || c.y === undefined) continue;
      ctx.beginPath();
      ctx.arc((c.x + 0.5) * sx, (c.y + 0.5) * sy, 2 * sx, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.strokeRect((this.view.focus.x - 8) * sx, (this.view.focus.z - 6) * sy, 16 * sx, 12 * sy);
  }

  // --- Modals -------------------------------------------------------------------------------

  private openModal(modal: Modal | null): void {
    this.modal = modal;
    this.overlay.dataset.sig = '';
    this.updateOverlay();
  }

  private updateOverlay(): void {
    const pending = this.state.story.pending[0];
    if (pending) {
      if (this.shownEvent !== pending) {
        this.shownEvent = pending;
        this.renderEvent(pending);
      }
      this.overlay.classList.add('show');
      return;
    }
    this.shownEvent = null;
    if (this.modal === null) {
      this.overlay.classList.remove('show');
      this.overlay.dataset.sig = '';
      return;
    }
    this.overlay.classList.add('show');
    if (this.modal === 'city') this.renderCity();
    else if (this.modal === 'research') this.renderResearch();
    else if (this.modal === 'council') this.renderCouncil();
    else if (this.modal === 'planet') this.renderPlanet();
    else this.renderDossier();
  }

  private renderEvent(id: string): void {
    const event = eventById(id);
    const { state } = this;
    this.overlay.dataset.sig = '';
    clear(this.overlay);
    const text = eventText(state, event);
    this.overlay.append(
      h(
        'div',
        { class: 'dialog' },
        h('div', { class: 'speaker' }, event.speaker),
        h('h2', {}, event.title),
        ...text
          .split('\n\n')
          .map((p) => h('p', { class: p.startsWith('Indice') ? 'clue' : '' }, p)),
        h(
          'div',
          { class: 'choices' },
          ...visibleChoices(state, event).map((choice, i) =>
            h(
              'button',
              {
                class: 'choice',
                onclick: () => {
                  this.audio.unlock();
                  answerEvent(state, i);
                  this.shownEvent = null;
                  clear(this.overlay);
                  this.overlay.classList.remove('show');
                  this.hudTimer = 0;
                },
              },
              choice.label,
            ),
          ),
        ),
      ),
    );
  }

  private closeButton(): HTMLElement {
    return h('button', { class: 'chip close', onclick: () => this.openModal(null) }, 'Fermer ✕');
  }

  private renderCity(): void {
    const { state } = this;
    const { city } = state;
    const sig = `city${Math.floor(city.morale)}${Math.floor(city.population)}${city.taxLevel}${JSON.stringify(city.policies)}${Math.floor(city.conspiracy)}${Math.floor(state.stock.credits)}`;
    this.patch(this.overlay, sig, () => [
      h(
        'div',
        { class: 'dialog wide' },
        this.closeButton(),
        h('h2', {}, 'Administration de la cité'),
        h(
          'div',
          { class: 'stats' },
          h('div', {}, h('b', {}, Math.floor(city.population)), 'citoyens'),
          h('div', {}, h('b', {}, `${city.housing}`), 'logements'),
          h('div', {}, h('b', {}, `${city.jobs}`), 'emplois'),
          h('div', {}, h('b', {}, Math.floor(city.morale)), 'moral'),
          h('div', {}, h('b', {}, `${state.research.toFixed(1)}`), 'recherche'),
        ),
        h('h3', {}, 'Impôts'),
        h(
          'div',
          { class: 'segmented' },
          ...TAX_LEVELS.map((level, i) =>
            h(
              'button',
              {
                class: city.taxLevel === i ? 'chip on' : 'chip',
                title: `Moral ${level.morale >= 0 ? '+' : ''}${level.morale}`,
                onclick: () => {
                  setTaxLevel(state, i as 0 | 1 | 2 | 3);
                  this.updateOverlay();
                },
              },
              level.name,
            ),
          ),
        ),
        h('h3', {}, 'Décrets'),
        h(
          'div',
          { class: 'policies' },
          ...(Object.keys(POLICIES) as PolicyId[]).map((id) => {
            const p = POLICIES[id];
            return h(
              'button',
              {
                class: city.policies[id] ? 'policy on' : 'policy',
                onclick: () => {
                  togglePolicy(state, id);
                  this.updateOverlay();
                },
              },
              h('b', {}, p.name),
              h('span', {}, p.desc),
              h(
                'em',
                {},
                `Moral ${p.morale > 0 ? '+' : ''}${p.morale}${p.upkeep ? ` · ${Math.round(p.upkeep * 60)} ¤/min` : ''}`,
              ),
            );
          }),
        ),
      ),
    ]);
  }

  private councilCard(c: Councillor, action: HTMLElement): HTMLElement {
    const trait = COUNCIL_TRAITS[c.trait];
    return h(
      'div',
      { class: 'councillor' },
      h('b', {}, c.name),
      h('em', {}, `Niveau ${c.level}`),
      h('span', {}, `${trait.name} : ${trait.desc}`),
      action,
    );
  }

  private renderCouncil(): void {
    const { state } = this;
    const reached = state.settlement?.reached ?? true;
    const wages = state.council.reduce((sum, c) => sum + c.level * COUNCIL_UPKEEP, 0);
    const sig = `cou${reached}${state.council.map((c) => c.id + '.' + c.level).join()}|${state.candidates.map((c) => c.id).join()}|${Math.floor(state.stock.credits / 10)}`;
    this.patch(this.overlay, sig, () => {
      const governor = state.governorTrait ? GOVERNOR_TRAITS[state.governorTrait] : null;
      return [
        h(
          'div',
          { class: 'dialog wide' },
          this.closeButton(),
          h('h2', {}, 'Conseil du gouverneur'),
          !reached
            ? h('p', {}, 'Il n’y a pas encore de gouverneur : rejoignez d’abord Port-Cendre.')
            : h(
                'p',
                { class: 'dim' },
                governor ? `Gouverneur ${governor.name.toLowerCase()} : ${governor.desc}. ` : '',
                `Salaires : ${wages} ¤/min. Chaque conseiller gagne un niveau toutes les 5 minutes.`,
              ),
          ...(reached
            ? SEAT_IDS.map((seat) => {
                const holder = state.council.find((c) => c.seat === seat);
                return h(
                  'div',
                  { class: 'seat' },
                  h('h3', {}, SEATS[seat].name),
                  h('p', { class: 'dim' }, SEATS[seat].desc),
                  holder
                    ? this.councilCard(
                        holder,
                        h(
                          'button',
                          {
                            class: 'chip',
                            onclick: () => {
                              dismissCouncillor(state, holder.id);
                              this.updateOverlay();
                            },
                          },
                          'Renvoyer',
                        ),
                      )
                    : h('p', { class: 'bad-text' }, 'Siège vacant'),
                );
              })
            : []),
          reached && h('h3', {}, 'Candidats'),
          ...state.candidates.map((c) =>
            this.councilCard(
              c,
              h(
                'button',
                {
                  class: 'chip accent',
                  disabled: state.stock.credits < hireCost(c.level),
                  onclick: () => {
                    const result = recruitCandidate(state, c.id);
                    if (!result.ok) this.say(result.reason ?? 'Impossible.');
                    this.updateOverlay();
                  },
                },
                `${SEATS[c.seat].name} · ${hireCost(c.level)} ¤`,
              ),
            ),
          ),
        ),
      ];
    });
  }

  private techCard(tech: TechDef): HTMLElement {
    const { state } = this;
    const lock = techLock(state, tech.id);
    const owned = state.techs.includes(tech.id);
    if (tech.parts) {
      const parts = RESOURCE_IDS.filter((r) => tech.parts?.[r]);
      return h(
        'div',
        { class: owned ? 'milestone owned' : lock ? 'milestone locked' : 'milestone' },
        h('b', {}, tech.name),
        h('em', {}, lock ?? ''),
        h('span', { class: 'dim' }, tech.desc),
        !owned &&
          h(
            'div',
            { class: 'parts' },
            ...parts.map((r) =>
              h(
                'span',
                { class: 'part' },
                resourceIcon(r),
                `${state.delivered[tech.id]?.[r] ?? 0} / ${tech.parts?.[r]}`,
              ),
            ),
          ),
        !owned &&
          !lock &&
          h(
            'button',
            {
              class: 'chip accent',
              disabled: !canDeliver(state, tech.id),
              onclick: () => {
                deliverParts(state, tech.id);
                this.hudTimer = 0;
                this.updateOverlay();
              },
            },
            'Livrer',
          ),
      );
    }
    return h(
      'button',
      {
        class: owned ? 'tech owned' : 'tech',
        disabled: lock !== null || state.research < (tech.cost ?? 0),
        onclick: () => {
          buyTech(state, tech.id);
          this.hudTimer = 0;
          this.updateOverlay();
        },
      },
      h('b', {}, tech.name),
      h('span', {}, tech.desc),
      h('em', {}, lock ?? `${tech.cost} 🔬`),
    );
  }

  private renderResearch(): void {
    const { state } = this;
    // Only what changes a button: a stock ticking up must not rebuild the panel under the cursor.
    const sig = `res${Math.floor(state.research)}${state.techs.length}${JSON.stringify(state.delivered)}${TECHS.map((t) => (canDeliver(state, t.id) ? 1 : 0)).join('')}`;
    const labs = state.buildings.filter((b) => b.type === 'lab' && b.built >= 1).length;
    const tier = currentTier(state);
    this.patch(this.overlay, sig, () => [
      h(
        'div',
        { class: 'dialog wide' },
        this.closeButton(),
        h('h2', {}, 'Progression'),
        h(
          'p',
          { class: 'dim' },
          'Livrez des ressources au Noyau pour débloquer bâtiments et outils. Une livraison peut se faire en plusieurs fois.',
        ),
        ...TIERS.flatMap((def, i) => [
          h('h3', { class: i > tier ? 'tier closed' : 'tier' }, `Palier ${i} : ${def.name}`),
          i > tier
            ? h('p', { class: 'dim' }, def.desc)
            : h(
                'div',
                { class: 'milestones' },
                ...TECHS.filter((t) => t.tier === i).map((t) => this.techCard(t)),
              ),
        ]),
        h('h3', {}, `Laboratoire : ${Math.floor(state.research)} 🔬`),
        h(
          'p',
          { class: 'dim' },
          labs > 0
            ? `${labs} laboratoire${labs > 1 ? 's' : ''} en service. Les missions et les secteurs conquis rapportent aussi des points.`
            : 'Aucun laboratoire : les points ne viennent que des missions et des secteurs conquis.',
        ),
        h(
          'div',
          { class: 'techs' },
          ...TECHS.filter((t) => t.cost !== undefined).map((t) => this.techCard(t)),
        ),
      ),
    ]);
  }

  private renderPlanet(): void {
    const { state } = this;
    this.patch(this.overlay, `pla${state.conquered.length}`, () => [
      h(
        'div',
        { class: 'dialog wide planet-view' },
        this.closeButton(),
        h('h2', {}, 'Kerath'),
        h(
          'div',
          { class: 'planet-layout' },
          h('div', { class: 'globe' }, renderPlanetMap(state)),
          renderSectorList(state),
        ),
      ),
    ]);
  }

  private renderDossier(): void {
    const { state } = this;
    const { story, city } = state;
    const sig = `dos${story.clues.length}${Math.floor(city.conspiracy)}${Math.floor(state.stock.credits)}`;
    this.patch(this.overlay, sig, () => [
      h(
        'div',
        { class: 'dialog wide' },
        this.closeButton(),
        h('h2', {}, 'Dossier du complot'),
        h(
          'p',
          {},
          story.moleCaught
            ? 'Le traître a été démasqué. Les restes du réseau agissent encore, sans tête.'
            : 'Quelqu’un au conseil renseigne vos ennemis. Vous pourrez l’accuser quand vous atteindrez les terres de Vantor ou le sanctuaire des sectaires.',
        ),
        h('h3', {}, `Niveau du complot : ${Math.floor(city.conspiracy)} %`),
        h(
          'div',
          { class: 'bar big' },
          h('i', { style: `width:${city.conspiracy}%;background:#c77dff` }),
        ),
        h(
          'p',
          { class: 'dim' },
          'À 40 % et 70 %, un bâtiment est saboté. À 100 %, c’est le soulèvement. Un bureau de sûreté ou le couvre-feu le freinent.',
        ),
        h(
          'button',
          {
            class: 'chip accent',
            onclick: () => {
              const result = investigate(state);
              if (!result.ok) this.say(`Une enquête coûte ${INVESTIGATION_COST} crédits.`);
              this.updateOverlay();
            },
          },
          `Financer une enquête (${INVESTIGATION_COST} ¤)`,
        ),
        h('h3', {}, 'Le conseil'),
        h(
          'div',
          { class: 'advisors' },
          ...Object.entries(ADVISORS).map(([id, a]) =>
            h(
              'div',
              { class: 'advisor', style: `border-color:${a.color}` },
              h('b', {}, a.name),
              h('span', {}, a.role),
              story.accused.includes(id as never) && h('em', {}, 'Accusé·e'),
            ),
          ),
        ),
        h('h3', {}, `Indices (${story.clues.length})`),
        story.clues.length === 0
          ? h('p', { class: 'dim' }, 'Aucun pour le moment.')
          : h('ul', { class: 'clues' }, ...story.clues.map((c) => h('li', {}, c))),
      ),
    ]);
  }
}
