import * as THREE from 'three';

// A stylised Yas Marina: main straight, T1, esses, hairpin, the long back
// straight, the west hairpin, a second straight, then the twisty hotel
// section under the W Hotel's LED gridshell, and back onto the pit straight.
// Not survey-accurate — evocative, and shaped for the shots we need.
// Units: metres. The track lies in the XZ plane, running anticlockwise.

const CONTROL: [number, number][] = [
  [0, 0], [250, 2], [520, 0], [640, -8],
  [700, -60], [690, -130], [630, -175],
  [575, -230], [585, -300], [650, -350],
  [720, -400], [735, -470], [690, -515], [620, -500],
  [400, -482], [100, -472], [-250, -462], [-560, -452],
  [-660, -430], [-690, -370], [-650, -322],
  [-470, -305], [-260, -290],
  [-160, -268], [-118, -215],
  [-132, -165], [-205, -148], [-268, -128], [-300, -84],
  [-276, -44], [-215, -30], [-130, -22], [-60, -6],
];

export const TRACK_WIDTH = 15;

export interface TrackFrame {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  /** Points to the left of the direction of travel (horizontal). */
  left: THREE.Vector3;
  curvature: number;
}

export class Track {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  /** Uniform arc-length samples. */
  readonly samples: number;
  readonly pts: THREE.Vector3[] = [];
  readonly tangents: THREE.Vector3[] = [];
  readonly lefts: THREE.Vector3[] = [];
  readonly curv: Float32Array;
  /** Racing speed profile (m/s) and cumulative lap time (s) at each sample. */
  readonly speed: Float32Array;
  readonly time: Float32Array;
  readonly lapTime: number;
  readonly ds: number;

  constructor() {
    this.curve = new THREE.CatmullRomCurve3(CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    this.length = this.curve.getLength();
    this.samples = Math.ceil(this.length / 2);
    this.ds = this.length / this.samples;
    for (let i = 0; i < this.samples; i++) {
      const u = i / this.samples;
      this.pts.push(this.curve.getPointAt(u));
      const t = this.curve.getTangentAt(u).setY(0).normalize();
      this.tangents.push(t);
      this.lefts.push(new THREE.Vector3(t.z, 0, -t.x));
    }
    // Curvature from heading change, lightly smoothed.
    const raw = new Float32Array(this.samples);
    for (let i = 0; i < this.samples; i++) {
      const a = this.tangents[(i - 3 + this.samples) % this.samples];
      const b = this.tangents[(i + 3) % this.samples];
      const ang = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
      raw[i] = ang / (6 * this.ds);
    }
    this.curv = new Float32Array(this.samples);
    for (let i = 0; i < this.samples; i++) {
      let s = 0;
      for (let k = -4; k <= 4; k++) s += raw[(i + k + this.samples) % this.samples];
      this.curv[i] = s / 9;
    }
    // Speed: lateral-grip limit, then acceleration/braking passes (two laps to wrap).
    const VMAX = 92;
    const ALAT = 42;
    const ACC = 11;
    const BRK = 40;
    const v = new Float32Array(this.samples);
    for (let i = 0; i < this.samples; i++) v[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(1e-4, Math.abs(this.curv[i]))));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i <= this.samples; i++) {
        const a = v[(i - 1) % this.samples];
        const j = i % this.samples;
        v[j] = Math.min(v[j], Math.sqrt(a * a + 2 * ACC * this.ds));
      }
      for (let i = this.samples - 1; i >= -1; i--) {
        const j = (i + this.samples) % this.samples;
        const n = v[(j + 1) % this.samples];
        v[j] = Math.min(v[j], Math.sqrt(n * n + 2 * BRK * this.ds));
      }
    }
    this.speed = v;
    this.time = new Float32Array(this.samples + 1);
    for (let i = 0; i < this.samples; i++) this.time[i + 1] = this.time[i] + this.ds / v[i];
    this.lapTime = this.time[this.samples];
  }

  wrap(s: number) {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  private idx(s: number): [number, number, number] {
    const x = this.wrap(s) / this.ds;
    const i = Math.floor(x);
    return [i % this.samples, (i + 1) % this.samples, x - i];
  }

  pointAt(s: number, out = new THREE.Vector3()) {
    const [i, j, f] = this.idx(s);
    return out.copy(this.pts[i]).lerp(this.pts[j], f);
  }

  tangentAt(s: number, out = new THREE.Vector3()) {
    const [i, j, f] = this.idx(s);
    return out.copy(this.tangents[i]).lerp(this.tangents[j], f).normalize();
  }

  leftAt(s: number, out = new THREE.Vector3()) {
    const [i, j, f] = this.idx(s);
    return out.copy(this.lefts[i]).lerp(this.lefts[j], f).normalize();
  }

  curvatureAt(s: number) {
    const [i, j, f] = this.idx(s);
    return this.curv[i] * (1 - f) + this.curv[j] * f;
  }

  speedAt(s: number) {
    const [i, j, f] = this.idx(s);
    return this.speed[i] * (1 - f) + this.speed[j] * f;
  }

  /** Position offset sideways (+ = left of travel) and lifted. */
  offsetPoint(s: number, lateral: number, up = 0, out = new THREE.Vector3()) {
    this.pointAt(s, out);
    const l = this.leftAt(s, _v);
    return out.addScaledVector(l, lateral).setY(out.y + up);
  }

  /** Distance travelled after `t` seconds at racing speed from the start line (multi-lap). */
  distanceAtTime(t: number): number {
    const laps = Math.floor(t / this.lapTime);
    const r = t - laps * this.lapTime;
    let lo = 0;
    let hi = this.samples;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.time[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const t0 = this.time[i - 1];
    const t1 = this.time[i];
    const f = t1 > t0 ? (r - t0) / (t1 - t0) : 0;
    return laps * this.length + (i - 1 + f) * this.ds;
  }

  /** Racing time to reach distance s from the start line (single lap). */
  timeAtDistance(s: number): number {
    const x = this.wrap(s) / this.ds;
    const i = Math.floor(x);
    const f = x - i;
    return this.time[i] * (1 - f) + this.time[Math.min(i + 1, this.samples)] * f;
  }

  /** Find the arc-length of the sample nearest to a world point (for authoring shots). */
  nearestS(p: THREE.Vector3): number {
    let best = Infinity;
    let bi = 0;
    for (let i = 0; i < this.samples; i++) {
      const d = this.pts[i].distanceToSquared(p);
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    return bi * this.ds;
  }
}

const _v = new THREE.Vector3();
