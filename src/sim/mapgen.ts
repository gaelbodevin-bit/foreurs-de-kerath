import { WALLS } from '../data/resources';
import { isWallKind, NEIGHBORS4 } from './grid';
import { makeValueNoise, Rng } from './rng';
import type { EnemyType, Tile, TileKind } from './types';

export interface MapParams {
  size: number;
  seed: number;
  caverns: number;
  /** 0 (soft) to 1 (mostly hard rock). */
  hardness: number;
  seams: Partial<Record<'oreSeam' | 'crystalSeam' | 'iceSeam' | 'sulfurSeam' | 'goldSeam', number>>;
  relics?: number;
  lavaPools?: number;
  waterPools?: number;
  fungusPatches?: number;
  /** Caverns filled with toxic gas, harmless until the player digs into them. */
  gasZones?: number;
  structures?: Partial<Record<EnemyType, number>>;
  /** Places a sealed settlement across the map, behind a band of fallen rock. */
  settlement?: boolean;
}

export interface GeneratedMap {
  w: number;
  h: number;
  tiles: Tile[];
  start: { x: number; y: number };
  structures: { type: EnemyType; x: number; y: number }[];
  settlement: { x: number; y: number } | null;
}

interface Cavern {
  x: number;
  y: number;
  r: number;
}

const START_RADIUS = 4;
const SETTLEMENT_RADIUS = 3;
const SETTLEMENT_OFFSET = 10;

