import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings';
import { isWallKind } from '../sim/grid';
import type { GameState, Tile } from '../sim/types';
import type { ModelId } from './assetManifest';
import { getTexture, placeModel } from './assets';
import { WALL_HEIGHT } from './terrain';

const grain = (i: number) => {
  const v = Math.sin(i * 91.7) * 24634.6345;
  return v - Math.floor(v);
};

/** What sits on a tile, if anything. Pebbles only appear on some of the floor. */
function decorFor(tile: Tile, i: number): { model: ModelId; fit: number } | null {
  if (!tile.seen) return null;
  switch (tile.k) {
    case 'rubble':
      return { model: 'rocksSmall', fit: 0.85 };
    case 'crystalSeam':
      return { model: 'crystals', fit: 0.72 };
    case 'oreSeam':
      return { model: 'rock', fit: 0.6 };
    case 'floor':
      return grain(i) < 0.05 ? { model: 'rockLarge', fit: 0.28 } : null;
    default:
      return null;
  }
}

const MAX_SPIKES = 1400;
const MUSHROOMS_PER_TILE = 6;
const MAX_MUSHROOMS = 1800;
/** Caps of the same family, from pale to ripe: a patch of a single green would look printed. */
const CAP_COLORS = [0x9ccc5a, 0xc7e07a, 0x7fb04a, 0xe0c26a].map((c) => new THREE.Color(c));
/** A freshly picked patch only has small ones left, until it grows back. */
const PICKED_SCALE = 0.35;

const MAX_PEBBLES = 3200;
const MAX_LICHEN = 1100;
const MAX_LAMPS = 320;
const LICHEN_COLORS = [0x35e0c2, 0x7fd8ff, 0xb79cff].map((c) =>
  new THREE.Color(c).multiplyScalar(1.5),
);
/** One lamp every this many tiles of road. */
const LAMP_SPACING = 4;

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

/** The pool of light at a lamp's foot, drawn once. */
function poolTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeGroundDetail() {
  const pebbles = instanced(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 1, flatShading: true }),
    MAX_PEBBLES,
  );
  pebbles.receiveShadow = true;
  const lichen = instanced(
    new THREE.SphereGeometry(1, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX_LICHEN,
  );
  const poleShape = new THREE.CylinderGeometry(0.018, 0.028, 1, 6);
  poleShape.translate(0, 0.5, 0);
  const poles = instanced(
    poleShape,
    new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.4 }),
    MAX_LAMPS,
  );
  poles.castShadow = true;
  const heads = instanced(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(3) }),
    MAX_LAMPS,
  );
  const pools = instanced(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xffb870,
      map: poolTexture(),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    MAX_LAMPS,
  );
  return { pebbles, lichen, poles, heads, pools };
}

function makeMushrooms(): { stems: THREE.InstancedMesh; caps: THREE.InstancedMesh } {
  const stemShape = new THREE.CylinderGeometry(0.5, 0.75, 1, 7);
  stemShape.translate(0, 0.5, 0);
  const stems = new THREE.InstancedMesh(
    stemShape,
    new THREE.MeshStandardMaterial({ color: 0xefe6c8, roughness: 0.85 }),
    MAX_MUSHROOMS,
  );
  // A dome, flattened at the base: the shape that says mushroom from any distance.
  const capShape = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const caps = new THREE.InstancedMesh(
    capShape,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      // A faint glow of their own, so that they can be picked out in the dark of the cave.
      emissive: 0x4a6a1e,
      emissiveIntensity: 0.55,
    }),
    MAX_MUSHROOMS,
  );
  for (const mesh of [stems, caps]) {
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  return { stems, caps };
}

/** Spires of rock, on the walls and at their feet: one draw call, however many there are. */
function makeSpikes(): THREE.InstancedMesh {
  const geometry = new THREE.ConeGeometry(1, 1, 6, 2);
  geometry.translate(0, 0.5, 0);
  // Knock the cones out of true, or they would all look turned on a lathe.
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const wobble = 0.8 + grain(i * 13 + 1) * 0.4;
    if (position.getY(i) < 0.99) {
      position.setX(i, position.getX(i) * wobble);
      position.setZ(i, position.getZ(i) * wobble);
    }
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xb09c8a,
      map: getTexture('wallColor'),
      roughness: 0.95,
      flatShading: true,
    }),
    MAX_SPIKES,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Purely visual props scattered over the cave, following the state of each tile. */
