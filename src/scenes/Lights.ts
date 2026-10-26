import * as THREE from 'three';
import season from '../data/season.json';
import { racesLeft } from '../data/story';
import { feat } from '../engine/AudioFeatures';
import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutSine, smoothstep, window01 } from '../engine/math';
import { barTime } from '../engine/Timeline';
import type { World } from '../world/World';
import { gradeNight } from './common';
import { GRID_TC, parkOnGrid } from './gridShared';
import { lens } from './rigs';

// Bars 1–5. Five lights, one per bar, breathing with the bass swell.
// They go out on the downbeat of bar 6 — exactly where the beat drops.

export class Lights implements Act {
  readonly name = 'lights' as const;
  private world!: World;
  private readonly cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 9000);

  setup(e: Engine) {
    this.world = e.world;
  }

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    const w = this.world;
    gradeNight(post);
    post.letterbox = 1;
    post.bloom = 1.0;
    post.streak = 0.6;
    post.streakTint = [1.4, 0.5, 0.45];
    post.vignette = 0.75;
    post.fade = 1 - smoothstep(0.2, 2.2, t);
    w.env.skyMat.uniforms.twilight.value = 0.22;
    w.env.skyMat.uniforms.gold.value = 0;
    w.env.skyMat.uniforms.time.value = t;

    parkOnGrid(w);
    const pole = w.state('ANT', GRID_TC, 0);
    const push = easeInOutSine(clamp(t / barTime(6)));
    const back = 6.4 - push * 2.6;
    w.localToWorld(pole, new THREE.Vector3(-0.9, 1.05, -back), this.cam.position);
    const target = w.gantry.group.position.clone().add(new THREE.Vector3(0, 0.2, 0));
    this.cam.lookAt(target.lerp(w.localToWorld(pole, new THREE.Vector3(0, 0.8, 6), new THREE.Vector3()), 0.42 - push * 0.12));
    lens(this.cam, 34 - push * 6, f.aspect);

    const swell = 0.8 + 0.5 * clamp(feat('low', t) * 2.2);
    const levels = [1, 2, 3, 4, 5].map((n) => {
      const on = t - Math.max(0, barTime(n));
      return on < 0 ? 0 : clamp(on / 0.06) * swell;
    });
    w.gantry.set(levels, 1.2);
    w.gantry.group.visible = true;
    w.pose(GRID_TC, 0, { lights: () => 0.15 + 0.85 * (levels.filter((l) => l > 0).length / 5), aero: () => 0 });
    w.hideTrails();
    w.hideSparks();
    f.draw(w.scene, this.cam);
    w.gantry.group.visible = false;

    // Lower-bar typewriter lines.
    const done = season.afterRound.round;
    const lines: [number, number, string][] = [
      [1.55, 2.95, `SEASON ${season.season} · ROUND ${done} OF ${season.totalRounds} COMPLETE`],
      [3.0, 3.95, racesLeft('LEFT')],
      [4.0, 5.0, season.leader.championDecided ? 'ONE TITLE DECIDED.' : 'ONE TITLE ALL BUT DECIDED.'],
      [5.0, 5.98, `ONE FIGHT WIDE OPEN.`],
    ];
    for (const [a, b, str] of lines) {
      const vis = window01(bar, a, b, 0.05, 0.12);
      if (vis <= 0) continue;
      const p = clamp((bar - a) / 0.55);
      ui.typeText(str, 960, 1018, p, { font: 'mono', size: 26, weight: 700, tracking: 0.16, align: 'center', alpha: vis, color: '#e9edf3' }, true);
    }
    ui.text('YAS MARINA · ABU DHABI', 960, 86, {
      font: 'mono', size: 15, weight: 700, tracking: 0.4, align: 'center', color: '#8d96a6', alpha: window01(bar, 1.3, 5.98, 0.6, 0.1) * 0.9,
    });
  }
}
