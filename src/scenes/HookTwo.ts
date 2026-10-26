import * as THREE from 'three';
import season from '../data/season.json';
import { feat, hitEnvelope } from '../engine/AudioFeatures';
import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutCubic, easeOutExpo, lerp, smoothstep, window01 } from '../engine/math';
import { barTime } from '../engine/Timeline';
import { drawLap, drawOverride, drawP2Banner, drawStrap, drawTower, p2Changes } from '../overlay/Hud';
import { type CarCode, CAR_CODES, project, projectedP2At, timingOrderAt } from '../world/RaceSim';
import type { World } from '../world/World';
import { chargeTau } from './Charge';
import { gradeNight, type Landmarks, landmarks, lightNight, offsetFor } from './common';
import { chase, lens, shake, tcam, trackside } from './rigs';

// Bars 40–60. Hook 2, the peak: Verstappen's charge from the hairpin to the
// lead, four onboards at once, the Mercedes/Ferrari duels (1 point apart),
// Leclerc to the front, and a four-abreast run to the line that freezes
// before anyone crosses it. Projected P2 changes hands at every turn.

const FINAL_LAPS = 58;
const ONBOARDS: CarCode[] = ['RUS', 'HAM', 'VER', 'LEC'];
const FREEZE = barTime(59.55);

