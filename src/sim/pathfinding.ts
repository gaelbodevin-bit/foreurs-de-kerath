import { BUILDINGS } from '../data/buildings';
import { idx, isWalkableKind, NEIGHBORS8 } from './grid';
import type { GameState } from './types';

/** Cost of walking through a building: units route around it unless there is no other way. */
const BUILDING_COST = 6;

function tileCost(state: GameState, i: number, occupied: Set<number>): number {
  const k = state.tiles[i].k;
  const base = k === 'path' ? 0.7 : k === 'rubble' ? 1.5 : 1;
  return occupied.has(i) ? base + BUILDING_COST : base;
}

export function buildingTiles(state: GameState): Set<number> {
  const out = new Set<number>();
  for (const b of state.buildings) {
    const size = BUILDINGS[b.type].size;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) out.add(idx(state, b.x + dx, b.y + dy));
    }
  }
  return out;
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    let i = this.items.length;
    this.items.push(item);
    this.prio.push(priority);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= priority) break;
      this.items[i] = this.items[parent];
      this.prio[i] = this.prio[parent];
      i = parent;
    }
    this.items[i] = item;
    this.prio[i] = priority;
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastPrio = this.prio.pop() as number;
    const n = this.items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && this.prio[child + 1] < this.prio[child]) child++;
        if (this.prio[child] >= lastPrio) break;
        this.items[i] = this.items[child];
        this.prio[i] = this.prio[child];
        i = child;
      }
      this.items[i] = lastItem;
      this.prio[i] = lastPrio;
    }
    return top;
  }
}

/**
 * Scratch space for A*, kept between searches: on a big planet, three fresh maps of the whole world for
 * every path cost more than the search itself. A tile's entries only count when its stamp is this search's.
 */
let scratchSize = 0;
let stamp = new Uint32Array(0);
let closed = new Uint32Array(0);
let gScore = new Float64Array(0);
let cameFrom = new Int32Array(0);
let search = 0;

function nextSearch(n: number): number {
  if (scratchSize !== n || search >= 0xfffffff0) {
    scratchSize = n;
    stamp = new Uint32Array(n);
    closed = new Uint32Array(n);
    gScore = new Float64Array(n);
    cameFrom = new Int32Array(n);
    search = 0;
  }
  return ++search;
}

/**
 * A* over walkable tiles. Returns tile indices excluding the start, or null if unreachable.
 * With a budget, gives up on anything costlier: a quick answer for "is it close by?".
 */
export function findPath(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  maxCost = Infinity,
): number[] | null {
  const start = idx(state, fromX, fromY);
  const goal = idx(state, toX, toY);
  if (start === goal) return [];
  if (!isWalkableKind(state.tiles[goal].k)) return null;

  const occupied = buildingTiles(state);
  const n = state.w * state.h;
  // Double precision: rounded to single, the same cost would look cheaper again and again, and a
  // long walk took millions of steps to find.
  const run = nextSearch(n);
  const g = gScore;
  const from = cameFrom;
  const known = (i: number): boolean => stamp[i] === run;
  const open = new MinHeap();
  stamp[start] = run;
  g[start] = 0;
  from[start] = -1;
  open.push(start, 0);

  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) break;
    // An older, costlier entry for a tile already settled.
    if (closed[cur] === run) continue;
    closed[cur] = run;
    const cx = cur % state.w;
    const cy = Math.floor(cur / state.w);
    for (const [dx, dy] of NEIGHBORS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
      const ni = ny * state.w + nx;
      if (!isWalkableKind(state.tiles[ni].k)) continue;
      // Never cut a corner around a wall.
      if (dx !== 0 && dy !== 0) {
        if (!isWalkableKind(state.tiles[cy * state.w + nx].k)) continue;
        if (!isWalkableKind(state.tiles[ny * state.w + cx].k)) continue;
      }
      const step = tileCost(state, ni, occupied) * (dx !== 0 && dy !== 0 ? 1.414 : 1);
      const score = g[cur] + step;
      const estimate = score + Math.hypot(nx - toX, ny - toY) * 0.7;
      if ((!known(ni) || score < g[ni]) && estimate <= maxCost) {
        stamp[ni] = run;
        g[ni] = score;
        from[ni] = cur;
        open.push(ni, estimate);
      }
    }
  }

  if (!known(goal) || from[goal] === -1) return null;
  const path: number[] = [];
  for (let c = goal; c !== start; c = from[c]) path.push(c);
  return path.reverse();
}

/** Breadth-first walking distance from a tile to every reachable tile (-1 when unreachable). */
export function distanceField(state: GameState, fromX: number, fromY: number): Int32Array {
  const n = state.w * state.h;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const start = idx(state, fromX, fromY);
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % state.w;
    const cy = Math.floor(cur / state.w);
    const next = dist[cur] + 1;
    for (let k = 0; k < 4; k++) {
      let ni: number;
      if (k === 0) ni = cx + 1 < state.w ? cur + 1 : -1;
      else if (k === 1) ni = cx > 0 ? cur - 1 : -1;
      else if (k === 2) ni = cy + 1 < state.h ? cur + state.w : -1;
      else ni = cy > 0 ? cur - state.w : -1;
      if (ni < 0 || dist[ni] !== -1) continue;
      if (!isWalkableKind(state.tiles[ni].k)) continue;
      dist[ni] = next;
      queue[tail++] = ni;
    }
  }
  return dist;
}
