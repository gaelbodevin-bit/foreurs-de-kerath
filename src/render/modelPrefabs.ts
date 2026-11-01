import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings';
import type { DrillTool } from '../data/resources';
import type { BuildingType, EnemyType, ResourceId, UnitType } from '../sim/types';
import type { ModelId } from './assetManifest';
import { hasModels, placeCharacter, placeModel } from './assets';
import { groundGlow } from './particles';

/**
 * Builds game objects out of the CC0 model packs. Each function returns null when a file it needs
 * did not load, which sends the caller back to the procedural shapes in `prefabs.ts`.
 */

const TEAL = 0x35e0c2;
const AMBER = 0xffb347;
const RED = 0xff5a5a;
const GLOW_STRENGTH = 3.2;

interface Part {
  model: ModelId;
  /** Footprint width, in tiles. */
  fit: number;
  x?: number;
  z?: number;
  y?: number;
  /** Quarter turns. */
  turn?: number;
  /** Keeps turning while the building has power. */
  spin?: boolean;
}

/** Glowing details the packs lack. They also double as the building's power light. */
interface Accent {
  color: number;
  y: number;
  x?: number;
  z?: number;
  size?: number;
  shape?: 'gem' | 'ball' | 'cross' | 'cap';
  /** Sits on a chimney, which then smokes. */
  smoke?: boolean;
}

/** A hand-placed primitive, for what the model packs don't have: tanks, pipes, awnings, windows. */
interface Detail {
  shape: 'box' | 'cyl' | 'dome';
  color: number;
  /** Lit from within, and goes dark when the building loses power. */
  glow?: boolean;
  x?: number;
  y: number;
  z?: number;
  w: number;
  h: number;
  d: number;
}

interface BuildingModel {
  /** The colour of the building's function, on the rim of its foundation. */
  trim: number;
  parts: Part[];
  accents: Accent[];
  details: Detail[];
}

const HOUSING = 0xffb347;
const INDUSTRY = 0xff8c3a;
const SCIENCE = 0xb79cff;
const WATER = 0x4ea8f0;
const GREEN = 0x9ccc5a;

const STEEL = 0x8f98a3;
const DARK = 0x3a3d42;
const RUST = 0x8a5a3c;
const WHITE = 0xd8dde2;
const OLIVE = 0x5d6b4a;

