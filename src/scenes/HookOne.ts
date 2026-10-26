import * as THREE from 'three';
import season from '../data/season.json';
import { feat, hitEnvelope } from '../engine/AudioFeatures';
import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutCubic, easeOutExpo, lerp, smoothstep, window01 } from '../engine/math';
import { barTime } from '../engine/Timeline';
import { drawLap, drawOverride, drawP2Banner, drawStrap, drawTower, p2Changes } from '../overlay/Hud';
import { type CarCode, CAR_CODES, project, projectedP2At, slotOf, timingOrderAt } from '../world/RaceSim';
import type { World } from '../world/World';
import { gradeNight, type Landmarks, landmarks, launchPace, lightNight, offsetFor } from './common';
import { CHARGE_SLOW, FREEZE_TC, chargeTau } from './Charge';
import { chase, lens, orbit, shake, tcam, trackside } from './rigs';

// Bars 20–36. Hook 1: "Lights out". Four 4-bar phrases, each a different
// place and lap of the imagined decider: the start, an onboard pass on the
// pit straight, the hotel section, and the back-straight duel.

const LAPS = { start: 1, b: 19, c: 33, d: 41 };

export class HookOne implements Act {
  readonly name = 'hook1' as const;
  private world!: World;
  private L!: Landmarks;
  private readonly cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 9000);
  private readonly st = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  setup(e: Engine) {
    this.world = e.world;
    this.L = landmarks(e.world.track, e.world.env.hotelS);
  }

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    const w = this.world;
    const cam = this.cam;
    gradeNight(post);
    const kick = hitEnvelope('kicks', t, 0.1, 0.25);
    post.ca = 0.0007 + kick * 0.0022;
    post.bloom = 0.95;
    post.streak = 0.45;
    post.exposure = 1 + 0.1 * kick;
    w.laneBias = null;
    lightNight(w);
    w.env.skyMat.uniforms.twilight.value = 0.3 * (1 - smoothstep(22, 24, bar));
    w.env.skyMat.uniforms.time.value = t;
    this.canopy(t, bar >= 28 && bar < 32 ? 1 : 0, kick);

    let lap = LAPS.start;
    let offset = 0;
    let tc = t;
    let shakeAmt = kick * 1.6;
    let fov = 40;
    let trails = { seconds: 0.5, points: 60, intensity: 3.2, width: 0.07 };
    let sparkCars: CarCode[] = [];

    if (bar < 24) {
      // A: standing start. Pace runs from the grid with a launch curve.
      const lightsOut = barTime(20);
      const gridS = w.track.length - 18;
      w.pace = launchPace(gridS);
      w.laneBias = (code, tau) => {
        const slot = Math.round(slotOf(code, barTime(20)));
        return (slot % 2 === 0 ? 2.6 : -2.6) * Math.exp(-Math.max(0, tau) / 1.6);
      };
      offset = -lightsOut - 0.12;
      const tau = t + offset;
      if (bar < 21.5) {
        // Low, long lens, in front of the grid: the field launches at us.
        fov = 30;
        w.track.offsetPoint(gridS + 24, 3.0, 0.42, cam.position);
        const pole = w.state('ANT', t, tau);
        this.tmp.copy(pole.pos).add(new THREE.Vector3(0, 0.6, 0));
        w.track.offsetPoint(gridS - 14, -0.5, 0.5, this.st);
        cam.lookAt(this.st.lerp(this.tmp, smoothstep(0.4, 2.2, tau) * 0.6));
        trails = { seconds: 0.35, points: 40, intensity: 3.5, width: 0.07 };
        shakeAmt = kick * 1.2 + smoothstep(0, 1.2, tau) * (1 - smoothstep(2.4, 3.4, tau)) * 2.5;
      } else if (bar < 22.75) {
        // Chase from behind the tail of the pack.
        fov = 34;
        const tail = w.state('NOR', t, tau);
        chase(cam, w, tail, 14, 2.4, 0, 60, 0.4);
        post.radial = 0.012;
        post.radialCenter = [0.5, 0.52];
        trails = { seconds: 0.6, points: 70, intensity: 3.4, width: 0.08 };
      } else {
        // Trackside pass-by on the main straight, sparks off the planks.
        fov = 30;
        const ref = barTime(23.45);
        const passS = w.state('VER', ref, ref + offset).s;
        const lead = w.state('VER', t, tau);
        trackside(cam, w, passS, -10.5, 0.9, lead.pos.clone().setY(0.6));
        sparkCars = ['ANT', 'RUS', 'HAM', 'VER', 'LEC'];
        trails = { seconds: 0.4, points: 50, intensity: 3.6, width: 0.08 };
      }
    } else {
      w.pace = (tau) => w.track.distanceAtTime(tau);
      if (bar < 28) {
        // B: lap 19. HAM's T-cam as he takes RUS on the pit straight.
        lap = LAPS.b;
        offset = offsetFor(w.track, 40, barTime(24));
        const tau = t + offset;
        if (bar < 26) {
          fov = 50;
          tcam(cam, w, w.state('HAM', t, tau));
          shakeAmt = 0.7 + kick * 0.9;
          trails = { seconds: 0.35, points: 40, intensity: 2.6, width: 0.06 };
        } else if (bar < 27) {
          fov = 32;
          const ref = barTime(26.6);
          const passS = w.state('HAM', ref, ref + offset).s + 6;
          const ham = w.state('HAM', t, tau);
          trackside(cam, w, passS, 11, 1.1, ham.pos.clone().setY(0.5));
          sparkCars = ['HAM', 'RUS'];
        } else {
          fov = 38;
          chase(cam, w, w.state('HAM', t, tau), 7.5, 1.6, 0.3, 30, 0.5);
          trails = { seconds: 0.5, points: 60, intensity: 3.2, width: 0.07 };
        }
      } else if (bar < 32) {
        // C: lap 33. The hotel section under the lit gridshell.
        lap = LAPS.c;
        offset = offsetFor(w.track, w.track.wrap(this.L.hotel - 120), barTime(28));
        const tau = t + offset;
        const mid = w.state('HAM', t, tau);
        if (bar < 30) {
          fov = 52;
          chase(cam, w, mid, 26, 9.5, -4, 40, -2);
          trails = { seconds: 1.0, points: 110, intensity: 3.6, width: 0.1 };
          shakeAmt = kick * 0.6;
        } else {
          // Wide: the whole hotel glowing, the pack threading under it.
          fov = 40;
          const c = w.env.canopyCenter;
          const along = w.track.tangentAt(w.env.hotelS);
          cam.position.copy(c).addScaledVector(along, 330).add(new THREE.Vector3(180, 26, 130));
          cam.lookAt(this.tmp.copy(c).setY(14).addScaledVector(along, -10));
          trails = { seconds: 2.4, points: 220, intensity: 3.0, width: 0.3 };
          shakeAmt = 0;
        }
      } else {
        // D: lap 41. Back straight: RUS takes P2 back, wings flat, override.
        lap = LAPS.d;
        offset = offsetFor(w.track, this.L.backStraight + 40, barTime(32));
        const tau = t + offset;
        const rus = w.state('RUS', t, tau);
        const ham = w.state('HAM', t, tau);
        if (bar < 34) {
          fov = 36;
          const s = (rus.s + ham.s) / 2 + 1.5;
          w.track.offsetPoint(s, -9.5, 0.8, cam.position);
          this.tmp.copy(rus.pos).lerp(ham.pos, 0.5).setY(0.55);
          cam.lookAt(this.tmp);
          trails = { seconds: 0.3, points: 40, intensity: 2.0, width: 0.05 };
          shakeAmt = 0.4 + kick * 0.8;
        } else if (bar < 35) {
          fov = 26;
          const s = Math.max(rus.s, ham.s) + 17;
          w.track.offsetPoint(s, 0.8, 0.5, cam.position);
          cam.lookAt(this.tmp.copy(rus.pos).lerp(ham.pos, 0.5).setY(0.5));
          trails = { seconds: 0.8, points: 90, intensity: 3.6, width: 0.08 };
        } else if (bar < 36) {
          fov = 34;
          const ref = barTime(35.75);
          const passS = w.state('RUS', ref, ref + offset).s + 8;
          trackside(cam, w, passS, 17, 3.2, rus.pos.clone().setY(0.3));
          sparkCars = CAR_CODES.filter((c) => c !== 'NOR');
          trails = { seconds: 1.2, points: 120, intensity: 3.8, width: 0.1 };
        } else {
          // Time decelerates into bullet time; the camera pushes into the
          // exact orbit Charge opens with, so the slow motion is one move.
          const t36 = barTime(36);
          const t37 = barTime(37);
          const D = t37 - t36;
          const u = clamp((t - t36) / D);
          const tau37 = chargeTau(w, t37);
          const warped = tau37 - ((t37 - t) - ((1 - CHARGE_SLOW) * D * (1 - u * u * u)) / 3);
          offset = warped - t;
          tc = Math.min(t, FREEZE_TC);
          const r2 = w.state('RUS', tc, warped);
          const h2 = w.state('HAM', tc, warped);
          this.tmp.copy(r2.pos).lerp(h2.pos, 0.5);
          const heading = Math.atan2(r2.forward.z, r2.forward.x);
          const e = easeInOutCubic(u);
          orbit(cam, this.tmp, lerp(22, 9, e), heading + Math.PI * lerp(1.0, 1.15, e), lerp(3.2, 1.1, e), 0.45);
          fov = lerp(42, 36, e);
          trails = { seconds: lerp(0.6, 0.35, e), points: 60, intensity: 3.0, width: 0.07 };
          shakeAmt = (1 - e) * kick;
        }
      }
    }

    const tau = t + offset;
    lens(cam, fov, f.aspect);
    shake(cam, t, shakeAmt);
    w.pose(tc, tau, {
      aero: bar >= 32 && bar < 34.5 ? (c) => (c === 'RUS' || c === 'HAM' ? 1 : w.autoAero(w.state(c, t, tau))) : undefined,
      lights: (c) => (c === 'RUS' && bar >= 32.25 && bar < 34 ? 0.5 + 0.5 * Math.sign(Math.sin(t * 20)) : 1),
    });
    w.updateTrails(tc, tau, cam.position, { ...trails, rate: tc === t ? 1 : 0 });
    if (sparkCars.length) w.updateSparks(t, offset, sparkCars, 1.2);
    else w.hideSparks();
    f.draw(w.scene, cam);

    // Typography and HUD.
    const lo = barTime(20);
    const flash = Math.exp(-(t - lo) / 0.18);
    post.flash = flash * 0.55;
    const la = window01(t, lo, barTime(21.25), 0.02, 0.3);
    if (la > 0) {
      const s = lerp(1.18, 1, easeOutExpo((t - lo) / 0.5));
      ui.text('LIGHTS OUT', 960, 330, { font: 'display', size: 170 * s, weight: 900, align: 'center', tracking: 0.04, alpha: la, glow: 'rgba(255,40,40,0.6)', glowBlur: 30 });
    }
    drawTower(ui, t, { appear: smoothstep(barTime(21), barTime(21.6), t) });
    drawP2Banner(ui, t, p2Changes(barTime(20), barTime(60), projectedP2At).filter((c) => c.t < barTime(37)));
    drawLap(ui, lap, season.remaining[season.remaining.length - 1].laps ?? 58, smoothstep(barTime(21.2), barTime(21.8), t));

    if (bar >= 24 && bar < 28) {
      const p = project(timingOrderAt(t));
      const ham = p.find((x) => x.code === 'HAM')!;
      const sub = p[0].code === 'HAM' ? `PROJECTED P2 · ${ham.total} PTS` : 'CHASING RUSSELL · 1 PT APART';
      drawStrap(ui, 'HAM', 64, 900, window01(bar, 24.2, 27.8, 0.4, 0.3), sub);
    }
    if (bar >= 32 && bar < 36) {
      drawOverride(ui, 'RUS', window01(bar, 32.2, 34.2, 0.15, 0.3) * (0.75 + 0.25 * Math.sign(Math.sin(t * 14))));
      drawStrap(ui, 'RUS', 64, 900, window01(bar, 33.8, 35.9, 0.4, 0.3), `BACK IN PROJECTED P2 · ${project(timingOrderAt(t))[0].total} PTS`);
    }
    // Slow the world down into bar 37 (Charge): let the image breathe.
    post.exposure *= 1 - 0.2 * smoothstep(36, 37, bar);
  }

  private canopy(t: number, mode: number, kick: number) {
    const u = this.world.env.canopyMat.uniforms;
    u.time.value = t;
    u.mode.value = mode;
    u.kick.value = kick * 0.6;
    u.level.value = clamp(feat('mid', t) * 1.2);
    u.intensity.value = 2.2;
    const cols = season.contenders.map((c) => this.world.colors[c.code as CarCode]);
    u.c0.value.copy(cols[0]);
    u.c1.value.copy(cols[1]);
    u.c2.value.copy(cols[2]);
    u.c3.value.copy(cols[3]);
  }
}
