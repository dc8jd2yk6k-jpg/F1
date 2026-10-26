import { clamp, easeOutCubic, smoothstep } from '../engine/math';
import type { Overlay } from '../overlay/Overlay';
import { EVENTS, SEASON, type SeasonEvent, driver, shortDate, teamAt, teamColor } from './data';

// Header, round strip, the "this weekend" classification panel and the
// start lights. Pure drawing.

export const PANEL_X = 1360;
export const PANEL_W = 488;

/** Round number, Grand Prix name, date, sprint tag. */
export function drawHeader(ui: Overlay, ev: SeasonEvent, age: number, alpha = 1) {
  if (alpha <= 0) return;
  const p = easeOutCubic(clamp(age / 0.35));
  const label = `ROUND ${String(ev.round).padStart(2, '0')} / ${SEASON.totalRounds}`;
  ui.text(label, 72, 64, { font: 'mono', size: 16, weight: 700, tracking: 0.18, color: '#8d96a6', alpha });
  let x = 72 + ui.measure(label, { font: 'mono', size: 16, weight: 700, tracking: 0.18 }) + 18;
  if (ev.type === 'sprint') {
    ui.rect(x, 47, 88, 24, '#F5C542', alpha);
    ui.text('SPRINT', x + 44, 65, { font: 'mono', size: 14, weight: 700, tracking: 0.14, align: 'center', color: '#05070a', alpha });
    x += 102;
  }
  ui.text(shortDate(ev.date), x, 64, { font: 'mono', size: 16, weight: 700, tracking: 0.12, color: '#8d96a6', alpha });
  ui.wipeText(ev.name.toUpperCase(), 70, 118, p, { font: 'title', size: 44, weight: 900, tracking: 0.03, alpha });
}

/** Free-text header for holds (summer break, today, intro). */
export function drawTitleHeader(ui: Overlay, kicker: string, title: string, age: number, alpha = 1) {
  if (alpha <= 0) return;
  ui.text(kicker, 72, 64, { font: 'mono', size: 16, weight: 700, tracking: 0.18, color: '#8d96a6', alpha });
  ui.wipeText(title, 70, 118, easeOutCubic(clamp(age / 0.4)), { font: 'title', size: 44, weight: 900, tracking: 0.03, alpha });
}

/** One segment per round of the calendar: run, current, still to come. */
export function drawRoundStrip(ui: Overlay, roundsDone: number, current: number, alpha = 1) {
  if (alpha <= 0) return;
  const n = SEASON.totalRounds;
  const segW = 15;
  const gap = 5;
  const w = n * segW + (n - 1) * gap;
  const x0 = 1848 - w;
  for (let i = 0; i < n; i++) {
    const r = i + 1;
    const x = x0 + i * (segW + gap);
    if (r === current) ui.rect(x, 52, segW, 10, '#F5C542', alpha);
    else if (r <= roundsDone) ui.rect(x, 52, segW, 10, '#dfe4ec', alpha * 0.85);
    else ui.rect(x, 52, segW, 10, '#2a3140', alpha);
  }
  ui.text(`${SEASON.season} DRIVERS' CHAMPIONSHIP`, 1848, 92, { font: 'mono', size: 13, weight: 700, tracking: 0.18, align: 'right', color: '#6f7a8c', alpha });
}

