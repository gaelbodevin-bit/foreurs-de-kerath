import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings';
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

interface BuildingModel {
  parts: Part[];
  accents: Accent[];
}

const BUILDING_MODELS: Record<BuildingType, BuildingModel> = {
  hq: {
    parts: [
      { model: 'hangarRoundA', fit: 2 },
      { model: 'dish', fit: 0.5, x: 0.7, z: -0.7, spin: true },
    ],
    accents: [{ color: TEAL, y: 1.2, size: 0.2, shape: 'gem' }],
  },
  depot: {
    parts: [{ model: 'hangarSmallB', fit: 0.95 }],
    accents: [{ color: AMBER, y: 0.55, size: 0.05 }],
  },
  generator: {
    parts: [{ model: 'generator', fit: 1.75 }],
    accents: [{ color: TEAL, y: 1.2, size: 0.17, shape: 'gem' }],
  },
  oxygen: {
    parts: [{ model: 'barrelLarge', fit: 0.85 }],
    accents: [{ color: 0x9fe6ff, y: 0.8, size: 0.13 }],
  },
  habitat: {
    parts: [{ model: 'hangarGlass', fit: 0.98 }],
    accents: [{ color: AMBER, y: 0.55, size: 0.07 }],
  },
  melter: {
    parts: [{ model: 'barrelMachine', fit: 0.75 }],
    accents: [{ color: 0x4ea8f0, y: 0.6, size: 0.11 }],
  },
  farm: {
    parts: [{ model: 'platformLarge', fit: 1.9 }],
    accents: [
      { color: 0x9ccc5a, x: -0.5, z: -0.5, y: 0.26, size: 0.27, shape: 'cap' },
      { color: 0x9ccc5a, x: 0.5, z: -0.5, y: 0.3, size: 0.3, shape: 'cap' },
      { color: 0x9ccc5a, x: -0.5, z: 0.5, y: 0.3, size: 0.3, shape: 'cap' },
      { color: 0x9ccc5a, x: 0.5, z: 0.5, y: 0.26, size: 0.27, shape: 'cap' },
    ],
  },
  refinery: {
    parts: [
      { model: 'hangarLargeA', fit: 1.9 },
      { model: 'chimney', fit: 0.28, x: 0.65, z: -0.65 },
    ],
    accents: [{ color: 0xff8c3a, x: 0.65, z: -0.65, y: 1.5, size: 0.08, smoke: true }],
  },
  foundry: {
    parts: [
      { model: 'hangarLargeB', fit: 1.9 },
      { model: 'chimney', fit: 0.3, x: 0.65, z: -0.65 },
      { model: 'chimney', fit: 0.3, x: -0.65, z: -0.65 },
    ],
    accents: [
      { color: 0xff7d54, x: 0.65, z: -0.65, y: 1.6, size: 0.1, smoke: true },
      { color: 0xff7d54, x: -0.65, z: -0.65, y: 1.6, size: 0.1, smoke: true },
    ],
  },
  market: {
    parts: [
      { model: 'platformLarge', fit: 1.9 },
      { model: 'barrels', fit: 0.8, x: -0.4, z: -0.4, y: 0.08 },
      { model: 'computer', fit: 0.7, x: 0.4, z: 0.45, y: 0.08 },
    ],
    accents: [{ color: 0xffc23d, x: 0.4, z: -0.4, y: 0.45, size: 0.17, shape: 'gem' }],
  },
  plaza: {
    parts: [{ model: 'platformSmall', fit: 0.92 }],
    accents: [{ color: 0x7fd8ff, y: 0.42, size: 0.12 }],
  },
  clinic: {
    parts: [{ model: 'hangarRoundB', fit: 1.95 }],
    accents: [{ color: RED, y: 1.1, size: 0.5, shape: 'cross' }],
  },
  lab: {
    parts: [
      { model: 'hangarGlass', fit: 1.95 },
      { model: 'dish', fit: 0.6, x: 0.65, z: 0.65, spin: true },
    ],
    accents: [{ color: 0xb79cff, y: 1.05, size: 0.16 }],
  },
  security: {
    parts: [{ model: 'structure', fit: 0.9 }],
    accents: [{ color: RED, y: 1, size: 0.1 }],
  },
  barracks: {
    parts: [{ model: 'hangarSmallA', fit: 1.9 }],
    accents: [{ color: RED, y: 1.05, size: 0.09 }],
  },
  workshop: {
    parts: [
      { model: 'hangarLargeA', fit: 1.9, turn: 1 },
      { model: 'wireless', fit: 0.5, x: -0.7, z: 0.7 },
    ],
    accents: [{ color: AMBER, y: 0.8, size: 0.08 }],
  },
  turret: {
    parts: [{ model: 'turret', fit: 0.85 }],
    accents: [{ color: RED, y: 0.5, size: 0.05 }],
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

export function buildingFromModels(type: BuildingType): THREE.Group | null {
  const spec = BUILDING_MODELS[type];
  if (!hasModels(spec.parts.map((p) => p.model))) return null;
  const center = BUILDINGS[type].size / 2;
  const g = new THREE.Group();
  const root = new THREE.Group();
  root.position.set(center, 0, center);
  g.add(root);
  const spinning: THREE.Object3D[] = [];
  const smoke: THREE.Vector3[] = [];
  for (const part of spec.parts) {
    const piece = placeModel(part.model, part.fit);
    if (!piece) return null;
    piece.position.set(part.x ?? 0, part.y ?? 0, part.z ?? 0);
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

export function unitFromModels(type: UnitType): THREE.Group | null {
  switch (type) {
    case 'foreur': {
      const made = characterGroup(foreurCount++ % 2 === 0 ? 'foreurA' : 'foreurB', 1);
      if (!made) return null;
      attach(made.body, 'head', hardHat(), [0, 0.3, 0]);
      attach(made.body, 'arm-right', placeModel('pickaxe', 0.22), [0, -0.2, 0.08]);
      // The headlamp's light on the floor: the cave feels darker around it.
      made.group.add(groundGlow(AMBER, 2.4, 0.22));
      return made.group;
    }
    case 'garde': {
      const made = characterGroup('garde', 1);
      if (!made) return null;
      attach(made.body, 'arm-right', placeModel('rifle', 0.34), [0, -0.2, 0.12]);
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