const BUILDING_MODELS: Record<BuildingType, BuildingModel> = {
  hq: {
    trim: TEAL,
    parts: [
      { model: 'hangarRoundA', fit: 2 },
      { model: 'dish', fit: 0.5, x: 0.7, z: -0.7, spin: true },
    ],
    accents: [{ color: TEAL, y: 1.2, size: 0.2, shape: 'gem' }],
    details: [
      { shape: 'box', color: DARK, x: 0, y: 0.16, z: 0.86, w: 0.5, h: 0.32, d: 0.2 },
      { shape: 'box', color: TEAL, glow: true, x: 0, y: 0.2, z: 0.97, w: 0.34, h: 0.14, d: 0.02 },
    ],
  },
  depot: {
    trim: TEAL,
    parts: [{ model: 'hangarSmallB', fit: 0.8, z: -0.05 }],
    accents: [{ color: AMBER, y: 0.5, size: 0.04 }],
    details: [
      { shape: 'box', color: RUST, x: -0.3, y: 0.08, z: 0.34, w: 0.16, h: 0.16, d: 0.16 },
      { shape: 'box', color: OLIVE, x: -0.11, y: 0.07, z: 0.36, w: 0.14, h: 0.14, d: 0.14 },
      { shape: 'box', color: RUST, x: -0.28, y: 0.21, z: 0.34, w: 0.12, h: 0.1, d: 0.12 },
    ],
  },
  generator: {
    trim: TEAL,
    parts: [{ model: 'generator', fit: 1.5, z: -0.1 }],
    accents: [{ color: TEAL, y: 1.1, size: 0.15, shape: 'gem' }],
    details: [
      { shape: 'cyl', color: STEEL, x: -0.66, y: 0.3, z: 0.66, w: 0.2, h: 0.6, d: 0.2 },
      { shape: 'cyl', color: STEEL, x: 0.66, y: 0.3, z: 0.66, w: 0.2, h: 0.6, d: 0.2 },
      {
        shape: 'cyl',
        color: TEAL,
        glow: true,
        x: -0.66,
        y: 0.62,
        z: 0.66,
        w: 0.14,
        h: 0.04,
        d: 0.14,
      },
      {
        shape: 'cyl',
        color: TEAL,
        glow: true,
        x: 0.66,
        y: 0.62,
        z: 0.66,
        w: 0.14,
        h: 0.04,
        d: 0.14,
      },
      { shape: 'box', color: DARK, x: 0, y: 0.1, z: 0.66, w: 1.2, h: 0.05, d: 0.05 },
    ],
  },
  oxygen: {
    trim: 0x9fe6ff,
    parts: [{ model: 'barrelLarge', fit: 0.66 }],
    accents: [{ color: 0x9fe6ff, y: 0.78, size: 0.1 }],
    details: [
      { shape: 'cyl', color: STEEL, x: 0.33, y: 0.28, z: 0.3, w: 0.07, h: 0.56, d: 0.07 },
      { shape: 'cyl', color: STEEL, x: -0.33, y: 0.2, z: 0.3, w: 0.07, h: 0.4, d: 0.07 },
    ],
  },
  habitat: {
    trim: HOUSING,
    parts: [{ model: 'hangarGlass', fit: 0.84 }],
    accents: [{ color: HOUSING, y: 0.5, size: 0.05 }],
    details: [
      { shape: 'cyl', color: HOUSING, glow: true, y: 0.16, w: 0.8, h: 0.05, d: 0.8 },
      { shape: 'box', color: DARK, x: 0, y: 0.1, z: 0.42, w: 0.18, h: 0.2, d: 0.06 },
      { shape: 'box', color: GREEN, x: 0.32, y: 0.06, z: 0.36, w: 0.12, h: 0.1, d: 0.12 },
    ],
  },
  melter: {
    trim: WATER,
    parts: [{ model: 'barrelMachine', fit: 0.62, x: -0.06 }],
    accents: [{ color: WATER, y: 0.6, size: 0.09 }],
    details: [
      { shape: 'cyl', color: 0x9fd8ff, x: 0.32, y: 0.2, z: 0.26, w: 0.2, h: 0.4, d: 0.2 },
      { shape: 'box', color: STEEL, x: 0.14, y: 0.3, z: 0.26, w: 0.2, h: 0.04, d: 0.04 },
    ],
  },
  farm: {
    trim: GREEN,
    parts: [{ model: 'platformLarge', fit: 1.86 }],
    accents: [
      { color: GREEN, x: -0.5, z: -0.5, y: 0.34, size: 0.27, shape: 'cap' },
      { color: 0xc7e07a, x: 0.5, z: -0.5, y: 0.4, size: 0.3, shape: 'cap' },
      { color: 0xc7e07a, x: -0.5, z: 0.5, y: 0.4, size: 0.3, shape: 'cap' },
      { color: GREEN, x: 0.5, z: 0.5, y: 0.34, size: 0.27, shape: 'cap' },
    ],
    details: [
      { shape: 'cyl', color: 0xefe6c8, x: -0.5, y: 0.22, z: -0.5, w: 0.1, h: 0.24, d: 0.1 },
      { shape: 'cyl', color: 0xefe6c8, x: 0.5, y: 0.25, z: -0.5, w: 0.1, h: 0.3, d: 0.1 },
      { shape: 'cyl', color: 0xefe6c8, x: -0.5, y: 0.25, z: 0.5, w: 0.1, h: 0.3, d: 0.1 },
      { shape: 'cyl', color: 0xefe6c8, x: 0.5, y: 0.22, z: 0.5, w: 0.1, h: 0.24, d: 0.1 },
      { shape: 'box', color: WATER, x: 0, y: 0.13, z: 0, w: 1.5, h: 0.03, d: 0.06 },
      { shape: 'box', color: WATER, x: 0, y: 0.13, z: 0, w: 0.06, h: 0.03, d: 1.5 },
    ],
  },
  refinery: {
    trim: INDUSTRY,
    parts: [
      { model: 'hangarLargeA', fit: 1.4, x: -0.2, z: 0.2 },
      { model: 'chimney', fit: 0.28, x: 0.65, z: -0.65 },
    ],
    accents: [{ color: 0xff8c3a, x: 0.65, z: -0.65, y: 1.5, size: 0.08, smoke: true }],
    details: [
      { shape: 'cyl', color: RUST, x: -0.6, y: 0.32, z: -0.62, w: 0.42, h: 0.64, d: 0.42 },
      { shape: 'cyl', color: STEEL, x: -0.6, y: 0.66, z: -0.62, w: 0.3, h: 0.05, d: 0.3 },
      { shape: 'box', color: STEEL, x: 0.02, y: 0.44, z: -0.64, w: 1.1, h: 0.06, d: 0.06 },
      {
        shape: 'box',
        color: INDUSTRY,
        glow: true,
        x: -0.2,
        y: 0.26,
        z: 0.92,
        w: 0.5,
        h: 0.1,
        d: 0.02,
      },
    ],
  },
  foundry: {
    trim: 0xff7d54,
    parts: [
      { model: 'hangarLargeB', fit: 1.5, z: 0.15 },
      { model: 'chimney', fit: 0.3, x: 0.65, z: -0.65 },
      { model: 'chimney', fit: 0.3, x: -0.65, z: -0.65 },
    ],
    accents: [
      { color: 0xff7d54, x: 0.65, z: -0.65, y: 1.6, size: 0.1, smoke: true },
      { color: 0xff7d54, x: -0.65, z: -0.65, y: 1.6, size: 0.1, smoke: true },
    ],
    details: [
      { shape: 'box', color: DARK, x: 0, y: 0.16, z: 0.92, w: 0.7, h: 0.32, d: 0.04 },
      {
        shape: 'box',
        color: 0xff6a2a,
        glow: true,
        x: 0,
        y: 0.14,
        z: 0.95,
        w: 0.5,
        h: 0.22,
        d: 0.02,
      },
    ],
  },
  market: {
    trim: 0xffc23d,
    parts: [
      { model: 'platformLarge', fit: 1.86 },
      { model: 'barrels', fit: 0.5, x: -0.55, z: 0.55, y: 0.08 },
    ],
    accents: [{ color: 0xffc23d, x: 0, z: 0.45, y: 0.5, size: 0.11, shape: 'gem' }],
    details: [
      // Three stalls, each with its own awning.
      { shape: 'box', color: 0xc14b3a, x: -0.5, y: 0.52, z: -0.45, w: 0.6, h: 0.05, d: 0.5 },
      { shape: 'box', color: RUST, x: -0.5, y: 0.2, z: -0.45, w: 0.5, h: 0.24, d: 0.3 },
      { shape: 'box', color: 0x3f7fb5, x: 0.5, y: 0.52, z: -0.45, w: 0.6, h: 0.05, d: 0.5 },
      { shape: 'box', color: RUST, x: 0.5, y: 0.2, z: -0.45, w: 0.5, h: 0.24, d: 0.3 },
      { shape: 'box', color: 0xd9a441, x: 0.55, y: 0.52, z: 0.5, w: 0.55, h: 0.05, d: 0.5 },
      { shape: 'box', color: RUST, x: 0.55, y: 0.2, z: 0.5, w: 0.45, h: 0.24, d: 0.28 },
    ],
  },
  plaza: {
    trim: 0x7fd8ff,
    parts: [{ model: 'platformSmall', fit: 0.9 }],
    accents: [{ color: 0x7fd8ff, y: 0.36, size: 0.07 }],
    details: [
      { shape: 'cyl', color: WHITE, y: 0.14, w: 0.5, h: 0.08, d: 0.5 },
      { shape: 'cyl', color: 0x4ea8f0, glow: true, y: 0.19, w: 0.38, h: 0.02, d: 0.38 },
      { shape: 'cyl', color: WHITE, y: 0.26, w: 0.05, h: 0.16, d: 0.05 },
      { shape: 'cyl', color: 0xefe6c8, x: -0.33, y: 0.2, z: -0.33, w: 0.05, h: 0.2, d: 0.05 },
      { shape: 'cyl', color: 0xefe6c8, x: 0.33, y: 0.2, z: 0.33, w: 0.05, h: 0.2, d: 0.05 },
      {
        shape: 'dome',
        color: GREEN,
        glow: true,
        x: -0.33,
        y: 0.3,
        z: -0.33,
        w: 0.13,
        h: 0.09,
        d: 0.13,
      },
      {
        shape: 'dome',
        color: GREEN,
        glow: true,
        x: 0.33,
        y: 0.3,
        z: 0.33,
        w: 0.13,
        h: 0.09,
        d: 0.13,
      },
    ],
  },
  clinic: {
    trim: RED,
    parts: [{ model: 'hangarRoundB', fit: 1.8 }],
    accents: [{ color: RED, y: 1.1, size: 0.5, shape: 'cross' }],
    details: [
      { shape: 'cyl', color: WHITE, y: 0.16, w: 1.8, h: 0.08, d: 1.8 },
      {
        shape: 'box',
        color: 0xbfe9ff,
        glow: true,
        x: 0,
        y: 0.26,
        z: 0.86,
        w: 0.36,
        h: 0.16,
        d: 0.02,
      },
    ],
  },
  lab: {
    trim: SCIENCE,
    parts: [
      { model: 'hangarGlass', fit: 1.7 },
      { model: 'dish', fit: 0.6, x: 0.68, z: 0.68, spin: true },
    ],
    accents: [{ color: SCIENCE, y: 1, size: 0.14 }],
    details: [
      { shape: 'cyl', color: SCIENCE, glow: true, y: 0.22, w: 1.62, h: 0.05, d: 1.62 },
      { shape: 'cyl', color: STEEL, x: -0.72, y: 0.55, z: -0.72, w: 0.04, h: 1.1, d: 0.04 },
      {
        shape: 'dome',
        color: SCIENCE,
        glow: true,
        x: -0.72,
        y: 1.12,
        z: -0.72,
        w: 0.06,
        h: 0.06,
        d: 0.06,
      },
      { shape: 'box', color: DARK, x: -0.68, y: 0.14, z: 0.62, w: 0.34, h: 0.28, d: 0.3 },
    ],
  },
  security: {
    trim: RED,
    parts: [{ model: 'structure', fit: 0.74 }],
    accents: [{ color: RED, y: 1.18, size: 0.07 }],
    details: [
      { shape: 'cyl', color: STEEL, y: 0.92, w: 0.04, h: 0.5, d: 0.04 },
      { shape: 'box', color: 0xbfe9ff, glow: true, x: 0, y: 0.3, z: 0.38, w: 0.3, h: 0.1, d: 0.02 },
    ],
  },
  barracks: {
    trim: RED,
    parts: [{ model: 'hangarSmallA', fit: 1.5, z: -0.1 }],
    accents: [{ color: RED, y: 1, size: 0.07 }],
    details: [
      { shape: 'box', color: OLIVE, x: 0, y: 0.08, z: 0.84, w: 1.7, h: 0.16, d: 0.06 },
      { shape: 'cyl', color: STEEL, x: -0.82, y: 0.5, z: 0.82, w: 0.04, h: 1, d: 0.04 },
      { shape: 'box', color: 0xc14b3a, x: -0.64, y: 0.86, z: 0.82, w: 0.34, h: 0.2, d: 0.02 },
    ],
  },
  workshop: {
    trim: AMBER,
    parts: [
      { model: 'hangarLargeA', fit: 1.5, z: -0.2, turn: 1 },
      { model: 'wireless', fit: 0.34, x: -0.74, z: -0.74 },
      { model: 'rover', fit: 0.6, x: 0.42, z: 0.68 },
    ],
    accents: [{ color: AMBER, y: 0.8, size: 0.06 }],
    details: [
      // A gantry crane over the bay.
      { shape: 'box', color: 0xd9a441, x: -0.72, y: 0.5, z: 0.7, w: 0.07, h: 1, d: 0.07 },
      { shape: 'box', color: 0xd9a441, x: -0.3, y: 0.98, z: 0.7, w: 0.9, h: 0.07, d: 0.07 },
      { shape: 'box', color: STEEL, x: 0.08, y: 0.76, z: 0.7, w: 0.03, h: 0.42, d: 0.03 },
      { shape: 'box', color: DARK, x: -0.32, y: 0.1, z: 0.7, w: 0.5, h: 0.2, d: 0.4 },
    ],
  },
  vent: {
    trim: 0xc4e04a,
    parts: [
      { model: 'barrelMachine', fit: 0.6 },
      { model: 'dish', fit: 0.4, y: 0.55, spin: true },
    ],
    accents: [{ color: 0xc4e04a, y: 0.42, size: 0.06 }],
    details: [
      { shape: 'box', color: 0xd9a441, x: 0.36, y: 0.06, z: 0, w: 0.04, h: 0.12, d: 0.7 },
      { shape: 'box', color: 0xd9a441, x: -0.36, y: 0.06, z: 0, w: 0.04, h: 0.12, d: 0.7 },
    ],
  },
  camp: {
    trim: TEAL,
    parts: [
      { model: 'hangarSmallA', fit: 1.1, x: -0.25, z: -0.25 },
      { model: 'turret', fit: 0.55, x: 0.62, z: 0.62 },
      { model: 'wireless', fit: 0.3, x: 0.68, z: -0.68 },
    ],
    accents: [{ color: TEAL, x: 0.68, z: -0.68, y: 0.85, size: 0.07 }],
    details: [
      { shape: 'box', color: RUST, x: -0.62, y: 0.09, z: 0.68, w: 0.2, h: 0.18, d: 0.2 },
      { shape: 'box', color: OLIVE, x: -0.36, y: 0.08, z: 0.72, w: 0.16, h: 0.16, d: 0.16 },
      { shape: 'box', color: 0xd9a441, x: 0, y: 0.1, z: 0.9, w: 1.8, h: 0.14, d: 0.04 },
    ],
  },
  turret: {
    trim: RED,
    parts: [{ model: 'turret', fit: 0.74 }],
    accents: [{ color: RED, y: 0.5, size: 0.04 }],
    details: [],
  },
};

