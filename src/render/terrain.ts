import * as THREE from 'three';
import { RESOURCES } from '../data/resources';
import { isWallKind } from '../sim/grid';
import type { GameState, Tile, TileKind } from '../sim/types';
import { getTexture } from './assets';

export const WALL_HEIGHT = 1.5;
const CHUNK = 12;
/** One texture repeat every this many tiles. */
const TEXTURE_TILES = 3;
/** The textures are mid-grey and multiply the tile colours, which would otherwise look dull. */
const TEXTURED_BOOST = 2.3;

const hex = (c: number) => new THREE.Color(c);
const BASE: Record<TileKind, THREE.Color> = {
  floor: hex(0x5a4a3e),
  rubble: hex(0x6e5f50),
  path: hex(0x3c5a63),
  fungus: hex(0x4e6b3a),
  lava: hex(0xff5a1f),
  water: hex(0x1f5f8f),
  dirt: hex(0x6e5b4c),
  loose: hex(0x665e5a),
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

interface Layer {
  positions: number[];
  colors: number[];
  uvs: number[];
}

const newLayer = (): Layer => ({ positions: [], colors: [], uvs: [] });

function rockMaterial(kind: 'ground' | 'wall'): THREE.Material {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: getTexture(kind === 'ground' ? 'groundColor' : 'wallColor'),
    normalMap: getTexture(kind === 'ground' ? 'groundNormal' : 'wallNormal'),
    roughness: 0.95,
    metalness: 0,
  });
}

/**
 * The cave is one heightfield: a corner stands tall when all four tiles around it are rock,
 * which gives sloped walls that open up naturally as the player digs.
 */
export class TerrainView {
  readonly group = new THREE.Group();
  private readonly floorMaterial = rockMaterial('ground');
  private readonly wallMaterial = rockMaterial('wall');
  private readonly glowMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    map: getTexture('wallColor'),
  });
  private readonly boost = getTexture('wallColor') ? TEXTURED_BOOST : 1;
  private readonly chunks = new Map<
    number,
    { floor: THREE.Mesh; wall: THREE.Mesh; glow: THREE.Mesh }
  >();
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

  /** Average ground height over a tile, for props standing on it. */
  heightAt(x: number, y: number): number {
    return (
      (this.cornerHeight(x, y) +
        this.cornerHeight(x + 1, y) +
        this.cornerHeight(x, y + 1) +
        this.cornerHeight(x + 1, y + 1)) /
      4
    );
  }

  private tileColor(tile: Tile, i: number, target: THREE.Color): void {
    if (!tile.seen) {
      target.copy(UNSEEN);
      return;
    }
    target.copy(BASE[tile.k]);
    const g = 0.86 + grain(i) * 0.28;
    target.multiplyScalar((tile.k === 'rubble' ? g * (0.8 + tile.rubble * 0.1) : g) * this.boost);
  }

  private rebuildChunk(cx: number, cy: number): void {
    const { state } = this;
    const floor = newLayer();
    const wall = newLayer();
    const glow = newLayer();
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
        const layer = glowing ? glow : !tile.seen || isWallKind(tile.k) ? wall : floor;
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
          layer.positions.push(vx, vy, vz);
          // Sliding with height keeps the texture from stretching down the slopes.
          layer.uvs.push((vx + vy * 0.6) / TEXTURE_TILES, (vz + vy * 0.6) / TEXTURE_TILES);
          // Baked shading on glowing tiles, which get no scene light to show their shape.
          const shade = glowing ? 0.65 + (vy / WALL_HEIGHT) * 0.45 : 1;
          layer.colors.push(color.r * shade, color.g * shade, color.b * shade);
        }
      }
    }
    const key = cy * this.cols + cx;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = {
        floor: new THREE.Mesh(new THREE.BufferGeometry(), this.floorMaterial),
        wall: new THREE.Mesh(new THREE.BufferGeometry(), this.wallMaterial),
        glow: new THREE.Mesh(new THREE.BufferGeometry(), this.glowMaterial),
      };
      this.chunks.set(key, chunk);
      this.group.add(chunk.floor, chunk.wall, chunk.glow);
      this.pickables.push(chunk.floor, chunk.wall, chunk.glow);
    }
    this.assign(chunk.floor, floor);
    this.assign(chunk.wall, wall);
    this.assign(chunk.glow, glow);
  }

  private assign(mesh: THREE.Mesh, { positions, colors, uvs }: Layer): void {
    const geometry = mesh.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    // computeVertexNormals would reuse the old array, too short once a chunk has grown.
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  }

  /** Redraws the chunks touched since the last frame, neighbours included: corners are shared. */
  sync(): number[] {
    const { state } = this;
    if (state.dirty.length === 0) return [];
    const changed = [...state.dirty];
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
    return changed;
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      chunk.floor.geometry.dispose();
      chunk.wall.geometry.dispose();
      chunk.glow.geometry.dispose();
    }
    this.floorMaterial.dispose();
    this.wallMaterial.dispose();
    this.glowMaterial.dispose();
  }
}
