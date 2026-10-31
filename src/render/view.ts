import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BUILDINGS } from '../data/buildings';
import { drillToolFor, type DrillTool } from '../data/resources';
import { ENEMIES, UNITS } from '../data/units';
import type { BuildingType, GameState } from '../sim/types';
import type { CharacterRig } from './assets';
import { DecorView } from './decor';
import { Dust, GasClouds, Smoke } from './particles';
import { settlementFromModels } from './modelPrefabs';
import { makeBuilding, makeEnemy, makePickup, makeUnit } from './prefabs';
import { TerrainView } from './terrain';

interface Tracked {
  object: THREE.Object3D;
  /** Position at the previous sim tick, to interpolate between 10 Hz steps. */
  px: number;
  py: number;
  tx: number;
  ty: number;
  bar?: THREE.Sprite;
}

interface FxSprite {
  object: THREE.Object3D;
  life: number;
  max: number;
  velocity?: THREE.Vector3[];
}

const GHOST_OK = new THREE.MeshBasicMaterial({ color: 0x35e0c2, transparent: true, opacity: 0.35 });
const GHOST_BAD = new THREE.MeshBasicMaterial({
  color: 0xff4040,
  transparent: true,
  opacity: 0.35,
});

const barMaterial = (color: number) => new THREE.SpriteMaterial({ color, depthTest: false });
const BAR_GOOD = barMaterial(0x5be37d);
const BAR_MID = barMaterial(0xf2c14b);
const BAR_BAD = barMaterial(0xff5050);

/** Below this frame rate, the view gives up its most expensive effects, one at a time. */
const TARGET_FPS = 32;
const SHADOW_MAP = 2048;

