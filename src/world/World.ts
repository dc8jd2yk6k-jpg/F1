import * as THREE from 'three';
import season from '../data/season.json';
import { hitsIn } from '../engine/AudioFeatures';
import { Car, makeShadowTexture } from './Car';
import { Environment } from './Environment';
import { Gantry } from './Gantry';
import { CAR_CODES, type CarCode, gapOf, laneOf } from './RaceSim';
import { Sparks, type SparkEmitter } from './Sparks';
import { Track } from './Track';
import { Trail } from './Trails';

// The shared 3D world used by every race act: track + environment, the six
// cars, their light trails and sparks. Two clocks drive it:
//   tc  — choreography time (song seconds): who is where in the running order
//   tau — sim time (seconds of racing): where on the lap the pack is
// Acts map song time to these however the shot needs (real time, slow motion,
// frozen), which is what makes bullet-time and per-phrase locations possible.

export interface CarState {
  code: CarCode;
  s: number;
  lane: number;
  pos: THREE.Vector3;
  forward: THREE.Vector3;
  left: THREE.Vector3;
  yaw: number;
  speed: number;
  roll: number;
}

const DRIVERS = [season.leader, ...season.contenders, ...season.others];
export const NUMBER: Record<CarCode, number> = Object.fromEntries(DRIVERS.map((d) => [d.code, d.number])) as Record<CarCode, number>;
const TEAM: Record<CarCode, string> = Object.fromEntries(DRIVERS.map((d) => [d.code, d.team])) as Record<CarCode, string>;

export function teamColor(code: CarCode): THREE.Color {
  if (code === 'ANT') return new THREE.Color(season.goldColor);
  return new THREE.Color((season.teams as Record<string, { color: string }>)[TEAM[code]].color);
}

export class World {
  readonly scene = new THREE.Scene();
  readonly track = new Track();
  readonly env: Environment;
  readonly cars = {} as Record<CarCode, Car>;
  readonly trails = {} as Record<CarCode, Trail[]>;
  readonly sparks = new Sparks();
  readonly gantry: Gantry;
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly colors = {} as Record<CarCode, THREE.Color>;
  /** Where the pace point is at sim time tau. Acts may swap this (e.g. a standing start). */
  pace: (tau: number) => number = (tau) => this.track.distanceAtTime(tau);
  /** Optional extra lateral offset per car (e.g. staggered grid slots). */
  laneBias: ((code: CarCode, tau: number) => number) | null = null;
  private readonly pts: THREE.Vector3[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    this.env = new Environment(this.track);
    this.scene.add(this.env.group);
    this.scene.environment = this.buildEnvMap(renderer);
    this.scene.environmentIntensity = 0.9;
    this.scene.fog = new THREE.FogExp2('#04060c', 0.0011);

    this.hemi = new THREE.HemisphereLight('#2a3550', '#060606', 0.35);
    this.key = new THREE.DirectionalLight('#dfe8ff', 1.0);
    this.key.position.set(-300, 400, 200);
    this.rim = new THREE.DirectionalLight('#ffd2a8', 2.4);
    this.rim.position.set(0, 50, -300);
    this.scene.add(this.hemi, this.key, this.rim, this.key.target, this.rim.target);

    const shadowTex = makeShadowTexture();
    for (const code of CAR_CODES) {
      const car = new Car(code, NUMBER[code], shadowTex);
      this.cars[code] = car;
      this.scene.add(car.root);
      this.colors[code] = teamColor(code);
      this.trails[code] = [new Trail(700), new Trail(700), new Trail(700)];
      for (const tr of this.trails[code]) this.scene.add(tr.mesh);
    }
    this.scene.add(this.sparks.mesh);
    this.gantry = new Gantry(this.track, 6);
    this.scene.add(this.gantry.group);
    for (let i = 0; i < 700; i++) this.pts.push(new THREE.Vector3());
  }