const ballGeometry = new THREE.SphereGeometry(1, 12, 10);
const capGeometry = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const gemGeometry = new THREE.OctahedronGeometry(1);
const barGeometry = new THREE.BoxGeometry(1, 1, 1);
const glowMaterials = new Map<number, THREE.MeshBasicMaterial>();

function glow(color: number): THREE.MeshBasicMaterial {
  let material = glowMaterials.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color });
    // Brighter than white on purpose: only what passes 1.0 catches the bloom.
    material.color.multiplyScalar(GLOW_STRENGTH);
    glowMaterials.set(color, material);
  }
  return material;
}

function makeAccent(accent: Accent): THREE.Object3D {
  const size = accent.size ?? 0.1;
  const material = glow(accent.color);
  const group = new THREE.Group();
  group.position.set(accent.x ?? 0, accent.y, accent.z ?? 0);
  if (accent.shape === 'cross') {
    const a = new THREE.Mesh(barGeometry, material);
    a.scale.set(size, 0.1, 0.14);
    const b = new THREE.Mesh(barGeometry, material);
    b.scale.set(0.14, 0.1, size);
    group.add(a, b);
    return group;
  }
  const geometry =
    accent.shape === 'gem' ? gemGeometry : accent.shape === 'cap' ? capGeometry : ballGeometry;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(
    size,
    accent.shape === 'gem' ? size * 1.35 : accent.shape === 'cap' ? size * 0.6 : size,
    size,
  );
  group.add(mesh);
  return group;
}