export class DecorView {
  readonly group = new THREE.Group();
  private readonly placed = new Map<number, { model: ModelId; object: THREE.Object3D }>();
  private readonly spikes = makeSpikes();
  private readonly mushrooms = makeMushrooms();
  private readonly ground = makeGroundDetail();
  private buildingCount = -1;

  constructor(
    private readonly state: GameState,
    private readonly heightAt: (x: number, y: number) => number,
  ) {
    for (let i = 0; i < state.tiles.length; i++) this.syncTile(i);
    this.group.add(
      this.spikes,
      this.mushrooms.stems,
      this.mushrooms.caps,
      ...Object.values(this.ground),
    );
    this.rebuildSpikes();
    this.rebuildMushrooms();
    this.rebuildGround();
  }

  /** A wall's height depends on its neighbours, so those are refreshed along with it. */
  sync(changed: readonly number[]): void {
    const { state } = this;
    const todo = new Set<number>();
    for (const i of changed) {
      for (const n of [i, i - 1, i + 1, i - state.w, i + state.w]) {
        if (n >= 0 && n < state.tiles.length) todo.add(n);
      }
    }
    for (const i of todo) this.syncTile(i);
    if (changed.length > 0) this.rebuildMushrooms();
    if (changed.length > 0 || state.buildings.length !== this.buildingCount) {
      this.rebuildSpikes();
      this.rebuildGround();
    }
  }

  private syncTile(i: number): void {
    const { state } = this;
    const want = decorFor(state.tiles[i], i);
    const have = this.placed.get(i);
    if (have && have.model !== want?.model) {
      this.group.remove(have.object);
      this.placed.delete(i);
    }
    if (!want) return;
    const x = i % state.w;
    const y = Math.floor(i / state.w);
    let object = this.placed.get(i)?.object;
    if (!object) {
      const made = placeModel(want.model, want.fit);
      if (!made) return;
      object = made;
      object.rotation.y = grain(i + 7) * Math.PI * 2;
      object.traverse((child) => {
        child.receiveShadow = true;
      });
      this.group.add(object);
      this.placed.set(i, { model: want.model, object });
    }
    const height = this.heightAt(x, y);
    // Sink props a little so that they grow out of the rock.
    object.position.set(x + 0.5, Math.min(height, WALL_HEIGHT) - (height > 0 ? 0.1 : 0), y + 0.5);
  }

