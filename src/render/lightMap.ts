import { BUILDINGS } from '../data/buildings';
import type { GameState, TileKind } from '../sim/types';

/** How far each kind of light carries, in tiles. Beyond it, only the darkness of the cave is left. */
const BUILDING_LIGHT = 7;
const HQ_LIGHT = 11;
const CITY_LIGHT = 11;
const ROAD_LIGHT = 4;
/** A building with no power keeps only its emergency lights. */
const UNPOWERED_SHARE = 0.55;
const UNPOWERED_LEVEL = 0.6;
/** Rock that shines lights up its surroundings, enough to be found from afar. */
const SHINING: Partial<Record<TileKind, { radius: number; level: number }>> = {
  lava: { radius: 4.5, level: 0.85 },
  crystalSeam: { radius: 2.4, level: 0.45 },
  relicVault: { radius: 2.4, level: 0.45 },
};

/** Full light up to here, as a share of the radius, then it fades out. */
const CORE = 0.35;

/** Keeps the brightest of what reaches each tile: lights don't add up to more than daylight. */
function stamp(
  levels: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  level = 1,
): void {
  const reach = Math.ceil(radius);
  const x0 = Math.max(0, Math.floor(cx) - reach);
  const x1 = Math.min(w - 1, Math.floor(cx) + reach);
  const y0 = Math.max(0, Math.floor(cy) - reach);
  const y1 = Math.min(h - 1, Math.floor(cy) + reach);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
      if (distance >= 1) continue;
      const t = distance <= CORE ? 0 : (distance - CORE) / (1 - CORE);
      const light = level * (1 - t * t * (3 - 2 * t));
      const i = y * w + x;
      if (light > levels[i]) levels[i] = light;
    }
  }
}

/** The light of every tile, from 0 to 1, from what doesn't move: lamps on heads come on top. */
export function computeLightMap(state: GameState, levels: Float32Array): void {
  const { w, h } = state;
  levels.fill(0);
  state.tiles.forEach((tile, i) => {
    if (!tile.seen) return;
    const x = (i % w) + 0.5;
    const y = Math.floor(i / w) + 0.5;
    if (tile.k === 'path') {
      if (tile.powered) stamp(levels, w, h, x, y, ROAD_LIGHT);
      return;
    }
    const shine = SHINING[tile.k];
    if (shine) stamp(levels, w, h, x, y, shine.radius, shine.level);
  });
  for (const b of state.buildings) {
    if (b.built < 1) continue;
    const def = BUILDINGS[b.type];
    const half = def.size / 2;
    const radius = b.type === 'hq' ? HQ_LIGHT : BUILDING_LIGHT;
    const dark = (def.power ?? 0) > 0 && b.eff <= 0;
    stamp(
      levels,
      w,
      h,
      b.x + half,
      b.y + half,
      dark ? radius * UNPOWERED_SHARE : radius,
      dark ? UNPOWERED_LEVEL : 1,
    );
  }
  const place = state.settlement;
  if (place && state.tiles[place.y * w + place.x].seen) {
    stamp(levels, w, h, place.x + 0.5, place.y + 0.5, CITY_LIGHT);
  }
}
