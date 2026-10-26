import { clamp, easeOutBack, easeOutCubic, lerp, smoothstep } from '../engine/math';
import type { Overlay } from '../overlay/Overlay';
import { driver, driverColor } from './data';
import { drawTeamTile } from './logos';
import type { BoardState, DriverState } from './schedule';

// The championship board: one row per driver, a team-coloured bar on a
// shared points axis, count-up totals, this round's "+N" chip and rank
// arrows. Pure drawing — everything comes from a BoardState.

export interface Layout {
  x: number;
  y: number;
  rowH: number;
  barX: number;
  barMaxW: number;
}

export const FULL: Layout = { x: 72, y: 178, rowH: 37.6, barX: 392, barMaxW: 760 };

export interface BoardOptions {
  layout?: Layout;
  /** 0..1 visibility of the whole board. */
  alpha?: number;
  /** Per-driver opacity multiplier (focus/dimming). */
  dim?: (code: string) => number;
  /** Visibility of the "+N" chips and rank arrows (they belong to the current round). */
  chips?: number;
  /** Rows revealed so far, top to bottom (intro wipe). */
  reveal?: number;
  /** Gentle breathing glow on the leader (0..1, smoothed — not per beat). */
  leaderGlow?: number;
}

function niceStep(max: number) {
  const raw = max / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

export function axisMaxFor(leader: number) {
  return Math.max(40, leader * 1.06);
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawAxis(ui: Overlay, L: Layout, axisMax: number, rows: number, alpha: number) {
  if (alpha <= 0) return;
  const step = niceStep(axisMax);
  const top = L.y - 18;
  const bottom = L.y + rows * L.rowH;
  for (let v = step; v < axisMax; v += step) {
    const x = L.barX + (v / axisMax) * L.barMaxW;
    const edge = smoothstep(0.98, 0.9, v / axisMax);
    ui.line(x, top + 8, x, bottom, '#ffffff', 1, 0.06 * alpha * edge);
    ui.text(String(v), x, top, { font: 'mono', size: 12, weight: 700, align: 'center', color: '#6f7a8c', alpha: alpha * edge });
  }
}

export function drawBoard(ui: Overlay, s: BoardState, opts: BoardOptions = {}) {
  const L = opts.layout ?? FULL;
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0) return;
  const axisMax = axisMaxFor(s.leaderPoints);
  drawAxis(ui, L, axisMax, s.rows.length, alpha);
  const ctx = ui.ctx;
  // Draw from the bottom up so rows rising through the table sit on top.
  const rows = [...s.rows].sort((a, b) => b.pos - a.pos);
  for (const r of rows) drawRow(ui, ctx, r, L, axisMax, s, opts, alpha);
}

function drawRow(ui: Overlay, ctx: CanvasRenderingContext2D, r: DriverState, L: Layout, axisMax: number, s: BoardState, opts: BoardOptions, alpha: number) {
  const d = driver(r.code);
  const col = driverColor(r.code);
  const reveal = opts.reveal === undefined ? 1 : clamp(opts.reveal - (r.pos - 1));
  if (reveal <= 0) return;
  // Rows in motion soften slightly so passing labels don't fight each other.
  const motion = Math.min(1, Math.abs(r.pos - r.rank) * 2) * Math.min(1, Math.abs(r.pos - r.prevRank) * 2);
  const a = alpha * (opts.dim ? opts.dim(r.code) : 1) * easeOutCubic(reveal) * (1 - 0.45 * motion);
  if (a <= 0.003) return;
  const y = L.y + (r.pos - 1) * L.rowH;
  const slide = (1 - easeOutCubic(reveal)) * -40;
  const cy = y + L.rowH / 2;
  const barH = L.rowH * 0.62;
  const moving = Math.abs(r.pos - Math.round(r.pos)) > 0.02;
  const displayRank = Math.round(r.pos);

  // Motion ghost while a row is changing places.
  if (moving) {
    const from = L.y + (r.prevRank - 1) * L.rowH + L.rowH / 2;
    const g = ctx.createLinearGradient(0, from, 0, cy);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(1, rgba(col, 0.28 * a));
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(L.x + 54 + slide, Math.min(from, cy), 6, Math.abs(cy - from));
    ctx.restore();
  }

  const leader = displayRank === 1 && s.leaderPoints > 0;
  ui.text(String(displayRank), L.x + 34 + slide, cy + 7, {
    font: 'mono', size: 19, weight: 700, align: 'right', color: leader ? '#F5C542' : '#cdd3dd', alpha: a,
  });
  // Rank change arrow for the current round.
  const chips = opts.chips ?? 1;
  const change = r.prevRank - r.rank;
  if (change !== 0 && chips > 0 && s.k >= 0) {
    const up = change > 0;
    const ca = a * chips * smoothstep(0.35, 0.6, s.age / Math.max(0.6, s.slot?.bars ?? 1));
    ui.text(`${up ? '▲' : '▼'}${Math.abs(change)}`, L.x + 44 + slide, cy + 6, {
      font: 'mono', size: 12, weight: 700, color: up ? '#3ee08f' : '#ff5a5a', alpha: ca,
    });
  }
  ui.rect(L.x + 72 + slide, cy - barH / 2, 5, barH, col, a);
  drawTeamTile(ui, d.team, L.x + 82 + slide, cy, 24, a);
  ui.text(String(d.number), L.x + 136 + slide, cy + 6, { font: 'mono', size: 14, weight: 700, align: 'right', color: '#7b8596', alpha: a });
  ui.text(d.last.toUpperCase(), L.x + 144 + slide, cy + 7, { font: 'title', size: 19, weight: 700, tracking: 0.04, alpha: a });
  if (d.standIn) ui.text('RES', L.x + 144 + ui.measure(d.last.toUpperCase(), { font: 'title', size: 19, weight: 700, tracking: 0.04 }) + 10 + slide, cy + 6,
    { font: 'mono', size: 11, weight: 700, color: '#7b8596', alpha: a });

  // The bar.
  const w = Math.max(0, (r.points / axisMax) * L.barMaxW);
  const bx = L.barX + slide;
  if (w > 0.5) {
    const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
    g.addColorStop(0, rgba(col, 0.35 * a));
    g.addColorStop(1, rgba(col, 0.95 * a));
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(bx, cy - barH / 2, w, barH, [0, barH / 2, barH / 2, 0]);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.22 * a})`;
    ctx.fillRect(bx, cy - barH / 2, w, 1.5);
    // Soft glow at the tip; the leader's breathes slowly with the bass swell.
    const glow = 0.35 + (leader ? 0.35 * (opts.leaderGlow ?? 0) : 0);
    const rg = ctx.createRadialGradient(bx + w, cy, 0, bx + w, cy, barH * 2.2);
    rg.addColorStop(0, rgba(col, glow * a));
    rg.addColorStop(1, rgba(col, 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg;
    ctx.fillRect(bx + w - barH * 2.2, cy - barH * 2.2, barH * 4.4, barH * 4.4);
    ctx.restore();
  }

  // Points (count-up) and this round's chip.
  const pts = Math.round(r.points);
  const px = bx + w + 12;
  ui.text(String(pts), px, cy + 7, { font: 'mono', size: 19, weight: 700, alpha: a });
  if (r.delta > 0 && chips > 0 && s.k >= 0) {
    const age = s.age;
    const life = s.slot?.bars ?? 2;
    const pop = easeOutBack(clamp(age / 0.25));
    const fade = 1 - smoothstep(life - 0.2, life, age);
    const ca = a * chips * clamp(age / 0.08) * fade;
    if (ca > 0.01) {
      const label = `+${r.delta}`;
      const tw = ui.measure(label, { font: 'mono', size: 15, weight: 700 }) + 14;
      const cx = px + ui.measure(String(pts), { font: 'mono', size: 19, weight: 700 }) + 10;
      const ch = 22 * lerp(0.6, 1, pop);
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(cx, cy - ch / 2, tw, ch, 4);
      ctx.fill();
      ctx.restore();
      ui.text(label, cx + tw / 2, cy + 5.5, { font: 'mono', size: 15, weight: 700, align: 'center', color: '#05070a', alpha: ca });
    }
  }
}
