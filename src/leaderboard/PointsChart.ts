import { clamp, easeInOutCubic, lerp, smoothstep } from '../engine/math';
import type { Overlay } from '../overlay/Overlay';
import { drawCover, photoFor } from '../photos/photos';
import { EVENTS, driver, driverColor } from './data';
import { FINAL, pointsByEvent } from './model';

// The fight for P2 as four racing lines: each contender's cumulative points,
// event by event (Grands Prix and sprints), with the season replayed one
// event per half bar. At the end the view eases in on the last rounds, where
// the four of them are separated by single digits. Pure drawing — the scene
// passes in how far the replay has got and which part of the season to show.

export const CONTENDERS = FINAL.slice(1, 5).map((r) => r.code);

/** CUMULATIVE[code][i] = points after the first i events (i = 0 … EVENTS.length). */
export const CUMULATIVE: Record<string, number[]> = Object.fromEntries(CONTENDERS.map((code) => {
  const out = [0];
  for (const p of pointsByEvent(code)) out.push(out[out.length - 1] + p);
  return [code, out];
}));

const N = EVENTS.length;
const PLOT = { x0: 150, x1: 1600, y0: 214, y1: 948 };
const BREAK_AT = EVENTS.findIndex((e) => e.code === 'NED');
const DASHED = new Set([CONTENDERS.filter((c) => driver(c).team === 'ferrari')[1]]);

export interface ChartView {
  /** Events shown along x: [first, last] in event-count units (0 = before the season). */
  x: [number, number];
  /** Points shown along y. When yMax is omitted it follows the leading line. */
  y: [number, number | null];
}

export interface ChartState {
  /** 0 … N: how many events have been replayed (fractional while a step eases in). */
  progress: number;
  view: ChartView;
  /** Index into CONTENDERS of the driver brought forward, or -1. */
  focus: number;
  alpha: number;
  /** 0..1: the axes and labels drawing on. */
  axes: number;
}

/** Cumulative value of a driver at fractional progress p, easing between events. */
export function valueAt(code: string, p: number) {
  const s = CUMULATIVE[code];
  const i = Math.min(N, Math.floor(p));
  if (i >= N) return s[N];
  return lerp(s[i], s[i + 1], easeInOutCubic(p - i));
}

/** Top of the y-axis while it follows the leading line: headroom for the callout card. */
export const autoTop = (lead: number) => Math.max(50, lead * 1.4);

