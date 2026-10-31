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
const LAVA_BRIGHTNESS = 3.4;

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

/** Smooth noise, for large patches of darker and lighter rock. */
function patches(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = x - ix;
  const sy = y - iy;
  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);
  const at = (a: number, b: number) => grain((a * 57 + b * 131) % 9973);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u;
  const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
  return top + (bottom - top) * v;
}

/** How a corner is lit: a brightness, plus the colour spilling from glowing rock nearby. */
interface CornerLight {
  shade: number;
  r: number;
  g: number;
  b: number;
}

interface Layer {
  positions: number[];
  colors: number[];
  uvs: number[];
}

const newLayer = (): Layer => ({ positions: [], colors: [], uvs: [] });

type LayerName = 'floor' | 'wall' | 'glow' | 'lava' | 'water';
const LAYERS: LayerName[] = ['floor', 'wall', 'glow', 'lava', 'water'];

function rockMaterial(kind: 'ground' | 'wall'): THREE.Material {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: getTexture(kind === 'ground' ? 'groundColor' : 'wallColor'),
    normalMap: getTexture(kind === 'ground' ? 'groundNormal' : 'wallNormal'),
    roughness: 0.95,
    metalness: 0,
    // The cave is an open shell: its back faces, the default, would cast no shadow at all.
    shadowSide: THREE.FrontSide,
  });
}

/** Plates of dark crust drifting on molten rock, drawn once. Wraps at the edges. */
function lavaTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffa52e';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 170; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 7 + Math.random() * 20;
    const stretch = 0.45 + Math.random() * 0.9;
    const turn = Math.random() * Math.PI;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        // Stretched and turned, or the plates would look like a sheet of round cells.
        ctx.save();
        ctx.translate(x + ox, y + oy);
        ctx.rotate(turn);
        ctx.scale(1, stretch);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        gradient.addColorStop(0, 'rgba(32,14,10,1)');
        gradient.addColorStop(0.7, 'rgba(46,20,12,0.95)');
        gradient.addColorStop(1, 'rgba(90,30,10,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A separate copy of a texture, whose offset can scroll on its own. */
function scrolling(texture: THREE.Texture | null): THREE.Texture | null {
  if (!texture) return null;
  const copy = texture.clone();
  copy.needsUpdate = true;
  return copy;
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
  private readonly lavaMap = lavaTexture();
  private readonly lavaMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    map: this.lavaMap,
  });
  private readonly waterNormal = scrolling(getTexture('groundNormal'));
  private readonly waterMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalMap: this.waterNormal,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.38,
    metalness: 0,
  });
  private readonly boost = getTexture('wallColor') ? TEXTURED_BOOST : 1;
  private readonly chunks = new Map<number, Record<LayerName, THREE.Mesh>>();
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
    return WALL_HEIGHT + (grain(x * 311 + y * 73) - 0.5) * 0.5;
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
    // Well above 1.0 where the molten rock shows through the crust, for the bloom to catch.
    if (tile.k === 'lava') {
      target.setScalar(LAVA_BRIGHTNESS);
      return;
    }
    target.copy(BASE[tile.k]);
    const g = 0.86 + grain(i) * 0.28;
    target.multiplyScalar((tile.k === 'rubble' ? g * (0.8 + tile.rubble * 0.1) : g) * this.boost);
  }

  /**
   * Baked light, which costs nothing once computed. Floor darkens where it meets a wall, the rims
   * of walls catch the light while their tops fade, and glowing rock tints whatever is around it.
   */
  private cornerLight(x: number, y: number): CornerLight {
    const { state } = this;
    const self = this.tall(x, y);
    let tallAround = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && this.tall(x + dx, y + dy)) tallAround++;
      }
    }
    const contact = self ? (tallAround < 8 ? 1.2 : 0.8) : Math.max(0.42, 1 - tallAround * 0.13);
    const shade = contact * (0.78 + patches(x / 6, y / 6) * 0.44);

    let r = 0;
    let g = 0;
    let b = 0;
    for (let ty = y - 3; ty < y + 3; ty++) {
      for (let tx = x - 3; tx < x + 3; tx++) {
        if (tx < 0 || ty < 0 || tx >= state.w || ty >= state.h) continue;
        const tile = state.tiles[ty * state.w + tx];
        if (!tile.seen || !GLOWING.has(tile.k)) continue;
        const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
        const weight = 0.09 / (0.6 + d);
        const color = BASE[tile.k];
        r += color.r * weight;
        g += color.g * weight;
        b += color.b * weight;
      }
    }
    return { shade, r, g, b };
  }

  /** Lava and water scroll, so that they read as liquid at a glance. */
  update(time: number): void {
    this.lavaMap.offset.set(time * 0.018, time * 0.011);
    this.waterNormal?.offset.set(time * 0.025, -time * 0.018);
    const pulse = 1 + Math.sin(time * 0.9) * 0.18;
    this.lavaMaterial.color.setScalar(pulse);
  }

  private rebuildChunk(cx: number, cy: number): void {
    const { state } = this;
    const layers: Record<LayerName, Layer> = {
      floor: newLayer(),
      wall: newLayer(),
      glow: newLayer(),
      lava: newLayer(),
      water: newLayer(),
    };
    const lights = new Map<number, CornerLight>();
    const lightAt = (x: number, y: number) => {
      const key = y * (state.w + 1) + x;
      let light = lights.get(key);
      if (!light) {
        light = this.cornerLight(x, y);
        lights.set(key, light);
      }
      return light;
    };
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
        const name: LayerName = !tile.seen
          ? 'wall'
          : tile.k === 'lava'
            ? 'lava'
            : tile.k === 'water'
              ? 'water'
              : glowing
                ? 'glow'
                : isWallKind(tile.k)
                  ? 'wall'
                  : 'floor';
        const layer = layers[name];
        // Water has no texture to dim it, so it does without the boost made up for that.
        const scale = name === 'water' ? 0.45 / this.boost : 1;
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
          if (glowing || !tile.seen) {
            const shade = glowing ? 0.65 + (vy / WALL_HEIGHT) * 0.45 : 1;
            layer.colors.push(color.r * shade, color.g * shade, color.b * shade);
          } else {
            const light = lightAt(vx, vz);
            layer.colors.push(
              color.r * scale * light.shade + light.r,
              color.g * scale * light.shade + light.g,
              color.b * scale * light.shade + light.b,
            );
          }
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
        lava: new THREE.Mesh(new THREE.BufferGeometry(), this.lavaMaterial),
        water: new THREE.Mesh(new THREE.BufferGeometry(), this.waterMaterial),
      };
      chunk.wall.castShadow = true;
      chunk.floor.receiveShadow = true;
      chunk.wall.receiveShadow = true;
      chunk.water.receiveShadow = true;
      this.chunks.set(key, chunk);
      for (const name of LAYERS) {
        this.group.add(chunk[name]);
        this.pickables.push(chunk[name]);
      }
    }
    for (const name of LAYERS) this.assign(chunk[name], layers[name]);
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
      // Three tiles out: that's how far a newly dug tile's light and shade can reach.
      for (const [dx, dy] of [
        [0, 0],
        [-3, 0],
        [3, 0],
        [0, -3],
        [0, 3],
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
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
      for (const name of LAYERS) chunk[name].geometry.dispose();
    }
    this.floorMaterial.dispose();
    this.wallMaterial.dispose();
    this.glowMaterial.dispose();
    this.lavaMaterial.dispose();
    this.waterMaterial.dispose();
    this.lavaMap.dispose();
    this.waterNormal?.dispose();
  }
}