  private nextToWall(x: number, y: number): boolean {
    const { state } = this;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const tile = state.tiles[(y + dy) * state.w + x + dx];
      if (tile && isWallKind(tile.k)) return true;
    }
    return false;
  }

  /** Clusters scattered over each known patch, the same every time thanks to `grain`. */
  private rebuildMushrooms(): void {
    const { state } = this;
    const { stems, caps } = this.mushrooms;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const noTurn = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let count = 0;
    for (let i = 0; i < state.tiles.length; i++) {
      const tile = state.tiles[i];
      if (!tile.seen || tile.k !== 'fungus') continue;
      const x = i % state.w;
      const y = Math.floor(i / state.w);
      const growth = tile.regrow > 0 ? PICKED_SCALE : 1;
      for (let n = 0; n < MUSHROOMS_PER_TILE && count < MAX_MUSHROOMS; n++) {
        const seed = i * 7 + n * 13;
        const px = x + 0.12 + grain(seed + 1) * 0.76;
        const pz = y + 0.12 + grain(seed + 2) * 0.76;
        const size = (0.05 + grain(seed + 3) * 0.09) * growth;
        const tall = size * (1.4 + grain(seed + 4));
        stems.setMatrixAt(
          count,
          matrix.compose(position.set(px, 0, pz), noTurn, scale.set(size * 0.6, tall, size * 0.6)),
        );
        caps.setMatrixAt(
          count,
          matrix.compose(
            position.set(px, tall * 0.92, pz),
            noTurn,
            scale.set(size * 1.5, size * 1.05, size * 1.5),
          ),
        );
        caps.setColorAt(count, CAP_COLORS[Math.floor(grain(seed + 5) * CAP_COLORS.length)]);
        count++;
      }
    }
    stems.count = count;
    caps.count = count;
    stems.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  }

  /** Loose stones on the floor, faintly glowing lichen at the walls' feet, lamps along the roads. */
  private rebuildGround(): void {
    const { state } = this;
    const { pebbles, lichen, poles, heads, pools } = this.ground;
    const occupied = new Set<number>();
    for (const b of state.buildings) {
      const size = BUILDINGS[b.type].size;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) occupied.add((b.y + dy) * state.w + b.x + dx);
      }
    }
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let stones = 0;
    let spots = 0;
    let lamps = 0;
    for (let i = 0; i < state.tiles.length; i++) {
      const tile = state.tiles[i];
      if (!tile.seen || occupied.has(i)) continue;
      const x = i % state.w;
      const y = Math.floor(i / state.w);
      if (tile.k === 'path') {
        if ((x + y) % LAMP_SPACING !== 0 || lamps >= MAX_LAMPS) continue;
        const px = x + 0.14;
        const pz = y + 0.14;
        poles.setMatrixAt(lamps, matrix.makeScale(1, 0.72, 1).setPosition(px, 0, pz));
        heads.setMatrixAt(lamps, matrix.makeTranslation(px, 0.74, pz));
        pools.setMatrixAt(lamps, matrix.makeScale(3, 1, 3).setPosition(px, 0.04, pz));
        lamps++;
        continue;
      }
      if (tile.k !== 'floor') continue;
      const stoneCount = grain(i + 41) < 0.45 ? 1 + Math.floor(grain(i + 43) * 3) : 0;
      for (let n = 0; n < stoneCount && stones < MAX_PEBBLES; n++) {
        const seed = i * 5 + n * 11;
        const size = 0.018 + grain(seed + 1) * 0.04;
        turn.setFromAxisAngle(up, grain(seed + 2) * 6.28);
        pebbles.setMatrixAt(
          stones++,
          matrix.compose(
            position.set(x + grain(seed + 3), size * 0.3, y + grain(seed + 4)),
            turn,
            scale.set(size, size * 0.65, size * (0.7 + grain(seed + 5) * 0.6)),
          ),
        );
      }
      if (grain(i + 61) >= 0.16 || !this.nextToWall(x, y)) continue;
      const color = LICHEN_COLORS[Math.floor(grain(i + 67) * LICHEN_COLORS.length)];
      for (let n = 0; n < 7 && spots < MAX_LICHEN; n++) {
        const seed = i * 3 + n * 17;
        const size = 0.012 + grain(seed + 1) * 0.022;
        lichen.setMatrixAt(
          spots,
          matrix.compose(
            position.set(
              x + 0.1 + grain(seed + 2) * 0.8,
              size * 0.4,
              y + 0.1 + grain(seed + 3) * 0.8,
            ),
            turn.identity(),
            scale.set(size, size * 0.6, size),
          ),
        );
        lichen.setColorAt(spots, color);
        spots++;
      }
    }
    pebbles.count = stones;
    lichen.count = spots;
    poles.count = heads.count = pools.count = lamps;
    for (const mesh of Object.values(this.ground)) mesh.instanceMatrix.needsUpdate = true;
    if (lichen.instanceColor) lichen.instanceColor.needsUpdate = true;
  }

  /** Redone in full on each change: a few thousand tile checks, and it only runs after a dig. */
  private rebuildSpikes(): void {
    const { state, spikes } = this;
    this.buildingCount = state.buildings.length;
    const occupied = new Set<number>();
    for (const b of state.buildings) {
      const size = BUILDINGS[b.type].size;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) occupied.add((b.y + dy) * state.w + b.x + dx);
      }
    }
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let count = 0;
    for (let i = 0; i < state.tiles.length && count < MAX_SPIKES; i++) {
      const tile = state.tiles[i];
      if (!tile.seen || occupied.has(i)) continue;
      const x = i % state.w;
      const y = Math.floor(i / state.w);
      const onWall = isWallKind(tile.k) && tile.k !== 'crystalSeam' && tile.k !== 'relicVault';
      const atFoot = tile.k === 'floor' && this.nextToWall(x, y);
      // Few at the walls' feet: that's where the foreurs walk.
      if (!(onWall ? grain(i + 31) < 0.1 : atFoot && grain(i + 31) < 0.08)) continue;
      const height = this.heightAt(x, y);
      const a = grain(i + 11);
      const b = grain(i + 17);
      const tall = onWall ? 0.35 + a * 0.5 : 0.18 + a * 0.22;
      const wide = onWall ? 0.16 + b * 0.16 : 0.07 + b * 0.06;
      position.set(x + 0.2 + a * 0.6, height - 0.05, y + 0.2 + b * 0.6);
      rotation.setFromAxisAngle(up, a * 6.28);
      scale.set(wide, tall, wide);
      spikes.setMatrixAt(count++, matrix.compose(position, rotation, scale));
    }
    spikes.count = count;
    spikes.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.spikes.geometry.dispose();
    (this.spikes.material as THREE.Material).dispose();
    this.spikes.dispose();
    for (const mesh of [this.mushrooms.stems, this.mushrooms.caps, ...Object.values(this.ground)]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
  }
}
