import * as THREE from 'three';
import season from '../data/season.json';
import { feat } from '../engine/AudioFeatures';
import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutSine, easeOutCubic, lerp, smoothstep, window01 } from '../engine/math';
import { barTime } from '../engine/Timeline';
import { gapLabel, hex, neonNumber } from '../overlay/Cards';
import type { CarCode } from '../world/RaceSim';
import type { World } from '../world/World';
import { landmarks, lightNight, offsetFor } from './common';
import { lens } from './rigs';

// Bars 61–82. The breakdown — the purest D minor in the song, and the
// emotional core. The cars are gone; only their light remains, like a long
// exposure of the race we just watched. The trails lift into the sky and,
// on the four bass pulses (bars 67, 71, 75, 79), each contender is painted
// as a neon numeral.

const PORTRAITS: { code: CarCode; bar: number }[] = [
  { code: 'RUS', bar: 67 },
  { code: 'HAM', bar: 71 },
  { code: 'VER', bar: 75 },
  { code: 'LEC', bar: 79 },
];
const DRIVERS = Object.fromEntries(season.contenders.map((d) => [d.code, d]));
const SNAP_TC = barTime(55.6);

function standingLine(code: CarCode) {
  const d = DRIVERS[code];
  const gap = gapLabel(code);
  if (gap === 'P2') {
    const next = season.contenders[1].points;
    const by = d.points - next;
    return `${d.points} PTS · HOLDS P2 BY ${by === 1 ? 'A SINGLE POINT' : `${by} POINTS`}`;
  }
  return `${d.points} PTS · ${gap.replace('−', '')} BEHIND`;
}

export class Exposure implements Act {
  readonly name = 'exposure' as const;
  private world!: World;
  private readonly cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 9000);
  private offset = 0;
  private readonly target = new THREE.Vector3();

  setup(e: Engine) {
    this.world = e.world;
    const L = landmarks(e.world.track, e.world.env.hotelS);
    // The exposure is of the Ferrari duel lap through the hotel section.
    this.offset = offsetFor(e.world.track, e.world.track.wrap(L.hotel + 60), SNAP_TC);
  }

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    const w = this.world;
    lightNight(w);
    w.laneBias = null;
    w.pace = (tau) => w.track.distanceAtTime(tau);
    w.env.skyMat.uniforms.time.value = t;
    w.env.skyMat.uniforms.stars.value = 1.6;
    post.letterbox = 1;
    post.bloom = 0.9;
    post.streak = 0.35;
    post.vignette = 0.7;
    post.grain = 0.045;
    post.saturation = 0.95;
    post.lift = [0, 0.004, 0.016];
    post.ca = 0.0012;
    // White-out from the photo finish resolves into the night.
    post.flash = 1 - smoothstep(61, 62.2, bar);
    const low = clamp(feat('low', t));

    const u = w.env.canopyMat.uniforms;
    u.time.value = t * 0.4;
    u.mode.value = 0;
    u.kick.value = 0;
    u.level.value = 0.3;
    u.intensity.value = 0.6;

    const tau = SNAP_TC + this.offset;
    const hotel = w.env.canopyCenter;
    const rise = easeInOutSine(clamp((bar - 64.5) / 2.5));
    const portrait = PORTRAITS.findIndex((p) => bar >= p.bar && bar < p.bar + 4);
    const focus = portrait >= 0 ? PORTRAITS[portrait].code : null;

    // Camera: slow drift past the hotel, then tilt up to the sky for the portraits.
    const drift = (t - barTime(61)) / (barTime(83) - barTime(61));
    const ang = 2.2 + drift * 0.9;
    const r = lerp(170, 150, drift);
    this.cam.position.set(hotel.x + Math.cos(ang) * r, lerp(46, 70, rise), hotel.z + Math.sin(ang) * r);
    this.target.copy(hotel).setY(lerp(-4, 150, rise));
    this.cam.lookAt(this.target);
    lens(this.cam, lerp(38, 48, rise), f.aspect);

    w.pose(SNAP_TC, tau, { visible: () => false });
    w.updateTrails(SNAP_TC, tau, this.cam.position, {
      seconds: 9,
      points: 640,
      intensity: lerp(4.2, 2.6, rise) + low * 1.5,
      width: lerp(0.9, 1.6, rise),
      fade: 0.8,
      rate: 1,
      rainOnly: true,
      only: (c) => c !== 'NOR' && c !== 'ANT',
      gain: (c) => (focus ? (c === focus ? 1.8 : 0.18) : 1),
      warp: (p, i, n, code) => {
        if (rise <= 0) return;
        const k = i / (n - 1);
        const idx = ['RUS', 'HAM', 'VER', 'LEC'].indexOf(code);
        p.y += rise * (Math.pow(k, 1.6) * 260 + 20 + idx * 14);
        p.x += rise * Math.sin(k * 3 + idx) * 40 * k;
      },
    });
    w.hideSparks();
    f.draw(w.scene, this.cam);

    // Words.
    ui.wipeText('THE CROWN IS SPOKEN FOR.', 960, 560, easeOutCubic((bar - 62) / 1.2), {
      font: 'title', size: 64, weight: 700, tracking: 0.08, align: 'center', alpha: window01(bar, 62, 64.3, 0.1, 0.4), glow: 'rgba(0,0,0,0.9)', glowBlur: 34,
    });
    ui.wipeText('SECOND IS STILL A FIGHT.', 960, 560, easeOutCubic((bar - 64.5) / 1.2), {
      font: 'title', size: 64, weight: 900, tracking: 0.08, align: 'center', alpha: window01(bar, 64.5, 66.9, 0.1, 0.4), glow: 'rgba(0,0,0,0.9)', glowBlur: 34,
    });

    if (focus) this.portrait(f, focus, bar - PORTRAITS[portrait].bar);
  }

  private portrait(f: FrameCtx, code: CarCode, k: number) {
    const { ui } = f;
    const d = DRIVERS[code];
    const col = hex(code);
    const out = 1 - smoothstep(3.6, 3.98, k);
    neonNumber(ui, String(d.number), 600, 790, 560 * (1 + 0.05 * (k / 4)), col, easeOutCubic(clamp(k / 1.6)), out);
    const tx = 1020;
    ui.wipeText(d.first.toUpperCase(), tx, 430, easeOutCubic((k - 0.6) / 0.6), { font: 'title', size: 36, weight: 600, tracking: 0.34, color: '#cfd5df', alpha: out });
    ui.wipeText(d.last.toUpperCase(), tx - 4, 530, easeOutCubic((k - 0.7) / 0.7), { font: 'title', size: 112, weight: 900, tracking: 0.02, alpha: out });
    ui.typeText(standingLine(code), tx, 600, clamp((k - 1.2) / 0.8), { font: 'mono', size: 28, weight: 700, color: col, alpha: out }, false);
    d.facts.forEach((fact, i) => {
      ui.typeText(fact.toUpperCase(), tx, 660 + i * 44, clamp((k - 1.8 - i * 0.5) / 0.8), {
        font: 'mono', size: 22, weight: 400, tracking: 0.06, color: '#c9ced8', alpha: out,
      }, false);
    });
    const n = PORTRAITS.findIndex((p) => p.code === code) + 1;
    ui.text(`${n} / 4`, tx, 900, { font: 'mono', size: 16, weight: 700, tracking: 0.3, color: '#7b8494', alpha: out * smoothstep(0.5, 1, k) });
  }
}
