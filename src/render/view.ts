import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings';
import { ENEMIES, UNITS } from '../data/units';
import type { BuildingType, GameState } from '../sim/types';
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
  private readonly lamp = new THREE.PointLight(0xfff0d0, 30, 16, 1.6);
  private lastTick = -1;
  private tickAlpha = 0;

  /** Camera rig: the point looked at, plus distance and heading. */
  focus = new THREE.Vector3();
  distance = 19;
  heading = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly state: GameState,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x07060a);
    this.scene.fog = new THREE.Fog(0x07060a, 26, 62);

    this.scene.add(new THREE.HemisphereLight(0x9fb6cf, 0x2a2018, 1.25));
    const key = new THREE.DirectionalLight(0xffe6c4, 1.5);
    key.position.set(-6, 14, 5);
    this.scene.add(key, this.lamp);

    this.terrain = new TerrainView(state);
    this.scene.add(this.terrain.group, this.marks, this.fxGroup, this.selection);

    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.dragBox.visible = false;
    this.dragBox.rotation.x = -Math.PI / 2;
    this.scene.add(this.dragBox);

    const hq = state.buildings.find((b) => b.type === 'hq');
    this.focus.set(hq ? hq.x + 1 : state.w / 2, 0, hq ? hq.y + 1 : state.h / 2);
    this.resize();
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.renderer.setSize(w, h, false);
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
    this.lamp.position.set(this.focus.x, 6, this.focus.z);
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

  private syncEntities(tickChanged: boolean, time: number): void {
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
    }

    const alpha = this.tickAlpha;
    for (const u of state.units) {
      const entry = this.track(`u${u.id}`, () => makeUnit(u.type), u.x, u.y, seen);
      if (tickChanged) {
        entry.px = entry.tx;
        entry.py = entry.ty;
        entry.tx = u.x;
        entry.ty = u.y;
      }
      const x = entry.px + (entry.tx - entry.px) * alpha;
      const y = entry.py + (entry.ty - entry.py) * alpha;
      const moving = Math.hypot(entry.tx - entry.px, entry.ty - entry.py) > 0.001;
      entry.object.position.set(x, moving ? Math.abs(Math.sin(time * 11 + u.id)) * 0.04 : 0, y);
      if (moving) entry.object.rotation.y = Math.atan2(entry.tx - entry.px, entry.ty - entry.py);
      if (u.working) entry.object.rotation.z = Math.sin(time * 30) * 0.05;
      else entry.object.rotation.z = 0;
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
            color: fx.hostile ? 0xff4040 : 0x5bf0ff,
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
    this.terrain.sync();
    this.syncEntities(changed, time);
    this.syncMarks();
    this.syncFx(dt);
    this.state.fx = this.state.fx.filter((f) => f.kind === 'sound');
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.terrain.dispose();
    this.renderer.dispose();
  }
}