export function generateMap(params: MapParams): GeneratedMap {
  const rng = new Rng(params.seed);
  const w = params.size;
  const h = params.size;
  const noise = makeValueNoise(params.seed ^ 0x51ed, 7);
  const tiles: Tile[] = [];

  const softLimit = 0.46 - params.hardness * 0.28;
  const looseLimit = 0.66 - params.hardness * 0.2;
  const hardLimit = 0.9 - params.hardness * 0.2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x < 1 || y < 1 || x >= w - 1 || y >= h - 1;
      const v = noise(x, y);
      const k: TileKind = edge
        ? 'solid'
        : v < softLimit
          ? 'dirt'
          : v < looseLimit
            ? 'loose'
            : v < hardLimit
              ? 'hard'
              : 'basalt';
      tiles.push({ k, seen: false, work: 0, rubble: 0, regrow: 0 });
    }
  }
  const at = (x: number, y: number) => tiles[y * w + x];
  const inner = (x: number, y: number) => x > 0 && y > 0 && x < w - 1 && y < h - 1;

  const start = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
  carveBlob(start.x, start.y, START_RADIUS, 'floor', 0);

  function carveBlob(cx: number, cy: number, r: number, kind: TileKind, jitter: number): void {
    for (let y = cy - r - 1; y <= cy + r + 1; y++) {
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        if (!inner(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r + (jitter ? rng.next() * jitter - jitter / 2 : 0)) at(x, y).k = kind;
      }
    }
  }

  const caverns: Cavern[] = [];
  for (
    let attempt = 0;
    attempt < params.caverns * 30 && caverns.length < params.caverns;
    attempt++
  ) {
    const r = rng.int(2, 4);
    const x = rng.int(r + 2, w - r - 3);
    const y = rng.int(r + 2, h - r - 3);
    if (Math.hypot(x - start.x, y - start.y) < START_RADIUS + r + 3) continue;
    if (caverns.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + 2)) continue;
    caverns.push({ x, y, r });
    carveBlob(x, y, r, 'floor', 1.2);
  }

  // Structures sit in the farthest caverns so the player meets them late.
  const byDistance = [...caverns].sort(
    (a, b) => Math.hypot(b.x - start.x, b.y - start.y) - Math.hypot(a.x - start.x, a.y - start.y),
  );
  const structures: GeneratedMap['structures'] = [];
  const used = new Set<Cavern>();
  for (const [type, count] of Object.entries(params.structures ?? {}) as [EnemyType, number][]) {
    for (let i = 0; i < count; i++) {
      const cavern = byDistance.find((c) => !used.has(c));
      if (!cavern) break;
      used.add(cavern);
      structures.push({ type, x: cavern.x, y: cavern.y });
    }
  }

  const free = () => caverns.filter((c) => !used.has(c));
  const decorate = (count: number | undefined, kind: TileKind, spread: number) => {
    for (let i = 0; i < (count ?? 0); i++) {
      const options = free();
      if (options.length === 0) return;
      const c = rng.pick(options);
      used.add(c);
      // Keep a walkable ring so a pool never seals off the far side of a cavern.
      splash(c.x, c.y, kind, Math.max(1, c.r - spread));
    }
  };
  function splash(cx: number, cy: number, kind: TileKind, r: number): void {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (inner(x, y) && at(x, y).k === 'floor' && Math.hypot(x - cx, y - cy) <= r - 0.3) {
          at(x, y).k = kind;
        }
      }
    }
  }
  decorate(params.lavaPools, 'lava', 2);
  decorate(params.waterPools, 'water', 2);
  decorate(params.fungusPatches, 'fungus', 1);
  for (let i = 0; i < (params.gasZones ?? 0); i++) {
    const options = free();
    if (options.length === 0) break;
    const c = rng.pick(options);
    used.add(c);
    for (let y = c.y - c.r - 1; y <= c.y + c.r + 1; y++) {
      for (let x = c.x - c.r - 1; x <= c.x + c.r + 1; x++) {
        if (inner(x, y) && at(x, y).k === 'floor') at(x, y).gas = 1;
      }
    }
  }

  // Veins: short random walks through rock.
  const paintVein = (kind: TileKind, cx: number, cy: number, length: number) => {
    let x = cx;
    let y = cy;
    for (let i = 0; i < length; i++) {
      if (inner(x, y) && isWallKind(at(x, y).k) && at(x, y).k !== 'solid') at(x, y).k = kind;
      const [dx, dy] = rng.pick(NEIGHBORS4);
      x = Math.max(1, Math.min(w - 2, x + dx));
      y = Math.max(1, Math.min(h - 2, y + dy));
    }
  };
  for (const [kind, count] of Object.entries(params.seams) as [TileKind, number][]) {
    for (let i = 0; i < count; i++) {
      paintVein(kind, rng.int(2, w - 3), rng.int(2, h - 3), rng.int(3, 6));
    }
  }

  // Guaranteed essentials right next to the landing zone: no unwinnable starts.
  const ring = START_RADIUS + 1;
  const essentials: [TileKind, number, number][] = [
    ['crystalSeam', ring, 0],
    ['oreSeam', -ring, 0],
    ['oreSeam', 1, ring],
    ['iceSeam', 0, -ring],
  ];
  for (const [kind, dx, dy] of essentials) {
    at(start.x + dx, start.y + dy).k = kind;
    paintVein(kind, start.x + dx, start.y + dy, 3);
  }
  // A few drillable tiles between the start and those seams, even in hard rock regions.
  for (const [dx, dy] of NEIGHBORS4) {
    for (let d = START_RADIUS + 1; d <= START_RADIUS + 3; d++) {
      const t = at(start.x + dx * d, start.y + dy * d);
      if (t.k === 'hard' || t.k === 'basalt') t.k = 'loose';
    }
  }

  for (let i = 0; i < (params.relics ?? 0); i++) {
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.int(2, w - 3);
      const y = rng.int(2, h - 3);
      if (!isWallKind(at(x, y).k) || at(x, y).k === 'relicVault') continue;
      if (Math.hypot(x - start.x, y - start.y) < 9) continue;
      at(x, y).k = 'relicVault';
      break;
    }
  }

  // Last, so that the other maps keep their layout. The rockfall seals the settlement all round,
  // and the straight line to it is always within reach of a pickaxe.
  let settlement: GeneratedMap['settlement'] = null;
  if (params.settlement) {
    const [signX, signY] = rng.pick([
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]);
    settlement = {
      x: start.x + signX * SETTLEMENT_OFFSET,
      y: start.y + signY * SETTLEMENT_OFFSET,
    };
    const { x: sx, y: sy } = settlement;
    for (let y = sy - SETTLEMENT_RADIUS - 2; y <= sy + SETTLEMENT_RADIUS + 2; y++) {
      for (let x = sx - SETTLEMENT_RADIUS - 2; x <= sx + SETTLEMENT_RADIUS + 2; x++) {
        if (!inner(x, y)) continue;
        at(x, y).k = Math.hypot(x - sx, y - sy) <= SETTLEMENT_RADIUS ? 'floor' : 'loose';
        at(x, y).gas = 0;
      }
    }
    for (let d = 1; d < SETTLEMENT_OFFSET; d++) {
      for (const [ox, oy] of [
        [0, 0],
        [signX, 0],
      ]) {
        const t = at(start.x + signX * d + ox, start.y + signY * d + oy);
        if ((WALLS[t.k]?.power ?? 0) > 1) t.k = 'loose';
      }
    }
  }

  return { w, h, tiles, start, structures, settlement };
}