function niceStep(max: number) {
  const raw = max / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

export function drawPointsChart(ui: Overlay, st: ChartState) {
  const a = st.alpha;
  if (a <= 0.003) return;
  const c = ui.ctx;
  const { x0, x1, y0, y1 } = PLOT;
  const p = st.progress;
  const heads = CONTENDERS.map((code) => ({ code, v: valueAt(code, p) }));
  const lead = Math.max(...heads.map((h) => h.v));
  const yLo = st.view.y[0];
  const yHi = st.view.y[1] ?? autoTop(lead);
  const [xLo, xHi] = st.view.x;
  const X = (i: number) => x0 + ((i - xLo) / (xHi - xLo)) * (x1 - x0);
  const Y = (v: number) => y1 - ((v - yLo) / (yHi - yLo)) * (y1 - y0);
  const ax = a * st.axes;

  // Grid and y labels.
  const step = niceStep(yHi - yLo);
  for (let v = Math.ceil(yLo / step) * step; v <= yHi; v += step) {
    const y = Y(v);
    const edge = smoothstep(y0 - 4, y0 + 30, y);
    ui.line(x0, y, x1, y, '#ffffff', 1, 0.07 * ax * edge);
    ui.text(String(v), x0 - 14, y + 4, { font: 'mono', size: 13, weight: 700, align: 'right', color: '#6f7a8c', alpha: ax * edge });
  }
  // Event codes along x, revealed as the replay reaches them.
  for (let i = 1; i <= N; i++) {
    const x = X(i);
    if (x < x0 - 2 || x > x1 + 2) continue;
    const ev = EVENTS[i - 1];
    const seen = smoothstep(i - 1, i - 0.4, p);
    ui.text(ev.type === 'sprint' ? 'S' : ev.code, x, y1 + 26, {
      font: 'mono', size: 11, weight: 700, align: 'center', color: ev.type === 'sprint' ? '#a08a3c' : '#8d96a6', alpha: ax * (0.35 + 0.65 * seen),
    });
  }
  ui.line(x0, y1, x1, y1, '#ffffff', 1, 0.25 * ax);
  // Summer break.
  const xb = X(BREAK_AT);
  if (xb > x0 && xb < x1) {
    c.save();
    c.setLineDash([4, 6]);
    ui.line(xb, y0, xb, y1, '#ffffff', 1, 0.18 * ax);
    c.restore();
    ui.text('SUMMER BREAK', xb + 8, y0 + 14, { font: 'mono', size: 11, weight: 700, tracking: 0.16, color: '#6f7a8c', alpha: ax });
  }

  // The lines, clipped to the plot.
  c.save();
  c.beginPath();
  c.rect(x0, y0 - 30, x1 - x0 + 12, y1 - y0 + 31);
  c.clip();
  CONTENDERS.forEach((code, k) => {
    const s = CUMULATIVE[code];
    const col = driverColor(code);
    const focus = st.focus === k;
    const la = a * (st.focus < 0 || focus ? 1 : 0.5);
    c.save();
    c.globalAlpha = clamp(la);
    c.strokeStyle = col;
    c.lineWidth = focus ? 5 : 3;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (DASHED.has(code)) c.setLineDash([12, 7]);
    if (focus) {
      c.shadowColor = col;
      c.shadowBlur = 14;
    }
    c.beginPath();
    c.moveTo(X(0), Y(0));
    const whole = Math.floor(p);
    for (let i = 1; i <= Math.min(whole, N); i++) c.lineTo(X(i), Y(s[i]));
    if (whole < N) {
      const f = easeInOutCubic(p - whole);
      c.lineTo(X(whole + f), Y(valueAt(code, p)));
    }
    c.stroke();
    c.restore();
    // Wins: gold dots (Grand Prix) and rings (sprints).
    EVENTS.forEach((ev, j) => {
      if (j + 1 > p || ev.classification[0].driver !== code) return;
      const x = X(j + 1);
      const y = Y(s[j + 1]);
      c.save();
      c.globalAlpha = clamp(la * smoothstep(j + 1, j + 1.3, p));
      c.beginPath();
      c.arc(x, y, ev.type === 'race' ? 6 : 5, 0, Math.PI * 2);
      if (ev.type === 'race') {
        c.fillStyle = '#F5C542';
        c.fill();
      } else {
        c.strokeStyle = '#F5C542';
        c.lineWidth = 2;
        c.stroke();
      }
      c.restore();
    });
  });
  c.restore();

  // Heads: a dot on each line, and a label column just right of the heads
  // (portrait, surname, live total), spread apart so close totals never collide.
  const hx = Math.min(x1, X(p));
  const placed = heads.map((h, k) => ({ ...h, k, y: Y(h.v), ly: Y(h.v) })).sort((m, n) => m.y - n.y);
  const GAP = 54;
  for (let i = 1; i < placed.length; i++) placed[i].ly = Math.max(placed[i].ly, placed[i - 1].ly + GAP);
  const over = placed[placed.length - 1].ly - (y1 - 10);
  if (over > 0) placed.forEach((h) => (h.ly -= over));
  for (const h of placed) {
    const code = h.code;
    const col = driverColor(code);
    const la = a * (st.focus < 0 || st.focus === h.k ? 1 : 0.6);
    c.save();
    c.globalAlpha = clamp(la);
    c.fillStyle = col;
    c.beginPath();
    c.arc(hx, h.y, 6, 0, Math.PI * 2);
    c.fill();
    c.restore();
    const lx = hx + 26;
    ui.line(hx + 7, h.y, lx - 4, h.ly, col, 1.5, la * 0.7);
    const photo = photoFor('driver', code);
    const r = 21;
    if (photo) {
      c.save();
      c.globalAlpha = clamp(la);
      c.beginPath();
      c.arc(lx + r, h.ly, r, 0, Math.PI * 2);
      c.clip();
      drawCover(c, photo, lx, h.ly - r, r * 2, r * 2);
      c.restore();
      c.save();
      c.globalAlpha = clamp(la);
      c.strokeStyle = col;
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(lx + r, h.ly, r, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    const tx = lx + r * 2 + 12;
    ui.text(driver(code).last.toUpperCase(), tx, h.ly - 3, { font: 'title', size: 20, weight: 900, tracking: 0.02, alpha: la });
    ui.text(String(Math.round(h.v)), tx, h.ly + 19, { font: 'mono', size: 18, weight: 700, color: col, alpha: la });
  }
}