  private buildEnvMap(renderer: THREE.WebGLRenderer) {
    // A tiny night "studio": dark dome, a ring of floodlight panels, warm city
    // glow on the horizon and a cool LED band — enough for believable paint
    // and asphalt reflections without any real-time lights.
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: '#04050a', side: THREE.BackSide })));
    const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13, 12) });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.5), panel);
      m.position.set(Math.cos(a) * 30, 18 + (i % 3) * 4, Math.sin(a) * 30);
      m.lookAt(0, 0, 0);
      s.add(m);
    }
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(45, 45, 4, 48, 1, true), new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.9, 0.45, 0.2), side: THREE.BackSide,
    }));
    glow.position.y = 1;
    s.add(glow);
    const led = new THREE.Mesh(new THREE.CylinderGeometry(44, 44, 1, 48, 1, true), new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.25, 0.6, 1.6), side: THREE.BackSide,
    }));
    led.position.y = 6;
    s.add(led);
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(s, 0.02).texture;
    pm.dispose();
    return tex;
  }

  /** Full kinematic state of a car. */
  state(code: CarCode, tc: number, tau: number, out?: CarState): CarState {
    const track = this.track;
    const st = out ?? {
      code, s: 0, lane: 0, pos: new THREE.Vector3(), forward: new THREE.Vector3(), left: new THREE.Vector3(), yaw: 0, speed: 0, roll: 0,
    };
    st.code = code;
    st.s = this.pace(tau) - gapOf(code, tc);
    st.lane = laneOf(code, tc) + (this.laneBias ? this.laneBias(code, tau) : 0);
    track.offsetPoint(st.s, st.lane, 0, st.pos);
    track.tangentAt(st.s, st.forward);
    track.leftAt(st.s, st.left);
    st.speed = Math.max(0, (this.pace(tau + 0.02) - this.pace(tau - 0.02)) / 0.04);
    const h = 0.05;
    const bias = (x: number) => (this.laneBias ? this.laneBias(code, x) : 0);
    const dl = (laneOf(code, tc + h) - laneOf(code, tc - h) + bias(tau + h) - bias(tau - h)) / (2 * h);
    st.yaw = Math.atan2(dl, Math.max(10, st.speed));
    const k = track.curvatureAt(st.s);
    st.roll = THREE.MathUtils.clamp(-k * st.speed * st.speed * 0.0016, -0.05, 0.05);
    return st;
  }

  /** World position of a car-local point (e.g. a rear light) at a given moment. */
  localToWorld(st: CarState, local: THREE.Vector3, out: THREE.Vector3) {
    const yaw = Math.atan2(st.forward.x, st.forward.z) + st.yaw;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.set(st.pos.x + local.x * c + local.z * s, st.pos.y + local.y, st.pos.z - local.x * s + local.z * c);
    return out;
  }

  /** Place every car. `aero` / `lights` may vary per car. */
  pose(tc: number, tau: number, opts: { aero?: (c: CarCode) => number; lights?: (c: CarCode) => number; visible?: (c: CarCode) => boolean } = {}) {
    for (const code of CAR_CODES) {
      const car = this.cars[code];
      const visible = opts.visible ? opts.visible(code) : true;
      car.root.visible = visible;
      if (!visible) continue;
      const st = this.state(code, tc, tau, _st);
      car.pose(st.pos, st.forward, {
        yaw: st.yaw,
        roll: st.roll,
        wheelAngle: (st.s / 0.36) % (Math.PI * 2),
        steer: THREE.MathUtils.clamp(this.track.curvatureAt(st.s + 4) * 6 + st.yaw * 2, -0.35, 0.35),
        aero: opts.aero ? opts.aero(code) : this.autoAero(st),
        lights: opts.lights ? opts.lights(code) : 1,
      });
    }
  }

  /** Straight-mode aero on straights, corner mode elsewhere (2026 active aero). */
  autoAero(st: CarState) {
    const k = Math.max(Math.abs(this.track.curvatureAt(st.s)), Math.abs(this.track.curvatureAt(st.s + 60)));
    return THREE.MathUtils.clamp(1 - (k - 0.002) / 0.004, 0, 1);
  }

  /**
   * Light trails behind each car, sampled from the past.
   * `rate` = d(tc)/d(tau): 1 when choreography runs in real time, 0 when frozen.
   */
  updateTrails(tc: number, tau: number, cam: THREE.Vector3, o: {
    seconds: number; points?: number; width?: number; intensity?: number; rate?: number; fade?: number;
    only?: (c: CarCode) => boolean; rainOnly?: boolean;
    /** Per-car brightness multiplier. */
    gain?: (c: CarCode) => number;
    /** Warp sampled points (i = 0 newest … n-1 oldest), e.g. to lift trails into the sky. */
    warp?: (p: THREE.Vector3, i: number, n: number, c: CarCode) => void;
  }) {
    const n = Math.min(o.points ?? 90, 700);
    const rate = o.rate ?? 1;
    const lp = Car.LIGHT_POINTS;
    for (const code of CAR_CODES) {
      const [tRain, tL, tR] = this.trails[code];
      if (o.only && !o.only(code)) {
        tRain.hide();
        tL.hide();
        tR.hide();
        continue;
      }
      const color = this.colors[code];
      const sets: [Trail, THREE.Vector3, number][] = o.rainOnly
        ? [[tRain, lp.rain, 1]]
        : [[tRain, lp.rain, 1], [tL, lp.left, 0.7], [tR, lp.right, 0.7]];
      if (o.rainOnly) {
        tL.hide();
        tR.hide();
      }
      for (const [trail, local, k] of sets) {
        const pts = this.pts;
        for (let i = 0; i < n; i++) {
          const dt = 0.03 + (o.seconds * i) / (n - 1);
          const st = this.state(code, tc - dt * rate, tau - dt, _st);
          this.localToWorld(st, local, pts[i]);
          if (o.warp) o.warp(pts[i], i, n, code);
        }
        const g = o.gain ? o.gain(code) : 1;
        trail.set(pts.slice(0, n), cam, color, (o.width ?? 0.09) * (local === lp.rain ? 1.2 : 1), (o.intensity ?? 4) * k * g, o.fade ?? 1.4);
      }
    }
  }

  hideTrails() {
    for (const code of CAR_CODES) for (const tr of this.trails[code]) tr.hide();
  }

  /** Sparks from the plank on detected kicks, in a shot where tau = t + offset. */
  updateSparks(t: number, offset: number, cars: CarCode[], intensity = 1, minStrength = 0.25) {
    const emitters: SparkEmitter[] = [];
    for (const [ht, strength] of hitsIn('kicks', t - Sparks.life, t + 1e-6, minStrength)) {
      for (const code of cars) {
        const st = this.state(code, ht, ht + offset, _st);
        const pos = this.localToWorld(st, _floor, new THREE.Vector3());
        const vel = st.forward.clone().multiplyScalar(st.speed);
        emitters.push({ t: ht + offset, strength: Math.min(1, strength * 1.2), pos, vel, seed: Math.round(ht * 1000) + code.charCodeAt(0) * 7 });
      }
    }
    this.sparks.update(t + offset, emitters, intensity);
  }

  hideSparks() {
    this.sparks.mesh.visible = false;
  }
}

const _st: CarState = {
  code: 'ANT', s: 0, lane: 0, pos: new THREE.Vector3(), forward: new THREE.Vector3(), left: new THREE.Vector3(), yaw: 0, speed: 0, roll: 0,
};
const _floor = new THREE.Vector3(0, 0.03, -0.6);
