import * as THREE from 'three';

let softDot: THREE.Texture | null = null;

/** A soft round spot, drawn once and shared by every glow and particle. */
export function softDotTexture(): THREE.Texture {
  if (softDot) return softDot;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  softDot = new THREE.CanvasTexture(canvas);
  return softDot;
}

const pools = new Map<number, THREE.MeshBasicMaterial>();
const poolGeometry = new THREE.PlaneGeometry(1, 1);

/** A pool of light on the ground: far cheaper than a real light, and unlimited in number. */
export function groundGlow(color: number, size: number, opacity = 0.3): THREE.Mesh {
  const key = color * 100 + Math.round(opacity * 99);
  let material = pools.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color,
      map: softDotTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    pools.set(key, material);
  }
  const mesh = new THREE.Mesh(poolGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.scale.set(size, size, 1);
  return mesh;
}

const SMOKE_COUNT = 240;

/** Smoke and dust clouds, recycled from a fixed pool so that they never allocate. */
export class Smoke {
  readonly object: THREE.Points;
  private readonly positions = new Float32Array(SMOKE_COUNT * 3);
  private readonly colors = new Float32Array(SMOKE_COUNT * 4);
  private readonly velocity = new Float32Array(SMOKE_COUNT * 3);
  private readonly life = new Float32Array(SMOKE_COUNT);
  private readonly max = new Float32Array(SMOKE_COUNT);
  private next = 0;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    this.object = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.8,
        map: softDotTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.object.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, shade: number, life: number, spread = 0.15): void {
    const i = this.next;
    this.next = (i + 1) % SMOKE_COUNT;
    this.positions.set([x, y, z], i * 3);
    this.colors.set([shade, shade, shade, 0], i * 4);
    this.velocity.set(
      [(Math.random() - 0.5) * spread, 0.25 + Math.random() * 0.25, (Math.random() - 0.5) * spread],
      i * 3,
    );
    this.life[i] = life;
    this.max[i] = life;
  }

  update(dt: number): void {
    for (let i = 0; i < SMOKE_COUNT; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const age = 1 - Math.max(0, this.life[i]) / this.max[i];
      for (let n = 0; n < 3; n++) this.positions[i * 3 + n] += this.velocity[i * 3 + n] * dt;
      // Quick to appear, slow to fade.
      this.colors[i * 4 + 3] = 0.34 * Math.min(1, age * 6) * (1 - age);
    }
    this.object.geometry.attributes.position.needsUpdate = true;
    this.object.geometry.attributes.color.needsUpdate = true;
  }
}

const DUST_COUNT = 130;
const DUST_BOX = 26;

/** Motes hanging in the lamplight around the camera's focus. */
export class Dust {
  readonly object: THREE.Points;
  private readonly seeds = new Float32Array(DUST_COUNT * 3);

  constructor() {
    const positions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT * 3; i++) this.seeds[i] = Math.random();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.object = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffdcb0,
        size: 0.07,
        map: softDotTexture(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.object.frustumCulled = false;
  }

  update(time: number, focus: THREE.Vector3): void {
    const positions = this.object.geometry.attributes.position as THREE.BufferAttribute;
    const wrap = (v: number) => (((v % DUST_BOX) + DUST_BOX) % DUST_BOX) - DUST_BOX / 2;
    for (let i = 0; i < DUST_COUNT; i++) {
      const a = this.seeds[i * 3];
      const b = this.seeds[i * 3 + 1];
      const c = this.seeds[i * 3 + 2];
      positions.setXYZ(
        i,
        focus.x + wrap(a * DUST_BOX + time * (0.08 + a * 0.1) - focus.x),
        0.3 + b * 3 + Math.sin(time * 0.4 + c * 9) * 0.25,
        focus.z + wrap(c * DUST_BOX + time * 0.06 - focus.z),
      );
    }
    positions.needsUpdate = true;
  }
}
