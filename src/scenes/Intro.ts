import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeOutCubic, smoothstep } from '../engine/math';
import { DRIVERS, EVENTS, OFFICIAL, SEASON } from '../leaderboard/data';
import { drawBoard } from '../leaderboard/Board';
import { F1_MARK, drawMarkSweep } from '../leaderboard/logos';
import { drawGantry, drawGridBoxes, gridOffset, lampsLit } from '../leaderboard/Opening';
import { stateAt } from '../leaderboard/schedule';
import { HERO } from '../photos/PhotoPlate';
import { drawBackdropCredit } from '../photos/credits';
import { photoFor } from '../photos/photos';
import { backdrop, calmPost } from './common';

// Bars 1–5, the swell: a cold open. The F1 mark catches the light; then real
// photographs cut in on the downbeats while the facts of the season land and
// the start-light gantry fills, one lamp per half bar — the real
// one-per-second cadence. In bar 5 the 23 drivers line up on the grid with
// all five lamps lit. The lights go out on the downbeat of bar 6, the bass
// drop, and the grid launches into the table (Season.ts carries that on).

const RACES = EVENTS.filter((e) => e.type === 'race').length;
const SPRINTS = EVENTS.length - RACES;
const POINTS = Object.values(OFFICIAL).reduce((a, b) => a + b, 0);

/** One hero photograph per downbeat, bars 2–4. */
const HEROES = [photoFor('venue', 'AZE'), photoFor('venue', 'MIA'), photoFor('finale', 'FINALE')];

const FACTS: [bar: number, big: string, label: string][] = [
  [2, String(SEASON.totalRounds), 'ROUNDS ON THE 2026 CALENDAR'],
  [3, `${RACES} + ${SPRINTS}`, 'GRANDS PRIX AND SPRINTS RUN SO FAR'],
  [4, String(DRIVERS.length), 'DRIVERS HAVE RACED'],
  [5, POINTS.toLocaleString('en-US'), 'POINTS SCORED. ONE TABLE.'],
];

export class Intro implements Act {
  readonly sections = ['intro'] as const;
  setup(_e: Engine) {}

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    calmPost(post);
    post.fade = 1 - smoothstep(0.1, 1.2, t);

    // Hero photographs: a hard cut on each downbeat, a slow push, then dimmed under the grid.
    const hi = Math.floor(bar) - 2;
    const hero = HEROES[Math.min(2, Math.max(0, hi))];
    const heroA = bar < 2 ? 0 : 1 - 0.75 * smoothstep(5, 5.35, bar);
    const since = bar - Math.min(4, Math.max(2, Math.floor(bar)));
    backdrop(f, 0, 0.05, hero ? [{ photo: hero, alpha: heroA, zoom: 1.04 + 0.03 * since, sharp: true }] : [], HERO);
    if (bar >= 2) drawBackdropCredit(ui, hero, heroA, 'PHOTO');

    // Bar 1: the mark catches the light.
    const markA = smoothstep(1.1, 1.45, bar) * (bar < 2 ? 1 : 0);
    if (markA > 0) {
      drawMarkSweep(ui, F1_MARK, 960 - 320, 540 - 340, 640, `#${F1_MARK.hex}`, clamp((bar - 1.35) / 0.55), markA);
      const k = easeOutCubic(clamp((bar - 1.45) / 0.4));
      ui.wipeText(`THE ${SEASON.season} CHAMPIONSHIP`, 960, 650, k, { font: 'title', size: 40, weight: 900, tracking: 0.32, align: 'center', alpha: markA });
      ui.wipeText('EVERY RACE. EVERY POINT.', 960, 700, clamp((bar - 1.6) / 0.35), {
        font: 'mono', size: 20, weight: 700, tracking: 0.3, align: 'center', color: '#c9ced8', alpha: markA,
      });
    }

    // The gantry arrives with the first photo, lamps from bar 3.
    drawGantry(ui, lampsLit(bar), smoothstep(2.2, 2.6, bar));

    // Facts, one per downbeat, lower left.
    for (const [b, big, label] of FACTS) {
      if (bar < b || bar >= b + 1) continue;
      const p = easeOutCubic(clamp((bar - b) / 0.35));
      ui.wipeText(big, 110, 900, p, { font: 'display', size: 190, weight: 900, alpha: 1 });
      ui.wipeText(label, 116, 950, clamp((bar - b - 0.1) / 0.35), { font: 'mono', size: 20, weight: 700, tracking: 0.2, color: '#d6dbe4', alpha: 1 });
    }

    // Bar 5: the grid. The board's own rows, drawn in their grid slots without
    // their bars — at lights out they launch into place.
    if (bar >= 5) {
      const reveal = ((bar - 5.05) / 0.55) * DRIVERS.length;
      drawGridBoxes(ui, reveal, 1);
      drawBoard(ui, stateAt(t), { chips: 0, dataAlpha: 0, reveal, offset: (code) => gridOffset(code, 0) });
      const la = smoothstep(5.05, 5.3, bar);
      ui.text(`${SEASON.season} ENTRY LIST · ${DRIVERS.length} DRIVERS`, 550, 280, { font: 'mono', size: 14, weight: 700, tracking: 0.24, color: '#8d96a6', alpha: la });
      ui.text('LIGHTS OUT: ROUND 1, MELBOURNE', 1340, 280, { font: 'mono', size: 14, weight: 700, tracking: 0.24, align: 'right', color: '#F5C542', alpha: la });
    }
  }
}
