import { WALLS } from '../data/resources';
import { REGIONS, sectorAt, WORLD_SIZE } from '../data/regions';
import { isWallKind, NEIGHBORS4 } from './grid';
import { makeValueNoise, Rng } from './rng';
import type { EnemyType, Tile, TileKind } from './types';

export interface MapParams {
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
  /** Sealed rooms with sleeping monsters, and something worth the risk. */
  lairs?: { count: number; monsters: EnemyType[] };
  /** Places a sealed settlement in this sector, behind a band of fallen rock. */
  settlement?: boolean;
}

export interface GeneratedMap {
  w: number;
  h: number;
  tiles: Tile[];
  start: { x: number; y: number };
  structures: { type: EnemyType; x: number; y: number }[];
  settlement: { x: number; y: number } | null;
  lairs: { x: number; y: number; monsters: EnemyType[] }[];
}

interface Cavern {
  x: number;
  y: number;
  r: number;
}

const START_RADIUS = 4;
const SETTLEMENT_RADIUS = 3;
const SETTLEMENT_OFFSET = 10;
/** No monsters waiting in or next to the city the colonists are holding out in. */
const LAIR_CLEARANCE = 10;
/** How wide the band of tough rock between two sectors is, in tiles on each side. */
const BORDER = 1.6;
/** The sectors of this rank and beyond are walled with what only a laser cuts. */
const BASALT_FROM_TIER = 2;

/**
 * The whole planet as one map. Each sector has its own geology, and the rock between sectors is what
 * paces the game: the first borders need a jackhammer, the later ones a laser.
 */
