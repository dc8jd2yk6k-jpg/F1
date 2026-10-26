import * as THREE from 'three';
import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutCubic, easeInOutSine, lerp, smoothstep, window01 } from '../engine/math';
import { hitEnvelope } from '../engine/AudioFeatures';
import { barTime } from '../engine/Timeline';
import { driverSlam } from '../overlay/Cards';
import type { CarCode } from '../world/RaceSim';
import type { World } from '../world/World';
import { gradeTwilight, lightDusk } from './common';
import { GRID_TC, gridS, parkOnGrid } from './gridShared';
import { lens } from './rigs';

// Bars 16–19. The hi-hats arrive; dusk at Yas Marina. One contender per bar,
// in standings order, each slammed on the downbeat with points and gap to P2.
// The back half of bar 19 replays the five lights, fast — the race is next.

const ORDER: CarCode[] = ['RUS', 'HAM', 'VER', 'LEC'];

interface Move {
  from: THREE.Vector3;
  to: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const MOVES: Record<CarCode, Move> = {
  RUS: { from: V(2.4, 0.34, 4.6), to: V(1.5, 0.3, 3.7), look: V(0, 0.45, 0.6), fov: 34 },
  HAM: { from: V(-2.1, 0.75, -4.9), to: V(-1.3, 0.62, -4.1), look: V(0, 0.6, -1.0), fov: 34 },
  VER: { from: V(3.9, 0.5, 2.0), to: V(3.9, 0.5, -1.4), look: V(0, 0.45, 0.3), fov: 38 },
  LEC: { from: V(2.8, 2.9, 3.6), to: V(2.0, 2.3, 2.6), look: V(0, 0.4, -0.4), fov: 36 },
  ANT: { from: V(0, 1, 4), to: V(0, 1, 4), look: V(0, 0, 0), fov: 40 },
  NOR: { from: V(0, 1, 4), to: V(0, 1, 4), look: V(0, 0, 0), fov: 40 },
};

export class Grid implements Act {
  readonly name = 'grid' as const;
  private world!: World;
  private readonly cam = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 9000);
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  setup(e: Engine) {
    this.world = e.world;
  }

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    const w = this.world;
    gradeTwilight(post);
    lightDusk(w, 1 - 0.4 * clamp((bar - 16) / 4));
    w.env.skyMat.uniforms.time.value = t;
    post.bloom = 0.8;
    post.streak = 0.4;
    post.letterbox = 1 - easeInOutCubic(clamp((bar - 19.5) / 0.5));
    const hat = hitEnvelope('snares', t, 0.08, 0.3);
    post.ca = 0.0015 + hat * 0.002;
    this.canopy(t);

    parkOnGrid(w);
    const i = Math.min(3, Math.floor(bar - 16));
    const k = bar - 16 - i;
    const code = ORDER[i];
    const crane = bar >= 19.5;

    // Lights: five on in the back half of bar 19 (one per 16th-ish step).
    const levels = [0, 1, 2, 3, 4].map((n) => (t >= barTime(19.5 + n * 0.08) ? 1 : 0));
    w.gantry.set(levels, 1.3);
    w.gantry.group.visible = true;

    if (!crane) {
      const st = w.state(code, GRID_TC, 0);
      const m = MOVES[code];
      const e = easeInOutSine(clamp(k));
      w.localToWorld(st, this.a.copy(m.from).lerp(m.to, e), this.cam.position);
      this.cam.lookAt(w.localToWorld(st, m.look, this.b));
      lens(this.cam, m.fov, f.aspect);
    } else {
      // Crane up behind the grid toward the gantry.
      const e = easeInOutCubic(clamp((bar - 19.5) / 0.5));
      w.track.offsetPoint(gridS(w) - 62, 0, lerp(2.2, 7.5, e), this.cam.position);
      this.cam.lookAt(this.b.copy(w.gantry.group.position).setY(lerp(3.4, 6.0, e)));
      lens(this.cam, lerp(30, 24, e), f.aspect);
    }
    w.pose(GRID_TC, 0, {
      aero: () => 0,
      lights: (c) => (c === code && !crane ? 0.6 + 0.4 * Math.sign(Math.sin(t * 9)) : 0.35),
    });
    w.hideTrails();
    w.hideSparks();
    f.draw(w.scene, this.cam);
    w.gantry.group.visible = false;

    if (!crane) driverSlam(ui, code, k);
    ui.text('THE FIGHT FOR P2', 120, 84, {
      font: 'mono', size: 18, weight: 700, tracking: 0.36, color: '#9aa3b2', alpha: window01(bar, 16, 19.45, 0.1, 0.1),
    });
    ui.text(`${i + 1} / 4`, 1800, 84, {
      font: 'mono', size: 18, weight: 700, tracking: 0.2, align: 'right', color: '#9aa3b2', alpha: window01(bar, 16, 19.45, 0.1, 0.1),
    });
    post.exposure = (1 + 0.06 * hat) * (1 + 0.15 * smoothstep(19.85, 20, bar));
  }

  private canopy(t: number) {
    const u = this.world.env.canopyMat.uniforms;
    u.time.value = t;
    u.mode.value = 0;
    u.kick.value = hitEnvelope('snares', t, 0.06, 0.3) * 0.6;
    u.level.value = 0.7;
    u.intensity.value = 1.6;
  }
}
