import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODEL_FILES, TEXTURE_FILES, type ModelId, type TextureId } from './assetManifest';

interface LoadedModel {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  box: THREE.Box3;
}

const models = new Map<ModelId, LoadedModel>();
const textures = new Map<TextureId, THREE.Texture>();

const url = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;

/** The packs author their colours as metal, which renders black without an environment map. */
function matteMaterials(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      if (material instanceof THREE.MeshStandardMaterial) {
        // The scene's soft reflections can only show on the parts named as metal.
        const metal = /metal/i.test(material.name);
        material.metalness = metal ? 0.45 : 0;
        material.roughness = metal ? 0.5 : Math.max(material.roughness, 0.75);
      }
    }
  });
}

/**
 * Loads everything once at startup. A file that fails to load is only reported: the renderer
 * falls back to its procedural shapes, so a missing asset can never block the game.
 */
export async function loadAssets(onProgress: (ratio: number) => void): Promise<void> {
  const gltf = new GLTFLoader();
  const image = new THREE.TextureLoader();
  const total = Object.keys(MODEL_FILES).length + Object.keys(TEXTURE_FILES).length;
  let done = 0;
  const tick = () => onProgress(++done / total);

  const modelJobs = (Object.entries(MODEL_FILES) as [ModelId, string][]).map(async ([id, path]) => {
    try {
      const loaded = await gltf.loadAsync(url(path));
      matteMaterials(loaded.scene);
      models.set(id, {
        scene: loaded.scene,
        clips: loaded.animations,
        box: new THREE.Box3().setFromObject(loaded.scene),
      });
    } catch (error) {
      console.warn(`Modèle introuvable : ${path}`, error);
    }
    tick();
  });

  const textureJobs = (Object.entries(TEXTURE_FILES) as [TextureId, string][]).map(
    async ([id, path]) => {
      try {
        const texture = await image.loadAsync(url(path));
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 8;
        // Normal maps hold directions, not colours.
        if (id.endsWith('Color')) texture.colorSpace = THREE.SRGBColorSpace;
        textures.set(id, texture);
      } catch (error) {
        console.warn(`Texture introuvable : ${path}`, error);
      }
      tick();
    },
  );

  await Promise.all([...modelJobs, ...textureJobs]);
}

export const getTexture = (id: TextureId): THREE.Texture | null => textures.get(id) ?? null;

export const hasModels = (ids: readonly ModelId[]): boolean => ids.every((id) => models.has(id));

/** A copy of a static model, standing on the ground, centred and scaled to a footprint width. */
export function placeModel(id: ModelId, width: number): THREE.Group | null {
  const model = models.get(id);
  if (!model) return null;
  const size = model.box.getSize(new THREE.Vector3());
  const center = model.box.getCenter(new THREE.Vector3());
  const scale = width / Math.max(size.x, size.z);
  const copy = model.scene.clone(true);
  copy.scale.setScalar(scale);
  copy.position.set(-center.x * scale, -model.box.min.y * scale, -center.z * scale);
  const holder = new THREE.Group();
  holder.add(copy);
  return holder;
}

/** Plays a character's animation clips, cross-fading between them. */
export class CharacterRig {
  private readonly mixer: THREE.AnimationMixer;
  private current: string | null = null;
  private action: THREE.AnimationAction | null = null;

  constructor(
    root: THREE.Object3D,
    private readonly clips: THREE.AnimationClip[],
  ) {
    this.mixer = new THREE.AnimationMixer(root);
  }

  play(name: string): void {
    if (name === this.current) return;
    const clip = this.clips.find((c) => c.name === name);
    if (!clip) return;
    const next = this.mixer.clipAction(clip).reset().play();
    if (this.action) next.crossFadeFrom(this.action, 0.15, false);
    this.action = next;
    this.current = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}

/** A character with its own skeleton, ready to animate. */
export function placeCharacter(id: ModelId): { object: THREE.Object3D; rig: CharacterRig } | null {
  const model = models.get(id);
  if (!model) return null;
  const object = cloneSkinned(model.scene);
  return { object, rig: new CharacterRig(object, model.clips) };
}
