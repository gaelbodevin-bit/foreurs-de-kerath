/** Deterministic PRNG (mulberry32). The state is one integer, so it saves with the game. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next };
}

/** Small stateful wrapper used where no game state is at hand (map generation). */
export class Rng {
  constructor(public seed: number) {}

  next(): number {
    const r = nextRandom(this.seed);
    this.seed = r.seed;
    return r.value;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

/** Random in [0, 1) drawn from the game state, keeping the simulation reproducible. */
export function rand(state: { rng: number }): number {
  const r = nextRandom(state.rng);
  state.rng = r.seed;
  return r.value;
}

export function randPick<T>(state: { rng: number }, items: readonly T[]): T {
  return items[Math.floor(rand(state) * items.length)];
}

/** Smooth 2D value noise in [0, 1], used for rock hardness. */
export function makeValueNoise(seed: number, scale: number): (x: number, y: number) => number {
  const rng = new Rng(seed);
  const size = 64;
  const lattice = Array.from({ length: size * size }, () => rng.next());
  const at = (x: number, y: number) =>
    lattice[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scale;
    const fy = y / scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}
