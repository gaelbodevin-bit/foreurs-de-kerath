import { WALLS } from '../data/resources';
import type { GameState, Tile, TileKind } from './types';

type Grid = Pick<GameState, 'w' | 'h' | 'tiles'>;

export const idx = (g: Pick<Grid, 'w'>, x: number, y: number): number => y * g.w + x;
export const inBounds = (g: Pick<Grid, 'w' | 'h'>, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < g.w && y < g.h;
export const tileAt = (g: Grid, x: number, y: number): Tile | undefined =>
  inBounds(g, x, y) ? g.tiles[idx(g, x, y)] : undefined;

export const isWallKind = (k: TileKind): boolean => k === 'solid' || WALLS[k] !== undefined;
export const isWalkableKind = (k: TileKind): boolean =>
  k === 'floor' || k === 'rubble' || k === 'path' || k === 'fungus';

export const NEIGHBORS4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const NEIGHBORS8: readonly (readonly [number, number])[] = [
  ...NEIGHBORS4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Changes a tile and flags it for the renderer. */
export function setTile(state: GameState, x: number, y: number, k: TileKind): void {
  const i = idx(state, x, y);
  state.tiles[i].k = k;
  state.dirty.push(i);
}

/** Flood-fills open ground from (x, y), revealing it and the walls around it. */
export function reveal(state: GameState, x: number, y: number): number {
  const stack = [idx(state, x, y)];
  const visited = new Set<number>(stack);
  let discovered = 0;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const cx = i % state.w;
    const cy = Math.floor(i / state.w);
    const tile = state.tiles[i];
    if (!tile.seen) {
      tile.seen = true;
      discovered++;
      state.dirty.push(i);
    }
    if (isWallKind(tile.k)) continue;
    for (const [dx, dy] of NEIGHBORS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(state, nx, ny)) continue;
      const ni = idx(state, nx, ny);
      if (visited.has(ni)) continue;
      visited.add(ni);
      stack.push(ni);
    }
  }
  return discovered;
}

export const tileCenter = (i: number, w: number): { x: number; y: number } => ({
  x: (i % w) + 0.5,
  y: Math.floor(i / w) + 0.5,
});
