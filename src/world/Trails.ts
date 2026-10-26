import * as THREE from 'three';

// Camera-facing light ribbons. Points are supplied newest-first by the caller
// (sampled from the race sim at past times), so a trail is a pure function of
// time like everything else.

export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly geo: THREE.BufferGeometry;

  constructor(readonly maxPoints: number) {
    this.pos = new Float32Array(maxPoints * 2 * 3);
    this.col = new Float32Array(maxPoints * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const o = i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.mesh.frustumCulled = false;
  }

  /**
   * @param pts newest first
   * @param intensity HDR multiplier
   * @param fade exponent of the brightness falloff along the trail
   */
  set(pts: THREE.Vector3[], camPos: THREE.Vector3, color: THREE.Color, width: number, intensity: number, fade = 1.6, headBoost = 1.0) {
    const n = Math.min(pts.length, this.maxPoints);
    if (n < 2 || intensity <= 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const dir = _a;
    const toCam = _b;
    const side = _c;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[Math.min(n - 1, i + 1)];
      const r = pts[Math.max(0, i - 1)];
      dir.subVectors(r, q);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      dir.normalize();
      toCam.subVectors(camPos, p).normalize();
      side.crossVectors(dir, toCam);
      if (side.lengthSq() < 1e-8) side.set(0, 1, 0);
      side.normalize();
      const age = i / (n - 1);
      const k = Math.pow(1 - age, fade) * intensity * (1 + headBoost * Math.exp(-age * 30));
      const w = width * (0.35 + 0.65 * (1 - age));
      const o = i * 6;
      this.pos[o] = p.x + side.x * w;
      this.pos[o + 1] = p.y + side.y * w;
      this.pos[o + 2] = p.z + side.z * w;
      this.pos[o + 3] = p.x - side.x * w;
      this.pos[o + 4] = p.y - side.y * w;
      this.pos[o + 5] = p.z - side.z * w;
      this.col[o] = this.col[o + 3] = color.r * k;
      this.col[o + 1] = this.col[o + 4] = color.g * k;
      this.col[o + 2] = this.col[o + 5] = color.b * k;
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  hide() {
    this.mesh.visible = false;
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
