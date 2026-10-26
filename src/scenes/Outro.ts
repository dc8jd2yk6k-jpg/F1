import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutCubic, easeOutCubic, easeOutExpo, lerp, smoothstep } from '../engine/math';
import { DURATION } from '../engine/Timeline';
import { POINTS_LEFT, RACES_LEFT, SEASON, shortDate } from '../leaderboard/data';
import { FULL, drawBoard } from '../leaderboard/Board';
import { F1_MARK, drawMark } from '../leaderboard/logos';
import { FINAL } from '../leaderboard/model';
import { PANEL_W, PANEL_X, drawRemaining, drawRoundStrip, drawTitleHeader } from '../leaderboard/Panels';
import { stateAt } from '../leaderboard/schedule';
import { GOLD } from '../photos/PhotoPlate';
import { drawBackdropCredit } from '../photos/credits';
import { PHOTOS } from '../photos/photos';
import { FINALE_PHOTO, zoomAt } from '../photos/venues';
import type { Overlay } from '../overlay/Overlay';
import { backdrop, calmPost } from './common';

// Bars 83–end. The song turns to D major and the backdrop warms to gold.
// The full table returns as it stands today, the five rounds still to run
// line up as question marks, and the video ends on the honest answer: P2 — ?

const FINALE = SEASON.remaining[SEASON.remaining.length - 1];

export class Outro implements Act {
  readonly sections = ['outro'] as const;
  setup(_e: Engine) {}

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    calmPost(post);
    post.fade = smoothstep(DURATION - 2.4, DURATION - 0.25, t);
    const warm = smoothstep(83, 86.5, bar);
    const boardIn = easeInOutCubic(clamp((bar - 83) / 0.8));
    const card = smoothstep(85.4, 85.8, bar);
    const title = smoothstep(87.5, 87.9, bar);
    const boardA = boardIn * (1 - 0.75 * card) * (1 - title);
    // The finale venue returns in gold: where P2 will be decided.
    const plate = smoothstep(83, 84.2, bar) * (1 - 0.75 * title);
    backdrop(f, warm, 0.05 + 0.03 * warm, [{ photo: FINALE_PHOTO, alpha: plate, zoom: zoomAt(bar - 83) }], GOLD);
    drawBackdropCredit(ui, FINALE_PHOTO, plate * (1 - title));

    drawBoard(ui, stateAt(t), { chips: 0, alpha: boardA });
    drawRoundStrip(ui, SEASON.afterRound.round, 0, boardA);
    drawTitleHeader(ui, `TODAY · AFTER ROUND ${SEASON.afterRound.round} OF ${SEASON.totalRounds}`, 'THE TABLE, AS IT STANDS', bar - 83, boardA);
    // Places 2–5 stay marked.
    const L = FULL;
    const y0 = L.y + L.rowH + 4;
    const y1 = L.y + L.rowH * 5 - 4;
    ui.line(1236, y0, 1236, y1, '#F5C542', 2, boardA);
    ui.text('P2 ?', 1210, (y0 + y1) / 2 + 12, { font: 'display', size: 48, weight: 900, align: 'right', color: '#F5C542', alpha: boardA });

    const pa = boardA * smoothstep(83.4, 83.8, bar);
    ui.text('STILL TO RACE', PANEL_X, 178, { font: 'mono', size: 14, weight: 700, tracking: 0.24, color: '#8d96a6', alpha: pa });
    ui.line(PANEL_X, 192, PANEL_X + PANEL_W, 192, '#ffffff', 1, 0.12 * pa);
    drawRemaining(ui, PANEL_X, 212, bar - 83.4, pa);
    ui.text(`${POINTS_LEFT} POINTS LEFT`, PANEL_X, 530, { font: 'title', size: 34, weight: 900, tracking: 0.04, alpha: pa * smoothstep(84, 84.4, bar) });

