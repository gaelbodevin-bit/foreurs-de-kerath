import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import type { BuildingType, EnemyType, ResourceId, UnitType } from '../sim/types';

/** All models are assembled from primitives: the game ships without a single asset file. */

const materials = new Map<string, THREE.Material>();
function lambert(color: number): THREE.Material {
  const key = `l${color}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materials.set(key, m);
  }
  return m;
}
function glow(color: number): THREE.Material {
  const key = `g${color}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    materials.set(key, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const coneGeo = new THREE.ConeGeometry(1, 1, 10);
const sphereGeo = new THREE.SphereGeometry(1, 12, 10);
const gemGeo = new THREE.OctahedronGeometry(1);
const rockGeo = new THREE.DodecahedronGeometry(1);

function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  return mesh;
}

const box = (m: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = sy / 2, z = 0) =>
  part(boxGeo, m, sx, sy, sz, x, y, z);
const cyl = (m: THREE.Material, r: number, h: number, x = 0, y = h / 2, z = 0) =>
  part(cylGeo, m, r, h, r, x, y, z);

const STEEL = 0x77808c;
const DARK = 0x3a3f49;
const TEAL = 0x35e0c2;
const AMBER = 0xffb347;

function makeWorker(suit: number, helmet: number, weapon: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(lambert(suit), 0.2, 0.26, 0.14, 0, 0.3),
    box(lambert(DARK), 0.07, 0.17, 0.09, -0.06, 0.09),
    box(lambert(DARK), 0.07, 0.17, 0.09, 0.06, 0.09),
    box(lambert(suit), 0.06, 0.2, 0.08, -0.13, 0.3),
    box(lambert(suit), 0.06, 0.2, 0.08, 0.13, 0.3),
    part(sphereGeo, lambert(helmet), 0.11, 0.1, 0.11, 0, 0.53, 0),
    box(glow(AMBER), 0.13, 0.04, 0.03, 0, 0.53, 0.1),
    box(lambert(DARK), 0.12, 0.16, 0.06, 0, 0.32, -0.1),
  );
  if (weapon) g.add(box(glow(0xff5a5a), 0.04, 0.04, 0.24, 0.13, 0.3, 0.14));
  else g.add(box(lambert(STEEL), 0.04, 0.04, 0.2, 0.13, 0.22, 0.13));
  return g;
}

export function makeUnit(type: UnitType): THREE.Group {
  switch (type) {
    case 'foreur':
      return makeWorker(0xd9762b, 0xf0c24b, false);
    case 'garde':
      return makeWorker(0x3f6fb5, 0xcfd6e0, true);
    case 'heavy': {
      const g = new THREE.Group();
      g.add(
        box(lambert(0xc9a227), 0.5, 0.26, 0.6, 0, 0.26),
        box(lambert(DARK), 0.12, 0.14, 0.66, -0.26, 0.07),
        box(lambert(DARK), 0.12, 0.14, 0.66, 0.26, 0.07),
        box(lambert(DARK), 0.28, 0.14, 0.2, 0, 0.45, -0.1),
      );
      const bit = part(coneGeo, lambert(STEEL), 0.17, 0.42, 0.17, 0, 0.27, 0.5);
      bit.rotation.x = Math.PI / 2;
      g.add(bit);
      return g;
    }
    case 'hauler': {
      const g = new THREE.Group();
      g.add(
        box(lambert(0x4f9d69), 0.36, 0.14, 0.5, 0, 0.17),
        box(lambert(STEEL), 0.32, 0.12, 0.2, 0, 0.3, -0.1),
        box(glow(TEAL), 0.26, 0.05, 0.03, 0, 0.2, 0.26),
      );
      for (const [x, z] of [
        [-0.2, 0.18],
        [0.2, 0.18],
        [-0.2, -0.18],
        [0.2, -0.18],
      ]) {
        g.add(part(sphereGeo, lambert(DARK), 0.08, 0.08, 0.08, x, 0.08, z));
      }
      return g;
    }
  }
}