const matteMaterials = new Map<number, THREE.MeshStandardMaterial>();

function matte(color: number): THREE.MeshStandardMaterial {
  let material = matteMaterials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.12 });
    matteMaterials.set(color, material);
  }
  return material;
}

const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);

function makeDetail(detail: Detail): THREE.Mesh {
  const material = detail.glow ? glow(detail.color) : matte(detail.color);
  const geometry =
    detail.shape === 'box' ? barGeometry : detail.shape === 'cyl' ? cylinderGeometry : capGeometry;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(detail.x ?? 0, detail.y, detail.z ?? 0);
  mesh.scale.set(detail.w, detail.h, detail.d);
  mesh.castShadow = !detail.glow;
  mesh.receiveShadow = !detail.glow;
  return mesh;
}

/** The slab every building stands on: it gives the city a common, built-up look. */
function foundation(size: number, trim: number): THREE.Group {
  const pad = new THREE.Group();
  const side = size * 0.98;
  const slab = new THREE.Mesh(barGeometry, matte(0x45474c));
  slab.scale.set(side, 0.06, side);
  slab.position.y = 0.03;
  slab.receiveShadow = true;
  const rim = new THREE.Mesh(barGeometry, matte(trim));
  rim.scale.set(side * 0.94, 0.012, side * 0.94);
  rim.position.y = 0.062;
  const top = new THREE.Mesh(barGeometry, matte(0x55575c));
  top.scale.set(side * 0.87, 0.016, side * 0.87);
  top.position.y = 0.066;
  top.receiveShadow = true;
  pad.add(slab, rim, top);
  return pad;
}

