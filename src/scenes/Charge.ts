import * as THREE from 'three';
import season from '../data/season.json';
import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInExpo, easeOutExpo, lerp, smoothstep } from '../engine/math';
import { barTime } from '../engine/Timeline';
import { drawEnergy } from '../overlay/Hud';
import type { World } from '../world/World';
import { gradeNight, landmarks, lightNight, offsetFor } from './common';
import { lens, orbit } from './rigs';

// Bars 37–39. The track dips; time nearly stops. Bullet-time orbit around
// RUS and HAM at the west hairpin, sparks hanging in the air, while the
// stakes land one per bar: 5 races · 4 drivers · 9 points. The energy store
// charges; on the last beat time snaps back and Hook 2 releases it.

export const FREEZE_TC = barTime(36.6);
export const CHARGE_SLOW = 0.035;
const SLOW = CHARGE_SLOW;

/** Sim time during the charge (exported so Hook 2 can continue seamlessly). */
export function chargeTau(w: World, t: number) {
  const L = landmarks(w.track, w.env.hotelS);
  const tau0 = offsetFor(w.track, w.track.wrap(L.westHairpin + 6), FREEZE_TC) + FREEZE_TC;
  const t0 = barTime(37);
  const tRamp = barTime(39.7);
  if (t < tRamp) return tau0 + (t - t0) * SLOW;
  // Ease back up to real time over the last beats.
  const base = tau0 + (tRamp - t0) * SLOW;
  const d = t - tRamp;
  const ramp = barTime(40) - tRamp;
  return base + (d < ramp ? SLOW * d + (1 - SLOW) * (d * d) / (2 * ramp) : SLOW * ramp + (1 - SLOW) * ramp / 2 + (d - ramp));
}

export class Charge implements Act {
  readonly name = 'charge' as const;
  private world!: World;
  private readonly cam = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 9000);
  private readonly c = new THREE.Vector3();

  setup(e: Engine) {
    this.world = e.world;
  }

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    const w = this.world;
    gradeNight(post);
    lightNight(w);
    w.env.skyMat.uniforms.time.value = t;
    w.laneBias = null;
    w.pace = (tau) => w.track.distanceAtTime(tau);
    const tau = chargeTau(w, t);
    const k = clamp((bar - 37) / 3);
    const snap = smoothstep(39.7, 40, bar);

    const rus = w.state('RUS', FREEZE_TC, tau);
    const ham = w.state('HAM', FREEZE_TC, tau);
    this.c.copy(rus.pos).lerp(ham.pos, 0.5);
    const heading = Math.atan2(rus.forward.z, rus.forward.x);
    orbit(this.cam, this.c, lerp(9, 6.5, k), heading + Math.PI * 1.15 + k * Math.PI * 0.7, lerp(1.1, 2.4, k), 0.45);
    lens(this.cam, lerp(36, 30, k), f.aspect);

    w.pose(FREEZE_TC, tau, { aero: () => 0 });
    w.updateTrails(FREEZE_TC, tau, this.cam.position, { seconds: 0.35, points: 50, intensity: 2.2, width: 0.05, rate: 0 });
    // Sparks: replay the kicks just before the freeze in slow motion.
    const sparkClock = FREEZE_TC + (tau - chargeTau(w, barTime(37)));
    w.updateSparks(sparkClock, tau - sparkClock, ['RUS', 'HAM', 'LEC', 'ANT'], 1.5, 0.15);
    f.draw(w.scene, this.cam);

    post.saturation = lerp(0.85, 1.1, snap);
    post.exposure = 0.85 + 0.25 * snap;
    post.vignette = 0.8;
    post.bloom = 0.6;
    post.streak = 0.25;
    post.grain = 0.05;
    post.ca = 0.003 + 0.01 * snap;
    post.radial = 0.05 * snap;
    post.flash = 0.25 * snap;

    // Stakes, one per bar.
    const lines: [string, string][] = [
      [String(season.remaining.length), season.remaining.length === 1 ? 'RACE' : 'RACES'],
      [String(season.contenders.length), 'DRIVERS'],
      [String(season.contenders[0].points - season.contenders[season.contenders.length - 1].points), 'POINTS'],
    ];
    lines.forEach(([n, word], i) => {
      const age = bar - (37 + i);
      if (age < 0) return;
      const a = clamp(age / 0.04) * (1 - snap);
      const s = lerp(1.25, 1, easeOutExpo(age / 0.4));
      const y = 330 + i * 150;
      ui.text(n, 300, y, { font: 'display', size: 150 * s, weight: 900, align: 'right', alpha: a, glow: 'rgba(0,0,0,0.85)', glowBlur: 30 });
      ui.text(word, 340, y, { font: 'title', size: 88 * s, weight: 900, tracking: 0.12, alpha: a, glow: 'rgba(0,0,0,0.85)', glowBlur: 30 });
    });
    const meterA = (1 - snap) * smoothstep(37.05, 37.3, bar);
    drawEnergy(ui, easeInExpo(clamp(k * 1.02)) * 0.15 + k * 0.85, 3, 160, 820, 520, meterA);
    ui.text(k >= 0.98 ? 'OVERRIDE ARMED' : 'ENERGY STORE', 160, 870, {
      font: 'mono', size: 18, weight: 700, tracking: 0.32, align: 'left', color: k >= 0.98 ? '#22E6C8' : '#9aa3b2', alpha: meterA,
    });
  }
}