/** Draws a mission. It only reads the game state and never changes the rules. */
export class MissionView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  readonly terrain: TerrainView;
  private readonly tracked = new Map<string, Tracked>();
  private readonly marks = new THREE.Group();
  private readonly markPool: THREE.Mesh[] = [];
  private readonly fxGroup = new THREE.Group();
  private readonly fx: FxSprite[] = [];
  private readonly selection = new THREE.Group();
  private readonly selectionRings: THREE.Mesh[] = [];
  private readonly ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), GHOST_OK);
  private readonly dragBox = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x35e0c2,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  private readonly raycaster = new THREE.Raycaster();
  private readonly lamp = new THREE.PointLight(0xfff0d0, 10, 18, 1.6);
  private readonly key = new THREE.DirectionalLight(0xffe9d6, 2.6);
  private readonly settlement: THREE.Group | null;
  private readonly decor: DecorView;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly smoke = new Smoke();
  private readonly dust = new Dust();
  private readonly gas = new GasClouds();
  private shake = 0;
  private frameCount = 0;
  private sampleTime = 0;
  private sampleFrames = 0;
  /** 0 is everything on. Each level up drops one effect, and it never comes back mid-mission. */
  quality = 0;
  /** The walking unit nearest the camera, for footsteps. */
  nearestWalker: { x: number; y: number } | null = null;
  private lastTick = -1;
  /** Seconds since the simulation last advanced: nobody walks on the spot during a pause. */
  private stale = 0;
  private tickAlpha = 0;

  /** Camera rig: the point looked at, plus distance and heading. */
  focus = new THREE.Vector3();
  distance = 19;
  heading = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly state: GameState,
  ) {
    this.scene.add(this.gas.object);
    this.settlement = state.settlement ? settlementFromModels() : null;
    if (this.settlement && state.settlement) {
      this.settlement.position.set(state.settlement.x + 0.5, 0, state.settlement.y + 0.5);
      this.scene.add(this.settlement);
    }
    this.renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x07060a);
    this.scene.fog = new THREE.Fog(0x07060a, 26, 62);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.15;

    this.scene.add(new THREE.HemisphereLight(0x8fa8cf, 0x2a2018, 0.6));
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.04;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 80;
    this.scene.add(this.key, this.key.target, this.lamp);

    this.composer = new EffectComposer(
      this.renderer,
      // Antialiased, in a format that keeps values above 1.0 for the bloom to find.
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
    );
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.5, 1.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.terrain = new TerrainView(state);
    this.decor = new DecorView(state, (x, y) => this.terrain.heightAt(x, y));
    this.scene.add(
      this.terrain.group,
      this.decor.group,
      this.marks,
      this.fxGroup,
      this.selection,
      this.smoke.object,
      this.dust.object,
    );

    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.dragBox.visible = false;
    this.dragBox.rotation.x = -Math.PI / 2;
    this.scene.add(this.dragBox);

    const hq = state.buildings.find((b) => b.type === 'hq');
    this.focus.set(hq ? hq.x + 1 : state.w / 2, 0, hq ? hq.y + 1 : state.h / 2);
    this.resize();
    // Handy for checking rendering by hand: out of reach in production builds.
    if (import.meta.env.DEV) Object.assign(window, { kerathView: this });
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private placeCamera(): void {
    const pitch = 0.95;
    const horizontal = Math.cos(pitch) * this.distance;
    this.camera.position.set(
      this.focus.x + Math.sin(this.heading) * horizontal,
      Math.sin(pitch) * this.distance,
      this.focus.z + Math.cos(this.heading) * horizontal,
    );
    this.camera.lookAt(this.focus);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.lamp.position.set(this.focus.x, 6, this.focus.z);
    this.placeShadow();
  }

  /** The shadow map follows the camera, in small jumps: sliding smoothly would make it shimmer. */
  private placeShadow(): void {
    const reach = Math.max(14, Math.min(36, this.distance * 1.15));
    const shadow = this.key.shadow.camera;
    if (shadow.right !== reach) {
      shadow.left = -reach;
      shadow.right = reach;
      shadow.top = reach;
      shadow.bottom = -reach;
      shadow.updateProjectionMatrix();
    }
    const x = Math.round(this.focus.x);
    const z = Math.round(this.focus.z);
    this.key.target.position.set(x, 0, z);
    this.key.position.set(x - 14, 26, z + 11);
  }

  /** Watches the real frame rate and steps quality down on machines that can't keep up. */
  private adaptQuality(dt: number): void {
    // Anything this slow means a hidden tab, not a slow machine.
    if (dt > 0.25) return;
    this.sampleTime += dt;
    this.sampleFrames++;
    if (this.sampleTime < 3) return;
    const fps = this.sampleFrames / this.sampleTime;
    this.sampleTime = 0;
    this.sampleFrames = 0;
    if (fps >= TARGET_FPS || this.quality >= 3) return;
    this.quality++;
    if (this.quality === 1) {
      this.renderer.setPixelRatio(1);
      this.composer.setPixelRatio(1);
      this.resize();
    } else if (this.quality === 2) {
      this.renderer.shadowMap.autoUpdate = false;
      this.bloom.enabled = false;
    } else {
      this.key.castShadow = false;
    }
  }

  /** Pans along the ground, relative to where the camera faces. */
  pan(dx: number, dy: number): void {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    this.focus.x = Math.max(0, Math.min(this.state.w, this.focus.x + dx * c + dy * s));
    this.focus.z = Math.max(0, Math.min(this.state.h, this.focus.z - dx * s + dy * c));
  }

  zoom(delta: number): void {
    this.distance = Math.max(8, Math.min(48, this.distance + delta));
  }

  /** Screen position to tile, by shooting a ray at the cave itself. */
  pickTile(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.terrain.pickables, false)[0];
    if (!hit) return null;
    // Nudge into the surface, so that a click on a slope lands on the wall it belongs to.
    const dir = this.raycaster.ray.direction;
    const x = Math.floor(hit.point.x + dir.x * 0.05);
    const y = Math.floor(hit.point.z + dir.z * 0.05);
    if (x < 0 || y < 0 || x >= this.state.w || y >= this.state.h) return null;
    return { x, y };
  }

  /** Unit under the cursor, projected to screen space for forgiving clicks. */
  pickUnit(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    let best: number | null = null;
    let bestD = 26;
    const v = new THREE.Vector3();
    for (const unit of this.state.units) {
      v.set(unit.x, 0.3, unit.y).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestD) {
        best = unit.id;
        bestD = d;
      }
    }
    return best;
  }

  setGhost(type: BuildingType | 'path' | null, x: number, y: number, valid: boolean): void {
    this.ghost.visible = type !== null;
    if (!type) return;
    const size = type === 'path' ? 1 : BUILDINGS[type].size;
    this.ghost.scale.set(size, 1, size);
    this.ghost.position.set(x + size / 2, 0.3, y + size / 2);
    this.ghost.material = valid ? GHOST_OK : GHOST_BAD;
  }

  setDragBox(area: { x0: number; y0: number; x1: number; y1: number } | null): void {
    this.dragBox.visible = area !== null;
    if (!area) return;
    const minX = Math.min(area.x0, area.x1);
    const minY = Math.min(area.y0, area.y1);
    const w = Math.abs(area.x1 - area.x0) + 1;
    const h = Math.abs(area.y1 - area.y0) + 1;
    this.dragBox.scale.set(w, h, 1);
    this.dragBox.position.set(minX + w / 2, 1.7, minY + h / 2);
  }

  setSelection(tiles: { x: number; y: number; size: number }[]): void {
    while (this.selectionRings.length < tiles.length) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 32),
        new THREE.MeshBasicMaterial({
          color: 0x35e0c2,
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: true,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      this.selection.add(ring);
      this.selectionRings.push(ring);
    }
    this.selectionRings.forEach((ring, i) => {
      const t = tiles[i];
      ring.visible = t !== undefined;
      if (!t) return;
      ring.position.set(t.x, 0.05, t.y);
      ring.scale.setScalar(t.size);
    });
  }

  private track(
    key: string,
    make: () => THREE.Object3D,
    x: number,
    y: number,
    seen: Set<string>,
  ): Tracked {
    seen.add(key);
    let entry = this.tracked.get(key);
    if (!entry) {
      const object = make();
      object.position.set(x, 0, y);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh && !(child.material instanceof THREE.MeshBasicMaterial)) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.scene.add(object);
      entry = { object, px: x, py: y, tx: x, ty: y };
      this.tracked.set(key, entry);
    }
    return entry;
  }

  private healthBar(entry: Tracked, ratio: number, height: number, width: number): void {
    if (ratio >= 0.995) {
      if (entry.bar) entry.bar.visible = false;
      return;
    }
    if (!entry.bar) {
      entry.bar = new THREE.Sprite(BAR_GOOD);
      entry.bar.renderOrder = 10;
      entry.object.add(entry.bar);
    }
    entry.bar.visible = true;
    entry.bar.material = ratio > 0.6 ? BAR_GOOD : ratio > 0.3 ? BAR_MID : BAR_BAD;
    entry.bar.scale.set(Math.max(0.03, ratio) * width, 0.06, 1);
    entry.bar.position.set(0, height, 0);
  }

  /** Stretches a laser unit's ray to the rock it is cutting, flickering, with sparks at the end. */
  private aimBeam(
    unit: THREE.Object3D,
    target: { x: number; y: number } | null,
    x: number,
    y: number,
    time: number,
  ): void {
    const beam = unit.userData.beam as THREE.Group | undefined;
    if (!beam) return;
    beam.visible = target !== null;
    if (!target) return;
    const length = Math.max(0.2, Math.hypot(target.x - x, target.y - y) - 0.55);
    const ray = beam.getObjectByName('ray') as THREE.Object3D;
    const impact = beam.getObjectByName('impact') as THREE.Object3D;
    const width = 0.018 + Math.sin(time * 47) * 0.006;
    ray.scale.set(width, length, width);
    ray.position.z = length / 2;
    impact.position.z = length;
    impact.scale.setScalar(0.07 + Math.sin(time * 61) * 0.025);
    if (Math.random() < 0.25) this.smoke.emit(target.x, 0.35, target.y, 0.9, 0.5, 0.5);
  }

  private syncEntities(tickChanged: boolean, time: number, dt: number): void {
    const { state } = this;
    const seen = new Set<string>();

    for (const b of state.buildings) {
      const def = BUILDINGS[b.type];
      const entry = this.track(`b${b.id}`, () => makeBuilding(b.type), b.x, b.y, seen);
      entry.object.position.set(b.x, 0, b.y);
      // Sites rise from the ground as work progresses.
      entry.object.scale.y = 0.15 + Math.min(1, b.built) * 0.85;
      entry.object.visible = true;
      this.healthBar(entry, b.hp / def.hp, 1.4, def.size * 0.9);
      const off = b.built >= 1 && b.eff <= 0 && (def.power ?? 0) > 0;
      entry.object.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          child.visible = !off && !(b.sabotaged > 0 && Math.floor(time * 6) % 2 === 0);
        }
      });
      if (entry.bar) entry.bar.position.x = def.size / 2;
      (entry.object.userData.growth as THREE.Object3D[] | undefined)?.forEach((part, i) => {
        part.visible = state.cityLevel > i;
      });
      if (b.built >= 1 && !off && this.stale < 0.3) {
        const { spinning, smoke } = entry.object.userData as {
          spinning?: THREE.Object3D[];
          smoke?: THREE.Vector3[];
        };
        spinning?.forEach((part) => {
          part.rotation.y += dt * 0.7;
        });
        for (const chimney of smoke ?? []) {
          if (Math.random() < dt * 3.5) {
            this.smoke.emit(b.x + chimney.x, chimney.y, b.y + chimney.z, 0.34, 3.2);
          }
        }
      }
    }
    this.gas.update(state, time, dt);
    this.nearestWalker = null;
    let walkerDistance = Infinity;

    if (this.settlement && state.settlement) {
      const { x, y } = state.settlement;
      this.settlement.visible = state.tiles[y * state.w + x].seen;
      (this.settlement.userData.beacon as THREE.Object3D).rotation.y = time * 0.9;
    }

    const alpha = this.tickAlpha;
    const heldTool = drillToolFor(state.mods.drillPower);
    for (const u of state.units) {
      // The tool is part of the key, so that a new tool swaps the model.
      const entry = this.track(
        `u${u.id}${heldTool}`,
        () => makeUnit(u.type, heldTool),
        u.x,
        u.y,
        seen,
      );
      if (tickChanged) {
        entry.px = entry.tx;
        entry.py = entry.ty;
        entry.tx = u.x;
        entry.ty = u.y;
      }
      const x = entry.px + (entry.tx - entry.px) * alpha;
      const y = entry.py + (entry.ty - entry.py) * alpha;
      const moving =
        this.stale < 0.3 && Math.hypot(entry.tx - entry.px, entry.ty - entry.py) > 0.001;
      if (moving) {
        entry.object.rotation.y = Math.atan2(entry.tx - entry.px, entry.ty - entry.py);
        const walker = Math.hypot(x - this.focus.x, y - this.focus.z);
        if (walker < walkerDistance && (u.type === 'foreur' || u.type === 'garde')) {
          walkerDistance = walker;
          this.nearestWalker = { x, y };
        }
      }
      const active = u.working && this.stale < 0.3;
      const job = u.jobId === null ? undefined : state.jobs.find((j) => j.id === u.jobId);
      const target = active && job?.kind === 'drill' ? job : undefined;
      const tool = entry.object.userData.tool as DrillTool | undefined;
      if (target) {
        entry.object.rotation.y = Math.atan2(target.x + 0.5 - x, target.y + 0.5 - y);
      }
      // Rock dust where someone is at work: a jackhammer raises far more than a pickaxe.
      if (
        active &&
        tool !== 'laser' &&
        Math.random() < dt * (target && tool === 'hammer' ? 16 : 5)
      ) {
        this.smoke.emit(x, 0.3, y, 0.55, 1.1, 0.6);
      }
      this.aimBeam(
        entry.object,
        target ? { x: target.x + 0.5, y: target.y + 0.5 } : null,
        x,
        y,
        time,
      );
      const rig = entry.object.userData.rig as CharacterRig | undefined;
      if (rig) {
        entry.object.position.set(x, 0, y);
        const idle =
          u.type !== 'garde' ? 'idle' : u.cooldown > 0 ? 'holding-right-shoot' : 'holding-right';
        const working =
          target && tool
            ? { pick: 'attack-melee-right', hammer: 'holding-both', laser: 'holding-right-shoot' }[
                tool
              ]
            : 'interact-right';
        rig.play(moving ? 'walk' : u.working ? working : idle);
        rig.update(dt);
        // The hammer shakes whoever holds it.
        if (target && tool === 'hammer') {
          entry.object.position.x += Math.sin(time * 71 + u.id) * 0.012;
          entry.object.position.z += Math.cos(time * 83 + u.id) * 0.012;
        }
      } else {
        // Machines have no skeleton: they just rattle along.
        entry.object.position.set(x, moving ? Math.abs(Math.sin(time * 11 + u.id)) * 0.03 : 0, y);
        entry.object.rotation.z = u.working ? Math.sin(time * 30) * 0.03 : 0;
      }
      this.healthBar(entry, u.hp / UNITS[u.type].hp, 0.82, 0.5);
      if (u.carry) {
        const carriedKey = `c${u.id}${u.carry}`;
        const c = this.track(carriedKey, () => makePickup(u.carry as never), x, y, seen);
        c.object.position.set(x, 0.55, y);
      }
    }

    for (const e of state.enemies) {
      const def = ENEMIES[e.type];
      const tile = state.tiles[Math.floor(e.y) * state.w + Math.floor(e.x)];
      const entry = this.track(`e${e.id}`, () => makeEnemy(e.type), e.x, e.y, seen);
      entry.object.visible = tile.seen;
      if (tickChanged) {
        entry.px = entry.tx;
        entry.py = entry.ty;
        entry.tx = e.x;
        entry.ty = e.y;
      }
      const x = entry.px + (entry.tx - entry.px) * alpha;
      const y = entry.py + (entry.ty - entry.py) * alpha;
      entry.object.position.set(x, 0, y);
      if (Math.hypot(entry.tx - entry.px, entry.ty - entry.py) > 0.001) {
        entry.object.rotation.y = Math.atan2(entry.tx - entry.px, entry.ty - entry.py);
      }
      const enemyRig = entry.object.userData.rig as CharacterRig | undefined;
      if (enemyRig) {
        const walking =
          this.stale < 0.3 && Math.hypot(entry.tx - entry.px, entry.ty - entry.py) > 0.001;
        enemyRig.play(walking ? 'walk' : e.cooldown > 0 ? 'attack-melee-right' : 'idle');
        enemyRig.update(dt);
      }
      if (e.type === 'heart') {
        const beat = 1 + Math.pow(Math.max(0, Math.sin(time * 2.4)), 6) * 0.1;
        entry.object.scale.set(beat, beat, beat);
      }
      this.healthBar(entry, e.hp / def.hp, def.structure ? 2.4 : 0.9, def.structure ? 1.4 : 0.5);
    }

    for (const p of state.pickups) {
      const entry = this.track(`p${p.id}`, () => makePickup(p.res), p.x, p.y, seen);
      entry.object.position.set(p.x, 0, p.y);
      entry.object.rotation.y = time + p.id;
    }

    for (const [key, entry] of this.tracked) {
      if (seen.has(key)) continue;
      this.scene.remove(entry.object);
      this.tracked.delete(key);
    }
  }

  private syncMarks(): void {
    const jobs = this.state.jobs.filter(
      (j) => j.kind === 'drill' || j.kind === 'path' || j.kind === 'harvest',
    );
    while (this.markPool.length < jobs.length) {
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.86, 0.86),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.55,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
      );
      mark.rotation.x = -Math.PI / 2;
      this.marks.add(mark);
      this.markPool.push(mark);
    }
    this.markPool.forEach((mark, i) => {
      const job = jobs[i];
      mark.visible = job !== undefined;
      if (!job) return;
      const wall = job.kind === 'drill';
      mark.position.set(job.x + 0.5, wall ? 1.56 : 0.06, job.y + 0.5);
      (mark.material as THREE.MeshBasicMaterial).color.setHex(
        wall ? 0xffb347 : job.kind === 'path' ? 0x4ee0ff : 0x9ccc5a,
      );
    });
  }

  private syncFx(dt: number): void {
    for (const fx of this.state.fx) {
      if (fx.kind === 'laser') {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(fx.x1, 0.45, fx.y1),
          new THREE.Vector3(fx.x2, 0.45, fx.y2),
        ]);
        const line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(fx.hostile ? 0xff4040 : 0x5bf0ff).multiplyScalar(3),
            transparent: true,
          }),
        );
        this.fxGroup.add(line);
        this.fx.push({ object: line, life: 0.14, max: 0.14 });
      } else if (fx.kind === 'burst') {
        const group = new THREE.Group();
        const velocity: THREE.Vector3[] = [];
        const material = new THREE.MeshBasicMaterial({ color: fx.color, transparent: true });
        const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
        for (let i = 0; i < 10; i++) {
          const m = new THREE.Mesh(geometry, material);
          m.position.set(fx.x, 0.5, fx.y);
          group.add(m);
          velocity.push(
            new THREE.Vector3(
              Math.random() - 0.5,
              Math.random() * 1.1,
              Math.random() - 0.5,
            ).multiplyScalar(4),
          );
        }
        this.fxGroup.add(group);
        this.fx.push({ object: group, life: 0.7, max: 0.7, velocity });
        for (let i = 0; i < 12; i++) this.smoke.emit(fx.x, 0.4, fx.y, 0.5, 1.8, 1.6);
        const away = Math.hypot(fx.x - this.focus.x, fx.y - this.focus.z);
        this.shake = Math.max(this.shake, 0.22 * Math.max(0, 1 - away / 18));
      }
    }

    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.velocity) {
        f.object.children.forEach((child, n) => {
          const v = (f.velocity as THREE.Vector3[])[n];
          v.y -= 9 * dt;
          child.position.addScaledVector(v, dt);
        });
      }
      const material =
        f.object instanceof THREE.Line
          ? (f.object.material as THREE.LineBasicMaterial)
          : ((f.object.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial);
      material.opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) {
        this.fxGroup.remove(f.object);
        this.fx.splice(i, 1);
      }
    }
  }

  /** `alpha` is how far we are between the last sim tick and the next one, 0 to 1. */
  render(alpha: number, dt: number, time: number): void {
    const changed = this.state.tick !== this.lastTick;
    this.lastTick = this.state.tick;
    this.tickAlpha = Math.min(1, alpha);
    this.stale = changed ? 0 : this.stale + dt;
    this.decor.sync(this.terrain.sync());
    this.syncEntities(changed, time, dt);
    this.syncMarks();
    this.syncFx(dt);
    this.state.fx = this.state.fx.filter((f) => f.kind === 'sound' || f.kind === 'voice');
    this.terrain.update(time);
    this.smoke.update(dt);
    this.dust.update(time, this.focus);
    this.shake *= Math.exp(-dt * 7);
    this.placeCamera();
    this.adaptQuality(dt);
    // Past the first step down, shadows are only redrawn on one frame out of three.
    if (!this.renderer.shadowMap.autoUpdate && this.frameCount % 3 === 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.frameCount++;
    this.composer.render(dt);
  }

  dispose(): void {
    this.terrain.dispose();
    this.decor.dispose();
    this.bloom.dispose();
    this.composer.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