export function makeEnemy(type: EnemyType): THREE.Group {
  const g = new THREE.Group();
  switch (type) {
    case 'rongeur':
      g.add(
        part(sphereGeo, lambert(0x6b4a7a), 0.17, 0.12, 0.24, 0, 0.13, 0),
        part(coneGeo, lambert(0xdcd0b8), 0.04, 0.12, 0.04, -0.06, 0.1, 0.25),
        part(coneGeo, lambert(0xdcd0b8), 0.04, 0.12, 0.04, 0.06, 0.1, 0.25),
        part(sphereGeo, glow(0xff4040), 0.025, 0.025, 0.025, -0.07, 0.19, 0.2),
        part(sphereGeo, glow(0xff4040), 0.025, 0.025, 0.025, 0.07, 0.19, 0.2),
      );
      break;
    case 'golem':
      g.add(
        part(rockGeo, lambert(0x6f675f), 0.3, 0.36, 0.26, 0, 0.5, 0),
        part(rockGeo, lambert(0x5d564f), 0.15, 0.2, 0.15, -0.34, 0.4, 0),
        part(rockGeo, lambert(0x5d564f), 0.15, 0.2, 0.15, 0.34, 0.4, 0),
        part(rockGeo, lambert(0x5d564f), 0.13, 0.17, 0.13, -0.14, 0.13, 0),
        part(rockGeo, lambert(0x5d564f), 0.13, 0.17, 0.13, 0.14, 0.13, 0),
        part(gemGeo, glow(0xff8c3a), 0.07, 0.09, 0.07, 0, 0.62, 0.24),
      );
      break;
    case 'larve':
      for (let i = 0; i < 4; i++) {
        g.add(
          part(
            sphereGeo,
            lambert(i % 2 ? 0x7a2e16 : 0xb2441c),
            0.15 - i * 0.015,
            0.12,
            0.15,
            0,
            0.12,
            0.2 - i * 0.2,
          ),
        );
      }
      g.add(part(sphereGeo, glow(0xffb040), 0.05, 0.05, 0.05, 0, 0.17, 0.31));
      break;
    case 'saboteur':
      g.add(makeWorker(0x3b2748, 0x241833, false));
      g.add(box(glow(0xc77dff), 0.1, 0.1, 0.1, 0, 0.32, 0.12));
      break;
    case 'drone':
      g.add(
        part(sphereGeo, lambert(0x8a2f36), 0.2, 0.1, 0.2, 0, 0.62, 0),
        box(lambert(DARK), 0.54, 0.03, 0.05, 0, 0.66, 0),
        box(lambert(DARK), 0.05, 0.03, 0.54, 0, 0.66, 0),
        part(sphereGeo, glow(0xff3030), 0.05, 0.05, 0.05, 0, 0.55, 0.15),
      );
      break;
    case 'nest':
      g.add(
        part(sphereGeo, lambert(0x4b2a56), 0.75, 0.55, 0.75, 0, 0.25, 0),
        part(coneGeo, lambert(0x6b3d78), 0.2, 0.7, 0.2, -0.45, 0.45, 0.2),
        part(coneGeo, lambert(0x6b3d78), 0.2, 0.9, 0.2, 0.4, 0.55, -0.25),
        part(coneGeo, lambert(0x6b3d78), 0.16, 0.6, 0.16, 0.1, 0.8, 0.3),
        part(sphereGeo, glow(0xff4080), 0.16, 0.16, 0.16, 0, 0.72, 0),
      );
      break;
    case 'outpost':
      g.add(
        box(lambert(0x5a2a30), 1.3, 0.5, 1.3),
        cyl(lambert(DARK), 0.3, 1.6),
        box(lambert(0x8a2f36), 0.7, 0.2, 0.7, 0, 1.6),
        part(gemGeo, glow(0xff3030), 0.14, 0.18, 0.14, 0, 2, 0),
      );
      break;
    case 'heart':
      g.add(
        part(sphereGeo, glow(0xd63a5a), 1, 1.15, 1, 0, 1.2, 0),
        part(coneGeo, lambert(0x3a1a2c), 0.3, 1.6, 0.3, -1, 0.8, 0.3),
        part(coneGeo, lambert(0x3a1a2c), 0.3, 1.9, 0.3, 1, 0.95, -0.2),
        part(coneGeo, lambert(0x3a1a2c), 0.26, 1.5, 0.26, 0.2, 0.75, 1),
        part(coneGeo, lambert(0x3a1a2c), 0.26, 1.7, 0.26, -0.2, 0.85, -1),
      );
      break;
  }
  return g;
}