/**
 * What the headquarters gains as the colony climbs in rank: the first thing a player sees grow.
 * Index 0 goes with the first rank above the camp.
 */
function headquartersGrowth(): THREE.Object3D[] {
  const tower = (x: number, z: number, height: number, light: number): THREE.Group => {
    const group = new THREE.Group();
    group.add(
      makeDetail({ shape: 'cyl', color: WHITE, x, y: height / 2, z, w: 0.3, h: height, d: 0.3 }),
      makeDetail({
        shape: 'cyl',
        color: light,
        glow: true,
        x,
        y: height * 0.8,
        z,
        w: 0.32,
        h: 0.04,
        d: 0.32,
      }),
      makeDetail({ shape: 'dome', color: STEEL, x, y: height, z, w: 0.17, h: 0.12, d: 0.17 }),
    );
    return group;
  };
  const ring = new THREE.Group();
  ring.add(makeDetail({ shape: 'cyl', color: TEAL, glow: true, y: 1.42, w: 0.9, h: 0.03, d: 0.9 }));
  ring.add(makeDetail({ shape: 'cyl', color: STEEL, y: 1.15, w: 0.05, h: 0.6, d: 0.05 }));
  return [
    tower(-0.78, -0.78, 1, AMBER),
    tower(-0.78, 0.78, 1.25, TEAL),
    tower(0.78, 0.78, 1.5, AMBER),
    ring,
  ];
}

