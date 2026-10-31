import * as THREE from 'three';

/** How finely each triangle is split: every level makes four out of one. */
const LEVELS = 2;
/** Enough to round off the boxes, while a head stays recognisably a head. */
const PASSES = 7;
const SHRINK = 0.5;
const INFLATE = -0.53;

/** The bone that moves a vertex the most. */
function mainJoint(joints: ArrayLike<number>, weights: ArrayLike<number>, vertex: number): number {
  let best = 0;
  for (let k = 1; k < 4; k++) {
    if (weights[vertex * 4 + k] > weights[vertex * 4 + best]) best = k;
  }
  return joints[vertex * 4 + best];
}

/**
 * Turns a low-poly box model into a soft one: splits its triangles, relaxes the corners with Taubin
 * smoothing (which, unlike plain averaging, does not shrink the volume), then shades it smoothly.
 * Parts on different bones stay separate shells, so an arm never melts into the torso.
 */
export function roundGeometry(
  source: THREE.BufferGeometry,
  levels = LEVELS,
  passes = PASSES,
): THREE.BufferGeometry {
  const count = source.getAttribute('position').count;
  const index = source.index
    ? Array.from(source.index.array)
    : Array.from({ length: count }, (_, i) => i);
  const position = Array.from(source.getAttribute('position').array as ArrayLike<number>);
  const uvAttribute = source.getAttribute('uv');
  const uv = uvAttribute ? Array.from(uvAttribute.array as ArrayLike<number>) : null;
  const jointAttribute = source.getAttribute('skinIndex');
  const weightAttribute = source.getAttribute('skinWeight');
  const joints = jointAttribute ? Array.from(jointAttribute.array as ArrayLike<number>) : null;
  const weights = weightAttribute ? Array.from(weightAttribute.array as ArrayLike<number>) : null;

  let triangles = index;
  for (let level = 0; level < levels; level++) {
    const midpoints = new Map<number, number>();
    const midpoint = (a: number, b: number): number => {
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const key = low * 0x4000000 + high;
      const known = midpoints.get(key);
      if (known !== undefined) return known;
      const made = position.length / 3;
      for (let k = 0; k < 3; k++)
        position.push((position[low * 3 + k] + position[high * 3 + k]) / 2);
      if (uv) for (let k = 0; k < 2; k++) uv.push((uv[low * 2 + k] + uv[high * 2 + k]) / 2);
      // Weights can't be averaged when the two ends name different bones: one end decides.
      if (joints && weights) {
        for (let k = 0; k < 4; k++) {
          joints.push(joints[low * 4 + k]);
          weights.push(weights[low * 4 + k]);
        }
      }
      midpoints.set(key, made);
      return made;
    };
    const next: number[] = [];
    for (let t = 0; t < triangles.length; t += 3) {
      const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    triangles = next;
  }

  // Vertices repeated for hard edges and texture seams must move as one.
  const total = position.length / 3;
  const shell = new Int32Array(total);
  const shells = new Map<string, number>();
  for (let v = 0; v < total; v++) {
    const joint = joints && weights ? mainJoint(joints, weights, v) : 0;
    const key = `${joint}/${Math.round(position[v * 3] * 1e4)}/${Math.round(position[v * 3 + 1] * 1e4)}/${Math.round(position[v * 3 + 2] * 1e4)}`;
    let id = shells.get(key);
    if (id === undefined) {
      id = shells.size;
      shells.set(key, id);
    }
    shell[v] = id;
  }

  const size = shells.size;
  const neighbours: Set<number>[] = Array.from({ length: size }, () => new Set<number>());
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [shell[triangles[t]], shell[triangles[t + 1]], shell[triangles[t + 2]]];
    neighbours[a].add(b).add(c);
    neighbours[b].add(a).add(c);
    neighbours[c].add(a).add(b);
  }
  const points = new Float64Array(size * 3);
  for (let v = 0; v < total; v++) {
    for (let k = 0; k < 3; k++) points[shell[v] * 3 + k] = position[v * 3 + k];
  }
  const moved = new Float64Array(size * 3);
  for (let pass = 0; pass < passes * 2; pass++) {
    const step = pass % 2 === 0 ? SHRINK : INFLATE;
    for (let s = 0; s < size; s++) {
      const around = neighbours[s];
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (const n of around) sum += points[n * 3 + k];
        const mean = around.size > 0 ? sum / around.size : points[s * 3 + k];
        moved[s * 3 + k] = points[s * 3 + k] + step * (mean - points[s * 3 + k]);
      }
    }
    points.set(moved);
  }

  // Normals summed per shell, so that the hard edges of the source no longer show in the shading.
  const normals = new Float64Array(size * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < triangles.length; t += 3) {
    const ids = [shell[triangles[t]], shell[triangles[t + 1]], shell[triangles[t + 2]]];
    a.fromArray(points, ids[0] * 3);
    b.fromArray(points, ids[1] * 3);
    c.fromArray(points, ids[2] * 3);
    b.sub(a);
    c.sub(a);
    b.cross(c);
    for (const id of ids) {
      normals[id * 3] += b.x;
      normals[id * 3 + 1] += b.y;
      normals[id * 3 + 2] += b.z;
    }
  }

  const outPosition = new Float32Array(total * 3);
  const outNormal = new Float32Array(total * 3);
  for (let v = 0; v < total; v++) {
    const s = shell[v];
    a.fromArray(normals, s * 3).normalize();
    for (let k = 0; k < 3; k++) outPosition[v * 3 + k] = points[s * 3 + k];
    outNormal[v * 3] = a.x;
    outNormal[v * 3 + 1] = a.y;
    outNormal[v * 3 + 2] = a.z;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(outPosition, 3));
  result.setAttribute('normal', new THREE.BufferAttribute(outNormal, 3));
  if (uv) result.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  if (joints && weights) {
    result.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(joints), 4));
    result.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(weights), 4));
  }
  result.setIndex(triangles);
  return result;
}
