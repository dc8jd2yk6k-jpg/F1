import * as THREE from 'three';
import { hash, hashS } from '../engine/rng';

// Titanium skid-block sparks. Each spark's position is solved analytically
// from its emission time (drag + gravity), so no particle state is carried
// between frames. Drawn as short velocity-aligned streaks.

export interface SparkEmitter {
  /** Emission time (s, sim clock) and strength 0..1. */
  t: number;
  strength: number;
  /** Floor position and car velocity at emission. */
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  seed: number;
}

const DRAG = 2.6;
const G = -9.81;
const PER_EMITTER = 40;
const LIFE = 0.75;

export class Sparks {
  readonly mesh: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly geo: THREE.BufferGeometry;

  constructor(private readonly capacity = 6000) {
    this.pos = new Float32Array(capacity * 2 * 3);
    this.col = new Float32Array(capacity * 2 * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.mesh.frustumCulled = false;
  }

  static get life() {
    return LIFE;
  }

  private at(e: SparkEmitter, v0: THREE.Vector3, dt: number, out: THREE.Vector3) {
    const k = (1 - Math.exp(-DRAG * dt)) / DRAG;
    out.copy(e.pos).addScaledVector(v0, k);
    out.y += 0.5 * G * dt * dt;
    if (out.y < 0.01) out.y = 0.01 + Math.abs(out.y) * 0.15; // skitter along the asphalt
    return out;
  }

  update(now: number, emitters: SparkEmitter[], intensity = 1) {
    let n = 0;
    const v0 = _v;
    const a = _a;
    const b = _b;
    for (const e of emitters) {
      const dt = now - e.t;
      if (dt < 0 || dt > LIFE) continue;
      const count = Math.round(PER_EMITTER * e.strength);
      for (let i = 0; i < count && n < this.capacity; i++) {
        const life = LIFE * (0.35 + 0.65 * hash(e.seed, i, 1));
        if (dt > life) continue;
        // Mostly backwards relative to the car, fanned sideways and up.
        v0.copy(e.vel).multiplyScalar(0.55 + 0.3 * hash(e.seed, i, 2));
        v0.x += hashS(e.seed, i, 3) * 9;
        v0.z += hashS(e.seed, i, 4) * 9;
        v0.y += 1.5 + hash(e.seed, i, 5) * 6;
        this.at(e, v0, dt, a);
        this.at(e, v0, Math.max(0, dt - 0.022), b);
        const age = dt / life;
        const heat = (1 - age) * (1 - age) * e.strength * intensity;
        const o = n * 6;
        this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], o);
        // White-hot head, orange tail.
        this.col.set([9 * heat, 6.5 * heat, 3.2 * heat, 5 * heat, 1.6 * heat, 0.25 * heat], o);
        n++;
      }
    }
    this.geo.setDrawRange(0, n * 2);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = n > 0;
  }
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
