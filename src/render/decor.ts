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
  private buildingCount = -1;

  constructor(
    private readonly state: GameState,
    private readonly heightAt: (x: number, y: number) => number,
  ) {
    for (let i = 0; i < state.tiles.length; i++) this.syncTile(i);
    this.group.add(this.spikes);
    this.rebuildSpikes();
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
    if (changed.length > 0 || state.buildings.length !== this.buildingCount) this.rebuildSpikes();
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
  }
}