/** The current event's points scorers, in finishing order. */
export function drawWeekend(ui: Overlay, ev: SeasonEvent, age: number, alpha = 1) {
  if (alpha <= 0) return;
  const x = PANEL_X;
  const y0 = 178;
  ui.text('THIS WEEKEND', x, y0, { font: 'mono', size: 14, weight: 700, tracking: 0.24, color: '#8d96a6', alpha });
  ui.text(ev.type === 'sprint' ? 'SPRINT · POINTS' : 'GRAND PRIX · POINTS', x + PANEL_W, y0, {
    font: 'mono', size: 14, weight: 700, tracking: 0.12, align: 'right', color: ev.type === 'sprint' ? '#F5C542' : '#8d96a6', alpha,
  });
  ui.line(x, y0 + 14, x + PANEL_W, y0 + 14, '#ffffff', 1, 0.12 * alpha);
  const rowH = ev.type === 'sprint' ? 50 : 44;
  ev.classification.forEach((e, i) => {
    const ra = alpha * easeOutCubic(clamp((age - 0.05 - i * 0.045) / 0.25));
    if (ra <= 0) return;
    const y = y0 + 34 + i * rowH;
    const d = driver(e.driver);
    const team = teamAt(e.driver, ev);
    const col = teamColor(team);
    const slide = (1 - ra) * 30;
    if (i === 0) ui.rect(x - 8 + slide, y - 4, PANEL_W + 16, rowH - 6, '#ffffff', 0.05 * ra);
    ui.text(`P${e.pos}`, x + slide, y + 22, { font: 'mono', size: 17, weight: 700, color: i < 3 ? '#F5C542' : '#9aa3b2', alpha: ra });
    ui.rect(x + 54 + slide, y + 4, 5, 24, col, ra);
    ui.text(d.last.toUpperCase(), x + 70 + slide, y + 23, { font: 'title', size: 21, weight: 700, tracking: 0.03, alpha: ra });
    if (e.team && e.team !== d.team) {
      const nw = ui.measure(d.last.toUpperCase(), { font: 'title', size: 21, weight: 700, tracking: 0.03 });
      ui.text(`FOR ${SEASON.teams[team as keyof typeof SEASON.teams].name.toUpperCase()}`, x + 80 + nw + slide, y + 22, {
        font: 'mono', size: 11, weight: 700, tracking: 0.08, color: col, alpha: ra,
      });
    }
    ui.text(`+${e.pts}`, x + PANEL_W + slide, y + 23, { font: 'mono', size: 21, weight: 700, align: 'right', color: col, alpha: ra });
  });
}

/** Five start lights, F1-style, lit one per bar of the intro. */
export function drawStartLights(ui: Overlay, lit: number, x: number, y: number, size: number, alpha = 1) {
  if (alpha <= 0) return;
  const c = ui.ctx;
  const gap = size * 1.35;
  const x0 = x - (gap * 4) / 2;
  for (let i = 0; i < 5; i++) {
    const on = clamp(lit - i);
    const cx = x0 + i * gap;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = '#0b0d12';
    c.beginPath();
    c.roundRect(cx - size * 0.62, y - size * 1.25, size * 1.24, size * 2.5, size * 0.2);
    c.fill();
    for (const dy of [-0.55, 0.55]) {
      c.beginPath();
      c.arc(cx, y + dy * size, size * 0.42, 0, Math.PI * 2);
      c.fillStyle = on > 0 ? `rgba(255,${30 + 20 * (1 - on)},${30},${0.25 + 0.75 * on})` : '#1d0a0b';
      if (on > 0) {
        c.shadowColor = 'rgba(255,40,40,0.9)';
        c.shadowBlur = size * 0.9 * on;
      }
      c.fill();
      c.shadowBlur = 0;
    }
    c.restore();
  }
}

/** Remaining rounds of the calendar as empty slots. */
export function drawRemaining(ui: Overlay, x: number, y: number, age: number, alpha = 1) {
  if (alpha <= 0) return;
  SEASON.remaining.forEach((r, i) => {
    const ra = alpha * easeOutCubic(clamp((age - i * 0.08) / 0.3));
    const yy = y + i * 54;
    ui.rect(x, yy, PANEL_W, 44, '#ffffff', 0.04 * ra);
    ui.text(`R${r.round}`, x + 14, yy + 29, { font: 'mono', size: 16, weight: 700, color: '#6f7a8c', alpha: ra });
    ui.text(r.name.toUpperCase(), x + 70, yy + 29, { font: 'title', size: 19, weight: 700, tracking: 0.03, alpha: ra });
    ui.text(shortDate(r.date), x + PANEL_W - 52, yy + 29, { font: 'mono', size: 15, weight: 700, align: 'right', color: '#8d96a6', alpha: ra });
    ui.text('?', x + PANEL_W - 14, yy + 30, { font: 'mono', size: 18, weight: 700, align: 'right', color: '#F5C542', alpha: ra });
  });
}

export const LAST_RACE = EVENTS.filter((e) => e.type === 'race').at(-1)!;
export const fadeIn = (age: number, len = 0.3) => smoothstep(0, len, age);
