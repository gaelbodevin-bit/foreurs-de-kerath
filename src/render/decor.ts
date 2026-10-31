import * as THREE from 'three';
import type { GameState, Tile } from '../sim/types';
import type { ModelId } from './assetManifest';
import { placeModel } from './assets';
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

/** Purely visual props scattered over the cave, following the state of each tile. */
export class DecorView {
  readonly group = new THREE.Group();
  private readonly placed = new Map<number, { model: ModelId; object: THREE.Object3D }>();

  constructor(
    private readonly state: GameState,
    private readonly heightAt: (x: number, y: number) => number,
  ) {
    for (let i = 0; i < state.tiles.length; i++) this.syncTile(i);
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
      this.group.add(object);
      this.placed.set(i, { model: want.model, object });
    }
    const height = this.heightAt(x, y);
    // Sink props a little so that they grow out of the rock.
    object.position.set(x + 0.5, Math.min(height, WALL_HEIGHT) - (height > 0 ? 0.1 : 0), y + 0.5);
  }
}
