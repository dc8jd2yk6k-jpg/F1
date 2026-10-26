import season from '../data/season.json';
import { clamp, easeOutCubic, easeOutExpo, lerp, smoothstep } from '../engine/math';
import type { CarCode } from '../world/RaceSim';
import { teamColor } from '../world/World';
import type { Overlay } from './Overlay';

// Large typographic cards: the driver "slam" card and helpers to reveal
// numerals as neon outlines.

const DRIVERS = Object.fromEntries([season.leader, ...season.contenders, ...season.others].map((d) => [d.code, d]));
const P2_POINTS = season.contenders[0].points;
export const hex = (code: CarCode) => `#${teamColor(code).getHexString()}`;

export function gapLabel(code: CarCode) {
  const d = DRIVERS[code];
  const gap = P2_POINTS - d.points;
  return gap === 0 ? 'P2' : `−${gap}`;
}

/** Outline numeral drawn on like light painting (`p` 0..1), with a glow. */
export function neonNumber(ui: Overlay, text: string, x: number, y: number, size: number, color: string, p: number, alpha = 1, align: CanvasTextAlign = 'center') {
  if (p <= 0 || alpha <= 0) return;
  const c = ui.ctx;
  c.save();
  const L = size * 6;
  c.setLineDash([L, L]);
  c.lineDashOffset = L * (1 - clamp(p));
  ui.text(text, x, y, { font: 'display', size, weight: 900, align, color: 'none', stroke: color, strokeWidth: size * 0.012 + 1.5, glow: color, glowBlur: 28, alpha });
  c.restore();
  const fill = smoothstep(0.75, 1, p) * 0.12 * alpha;
  if (fill > 0) ui.text(text, x, y, { font: 'display', size, weight: 900, align, color, alpha: fill });
}

/** The Grid act's driver slam: number, name, points, gap to P2. `k` is 0..1 through the bar. */
export function driverSlam(ui: Overlay, code: CarCode, k: number) {
  const d = DRIVERS[code];
  const col = hex(code);
  const inA = clamp(k / 0.04);
  const out = 1 - smoothstep(0.9, 1, k);
  const a = inA * out;
  if (a <= 0) return;
  const s = lerp(1.14, 1, easeOutExpo(k / 0.35));
  const x = 120;
  ui.text(String(d.number), x - 10, 610, {
    font: 'display', size: 420 * s, weight: 900, color: col, alpha: a * 0.18, align: 'left',
  });
  ui.text(String(d.number), x - 10, 610, {
    font: 'display', size: 420 * s, weight: 900, color: 'none', stroke: col, strokeWidth: 3, alpha: a, align: 'left', glow: col, glowBlur: 20,
  });
  const nameP = easeOutCubic(clamp((k - 0.06) / 0.25));
  ui.wipeText(d.first.toUpperCase(), x, 700, nameP, { font: 'title', size: 34, weight: 600, tracking: 0.32, color: '#cfd5df', alpha: a });
  ui.wipeText(d.last.toUpperCase(), x - 4, 790, nameP, { font: 'title', size: 100, weight: 900, tracking: 0.02, alpha: a });
  const dataP = clamp((k - 0.2) / 0.3);
  ui.typeText(`${d.points} PTS`, x, 858, dataP, { font: 'mono', size: 34, weight: 700, alpha: a }, false);
  const gap = gapLabel(code);
  const chipA = a * smoothstep(0.35, 0.45, k);
  if (chipA > 0) {
    const w = ui.measure(gap, { font: 'mono', size: 30, weight: 700 }) + 30;
    ui.rect(x + 210, 826, w, 44, col, chipA);
    ui.text(gap, x + 210 + w / 2, 859, { font: 'mono', size: 30, weight: 700, align: 'center', color: '#05070a', alpha: chipA });
  }
}
