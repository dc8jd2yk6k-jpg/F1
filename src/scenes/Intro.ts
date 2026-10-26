import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeOutCubic, smoothstep, window01 } from '../engine/math';
import { DRIVERS, EVENTS, OFFICIAL, SEASON } from '../leaderboard/data';
import { drawBoard } from '../leaderboard/Board';
import { F1_MARK, drawMark } from '../leaderboard/logos';
import { PANEL_W, PANEL_X, drawStartLights, drawTitleHeader } from '../leaderboard/Panels';
import { stateAt } from '../leaderboard/schedule';
import { background, calmPost } from './common';

// Bars 1–5, the swell. The grid of 23 drivers fills in on zero, entry-list
// order, while the five start lights come on one per bar. They go out on the
// downbeat of bar 6 — the bass drop — and the season begins.

const RACES = EVENTS.filter((e) => e.type === 'race').length;
const SPRINTS = EVENTS.length - RACES;
const POINTS = Object.values(OFFICIAL).reduce((a, b) => a + b, 0);

export class Intro implements Act {
  readonly sections = ['intro'] as const;
  setup(_e: Engine) {}

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    calmPost(post);
    post.fade = 1 - smoothstep(0.15, 1.8, t);
    const bg = background(f.aspect);
    bg.set(t, 0, 0.05);
    f.draw(bg.scene, bg.camera);

    const ha = smoothstep(1.1, 1.4, bar);
    drawTitleHeader(ui, '', 'EVERY RACE. EVERY POINT.', bar - 1.2, ha);
    drawMark(ui, F1_MARK, 70, 38, 44, `#${F1_MARK.hex}`, ha);
    ui.text(`${SEASON.season} DRIVERS' CHAMPIONSHIP`, 126, 64, { font: 'mono', size: 16, weight: 700, tracking: 0.18, color: '#8d96a6', alpha: ha });
    drawBoard(ui, stateAt(t), { chips: 0, reveal: ((bar - 1.6) / 3.6) * DRIVERS.length });

    const lit = [1, 2, 3, 4, 5].filter((n) => bar >= n).length;
    drawStartLights(ui, lit, 1740, 90, 17);

    const facts: [number, string, string][] = [
      [2, String(SEASON.totalRounds), 'ROUNDS ON THE CALENDAR'],
      [3, String(RACES), `GRANDS PRIX AND ${SPRINTS} SPRINTS RUN`],
      [4, String(DRIVERS.length), 'DRIVERS HAVE RACED'],
      [5, POINTS.toLocaleString('en-US'), 'POINTS SCORED SO FAR'],
    ];
    facts.forEach(([b, n, label], i) => {
      const a = window01(bar, b, 5.98, 0.15, 0.08);
      if (a <= 0) return;
      const y = 300 + i * 150;
      const p = easeOutCubic(clamp((bar - b) / 0.4));
      ui.text(n, PANEL_X, y, { font: 'display', size: 96, weight: 900, alpha: a * p });
      ui.wipeText(label, PANEL_X + 4, y + 40, p, { font: 'mono', size: 16, weight: 700, tracking: 0.16, color: '#9aa3b2', alpha: a });
    });
    ui.line(PANEL_X, 240, PANEL_X + PANEL_W, 240, '#ffffff', 1, 0.1 * smoothstep(1.8, 2.2, bar));
  }
}
