import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeOutCubic, smoothstep } from '../engine/math';
import { CHAMPION, CLINCHED_AT, EVENTS, POINTS_LEFT, RACES_LEFT, SEASON, driver, driverColor } from '../leaderboard/data';
import { FULL, drawBoard } from '../leaderboard/Board';
import { drawTeamTile } from '../leaderboard/logos';
import { LIGHTS_OUT, drawGantry, gridOffset, launch } from '../leaderboard/Opening';
import { TABLES } from '../leaderboard/model';
import { PANEL_W, PANEL_X, drawHeader, drawRemaining, drawRoundStrip, drawTitleHeader, drawWeekend } from '../leaderboard/Panels';
import { SLOTS, SUMMER_BREAK, TODAY, stateAt } from '../leaderboard/schedule';
import type { Overlay } from '../overlay/Overlay';
import { drawBackdropCredit, drawSoundCredit, drawWinnerCard } from '../photos/credits';
import { LEGS, legAt, venueLayers } from '../photos/venues';
import { backdrop, breath, calmPost } from './common';

// Bars 6–60: the season itself, one round at a time, from Melbourne to
// Austin. Two holds are cut into the music: the song's dip is the summer
// break, and after Austin the board settles on today's standings with the
// P2 fight bracketed.

const HUN = SLOTS.findIndex((s) => EVENTS[s.event].code === 'HUN');
/** The title is clinched once the deciding Grand Prix's rows have settled. */
const CLINCH = SLOTS.find((s) => EVENTS[s.event].code === CLINCHED_AT && EVENTS[s.event].type === 'race') ?? null;
export const CHAMPION_FROM = CLINCH ? CLINCH.bar + 1 : Infinity;

export class Season implements Act {
  readonly sections = ['verse', 'build', 'hook1', 'dip', 'hook2'] as const;
  setup(_e: Engine) {}

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    calmPost(post);
    backdrop(f, 0, 0.05, venueLayers(bar));
    const leg = LEGS[legAt(bar)];
    if (leg) drawBackdropCredit(ui, leg.photo, smoothstep(leg.from, leg.from + 0.3, bar));
    // The launch you hear at lights out is a real recording: credited while it plays.
    drawSoundCredit(ui, smoothstep(LIGHTS_OUT, LIGHTS_OUT + 0.15, bar) * (1 - smoothstep(LIGHTS_OUT + 1.3, LIGHTS_OUT + 1.6, bar)));

    const s = stateAt(t);
    const inBreak = bar >= SUMMER_BREAK.from && bar < SUMMER_BREAK.to;
    const inToday = bar >= TODAY.from;
    const hold = inBreak || inToday;
    // Lights out (bar 6): the grid slots launch into their rows, the dark gantry fades.
    const go = launch(bar);
    drawBoard(ui, s, {
      chips: hold ? 0 : 1, leaderGlow: breath(t), champion: bar >= CHAMPION_FROM ? CHAMPION ?? undefined : undefined,
      ...(go < 1 ? { offset: (code: string) => gridOffset(code, go), dataAlpha: go } : {}),
    });
    drawGantry(ui, 0, 1 - smoothstep(LIGHTS_OUT, LIGHTS_OUT + 0.35, bar));

    const ev = EVENTS[s.k];
    drawRoundStrip(ui, ev.round, hold ? 0 : ev.round);

