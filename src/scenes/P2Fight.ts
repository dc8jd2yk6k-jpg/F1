import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from '../engine/math';
import { EVENTS, RACES_LEFT, driver, driverColor } from '../leaderboard/data';
import { drawBoard } from '../leaderboard/Board';
import { drawTeamTile } from '../leaderboard/logos';
import { FINAL, pointsByEvent, pointsSince } from '../leaderboard/model';
import { drawTitleHeader } from '../leaderboard/Panels';
import { autoTop, drawPointsChart } from '../leaderboard/PointsChart';
import { TODAY, stateAt } from '../leaderboard/schedule';
import type { Overlay } from '../overlay/Overlay';
import { drawBackdropCredit } from '../photos/credits';
import { drawCover, photoFor } from '../photos/photos';
import { FINALE_PHOTO, zoomAt } from '../photos/venues';
import { backdrop, calmPost } from './common';

// Bars 61–82, the breakdown: the fight for P2, up close. The board narrows
// to championship places 2–5 and each contender's season unrolls as a strip
// of every score — race by race, sprint by sprint. From the first bass pulse
// (bar 67) the strips give way to a chart of cumulative points: the season
// replays as four racing lines, one event per half bar, and on each pulse
// (67, 71, 75, 79) one driver is brought forward with what the data says
// about them. Then the view closes in on the finish: 9 points, 4 drivers.

const CONTENDERS = FINAL.slice(1, 5);
const PULSES = [67, 71, 75, 79];
const BREAK_AT = EVENTS.findIndex((e) => e.code === 'NED');
const STRIP_X = 780;
const STRIP_W = 1068;
const BLOCK_Y = 176;
const BLOCK_H = 214;
const COL_W = STRIP_W / EVENTS.length;
const MAX_H = 112;

/** The chart: axes draw on at bar 67, then one event every half bar from 67.5 to 79.5, then the zoom. */
export const CHART = { in: 67, start: 67.5, step: 0.5, zoom: [79.5, 81] as const };

const since = Object.fromEntries(CONTENDERS.map((r) => [r.code, pointsSince(r.code, BREAK_AT)]));
const mostSince = Math.max(...Object.values(since));

export class P2Fight implements Act {
  readonly sections = ['breakdown'] as const;
  setup(_e: Engine) {}

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    calmPost(post);
    // The finale venue from the "today" hold dissolves away: this act is about the drivers.
    const plate = 1 - smoothstep(61, 61.8, bar);
    backdrop(f, 0, 0.05, [{ photo: FINALE_PHOTO, alpha: plate, zoom: zoomAt(bar - TODAY.from) }]);
    drawBackdropCredit(ui, FINALE_PHOTO, plate);

    // Hand-off from the full board: everyone but places 2–5 steps back.
    const out = easeInOutCubic(clamp((bar - 61) / 0.8));
    if (out < 1) {
      const keep = new Set(CONTENDERS.map((r) => r.code));
      drawBoard(ui, stateAt(t), { chips: 0, alpha: 1 - out, dim: (c) => (keep.has(c) ? 1 : 1 - out) });
    }
    const a = smoothstep(61.4, 61.9, bar);
    const spread = CONTENDERS[0].points - CONTENDERS[CONTENDERS.length - 1].points;
    drawTitleHeader(ui, 'THE FIGHT FOR P2', `${CONTENDERS.length} DRIVERS · ${spread} POINTS · ${RACES_LEFT} RACES LEFT`, bar - 61.4, a);
    if (a <= 0) return;

    this.credits(ui, a * smoothstep(61.8, 62.4, bar));