export function buildingFromModels(type: BuildingType): THREE.Group | null {
  const spec = BUILDING_MODELS[type];
  if (!hasModels(spec.parts.map((p) => p.model))) return null;
  const center = BUILDINGS[type].size / 2;
  const g = new THREE.Group();
  const root = new THREE.Group();
  root.position.set(center, 0, center);
  g.add(root);
  root.add(foundation(BUILDINGS[type].size, spec.trim));
  for (const detail of spec.details) root.add(makeDetail(detail));
  if (type === 'hq') {
    const growth = headquartersGrowth();
    root.add(...growth);
    g.userData.growth = growth;
  }
  const spinning: THREE.Object3D[] = [];
  const smoke: THREE.Vector3[] = [];
  for (const part of spec.parts) {
    const piece = placeModel(part.model, part.fit);
    if (!piece) return null;
    piece.position.set(part.x ?? 0, (part.y ?? 0) + 0.07, part.z ?? 0);
    piece.rotation.y = ((part.turn ?? 0) * Math.PI) / 2;
    if (part.spin) spinning.push(piece);
    root.add(piece);
  }
  for (const accent of spec.accents) {
    const made = makeAccent(accent);
    if (accent.shape === 'gem') spinning.push(made);
    if (accent.smoke) {
      smoke.push(
        new THREE.Vector3(center + (accent.x ?? 0), accent.y + 0.1, center + (accent.z ?? 0)),
      );
    }
    root.add(made);
  }
  root.add(groundGlow(spec.accents[0].color, BUILDINGS[type].size * 2.6));
  g.userData.spinning = spinning;
  g.userData.smoke = smoke;
  return g;
}

/** Puts a static model in a character's hand or on its head; they follow the animation. */
function attach(
  character: THREE.Object3D,
  bone: string,
  item: THREE.Object3D | null,
  offset: [number, number, number],
): void {
  if (!item) return;
  item.position.set(...offset);
  character.getObjectByName(bone)?.add(item);
}

function hardHat(): THREE.Object3D {
  const hat = new THREE.Group();
  const shell = new THREE.Mesh(capGeometry, new THREE.MeshLambertMaterial({ color: 0xf0c24b }));
  shell.scale.set(0.2, 0.15, 0.2);
  const lamp = new THREE.Mesh(ballGeometry, glow(AMBER));
  lamp.scale.setScalar(0.045);
  lamp.position.set(0, 0.07, 0.19);
  hat.add(shell, lamp);
  return hat;
}

/**
 * Built along +Z, grip down. The character's arm runs along -X from the shoulder and its fist ends
 * 0.28 out; the guard's pose then swings it 60° forward, which the turn cancels so the gun aims ahead.
 */
function pistol(): THREE.Object3D {
  const tool = new THREE.Group();
  tool.add(
    makeDetail({ shape: 'box', color: 0x9aa3ad, y: 0.03, z: 0.15, w: 0.07, h: 0.08, d: 0.32 }),
    makeDetail({ shape: 'box', color: 0x2c3036, y: -0.1, z: 0.03, w: 0.06, h: 0.16, d: 0.08 }),
    makeDetail({
      shape: 'box',
      color: 0x7ffcff,
      glow: true,
      y: 0.03,
      z: 0.315,
      w: 0.05,
      h: 0.05,
      d: 0.02,
    }),
  );
  tool.rotation.y = -Math.PI / 3;
  return tool;
}

/** Large for the hand holding it, or it would be lost at game distance. */
function pickaxe(): THREE.Object3D {
  const tool = new THREE.Group();
  tool.add(
    makeDetail({ shape: 'cyl', color: 0x9a6a3f, y: 0, w: 0.05, h: 0.56, d: 0.05 }),
    makeDetail({ shape: 'box', color: 0xc9d0d8, y: 0.27, w: 0.42, h: 0.07, d: 0.07 }),
    makeDetail({ shape: 'cyl', color: 0xc9d0d8, x: 0.21, y: 0.26, w: 0.045, h: 0.12, d: 0.045 }),
    makeDetail({ shape: 'cyl', color: 0xc9d0d8, x: -0.21, y: 0.26, w: 0.045, h: 0.12, d: 0.045 }),
  );
  // Held out in front of the fist: pointing back up the arm, the head would vanish inside the body.
  tool.rotation.x = 1.35;
  return tool;
}