    if (inBreak) {
      const age = bar - SUMMER_BREAK.from;
      const after = TABLES[SLOTS[HUN].event + 1];
      const lead = after[0].points - after[1].points;
      drawTitleHeader(ui, `AFTER ROUND ${ev.round} OF ${SEASON.totalRounds} · SUMMER BREAK`,
        `HALFWAY: ${driver(after[0].code).last.toUpperCase()} LEADS BY ${lead}`, age);
      this.winsPanel(ui, after, age);
    } else if (inToday) {
      const age = bar - TODAY.from;
      const table = TABLES[TABLES.length - 1];
      const p2 = table.slice(1, 5);
      const spread = p2[0].points - p2[p2.length - 1].points;
      drawTitleHeader(ui, `TODAY · AFTER ROUND ${ev.round} OF ${SEASON.totalRounds}`, `THE FIGHT FOR SECOND: ${spread} POINTS`, age);
      this.bracket(ui, spread, p2.length, age);
      ui.text('STILL TO RACE', PANEL_X, 178, { font: 'mono', size: 14, weight: 700, tracking: 0.24, color: '#8d96a6', alpha: smoothstep(0, 0.3, age) });
      ui.line(PANEL_X, 192, PANEL_X + PANEL_W, 192, '#ffffff', 1, 0.12 * smoothstep(0, 0.3, age));
      drawRemaining(ui, PANEL_X, 212, age);
      const a = smoothstep(0.6, 1.0, age);
      ui.text(`${POINTS_LEFT} POINTS LEFT`, PANEL_X, 530, { font: 'title', size: 34, weight: 900, tracking: 0.04, alpha: a });
      ui.text(`${RACES_LEFT} GRANDS PRIX · NO SPRINTS`, PANEL_X, 566, { font: 'mono', size: 15, weight: 700, tracking: 0.14, color: '#9aa3b2', alpha: a });
      const note = CHAMPION
        ? `${driver(CHAMPION).last.toUpperCase()} IS CHAMPION · SECOND IS STILL OPEN`
        : SEASON.clinchNote.toUpperCase();
      ui.text(note, PANEL_X, 612, { font: 'mono', size: 13, weight: 700, tracking: 0.1, color: '#F5C542', alpha: smoothstep(1.2, 1.6, age) });
    } else {
      drawHeader(ui, ev, s.age);
      drawWeekend(ui, ev, s.age);
      drawWinnerCard(ui, ev, s.age);
      if (CLINCH && s.slot === CLINCH) this.championBanner(ui, bar - CHAMPION_FROM);
    }
  }

  /** The title, clinched: a gold card over the quiet lower half of the board. */
  private championBanner(ui: Overlay, age: number) {
    if (age < 0 || !CHAMPION) return;
    const a = smoothstep(0, 0.2, age);
    const p = easeOutCubic(clamp(age / 0.4));
    const d = driver(CHAMPION);
    const ev = EVENTS[CLINCH!.event];
    const pos = ev.classification.find((e) => e.driver === CHAMPION)?.pos;
    const pts = TABLES[CLINCH!.event + 1].find((r) => r.code === CHAMPION)!.points;
    const x = 600;
    const y = 660;
    const w = 640;
    const h = 236;
    ui.rect(x, y, w, h, '#05070a', 0.86 * a);
    ui.line(x, y, x + w * p, y, '#F5C542', 3, a);
    ui.line(x + w * (1 - p), y + h, x + w, y + h, '#F5C542', 3, a);
    ui.text(`${SEASON.season} WORLD CHAMPION`, x + 32, y + 54, { font: 'mono', size: 18, weight: 700, tracking: 0.3, color: '#F5C542', alpha: a });
    ui.wipeText(`${d.first} ${d.last}`.toUpperCase(), x + 28, y + 134, p, { font: 'title', size: 62, weight: 900, tracking: 0.02, alpha: a });
    const where = ev.name.replace(' Grand Prix', '').toUpperCase();
    ui.text(`${pos ? `P${pos} IN ${where} · ` : ''}${pts} PTS · ${RACES_LEFT} RACES TO SPARE`, x + 32, y + 186,
      { font: 'mono', size: 15, weight: 700, tracking: 0.12, color: '#d6dbe4', alpha: a * smoothstep(0.2, 0.5, age) });
  }

  /** Halfway snapshot: who has won what. */
  private winsPanel(ui: Overlay, table: (typeof TABLES)[number], age: number) {
    const a = smoothstep(0, 0.3, age);
    ui.text('GRAND PRIX WINS SO FAR', PANEL_X, 178, { font: 'mono', size: 14, weight: 700, tracking: 0.24, color: '#8d96a6', alpha: a });
    ui.line(PANEL_X, 192, PANEL_X + PANEL_W, 192, '#ffffff', 1, 0.12 * a);
    const winners = table.filter((r) => r.wins > 0).sort((x, y) => y.wins - x.wins);
    winners.forEach((r, i) => {
      const ra = easeOutCubic(clamp((age - 0.1 - i * 0.08) / 0.3));
      const y = 230 + i * 58;
      const col = driverColor(r.code);
      ui.rect(PANEL_X, y - 22, 5, 30, col, ra);
      drawTeamTile(ui, driver(r.code).team, PANEL_X + 12, y - 7, 28, ra);
      ui.text(driver(r.code).last.toUpperCase(), PANEL_X + 50, y, { font: 'title', size: 22, weight: 700, alpha: ra });
      for (let w = 0; w < r.wins; w++) ui.rect(PANEL_X + 230 + w * 26, y - 18, 18, 22, col, ra * 0.95);
      ui.text(String(r.wins), PANEL_X + PANEL_W, y, { font: 'mono', size: 22, weight: 700, align: 'right', alpha: ra });
    });
  }

  /** Gold bracket over championship rows 2–5. */
  private bracket(ui: Overlay, spread: number, n: number, age: number) {
    const a = smoothstep(0.2, 0.6, age);
    if (a <= 0) return;
    const L = FULL;
    const y0 = L.y + L.rowH * 1 + 4;
    const y1 = L.y + L.rowH * (1 + n) - 4;
    const x = 1236;
    const grow = easeOutCubic(clamp((age - 0.2) / 0.5));
    const ym = (y0 + y1) / 2;
    ui.line(x, ym - (ym - y0) * grow, x, ym + (y1 - ym) * grow, '#F5C542', 2, a);
    ui.line(x - 14, y0, x, y0, '#F5C542', 2, a * grow);
    ui.line(x - 14, y1, x, y1, '#F5C542', 2, a * grow);
    ui.text(`${spread} PTS`, x - 26, ym + 2, { font: 'display', size: 54, weight: 900, align: 'right', color: '#F5C542', alpha: a });
    ui.text(`${n} DRIVERS FOR P2`, x - 26, ym + 30, { font: 'mono', size: 13, weight: 700, tracking: 0.14, align: 'right', color: '#F5C542', alpha: a });
  }
}