/** Each building gets a distinct silhouette, recognisable from the default camera. */
export function makeBuilding(type: BuildingType): THREE.Group {
  const size = BUILDINGS[type].size;
  const g = new THREE.Group();
  const center = size / 2;
  const root = new THREE.Group();
  root.position.set(center, 0, center);
  g.add(root);
  const w = size - 0.14;
  root.add(box(lambert(DARK), w, 0.08, w));
  switch (type) {
    case 'hq':
      root.add(
        box(lambert(0x8c95a3), 1.5, 0.7, 1.5),
        box(lambert(0x5f6875), 1, 0.45, 1, 0, 0.92),
        cyl(lambert(STEEL), 0.05, 0.8, 0.45, 1.5, 0.45),
        box(glow(TEAL), 1.52, 0.07, 1.52, 0, 0.5),
        part(gemGeo, glow(TEAL), 0.2, 0.28, 0.2, 0, 1.45, 0),
      );
      break;
    case 'depot':
      root.add(
        box(lambert(0x8a7050), 0.74, 0.42, 0.74),
        box(lambert(0x6d583f), 0.3, 0.26, 0.34, 0.12, 0.55),
      );
      break;
    case 'generator':
      root.add(
        cyl(lambert(STEEL), 0.42, 0.75, -0.38, undefined, 0.2),
        cyl(lambert(STEEL), 0.28, 0.55, 0.45, undefined, -0.35),
        box(lambert(0x5f6875), 0.6, 0.4, 0.6, 0.4, undefined, 0.45),
        part(gemGeo, glow(TEAL), 0.2, 0.27, 0.2, -0.38, 1, 0.2),
      );
      break;
    case 'oxygen':
      root.add(
        cyl(lambert(0xaed4e6), 0.28, 0.7),
        part(sphereGeo, glow(0x9fe6ff), 0.17, 0.17, 0.17, 0, 0.82, 0),
        box(lambert(STEEL), 0.7, 0.14, 0.14, 0, 0.3),
      );
      break;
    case 'habitat':
      root.add(
        box(lambert(0xb0a494), 0.74, 0.5, 0.74),
        box(lambert(0x8b4a3a), 0.82, 0.1, 0.82, 0, 0.55),
        box(glow(AMBER), 0.12, 0.13, 0.02, -0.18, 0.27, 0.38),
        box(glow(AMBER), 0.12, 0.13, 0.02, 0.18, 0.27, 0.38),
      );
      break;
    case 'melter':
      root.add(
        cyl(lambert(STEEL), 0.3, 0.45),
        part(sphereGeo, glow(0x4ea8f0), 0.25, 0.14, 0.25, 0, 0.47, 0),
      );
      break;
    case 'farm':
      root.add(box(lambert(0x3e5a34), 1.7, 0.16, 1.7));
      for (const [x, z] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ]) {
        root.add(
          cyl(lambert(0xcfc8a8), 0.06, 0.35, x, 0.33, z),
          part(sphereGeo, glow(0x9ccc5a), 0.28, 0.14, 0.28, x, 0.55, z),
        );
      }
      break;
    case 'refinery':
      root.add(
        box(lambert(0x5f6875), 1.4, 0.55, 1.1),
        cyl(lambert(DARK), 0.13, 1.25, -0.5, undefined, -0.45),
        cyl(lambert(DARK), 0.13, 1, 0.1, undefined, -0.45),
        box(glow(0xff8c3a), 0.5, 0.08, 0.04, 0.3, 0.3, 0.56),
      );
      break;
    case 'foundry':
      root.add(
        box(lambert(0x4f3f3f), 1.6, 0.6, 1.5),
        cyl(lambert(0x2f2a2f), 0.32, 1.2, 0, undefined, 0),
        part(sphereGeo, glow(0xff7d54), 0.26, 0.12, 0.26, 0, 1.2, 0),
      );
      break;
    case 'market':
      root.add(
        box(lambert(0xb48e4e), 0.55, 0.4, 0.55, -0.45, undefined, -0.4),
        box(lambert(0x8a5a8a), 0.55, 0.4, 0.55, 0.45, undefined, -0.4),
        box(lambert(0x4a8a8a), 0.55, 0.4, 0.55, -0.45, undefined, 0.42),
        part(gemGeo, glow(0xffc23d), 0.18, 0.25, 0.18, 0.45, 0.4, 0.42),
      );
      break;
    case 'plaza':
      root.add(
        box(lambert(0x9a9288), 0.8, 0.06, 0.8, 0, 0.1),
        cyl(lambert(0xb7b0a4), 0.1, 0.4, 0, 0.32, 0),
        part(sphereGeo, glow(0x7fd8ff), 0.1, 0.1, 0.1, 0, 0.6, 0),
      );
      break;
    case 'clinic':
      root.add(
        box(lambert(0xdedad2), 1.5, 0.65, 1.4),
        box(glow(0xff5a5a), 0.5, 0.14, 0.14, 0, 0.72, 0),
        box(glow(0xff5a5a), 0.14, 0.14, 0.5, 0, 0.72, 0),
      );
      break;
    case 'lab':
      root.add(
        box(lambert(0x7a86a3), 1.3, 0.5, 1.3),
        part(sphereGeo, lambert(0xb79cff), 0.5, 0.5, 0.5, 0, 0.55, 0),
        box(glow(0xb79cff), 1.32, 0.05, 1.32, 0, 0.3),
      );
      break;
    case 'security':
      root.add(
        box(lambert(0x2f3b52), 0.72, 0.75, 0.72),
        box(glow(0xff4545), 0.2, 0.06, 0.2, 0, 0.8),
      );
      break;
    case 'barracks':
      root.add(
        box(lambert(0x4a5a42), 1.6, 0.5, 1.2),
        box(lambert(0x3a4834), 0.5, 0.3, 0.5, 0.5, 0.65, 0),
        box(glow(0xff5a5a), 1.62, 0.04, 0.04, 0, 0.3, 0.6),
      );
      break;
    case 'workshop':
      root.add(
        box(lambert(0x8a6a2f), 1.6, 0.6, 1.5),
        box(lambert(DARK), 0.8, 0.45, 0.04, 0, 0.26, 0.76),
        cyl(lambert(STEEL), 0.05, 1.2, 0.65, undefined, -0.6),
      );
      break;
    case 'turret':
      root.add(
        cyl(lambert(STEEL), 0.28, 0.4),
        box(lambert(DARK), 0.36, 0.18, 0.36, 0, 0.48),
        box(glow(0xff5a5a), 0.07, 0.07, 0.48, 0, 0.5, 0.3),
      );
      break;
  }
  return g;
}

export function makePickup(res: ResourceId): THREE.Object3D {
  const color = RESOURCES[res].color;
  const shiny =
    res === 'crystal' || res === 'relic' || res === 'gold' || res === 'sulfur' || res === 'ice';
  const material = shiny ? glow(color) : lambert(color);
  const geometry = res === 'crystal' || res === 'relic' ? gemGeo : rockGeo;
  return part(geometry, material, 0.09, 0.11, 0.09, 0, 0.1, 0);
}
