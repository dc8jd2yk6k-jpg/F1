import * as THREE from 'three';
import season from '../data/season.json';
import { SPREAD, racesLeft, word } from '../data/story';
import { feat } from '../engine/AudioFeatures';
import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutSine, easeOutCubic, easeOutExpo, lerp, smoothstep, window01 } from '../engine/math';
import { DURATION, barTime } from '../engine/Timeline';
import { neonNumber } from '../overlay/Cards';
import type { World } from '../world/World';
import { lightNight, offsetFor } from './common';
import { lens } from './rigs';

// Bars 83–89 + the silent tail. The song turns to D major: warmth arrives as a
// gold edge on the horizon. The four trails from the frozen photo-finish run
// to the line and stop there. Unresolved, on purpose: P2 — ?

const FREEZE = barTime(59.55);
const FINALE = season.remaining[season.remaining.length - 1];

function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return `${d} ${months[m - 1]} ${y}`;
}

export class Finale implements Act {
  readonly name = 'finale' as const;
  private world!: World;
  private readonly cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 9000);
  private offset = 0;
  private readonly v = new THREE.Vector3();

  setup(e: Engine) {
    this.world = e.world;
    this.offset = offsetFor(e.world.track, 2.4, FREEZE);
  }

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    const w = this.world;
    lightNight(w);
    w.laneBias = null;
    w.pace = (tau) => w.track.distanceAtTime(tau);
    const lift = smoothstep(83, 86, bar);
    w.env.skyMat.uniforms.time.value = t;
    w.env.skyMat.uniforms.gold.value = lift * 0.9;
    w.env.skyMat.uniforms.horizonTint.value.set(0.09 * lift, 0.045 * lift, 0.01 * lift);
    w.key.color.lerp(new THREE.Color('#ffd9a0'), lift * 0.6);
    post.letterbox = 1;
    post.bloom = 0.95;
    post.streak = 0.4;
    post.streakTint = [1.3, 1.0, 0.7];
    post.grain = 0.04;
    post.vignette = 0.75;
    post.lift = [0.01 * lift, 0.006 * lift, 0.004];
    post.gain = [1 + 0.05 * lift, 1 + 0.02 * lift, 1 - 0.03 * lift];
    post.saturation = 1.0;
    // Fade out through the silent tail.
    post.fade = smoothstep(DURATION - 2.2, DURATION - 0.2, t);

    const tau = FREEZE + this.offset;
    const lead = w.state('LEC', FREEZE, tau);
    const p = easeInOutSine(clamp((t - barTime(83)) / (barTime(88) - barTime(83))));
    // Rise above the finish line, looking back down the straight at the trails.
    this.v.copy(lead.pos).addScaledVector(lead.left, -3.6);
    this.cam.position.copy(this.v).addScaledVector(lead.forward, lerp(14, 34, p)).setY(lerp(2.2, 30, p));
    this.cam.lookAt(this.v.clone().addScaledVector(lead.forward, lerp(-30, -160, p)).setY(lerp(0, 8, p)));
    lens(this.cam, lerp(40, 46, p), f.aspect);

    const low = clamp(feat('low', t));
    w.pose(FREEZE, tau, { visible: () => bar < 84.5, lights: () => 0.6 });
    for (const c of Object.values(w.cars)) c.root.visible = c.root.visible && bar < 84.5;
    w.updateTrails(FREEZE, tau, this.cam.position, {
      seconds: 7,
      points: 520,
      intensity: (2.8 + low) * (1 - post.fade),
      width: lerp(0.12, 0.5, p),
      fade: 0.7,
      rainOnly: true,
      only: (c) => c !== 'NOR' && c !== 'ANT',
    });
    w.hideSparks();
    f.draw(w.scene, this.cam);

    // P2 — ?
    const qa = window01(bar, 84.9, 87.3, 0.05, 0.25);
    if (qa > 0) {
      const g = ui.ctx.createRadialGradient(960, 600, 40, 960, 600, 760);
      g.addColorStop(0, 'rgba(0,0,0,0.72)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ui.ctx.save();
      ui.ctx.globalAlpha = qa;
      ui.ctx.fillStyle = g;
      ui.ctx.fillRect(0, 0, 1920, 1080);
      ui.ctx.restore();
      const s = lerp(1.12, 1, easeOutExpo((bar - 84.9) / 0.5));
      ui.text('P2', 860, 610, { font: 'display', size: 330 * s, weight: 900, align: 'right', alpha: qa, glow: 'rgba(255,255,255,0.35)', glowBlur: 26 });
      neonNumber(ui, '?', 1100, 610, 330 * s, '#F5C542', easeOutCubic(clamp((bar - 85.3) / 1.0)), qa);
      ui.rect(892, 500, 110, 14, '#ffffff', qa * smoothstep(85.0, 85.25, bar));
      const date = longDate(FINALE.date).toUpperCase();
      ui.typeText(`DECIDED UNDER THE LIGHTS AT ${FINALE.venue?.toUpperCase() ?? 'YAS MARINA'}`, 960, 730, clamp((bar - 85.6) / 0.7),
        { font: 'mono', size: 26, weight: 700, tracking: 0.18, align: 'center', alpha: qa }, false);
      ui.typeText(`${date} · ${racesLeft('TO GO')}`, 960, 774, clamp((bar - 86.1) / 0.6),
        { font: 'mono', size: 22, weight: 400, tracking: 0.2, align: 'center', color: '#c9ced8', alpha: qa }, false);
    }

    // Title card.
    const ta = smoothstep(87.4, 87.9, bar) * (1 - post.fade);
    if (ta > 0) {
      ui.rect(0, 0, 1920, 1080, '#000000', ta * 0.7);
      ui.text('F1', 960, 560, { font: 'display', size: 260, weight: 900, align: 'center', tracking: 0.06, alpha: ta });
      ui.text(`${word(SPREAD)} POINTS · THE FIGHT FOR SECOND`, 960, 630, { font: 'title', size: 26, weight: 700, tracking: 0.36, align: 'center', color: '#d6dbe4', alpha: ta });
      const fine = `STANDINGS: ${season.status.toUpperCase()}, AFTER ROUND ${season.afterRound.round} (${season.afterRound.name.toUpperCase()}, ${longDate(season.afterRound.date)}). THE RACE SHOWN IS IMAGINED.`;
      ui.text(fine, 960, 990, { font: 'mono', size: 14, weight: 400, tracking: 0.08, align: 'center', color: '#8d96a6', alpha: ta });
      ui.text('UNOFFICIAL FAN WORK · NOT AFFILIATED WITH FORMULA 1, THE FIA OR ANY TEAM', 960, 1016, { font: 'mono', size: 14, weight: 400, tracking: 0.08, align: 'center', color: '#8d96a6', alpha: ta });
    }
  }
}
