import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { log } from './entities';
import { isWalkableKind, NEIGHBORS4 } from './grid';
import type { GameState } from './types';

/** Below this, the air is merely unpleasant. */
export const GAS_HARMFUL = 0.2;
const GAS_DAMAGE = 3;
const FLOW = 0.12;
const FADE_BELOW = 0.03;
export const VENT_RADIUS = 6;
const VENT_RATE = 0.2;

/** Runs once a second. Gas stays sealed in its cavern until someone digs a way out for it. */
export function updateGas(state: GameState): void {
  const { tiles, w, h } = state;
  if (!tiles.some((t) => t.gas)) return;

  const change = new Float32Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    const gas = tiles[i].gas ?? 0;
    if (gas <= 0) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (!isWalkableKind(tiles[n].k)) continue;
      const flow = (gas - (tiles[n].gas ?? 0)) * FLOW;
      if (flow <= 0) continue;
      change[i] -= flow;
      change[n] += flow;
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (change[i] === 0) continue;
    const next = (tiles[i].gas ?? 0) + change[i];
    tiles[i].gas = next < FADE_BELOW ? 0 : next;
  }

  for (const b of state.buildings) {
    if (b.type !== 'vent' || b.built < 1 || b.eff <= 0) continue;
    const center = BUILDINGS.vent.size / 2;
    for (let y = b.y - VENT_RADIUS; y <= b.y + VENT_RADIUS; y++) {
      for (let x = b.x - VENT_RADIUS; x <= b.x + VENT_RADIUS; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const tile = tiles[y * w + x];
        if (!tile.gas) continue;
        if (Math.hypot(x + 0.5 - b.x - center, y + 0.5 - b.y - center) > VENT_RADIUS) continue;
        tile.gas = Math.max(0, tile.gas - VENT_RATE * b.eff);
      }
    }
  }

  let hurt = false;
  for (const unit of state.units) {
    // Machines don't breathe.
    if (UNITS[unit.type].citizens === 0) continue;
    const gas = tiles[Math.floor(unit.y) * w + Math.floor(unit.x)].gas ?? 0;
    if (gas < GAS_HARMFUL) continue;
    unit.hp -= gas * GAS_DAMAGE * state.mods.hazard;
    hurt = true;
  }
  if (hurt) {
    state.fx.push({ kind: 'voice', id: 'gas' });
    if (state.tick % 200 === 0) {
      log(state, 'Gaz toxique : éloignez vos équipes ou posez un ventilateur.', 'warn');
    }
  }
}