/** Held in one hand, working end down. */
function jackhammer(): THREE.Object3D {
  const tool = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: 0x8f98a3,
    metalness: 0.5,
    roughness: 0.45,
  });
  const paint = new THREE.MeshLambertMaterial({ color: 0xd8562a });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.3, 10), paint);
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.2, 3, 8), steel);
  handle.rotation.z = Math.PI / 2;
  handle.position.y = 0.17;
  const bit = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 8), steel);
  bit.rotation.x = Math.PI;
  bit.position.y = -0.27;
  tool.add(body, handle, bit);
  // Scaled to the crew's small hands, and tilted towards the rock in front.
  tool.scale.setScalar(0.55);
  tool.rotation.x = 0.6;
  return tool;
}

function laserDrill(): THREE.Object3D {
  const tool = new THREE.Group();
  const rifle = placeModel('rifle', 0.34);
  if (rifle) tool.add(rifle);
  const lens = new THREE.Mesh(ballGeometry, glow(0x7ffcff));
  lens.scale.setScalar(0.05);
  lens.position.set(0, 0.05, 0.2);
  tool.add(lens);
  return tool;
}

/** The ray and its point of impact, hidden until the unit is cutting rock. Faces along +Z. */
function laserBeam(): THREE.Group {
  const beam = new THREE.Group();
  beam.position.set(0, 0.3, 0.2);
  const ray = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), glow(0x7ffcff));
  ray.rotation.x = Math.PI / 2;
  ray.name = 'ray';
  const impact = new THREE.Mesh(ballGeometry, glow(0xffe9a8));
  impact.name = 'impact';
  beam.add(ray, impact);
  beam.visible = false;
  return beam;
}

/** Rigged characters expose their animations on `userData.rig`. */
function characterGroup(
  id: ModelId,
  scale: number,
): { group: THREE.Group; body: THREE.Object3D } | null {
  const character = placeCharacter(id);
  if (!character) return null;
  const group = new THREE.Group();
  character.object.scale.setScalar(scale);
  group.add(character.object);
  group.userData.rig = character.rig;
  return { group, body: character.object };
}

let foreurCount = 0;

export function unitFromModels(type: UnitType, tool: DrillTool): THREE.Group | null {
  switch (type) {
    case 'foreur': {
      const made = characterGroup(foreurCount++ % 2 === 0 ? 'foreurA' : 'foreurB', 1);
      if (!made) return null;
      attach(made.body, 'head', hardHat(), [0, 0.3, 0]);
      if (tool === 'pick') {
        attach(made.body, 'arm-right', pickaxe(), [0, -0.27, 0.2]);
      } else if (tool === 'hammer') {
        attach(made.body, 'arm-right', jackhammer(), [0, -0.12, 0.14]);
      } else {
        attach(made.body, 'arm-right', laserDrill(), [0, -0.2, 0.12]);
        const beam = laserBeam();
        made.group.add(beam);
        made.group.userData.beam = beam;
      }
      made.group.userData.tool = tool;
      // The headlamp's light on the floor: the cave feels darker around it.
      made.group.add(groundGlow(AMBER, 2.4, 0.22));
      return made.group;
    }
    case 'garde': {
      const made = characterGroup('garde', 1);
      if (!made) return null;
      attach(made.body, 'arm-right', pistol(), [-0.27, 0, 0]);
      return made.group;
    }
    case 'heavy': {
      const g = new THREE.Group();
      const model = placeModel('miner', 0.95);
      if (!model) return null;
      g.add(model);
      return g;
    }
    case 'hauler': {
      const g = new THREE.Group();
      const model = placeModel('rover', 0.7);
      if (!model) return null;
      g.add(model);
      return g;
    }
  }
}

/**
 * The one building of its kind: a stepped plinth, a ring of columns around a rotunda, a gold dome and
 * a spire. Nothing the crew can build looks like it, so it stands out from anywhere in the city.
 */