    // P2 — ?
    if (card > 0 && title < 1) {
      const a = card * (1 - title);
      const g = ui.ctx.createRadialGradient(960, 600, 60, 960, 600, 820);
      g.addColorStop(0, 'rgba(3,4,8,0.88)');
      g.addColorStop(1, 'rgba(3,4,8,0.35)');
      ui.ctx.save();
      ui.ctx.globalAlpha = a;
      ui.ctx.fillStyle = g;
      ui.ctx.fillRect(0, 0, 1920, 1080);
      ui.ctx.restore();
      const s = lerp(1.1, 1, easeOutExpo((bar - 85.4) / 0.5));
      const contenders = FINAL.slice(1, 5).map((r) => r.code).join(' · ');
      ui.text('P2', 900, 600, { font: 'display', size: 300 * s, weight: 900, align: 'right', alpha: a });
      ui.rect(932, 488, 110, 16, '#ffffff', a * smoothstep(85.5, 85.7, bar));
      ui.text('?', 1150, 600, { font: 'display', size: 300 * s, weight: 900, align: 'center', color: '#F5C542', alpha: a * smoothstep(85.7, 86.0, bar) });
      ui.typeText(contenders, 960, 700, clamp((bar - 85.9) / 0.6), { font: 'mono', size: 28, weight: 700, tracking: 0.2, align: 'center', alpha: a }, false);
      ui.typeText(`${RACES_LEFT} RACES · DECIDED BY ${shortDate(FINALE.date)} AT ${(FINALE.venue ?? 'YAS MARINA').toUpperCase()}`, 960, 748,
        clamp((bar - 86.4) / 0.6), { font: 'mono', size: 18, weight: 700, tracking: 0.16, align: 'center', color: '#c9ced8', alpha: a }, false);
    }

    // Title card.
    if (title > 0) {
      const p = easeOutCubic(clamp((bar - 87.5) / 0.8));
      drawMark(ui, F1_MARK, 960 - 150, 300, 300, `#${F1_MARK.hex}`, title * p);
      ui.text(`“F1” · ${SEASON.season} · THE CHAMPIONSHIP, RACE BY RACE`, 960, 624, { font: 'title', size: 26, weight: 700, tracking: 0.3, align: 'center', color: '#d6dbe4', alpha: title });
      const fine = [
        `DATA: OFFICIAL CLASSIFICATIONS OF ${SEASON.afterRound.round} GRANDS PRIX AND 6 SPRINTS, CHECKED AGAINST THE STANDINGS AFTER THE ${SEASON.afterRound.name.toUpperCase()} (${shortDate(SEASON.afterRound.date)} ${SEASON.season}).`,
        'LOGOS ARE TRADEMARKS OF THEIR OWNERS, SHOWN TO IDENTIFY TEAMS · MARKS VIA SIMPLE-ICONS (CC0)',
        'UNOFFICIAL FAN WORK · NOT AFFILIATED WITH OR ENDORSED BY FORMULA 1, THE FIA OR ANY TEAM',
      ];
      photoCredits(ui, title);
      fine.forEach((l, i) => ui.text(l, 960, 970 + i * 24, { font: 'mono', size: 13, weight: 400, tracking: 0.06, align: 'center', color: '#8d96a6', alpha: title }));
    }
  }
}

/** Every photograph used, on the closing card (the full list is in CREDITS.md). */
function photoCredits(ui: Overlay, alpha: number) {
  if (!PHOTOS.length || alpha <= 0) return;
  const sa = PHOTOS.some((p) => /BY-SA/i.test(p.license));
  ui.text(`PHOTOGRAPHY VIA WIKIMEDIA COMMONS${sa ? ' · THIS VIDEO IS SHARED UNDER CC BY-SA 4.0' : ''}`, 960, 690, {
    font: 'mono', size: 13, weight: 700, tracking: 0.16, align: 'center', color: '#c9ced8', alpha,
  });
  const cols = 3;
  const perCol = Math.ceil(PHOTOS.length / cols);
  const colW = 580;
  const x0 = 960 - (colW * cols) / 2 + 20;
  PHOTOS.forEach((p, i) => {
    const cx = x0 + Math.floor(i / perCol) * colW;
    const cy = 722 + (i % perCol) * 19;
    const line = `${p.caption.toUpperCase()} — ${p.author.toUpperCase()}, ${p.license}`;
    const style = { font: 'mono', size: 11, weight: 400, tracking: 0.03 } as const;
    const size = Math.min(11, (11 * (colW - 24)) / ui.measure(line, style));
    ui.text(line, cx, cy, { ...style, size, color: '#a3abb8', alpha });
  });
}
