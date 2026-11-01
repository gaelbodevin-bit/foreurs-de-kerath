import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { GameState } from '../sim/types';
import { computeLightMap } from './lightMap';

export const MAX_HEAD_LAMPS = 32;
/** What is left to see far from any light: enough to tell rock from floor. */
const CAVE_DARK = 0.13;
/** Seconds between two refreshes of the fixed lights. They hardly ever change. */
const REFRESH = 0.5;

export interface HeadLamp {
  x: number;
  y: number;
  radius: number;
}

const VERTEX = `varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const FRAGMENT = `uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform sampler2D tLight;
  uniform mat4 inverseViewProjection;
  uniform vec2 worldSize;
  uniform vec3 lamps[${MAX_HEAD_LAMPS}];
  uniform int lampCount;
  uniform float caveDark;
  varying vec2 vUv;
  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    float depth = texture2D(tDepth, vUv).r;
    vec4 world = inverseViewProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    world.xyz /= world.w;
    vec2 ground = world.xz;
    float fixedLight = texture2D(tLight, ground / worldSize).r;
    float headLight = 0.0;
    for (int i = 0; i < lampCount; i++) {
      float along = distance(ground, lamps[i].xy) / lamps[i].z;
      headLight = max(headLight, 1.0 - smoothstep(0.25, 1.0, along));
    }
    float light = max(fixedLight, headLight);
    float level = mix(caveDark, 1.0, light);
    // What outshines white stays visible from afar: lava, crystal, lamps, a colony's windows.
    vec3 glow = max(color - 1.0, 0.0);
    // Head lamps are warmer than the colony's lights.
    vec3 tint = mix(vec3(1.0), vec3(1.0, 0.93, 0.78), headLight * (1.0 - fixedLight));
    gl_FragColor = vec4(color * level * tint + glow * (1.0 - level), 1.0);
  }`;

/**
 * The cave is dark, except around what lights it. Applied to the finished picture, using its depth
 * to find which tile each pixel shows, so that it covers everything at once.
 *
 * Marks and rings are drawn in the same render, after the dark: the player still has to read them.
 */
export class DarknessPass extends Pass {
  /** What must stay readable in the dark. Its materials should not use the depth test. */
  readonly overlay = new THREE.Scene();
  private readonly levels: Float32Array;
  private readonly pixels: Uint8Array;
  private readonly lightTexture: THREE.DataTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly matrix = new THREE.Matrix4();
  private refreshIn = 0;

  constructor(
    private readonly state: GameState,
    private readonly camera: THREE.Camera,
  ) {
    super();
    this.levels = new Float32Array(state.w * state.h);
    this.pixels = new Uint8Array(state.w * state.h);
    this.lightTexture = new THREE.DataTexture(
      this.pixels,
      state.w,
      state.h,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.lightTexture.magFilter = THREE.LinearFilter;
    this.lightTexture.minFilter = THREE.LinearFilter;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tLight: { value: this.lightTexture },
        inverseViewProjection: { value: this.matrix },
        worldSize: { value: new THREE.Vector2(state.w, state.h) },
        lamps: { value: Array.from({ length: MAX_HEAD_LAMPS }, () => new THREE.Vector3()) },
        lampCount: { value: 0 },
        caveDark: { value: CAVE_DARK },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    quad.renderOrder = -1000;
    this.overlay.add(quad);
  }

  update(dt: number, lamps: readonly HeadLamp[]): void {
    this.refreshIn -= dt;
    if (this.refreshIn <= 0) {
      this.refreshIn = REFRESH;
      computeLightMap(this.state, this.levels);
      for (let i = 0; i < this.levels.length; i++) {
        this.pixels[i] = Math.round(this.levels[i] * 255);
      }
      this.lightTexture.needsUpdate = true;
    }
    const slots = this.material.uniforms.lamps.value as THREE.Vector3[];
    const count = Math.min(MAX_HEAD_LAMPS, lamps.length);
    for (let i = 0; i < count; i++) slots[i].set(lamps[i].x, lamps[i].y, lamps[i].radius);
    this.material.uniforms.lampCount.value = count;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.matrix.multiplyMatrices(this.camera.matrixWorld, this.projectionInverse());
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    renderer.render(this.overlay, this.camera);
  }

  private projectionInverse(): THREE.Matrix4 {
    return (this.camera as THREE.PerspectiveCamera).projectionMatrixInverse;
  }

  override dispose(): void {
    this.lightTexture.dispose();
    this.material.dispose();
  }
}