export class HookTwo implements Act {
  readonly name = 'hook2' as const;
  private world!: World;
  private L!: Landmarks;
  private readonly cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 9000);
  private readonly quad = ONBOARDS.map(() => new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 9000));
  private readonly v = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private changes: { t: number; code: CarCode }[] = [];

  setup(e: Engine) {
    this.world = e.world;
    this.L = landmarks(e.world.track, e.world.env.hotelS);
    this.changes = p2Changes(barTime(20), barTime(60), projectedP2At);
  }

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    const w = this.world;
    const cam = this.cam;
    gradeNight(post);
    lightNight(w);
    w.env.skyMat.uniforms.time.value = t;
    w.laneBias = null;
    w.pace = (tau) => w.track.distanceAtTime(tau);
    const kick = hitEnvelope('kicks', t, 0.1, 0.25);
    post.ca = 0.0008 + kick * 0.0025;
    post.bloom = 0.8;
    post.streak = 0.5;
    post.exposure = 1 + 0.1 * kick;
    this.canopy(t, bar, kick);

    // Frozen photo-finish: both clocks stop at FREEZE.
    const frozen = t >= FREEZE;
    const tc = frozen ? FREEZE : t;

    let offset = 0;
    let lap = 47;
    let fov = 40;
    let shakeAmt = kick * 1.8;
    let trails = { seconds: 0.5, points: 60, intensity: 3.2, width: 0.07 };
    let sparks: CarCode[] = [];
    let split = false;

    if (bar < 44) {
      // Release from the bullet-time hairpin; VER picks off LEC then HAM.
      offset = chargeTau(w, barTime(40)) - barTime(40);
      const tau = t + offset;
      if (bar < 40.5) {
        fov = 30;
        const ref = barTime(40.3);
        const s = w.state('VER', ref, ref + offset).s + 14;
        trackside(cam, w, s, -12, 1.0, w.state('VER', t, tau).pos.clone().setY(0.5));
        sparks = CAR_CODES.filter((c) => c !== 'NOR');
        post.radial = 0.05 * (1 - smoothstep(40, 40.4, bar));
        post.flash = 0.25 * Math.exp(-(t - barTime(40)) / 0.12);
      } else if (bar < 42) {
        fov = 50;
        tcam(cam, w, w.state('VER', t, tau));
        shakeAmt = 0.8 + kick;
        trails = { seconds: 0.3, points: 40, intensity: 2.6, width: 0.06 };
      } else {
        fov = 34;
        chase(cam, w, w.state('VER', t, tau), 9, 1.4, -1.2, 30, 0.5);
        post.radial = 0.01;
        sparks = ['VER', 'HAM'];
      }
    } else if (bar < 48) {
      lap = 50;
      offset = offsetFor(w.track, w.track.wrap(this.L.backStraight + 20), barTime(44));
      const tau = t + offset;
      if (bar < 46) {
        split = true;
      } else {
        // High, long-lens tracking: VER leads the train.
        fov = 22;
        const ver = w.state('VER', t, tau);
        cam.position.copy(ver.pos).addScaledVector(ver.left, -48).addScaledVector(ver.forward, 30).setY(22);
        cam.lookAt(this.v.copy(ver.pos).addScaledVector(ver.forward, -14));
        trails = { seconds: 1.2, points: 120, intensity: 3.8, width: 0.12 };
        shakeAmt = 0.2;
      }
    } else if (bar < 52) {
      // RUS v HAM — one point apart.
      lap = 53;
      offset = offsetFor(w.track, 60, barTime(48));
      const tau = t + offset;
      const rus = w.state('RUS', t, tau);
      const ham = w.state('HAM', t, tau);
      this.v.copy(rus.pos).lerp(ham.pos, 0.5);
      if (bar < 50) {
        // Tracking alongside, low, from the outside of the pair.
        fov = 34;
        w.track.offsetPoint((rus.s + ham.s) / 2 + 2.5, 10, 0.75, cam.position);
        cam.lookAt(this.v.clone().setY(0.5));
        trails = { seconds: 0.3, points: 40, intensity: 2.0, width: 0.05 };
        shakeAmt = 0.4 + kick * 0.8;
      } else {
        // High drone over the pair, looking down the road ahead of them.
        fov = 36;
        cam.position.copy(this.v).addScaledVector(rus.forward, -16).setY(15);
        cam.lookAt(this.tmp.copy(this.v).addScaledVector(rus.forward, 10));
        trails = { seconds: 1.0, points: 100, intensity: 3.0, width: 0.1 };
        shakeAmt = 0.15;
      }
    } else if (bar < 55) {
      // Ferrari v Ferrari under the hotel.
      lap = 55;
      offset = offsetFor(w.track, w.track.wrap(this.L.hotel - 170), barTime(52));
      const tau = t + offset;
      const lec = w.state('LEC', t, tau);
      if (bar < 54) {
        fov = 46;
        chase(cam, w, lec, 13, 4.5, 2.5, 30, -0.5);
        trails = { seconds: 0.9, points: 100, intensity: 3.6, width: 0.09 };
      } else {
        fov = 30;
        const ref = barTime(54.5);
        const s = w.state('LEC', ref, ref + offset).s + 4;
        trackside(cam, w, s, 9.5, 0.9, lec.pos.clone().setY(0.5));
        sparks = ['LEC', 'HAM', 'RUS'];
      }
    } else if (bar < 57) {
      // LEC to the front.
      lap = 57;
      offset = offsetFor(w.track, w.track.wrap(this.L.esses - 140), barTime(55));
      const tau = t + offset;
      if (bar < 56) {
        fov = 50;
        tcam(cam, w, w.state('LEC', t, tau));
        shakeAmt = 0.9 + kick;
        trails = { seconds: 0.3, points: 40, intensity: 2.6, width: 0.06 };
      } else {
        fov = 26;
        const lec = w.state('LEC', t, tau);
        w.track.offsetPoint(lec.s + 22, -1.5, 0.6, cam.position);
        cam.lookAt(lec.pos.clone().setY(0.6));
        trails = { seconds: 0.8, points: 90, intensity: 3.6, width: 0.08 };
      }
    } else {
      // Four abreast to the line — and the frame stops before anyone crosses it.
      lap = FINAL_LAPS;
      offset = offsetFor(w.track, 2.4, FREEZE);
      const tauNow = tc + offset;
      const lead = w.state('LEC', tc, tauNow);
      const e = smoothstep(57, 59.5, bar);
      if (!frozen) {
        fov = lerp(26, 56, e);
        w.track.offsetPoint(lead.s + lerp(26, 8, easeInOutCubic(e)), -1.8, lerp(0.9, 0.45, e), cam.position);
        cam.lookAt(this.v.copy(lead.pos).setY(0.6).addScaledVector(lead.left, -1.8));
        trails = { seconds: 0.7, points: 80, intensity: 3.6, width: 0.08 };
        sparks = ['RUS', 'HAM', 'VER', 'LEC'];
      } else {
        // Frozen: the camera alone keeps drifting round the line.
        const d = t - FREEZE;
        const mid = this.v.copy(lead.pos).addScaledVector(lead.left, -5.4);
        const sw = 0.55 + d * 0.06;
        cam.position.copy(mid).addScaledVector(lead.forward, 17 * Math.cos(sw)).addScaledVector(lead.left, -17 * Math.sin(sw)).setY(1.4 + d * 0.3);
        cam.lookAt(mid.setY(0.4));
        fov = 40;
        trails = { seconds: 0.7, points: 80, intensity: 3.6, width: 0.08 };
        shakeAmt = 0;
      }
    }

    const tau = tc + offset;
    if (!split) {
      lens(cam, fov, f.aspect);
      shake(cam, t, frozen ? 0 : shakeAmt);
    }
    w.pose(tc, tau, {
      aero: bar >= 44 && bar < 46.5 ? () => 1 : undefined,
      lights: (c) => (overrideOn(c, bar) ? 0.5 + 0.5 * Math.sign(Math.sin(t * 20)) : 1),
    });
    if (sparks.length) w.updateSparks(frozen ? FREEZE : t, offset, sparks, 1.2);
    else w.hideSparks();

    if (split) {
      const W2 = f.width / 2;
      const H2 = f.height / 2;
      ONBOARDS.forEach((code, i) => {
        const c = this.quad[i];
        lens(c, 50, W2 / H2);
        tcam(c, w, w.state(code, tc, tau));
        shake(c, t + i * 3.1, 0.7 + kick);
        w.updateTrails(tc, tau, c.position, { seconds: 0.3, points: 40, intensity: 2.6, width: 0.06 });
        const col = i % 2;
        const row = i < 2 ? 1 : 0;
        f.draw(w.scene, c, [col * W2, row * H2, W2, H2]);
      });
    } else {
      w.updateTrails(tc, tau, cam.position, { ...trails, rate: frozen ? 0 : 1 });
      f.draw(w.scene, cam);
    }

    // ---- Graphics ----
    if (split) this.splitFrame(ui, bar);
    const mystery = smoothstep(59.6, 59.9, bar);
    const hud = split ? 0 : 1;
    drawTower(ui, tc, { appear: hud * (1 - smoothstep(60.85, 61, bar)), mystery });
    drawLap(ui, lap, FINAL_LAPS, hud * (1 - smoothstep(59.5, 59.8, bar)));
    if (bar >= 56 && bar < 59.5) {
      ui.text('FINAL LAP', 1920 - 64, 220, { font: 'title', size: 22, weight: 900, tracking: 0.3, align: 'right', color: '#ffffff', alpha: 0.6 + 0.4 * Math.sign(Math.sin(t * 6)) });
    }
    drawP2Banner(ui, t, this.changes.filter((c) => c.t >= barTime(40)));
    if (bar >= 40.5 && bar < 44) {
      const p = project(timingOrderAt(t)).find((x) => x.code === 'VER')!;
      drawStrap(ui, 'VER', 64, 900, window01(bar, 40.6, 43.9, 0.4, 0.3), `P${timingOrderAt(t).indexOf('VER') + 1} ON THE ROAD · ${p.total} PTS PROJECTED`);
    }
    drawOverride(ui, 'VER', window01(bar, 44.2, 46, 0.1, 0.2) * (0.75 + 0.25 * Math.sign(Math.sin(t * 14))), 960, 980);
    if (bar >= 48 && bar < 52) {
      const a = window01(bar, 48.2, 51.8, 0.2, 0.3);
      ui.text('RUSSELL · HAMILTON', 960, 900, { font: 'title', size: 34, weight: 900, tracking: 0.18, align: 'center', alpha: a });
      ui.text('ONE POINT APART BEFORE TONIGHT', 960, 944, { font: 'mono', size: 18, weight: 700, tracking: 0.24, align: 'center', color: '#c8ced8', alpha: a });
    }
    if (bar >= 52 && bar < 55) {
      drawStrap(ui, 'LEC', 64, 900, window01(bar, 52.2, 54.9, 0.3, 0.2), `NINE BEHIND · NOTHING TO LOSE`);
    }
    if (bar >= 56 && bar < 57) {
      drawStrap(ui, 'LEC', 64, 900, window01(bar, 56.05, 56.95, 0.15, 0.15), `LEADS · ${project(timingOrderAt(t))[0].total} PTS PROJECTED`);
    }
    if (bar >= 59.55) {
      const a = smoothstep(59.6, 59.75, bar);
      const s = lerp(1.1, 1, easeOutExpo((bar - 59.6) / 0.4));
      ui.text('TOO CLOSE TO CALL', 960, 330, { font: 'display', size: 150 * s, weight: 900, align: 'center', tracking: 0.03, alpha: a, glow: 'rgba(255,255,255,0.35)', glowBlur: 22 });
    }

    // Grade: freeze desaturates and slowly whites out toward the breakdown.
    if (frozen) {
      post.saturation = lerp(1.05, 0.25, smoothstep(59.55, 60.2, bar));
      post.exposure = 1 + 0.2 * smoothstep(60.4, 61, bar);
      post.flash = smoothstep(60.55, 61, bar);
      post.ca = 0.004;
      post.grain = 0.05;
    }
  }

  private splitFrame(ui: FrameCtx['ui'], bar: number) {
    const a = smoothstep(44, 44.08, bar) * (1 - smoothstep(45.92, 46, bar));
    ui.rect(958, 0, 4, 1080, '#05070a', a);
    ui.rect(0, 538, 1920, 4, '#05070a', a);
    ONBOARDS.forEach((code, i) => {
      const x = (i % 2) * 960 + 28;
      const y = (i < 2 ? 0 : 540) + 54;
      const col = `#${this.world.colors[code].getHexString()}`;
      ui.rect(x - 4, y - 30, 6, 40, col, a);
      ui.text(code, x + 14, y, { font: 'title', size: 30, weight: 900, tracking: 0.1, alpha: a });
      ui.text(`P${timingOrderAt(barTime(bar)).indexOf(code) + 1}`, x + 100, y, { font: 'mono', size: 22, weight: 700, color: '#c8ced8', alpha: a });
    });
  }

  private canopy(t: number, bar: number, kick: number) {
    const u = this.world.env.canopyMat.uniforms;
    u.time.value = t;
    u.mode.value = bar >= 52 && bar < 55 ? 1 : 0.3;
    u.kick.value = kick * 0.7;
    u.level.value = clamp(feat('mid', t) * 1.3);
    u.intensity.value = 2.4;
    const red = this.world.colors.LEC;
    const cols = bar >= 52 && bar < 55 ? [red, red.clone().multiplyScalar(0.4), red, red.clone().multiplyScalar(0.4)]
      : season.contenders.map((c) => this.world.colors[c.code as CarCode]);
    u.c0.value.copy(cols[0]);
    u.c1.value.copy(cols[1]);
    u.c2.value.copy(cols[2]);
    u.c3.value.copy(cols[3]);
  }
}

function overrideOn(code: CarCode, bar: number) {
  return (code === 'VER' && bar >= 44.2 && bar < 46) || (code === 'LEC' && bar >= 55 && bar < 56.8) || (code === 'HAM' && bar >= 48.5 && bar < 50);
}
