import * as THREE from 'three';
import { RESOURCES } from '../data/resources';
import { isWallKind } from '../sim/grid';
import type { GameState, Tile, TileKind } from '../sim/types';

export const WALL_HEIGHT = 1.5;
const CHUNK = 12;

const hex = (c: number) => new THREE.Color(c);
const BASE: Record<TileKind, THREE.Color> = {
  floor: hex(0x5a4a3e),
  rubble: hex(0x6e5f50),
  path: hex(0x3c5a63),
  fungus: hex(0x4e6b3a),
  lava: hex(0xff5a1f),
  water: hex(0x1f5f8f),
  dirt: hex(0x7a5a40),
  loose: hex(0x6c5f58),
  hard: hex(0x4a4650),
  solid: hex(0x24222a),
  oreSeam: hex(RESOURCES.ore.color),
  crystalSeam: hex(RESOURCES.crystal.color),
  iceSeam: hex(RESOURCES.ice.color),
  sulfurSeam: hex(RESOURCES.sulfur.color),
  goldSeam: hex(RESOURCES.gold.color),
  relicVault: hex(RESOURCES.relic.color),
};
const UNSEEN = hex(0x0b0a0e);

/** These stay lit whatever the scene lighting: they are what the player looks for in the dark. */
const GLOWING = new Set<TileKind>([
  'lava',
  'crystalSeam',
  'relicVault',
  'iceSeam',
  'goldSeam',
  'sulfurSeam',
]);

/** Stable per-tile variation, so that rock doesn't look like flat colour. */
const grain = (i: number) => {
  const v = Math.sin(i * 127.1) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * The cave is one heightfield: a corner stands tall when all four tiles around it are rock,
 * which gives sloped walls that open up naturally as the player digs.
 */
export class TerrainView {
  readonly group = new THREE.Group();
  private readonly lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly chunks = new Map<number, { lit: THREE.Mesh; glow: THREE.Mesh }>();
  private readonly cols: number;
  private readonly rows: number;
  /** Everything the mouse can land on. */
  readonly pickables: THREE.Object3D[] = [];

  constructor(private readonly state: GameState) {
    this.cols = Math.ceil(state.w / CHUNK);
    this.rows = Math.ceil(state.h / CHUNK);
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) this.rebuildChunk(cx, cy);
    }
  }

  private tall(x: number, y: number): boolean {
    const { state } = this;
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ]) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= state.w || ty >= state.h) continue;
      const tile = state.tiles[ty * state.w + tx];
      if (tile.seen && !isWallKind(tile.k)) return false;
    }
    return true;
  }

  private cornerHeight(x: number, y: number): number {
    if (!this.tall(x, y)) return 0;
    // A slight wobble keeps long walls from looking machined.
    return WALL_HEIGHT + (grain(x * 311 + y * 73) - 0.5) * 0.25;
  }

  private tileColor(tile: Tile, i: number, target: THREE.Color): void {
    if (!tile.seen) {
      target.copy(UNSEEN);
      return;
    }
    target.copy(BASE[tile.k]);
    const g = 0.86 + grain(i) * 0.28;
    target.multiplyScalar(tile.k === 'rubble' ? g * (0.8 + tile.rubble * 0.1) : g);
  }

  private rebuildChunk(cx: number, cy: number): void {
    const { state } = this;
    const lit: number[] = [];
    const litColors: number[] = [];
    const glow: number[] = [];
    const glowColors: number[] = [];
    const color = new THREE.Color();
    const x1 = Math.min(state.w, (cx + 1) * CHUNK);
    const y1 = Math.min(state.h, (cy + 1) * CHUNK);
    for (let y = cy * CHUNK; y < y1; y++) {
      for (let x = cx * CHUNK; x < x1; x++) {
        const i = y * state.w + x;
        const tile = state.tiles[i];
        this.tileColor(tile, i, color);
        const a = this.cornerHeight(x, y);
        const b = this.cornerHeight(x + 1, y);
        const c = this.cornerHeight(x, y + 1);
        const d = this.cornerHeight(x + 1, y + 1);
        const glowing = tile.seen && GLOWING.has(tile.k);
        const verts = glowing ? glow : lit;
        const cols = glowing ? glowColors : litColors;
        // Fold each quad along the diagonal that keeps slopes smooth.
        const flip = Math.abs(a - d) > Math.abs(b - c);
        const tris = flip
          ? [
              [x, a, y],
              [x, c, y + 1],
              [x + 1, b, y],
              [x + 1, b, y],
              [x, c, y + 1],
              [x + 1, d, y + 1],
            ]
          : [
              [x, a, y],
              [x, c, y + 1],
              [x + 1, d, y + 1],
              [x, a, y],
              [x + 1, d, y + 1],
              [x + 1, b, y],
            ];
        for (let t = 0; t < 6; t++) {
          const [vx, vy, vz] = tris[t];
          verts.push(vx, vy, vz);
          // Baked shading on glowing tiles, which get no scene light to show their shape.
          const shade = glowing ? 0.65 + (vy / WALL_HEIGHT) * 0.45 : 1;
          cols.push(color.r * shade, color.g * shade, color.b * shade);
        }
      }
    }
    const key = cy * this.cols + cx;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = {
        lit: new THREE.Mesh(new THREE.BufferGeometry(), this.lit),
        glow: new THREE.Mesh(new THREE.BufferGeometry(), this.glow),
      };
      this.chunks.set(key, chunk);
      this.group.add(chunk.lit, chunk.glow);
      this.pickables.push(chunk.lit, chunk.glow);
    }
    this.assign(chunk.lit, lit, litColors);
    this.assign(chunk.glow, glow, glowColors);
  }

  private assign(mesh: THREE.Mesh, positions: number[], colors: number[]): void {
    const geometry = mesh.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  }

  /** Redraws the chunks touched since the last frame, neighbours included: corners are shared. */
  sync(): void {
    const { state } = this;
    if (state.dirty.length === 0) return;
    const todo = new Set<number>();
    for (const i of state.dirty) {
      const x = i % state.w;
      const y = Math.floor(i / state.w);
      for (const [dx, dy] of [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const cx = Math.floor((x + dx) / CHUNK);
        const cy = Math.floor((y + dy) / CHUNK);
        if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) todo.add(cy * this.cols + cx);
      }
    }
    state.dirty.length = 0;
    for (const key of todo) this.rebuildChunk(key % this.cols, Math.floor(key / this.cols));
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      chunk.lit.geometry.dispose();
      chunk.glow.geometry.dispose();
    }
    this.lit.dispose();
    this.glow.dispose();
  }
}