function councilSeat(): THREE.Group {
  const seat = new THREE.Group();
  const stone = 0xd9d4c5;
  const gold = new THREE.MeshStandardMaterial({
    color: 0xd4a73a,
    metalness: 0.75,
    roughness: 0.32,
  });
  seat.add(
    makeDetail({ shape: 'cyl', color: 0x8d8778, y: 0.06, w: 3.4, h: 0.12, d: 3.4 }),
    makeDetail({ shape: 'cyl', color: 0xaaa494, y: 0.18, w: 3, h: 0.12, d: 3 }),
    makeDetail({ shape: 'cyl', color: stone, y: 0.3, w: 2.6, h: 0.12, d: 2.6 }),
    makeDetail({ shape: 'cyl', color: TEAL, glow: true, y: 0.37, w: 2.66, h: 0.02, d: 2.66 }),
    makeDetail({ shape: 'cyl', color: 0xc9c3b2, y: 0.85, w: 1.5, h: 0.95, d: 1.5 }),
    makeDetail({ shape: 'cyl', color: 0xffd98a, glow: true, y: 0.85, w: 1.54, h: 0.14, d: 1.54 }),
    makeDetail({ shape: 'cyl', color: stone, y: 1.37, w: 2.34, h: 0.1, d: 2.34 }),
  );
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    seat.add(
      makeDetail({
        shape: 'cyl',
        color: stone,
        x: Math.cos(angle) * 1.08,
        y: 0.85,
        z: Math.sin(angle) * 1.08,
        w: 0.13,
        h: 0.95,
        d: 0.13,
      }),
    );
  }
  const dome = new THREE.Mesh(capGeometry, gold);
  dome.position.y = 1.42;
  dome.scale.set(0.85, 0.72, 0.85);
  dome.castShadow = true;
  const spire = new THREE.Mesh(cylinderGeometry, gold);
  spire.position.y = 2.32;
  spire.scale.set(0.05, 0.4, 0.05);
  seat.add(dome, spire);
  // The Charter's colours, on either side of the steps.
  for (const side of [-1, 1]) {
    seat.add(
      makeDetail({
        shape: 'cyl',
        color: 0x6f6a5e,
        x: side * 0.72,
        y: 0.75,
        z: 1.45,
        w: 0.05,
        h: 1.5,
        d: 0.05,
      }),
      makeDetail({
        shape: 'box',
        color: 0x1f8f7d,
        x: side * 0.72,
        y: 1.1,
        z: 1.47,
        w: 0.34,
        h: 0.62,
        d: 0.02,
      }),
    );
  }
  const gem = makeAccent({ color: TEAL, y: 2.68, size: 0.17, shape: 'gem' });
  seat.add(gem);
  seat.userData.beacon = gem;
  return seat;
}

/** The city the first mission digs towards: the council's seat, among what its people live in. */
export function settlementFromModels(): THREE.Group {
  const g = new THREE.Group();
  const parts: [ModelId, number, number, number][] = [
    ['hangarGlass', 1.3, -3.5, 0],
    ['hangarSmallB', 1.2, 3.5, 0.3],
    ['hangarRoundB', 1.4, 0.3, 3.7],
    ['hangarGlass', 1.1, -2.5, -2.7],
    ['structure', 0.9, 2.6, -2.6],
    ['barrels', 0.8, 2.5, 2.8],
    ['platformSmall', 1.1, -2.6, 2.8],
  ];
  for (const [model, fit, x, z] of parts) {
    const piece = placeModel(model, fit);
    if (!piece) continue;
    piece.position.set(x, 0, z);
    g.add(piece);
  }
  const seat = councilSeat();
  g.add(seat, groundGlow(TEAL, 10, 0.1));
  g.userData.beacon = seat.userData.beacon;
  return g;
}

/** Someone who lives in the city: no hard hat, no tool, and nobody gives them orders. */
export function residentFromModels(index: number): THREE.Group | null {
  const looks: ModelId[] = ['saboteur', 'saboteurB', 'foreurA', 'foreurB'];
  return characterGroup(looks[index % looks.length], 0.92)?.group ?? null;
}

/** Cloned once: darkens the sect's robes without touching the shared worker colours. */
function tintCharacter(object: THREE.Object3D, color: number): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = (child.material as THREE.MeshStandardMaterial).clone();
    material.color.setHex(color);
    child.material = material;
  });
}

/** Only human and machine enemies have models: the Fauna and the Heart stay procedural. */
export function enemyFromModels(type: EnemyType): THREE.Group | null {
  switch (type) {
    case 'saboteur': {
      const made = characterGroup(Math.random() < 0.5 ? 'saboteur' : 'saboteurB', 1);
      if (!made) return null;
      tintCharacter(made.body, 0x8a70b0);
      return made.group;
    }
    case 'drone': {
      const model = placeModel('speeder', 0.75);
      if (!model) return null;
      model.position.y = 0.45;
      const g = new THREE.Group();
      g.add(model);
      return g;
    }
    case 'outpost': {
      const g = new THREE.Group();
      const hangar = placeModel('hangarLargeB', 1.9);
      const turret = placeModel('turret', 0.8);
      if (!hangar || !turret) return null;
      turret.position.y = 0.6;
      g.add(hangar, turret, makeAccent({ color: 0xff3030, y: 1.3, size: 0.14, shape: 'gem' }));
      return g;
    }
    default:
      return null;
  }
}

export function pickupFromModels(res: ResourceId): THREE.Object3D | null {
  if (res !== 'stone' && res !== 'ore') return null;
  return placeModel('stone', 0.24);
}