export function generateWorld(seed: number): GeneratedMap {
  const rng = new Rng(seed);
  const w = WORLD_SIZE;
  const h = WORLD_SIZE;
  const noise = makeValueNoise(seed ^ 0x51ed, 7);
  const tiles: Tile[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x < 1 || y < 1 || x >= w - 1 || y >= h - 1;
      const v = noise(x, y);
      const { hardness } = REGIONS[sectorAt(x, y, w, h).index].map;
      const k: TileKind = edge
        ? 'solid'
        : v < 0.46 - hardness * 0.28
          ? 'dirt'
          : v < 0.66 - hardness * 0.2
            ? 'loose'
            : v < 0.9 - hardness * 0.2
              ? 'hard'
              : 'basalt';
      tiles.push({ k, seen: false, work: 0, rubble: 0, regrow: 0 });
    }
  }
  const at = (x: number, y: number) => tiles[y * w + x];
  const inner = (x: number, y: number) => x > 0 && y > 0 && x < w - 1 && y < h - 1;

  const home = REGIONS[0].planet;
  const start = { x: Math.round((home.x / 100) * w), y: Math.round((home.y / 100) * h) };

  function carveBlob(cx: number, cy: number, r: number, kind: TileKind, jitter: number): void {
    for (let y = cy - r - 1; y <= cy + r + 1; y++) {
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        if (!inner(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r + (jitter ? rng.next() * jitter - jitter / 2 : 0)) at(x, y).k = kind;
      }
    }
  }
  carveBlob(start.x, start.y, START_RADIUS, 'floor', 0);

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

  /** A random spot well inside a sector, or null if none turned up. */
  const spotIn = (index: number, margin: number): { x: number; y: number } | null => {
    for (let tries = 0; tries < 400; tries++) {
      const x = rng.int(2, w - 3);
      const y = rng.int(2, h - 3);
      const sector = sectorAt(x, y, w, h);
      if (sector.index === index && sector.margin >= margin) return { x, y };
    }
    return null;
  };

  const structures: GeneratedMap['structures'] = [];
  const lairs: GeneratedMap['lairs'] = [];
  REGIONS.forEach((region, index) => {
    const { map } = region;
    const caverns: Cavern[] = [];
    for (let attempt = 0; attempt < map.caverns * 30 && caverns.length < map.caverns; attempt++) {
      const r = rng.int(2, 4);
      const spot = spotIn(index, r + BORDER + 2);
      if (!spot) break;
      if (Math.hypot(spot.x - start.x, spot.y - start.y) < START_RADIUS + r + 3) continue;
      if (caverns.some((c) => Math.hypot(c.x - spot.x, c.y - spot.y) < c.r + r + 2)) continue;
      caverns.push({ ...spot, r });
      carveBlob(spot.x, spot.y, r, 'floor', 1.2);
    }

    // Structures sit in the sector's farthest caverns, so that they are met late.
    const byDistance = [...caverns].sort(
      (a, b) => Math.hypot(b.x - start.x, b.y - start.y) - Math.hypot(a.x - start.x, a.y - start.y),
    );
    const used = new Set<Cavern>();
    for (const [type, count] of Object.entries(map.structures ?? {}) as [EnemyType, number][]) {
      for (let i = 0; i < count; i++) {
        const cavern = byDistance.find((c) => !used.has(c));
        if (!cavern) break;
        used.add(cavern);
        structures.push({ type, x: cavern.x, y: cavern.y });
      }
    }

    // Before anything else claims a cavern. Never where Port-Cendre may stand, and if no cavern fits,
    // a room is dug for the purpose: every sector, the first above all, should have one to find.
    const farFromCity = (x: number, y: number) =>
      index > 0 ||
      !map.settlement ||
      ![1, -1].some(
        (sign) =>
          Math.hypot(x - (start.x + sign * SETTLEMENT_OFFSET), y - (start.y + SETTLEMENT_OFFSET)) <=
          LAIR_CLEARANCE,
      );
    for (let i = 0; i < (map.lairs?.count ?? 0); i++) {
      let c = byDistance.find(
        (option) => !used.has(option) && option.r >= 2 && farFromCity(option.x, option.y),
      );
      for (let tries = 0; !c && tries < 60; tries++) {
        const spot = spotIn(index, 3 + BORDER + 2);
        if (!spot || !farFromCity(spot.x, spot.y)) continue;
        if (Math.hypot(spot.x - start.x, spot.y - start.y) < START_RADIUS + 6) continue;
        c = { ...spot, r: 3 };
        carveBlob(c.x, c.y, c.r, 'floor', 1.2);
      }
      if (!c || !map.lairs) break;
      used.add(c);
      lairs.push({ x: c.x, y: c.y, monsters: map.lairs.monsters });
      for (let y = c.y - c.r - 1; y <= c.y + c.r + 1; y++) {
        for (let x = c.x - c.r - 1; x <= c.x + c.r + 1; x++) {
          if (inner(x, y) && at(x, y).k === 'floor') at(x, y).lair = true;
        }
      }
    }

    const free = () => caverns.filter((c) => !used.has(c));
    const splash = (cx: number, cy: number, kind: TileKind, r: number) => {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (inner(x, y) && at(x, y).k === 'floor' && Math.hypot(x - cx, y - cy) <= r - 0.3) {
            at(x, y).k = kind;
          }
        }
      }
    };
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
    decorate(map.lavaPools, 'lava', 2);
    decorate(map.waterPools, 'water', 2);
    decorate(map.fungusPatches, 'fungus', 1);
    for (let i = 0; i < (map.gasZones ?? 0); i++) {
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

    for (const [kind, count] of Object.entries(map.seams) as [TileKind, number][]) {
      for (let i = 0; i < count; i++) {
        const spot = spotIn(index, BORDER);
        if (spot) paintVein(kind, spot.x, spot.y, rng.int(3, 6));
      }
    }
    for (let i = 0; i < (map.relics ?? 0); i++) {
      const spot = spotIn(index, BORDER + 1);
      if (!spot || !isWallKind(at(spot.x, spot.y).k)) continue;
      at(spot.x, spot.y).k = 'relicVault';
    }
  });

  // Last among the terrain, so that no cavern or vein leaves a gap in the wall.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const sector = sectorAt(x, y, w, h);
      if (sector.margin >= BORDER) continue;
      const tier = Math.max(REGIONS[sector.index].tier, REGIONS[sector.other].tier);
      at(x, y).k = tier >= BASALT_FROM_TIER ? 'basalt' : 'hard';
      at(x, y).gas = 0;
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
  // A few drillable tiles between the start and those seams.
  for (const [dx, dy] of NEIGHBORS4) {
    for (let d = START_RADIUS + 1; d <= START_RADIUS + 3; d++) {
      const t = at(start.x + dx * d, start.y + dy * d);
      if (t.k === 'hard' || t.k === 'basalt') t.k = 'loose';
    }
  }

  // The rockfall seals the settlement all round, and the straight line to it is always within reach
  // of a pickaxe. It lies on the side away from the other sectors, so that it stays in the first.
  let settlement: GeneratedMap['settlement'] = null;
  if (REGIONS[0].map.settlement) {
    const signX = rng.pick([1, -1]);
    const signY = 1;
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
        at(x, y).lair = false;
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

  return { w, h, tiles, start, structures, settlement, lairs };
}