    // The strips, until the chart takes over on the first bass pulse.
    const sa = a * (1 - smoothstep(CHART.in, CHART.in + 0.3, bar));
    if (sa > 0) {
      this.codesRow(ui, sa);
      CONTENDERS.forEach((r, i) => this.block(ui, r, i, bar, sa, 1, 0));
      // Summer-break divider through the strips.
      const xb = STRIP_X + BREAK_AT * COL_W;
      ui.line(xb, BLOCK_Y - 4, xb, BLOCK_Y + BLOCK_H * 4 - 10, '#ffffff', 1, 0.16 * sa);
      ui.text('SUMMER BREAK', xb + 6, BLOCK_Y + BLOCK_H * 4 - 14, { font: 'mono', size: 10, weight: 700, tracking: 0.16, color: '#6f7a8c', alpha: sa });
      // Today marker at the end of the strips.
      ui.text(`AFTER R${EVENTS.at(-1)!.round}`, STRIP_X + STRIP_W, BLOCK_Y + BLOCK_H * 4 - 14, {
        font: 'mono', size: 10, weight: 700, tracking: 0.16, align: 'right', color: '#6f7a8c', alpha: sa,
      });
    }
    if (bar >= CHART.in) this.chart(ui, bar, spread);
  }

  /** Cumulative points, replayed; then the close-up on the finish. */
  private chart(ui: Overlay, bar: number, spread: number) {
    const progress = clamp((bar - CHART.start) / CHART.step, 0, EVENTS.length);
    const z = easeInOutCubic((bar - CHART.zoom[0]) / (CHART.zoom[1] - CHART.zoom[0]));
    const lead = CONTENDERS[0].points;
    const low = CONTENDERS[CONTENDERS.length - 1].points;
    const active = PULSES.findIndex((p) => bar >= p && bar < p + 4);
    const focus = bar < CHART.zoom[0] ? active : -1;
    drawPointsChart(ui, {
      progress,
      view: { x: [lerp(0, BREAK_AT, z), EVENTS.length], y: [lerp(0, low - 38, z), z > 0 ? lerp(autoTop(lead), lead + 10, z) : null] },
      focus,
      alpha: smoothstep(CHART.in + 0.15, CHART.in + 0.5, bar),
      axes: smoothstep(CHART.in + 0.15, CHART.in + 0.65, bar),
    });
    // On each pulse, a card introduces one contender (LEC's ends before the final hold).
    if (active >= 0) {
      // The first card waits for the strips to clear.
      const p0 = Math.max(PULSES[active], CHART.start);
      const end = active === PULSES.length - 1 ? CHART.zoom[1] : p0 + 3.85;
      this.callout(ui, CONTENDERS[active], bar - p0, smoothstep(p0 + 0.05, p0 + 0.35, bar) * (1 - smoothstep(end - 0.3, end, bar)));
    }
    // The finish, in gold.
    const fa = smoothstep(CHART.zoom[1] - 0.3, CHART.zoom[1] + 0.1, bar);
    if (fa > 0) {
      ui.text(`${spread} POINTS`, 170, 300, { font: 'display', size: 96, weight: 900, color: '#F5C542', alpha: fa });
      ui.text(`BETWEEN P2 AND P5 · ${CONTENDERS.map((r) => r.points).join(' · ')}`, 174, 340, {
        font: 'mono', size: 16, weight: 700, tracking: 0.14, color: '#F5C542', alpha: fa,
      });
      ui.text(`${RACES_LEFT} RACES LEFT`, 174, 368, { font: 'mono', size: 16, weight: 700, tracking: 0.14, color: '#c9ced8', alpha: fa });
    }
  }

  private callout(ui: Overlay, r: (typeof FINAL)[number], age: number, a: number) {
    if (a <= 0.01) return;
    const d = driver(r.code);
    const col = driverColor(r.code);
    const x = 170;
    const y = 236;
    ui.rect(x, y, 4, 118, col, a);
    ui.text(`P${r.rank} · ${r.points} PTS`, x + 20, y + 22, { font: 'mono', size: 15, weight: 700, tracking: 0.14, color: r.rank === 2 ? '#F5C542' : '#9aa3b2', alpha: a });
    ui.text(d.last.toUpperCase(), x + 18, y + 66, { font: 'title', size: 44, weight: 900, tracking: 0.02, alpha: a });
    const record = [`${r.wins} ${r.wins === 1 ? 'WIN' : 'WINS'}`, `${r.podiums} PODIUMS`];
    if (r.sprintWins > 0) record.push(`${r.sprintWins} SPRINT ${r.sprintWins === 1 ? 'WIN' : 'WINS'}`);
    ui.typeText(record.join(' · '), x + 20, y + 94, clamp((age - 0.2) / 0.6), { font: 'mono', size: 14, weight: 700, tracking: 0.1, alpha: a }, false);
    const sinceTxt = `${since[r.code]} PTS SINCE THE SUMMER BREAK${since[r.code] === mostSince ? ' — MOST OF THE FOUR' : ''}`;
    ui.typeText(sinceTxt, x + 20, y + 116, clamp((age - 0.6) / 0.7), { font: 'mono', size: 14, weight: 700, tracking: 0.1, color: col, alpha: a }, false);
  }

  /** One line crediting the four portraits. */
  private credits(ui: Overlay, a: number) {
    const parts = CONTENDERS.map((r) => photoFor('driver', r.code)).filter((p) => !!p)
      .map((p) => `${driver(p!.key).last.toUpperCase()}: ${p!.author.toUpperCase()}, ${p!.license}`);
    if (!parts.length || a <= 0) return;
    ui.text(`PHOTOS · ${parts.join(' · ')} · WIKIMEDIA COMMONS`, 1848, 1064, {
      font: 'mono', size: 11, weight: 700, tracking: 0.04, align: 'right', color: '#8d96a6', alpha: a * 0.9,
    });
  }

  private codesRow(ui: Overlay, a: number) {
    EVENTS.forEach((ev, j) => {
      const x = STRIP_X + (j + 0.5) * COL_W;
      ui.text(ev.type === 'sprint' ? 'S' : ev.code, x, BLOCK_Y - 2, {
        font: 'mono', size: 10, weight: 700, align: 'center', color: ev.type === 'sprint' ? '#a08a3c' : '#6f7a8c', alpha: a,
      });
    });
  }

  private block(ui: Overlay, r: (typeof FINAL)[number], i: number, bar: number, alpha: number, focus: number, hi: number) {
    const d = driver(r.code);
    const col = driverColor(r.code);
    const y = BLOCK_Y + 12 + i * BLOCK_H;
    const a = alpha * focus;
    const base = y + BLOCK_H - 44;

    // Portrait, between the name and the strip.
    const photo = photoFor('driver', r.code);
    if (photo) {
      const px = 572;
      const pw = 184;
      const ph = BLOCK_H - 22;
      const c = ui.ctx;
      c.save();
      c.globalAlpha = a * (0.78 + 0.22 * hi);
      c.beginPath();
      c.rect(px, y - 4, pw, ph);
      c.clip();
      drawCover(c, photo, px, y - 4, pw, ph);
      c.restore();
      ui.rect(px, y - 4, 3, ph, col, a);
    }

    // Identity.
    ui.text(`P${r.rank}`, 72, y + 34, { font: 'mono', size: 20, weight: 700, color: r.rank === 2 ? '#F5C542' : '#9aa3b2', alpha: a });
    ui.text(String(d.number), 72, y + 150, { font: 'display', size: 120, weight: 900, color: col, alpha: a * 0.18 });
    ui.text(String(d.number), 72, y + 150, { font: 'display', size: 120, weight: 900, color: 'none', stroke: col, strokeWidth: 2.5, alpha: a });
    drawTeamTile(ui, d.team, 250, y + 58, 26, a);
    ui.text(d.first.toUpperCase(), 286, y + 64, { font: 'mono', size: 15, weight: 700, tracking: 0.24, color: '#cfd5df', alpha: a });
    ui.text(d.last.toUpperCase(), 248, y + 112, { font: 'title', size: 46, weight: 900, tracking: 0.02, alpha: a });
    ui.text(`${r.points}`, 250, y + 160, { font: 'mono', size: 34, weight: 700, alpha: a });
    const gap = r.rank === 2 ? `AHEAD BY ${r.points - CONTENDERS[1].points}` : `${CONTENDERS[0].points - r.points} BEHIND`;
    ui.text(`PTS · ${gap}`, 330, y + 158, { font: 'mono', size: 15, weight: 700, tracking: 0.12, color: r.rank === 2 ? '#F5C542' : '#9aa3b2', alpha: a });

    // Every score of the season, race by race.
    const pts = pointsByEvent(r.code);
    ui.line(STRIP_X, base, STRIP_X + STRIP_W, base, '#ffffff', 1, 0.14 * a);
    pts.forEach((p, j) => {
      const ev = EVENTS[j];
      const grow = easeOutCubic(clamp((bar - 61.8 - j * 0.13) / 0.6));
      if (grow <= 0) return;
      const w = ev.type === 'sprint' ? COL_W * 0.34 : COL_W * 0.62;
      const x = STRIP_X + (j + 0.5) * COL_W - w / 2;
      if (p === 0) {
        ui.rect(x, base - 2, w, 2, '#ff5a5a', a * 0.5 * grow);
        return;
      }
      const h = (p / 25) * MAX_H * grow;
      const won = ev.classification[0].driver === r.code;
      ui.rect(x, base - h, w, h, col, a * (ev.type === 'sprint' ? 0.55 : 0.9));
      if (won) ui.rect(x, base - h - 4, w, 3, '#F5C542', a * grow);
      ui.text(String(p), x + w / 2, base - h - 9, { font: 'mono', size: 11, weight: 700, align: 'center', color: '#cdd3dd', alpha: a * grow });
    });

    // On its bass pulse, the block speaks.
    if (hi > 0) {
      const sinceTxt = `${since[r.code]} PTS SINCE THE SUMMER BREAK${since[r.code] === mostSince ? ' — MOST OF THE FOUR' : ''}`;
      const record = [`${r.wins} ${r.wins === 1 ? 'WIN' : 'WINS'}`, `${r.podiums} PODIUMS`];
      if (r.sprintWins > 0) record.push(`${r.sprintWins} SPRINT ${r.sprintWins === 1 ? 'WIN' : 'WINS'}`);
      ui.rect(64, y - 6, STRIP_X + STRIP_W - 52, BLOCK_H - 14, col, 0.06 * hi);
      ui.rect(64, y - 6, 3, BLOCK_H - 14, col, hi);
      const k0 = bar - PULSES[i];
      ui.typeText(record.join(' · '), 250, y + 186, clamp((k0 - 0.25) / 0.6), { font: 'mono', size: 13, weight: 700, tracking: 0.1, alpha: hi }, false);
      ui.typeText(sinceTxt, 250, y + 204, clamp((k0 - 0.7) / 0.7), { font: 'mono', size: 13, weight: 700, tracking: 0.1, color: col, alpha: hi }, false);
    }
  }
}
