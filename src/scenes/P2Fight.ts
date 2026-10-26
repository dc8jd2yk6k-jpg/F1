import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from '../engine/math';
import { EVENTS, RACES_LEFT, driver, driverColor } from '../leaderboard/data';
import { drawBoard } from '../leaderboard/Board';
import { drawTeamTile } from '../leaderboard/logos';
import { FINAL, pointsByEvent, pointsSince } from '../leaderboard/model';
import { drawTitleHeader } from '../leaderboard/Panels';
import { stateAt } from '../leaderboard/schedule';
import type { Overlay } from '../overlay/Overlay';
import { background, calmPost } from './common';

// Bars 61–82, the breakdown: the fight for P2, up close. The board narrows
// to championship places 2–5 and each contender's season unrolls as a strip
// of every score — race by race, sprint by sprint. On the four bass pulses
// (bars 67, 71, 75, 79) one driver at a time is brought forward with what the
// data says about them.

const CONTENDERS = FINAL.slice(1, 5);
const PULSES = [67, 71, 75, 79];
const BREAK_AT = EVENTS.findIndex((e) => e.code === 'NED');
const STRIP_X = 780;
const STRIP_W = 1068;
const BLOCK_Y = 176;
const BLOCK_H = 214;
const COL_W = STRIP_W / EVENTS.length;
const MAX_H = 112;

const since = Object.fromEntries(CONTENDERS.map((r) => [r.code, pointsSince(r.code, BREAK_AT)]));
const mostSince = Math.max(...Object.values(since));

export class P2Fight implements Act {
  readonly sections = ['breakdown'] as const;
  setup(_e: Engine) {}

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    calmPost(post);
    const bg = background(f.aspect);
    bg.set(t, 0, 0.05);
    f.draw(bg.scene, bg.camera);

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

    const active = PULSES.findIndex((p) => bar >= p && bar < p + 4);
    this.codesRow(ui, a);
    CONTENDERS.forEach((r, i) => {
      const focus = active < 0 ? 1 : i === active ? 1 : 0.32;
      const hi = active === i ? smoothstep(PULSES[i], PULSES[i] + 0.3, bar) * (1 - smoothstep(PULSES[i] + 3.75, PULSES[i] + 4, bar)) : 0;
      this.block(ui, r, i, bar, a, lerp(1, focus, smoothstep(66.7, 67.1, bar)), hi);
    });
    // Summer-break divider through the strips.
    const xb = STRIP_X + BREAK_AT * COL_W;
    ui.line(xb, BLOCK_Y - 4, xb, BLOCK_Y + BLOCK_H * 4 - 10, '#ffffff', 1, 0.16 * a);
    ui.text('SUMMER BREAK', xb + 6, BLOCK_Y + BLOCK_H * 4 - 14, { font: 'mono', size: 10, weight: 700, tracking: 0.16, color: '#6f7a8c', alpha: a });
    // Today marker at the end of the strips.
    ui.text(`AFTER R${EVENTS.at(-1)!.round}`, STRIP_X + STRIP_W, BLOCK_Y + BLOCK_H * 4 - 14, {
      font: 'mono', size: 10, weight: 700, tracking: 0.16, align: 'right', color: '#6f7a8c', alpha: a,
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
