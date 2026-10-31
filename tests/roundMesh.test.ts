import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { roundGeometry } from '../src/render/roundMesh';

function skinnedBox(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const count = box.getAttribute('position').count;
  box.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  box.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  return box;
}

const farthest = (geometry: THREE.BufferGeometry): number => {
  const position = geometry.getAttribute('position');
  let best = 0;
  for (let i = 0; i < position.count; i++) {
    best = Math.max(best, Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
  }
  return best;
};

describe('roundGeometry', () => {
  it('pulls the corners of a box in, without collapsing it', () => {
    const box = skinnedBox();
    const round = roundGeometry(box);
    expect(farthest(round)).toBeLessThan(farthest(box) * 0.9);
    expect(farthest(round)).toBeGreaterThan(0.35);
  });

  it('keeps the attributes a skinned, textured mesh needs', () => {
    const round = roundGeometry(skinnedBox());
    const count = round.getAttribute('position').count;
    for (const name of ['normal', 'uv', 'skinIndex', 'skinWeight']) {
      expect(round.getAttribute(name).count).toBe(count);
    }
    const normal = round.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 4);
    }
    expect(round.index?.count).toBe(36 * 16);
  });

  it('leaves the source geometry untouched', () => {
    const box = skinnedBox();
    const before = Array.from(box.getAttribute('position').array);
    roundGeometry(box);
    expect(Array.from(box.getAttribute('position').array)).toEqual(before);
  });
});
