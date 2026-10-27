import { clamp, easeOutCubic } from '../engine/math';
import type { Overlay } from '../overlay/Overlay';
import { FULL } from './Board';
import { TABLES } from './model';

// Pieces of the cold open shared by the intro and the first round: the
// start-light gantry, the grid the 23 drivers line up on, and the launch
// that carries each grid slot into its row of the table when the lights go
// out on the bass drop (bar 6).

/** Lamps come on one per half bar (beats 1 and 3), the real one-per-second cadence. */
export const LAMPS_ON = [3, 3.5, 4, 4.5, 5];
export const LIGHTS_OUT = 6;
export const lampsLit = (bar: number) => (bar >= LIGHTS_OUT ? 0 : LAMPS_ON.filter((b) => bar >= b).length);

/** Launch progress 0..1 after lights out. Ease-out: the biggest move lands on the beat. */
export const launch = (bar: number) => easeOutCubic(clamp((bar - LIGHTS_OUT) / 0.45));

// The grid: two staggered columns, entry-list order (race-number order, as
// the table starts). Positions are the row origins the board draws from.
const GRID = { x: [560, 1010], y: 300, step: 62, stagger: 31 };

export function gridSlot(rank: number): [number, number] {
  const i = rank - 1;
  const col = i % 2;
  return [GRID.x[col], GRID.y + Math.floor(i / 2) * GRID.step + col * GRID.stagger];
}

const START_RANK = new Map(TABLES[0].map((r) => [r.code, r.rank]));

/** Row displacement from its table position to its grid slot, scaled by (1 - progress). */
export function gridOffset(code: string, progress: number): [number, number] {
  const rank = START_RANK.get(code) ?? 1;
  const [sx, sy] = gridSlot(rank);
  const rowY = FULL.y + (rank - 1) * FULL.rowH;
  const k = 1 - progress;
  return [(sx - FULL.x) * k, (sy - rowY) * k];
}

/** Painted grid boxes behind the slots. */
export function drawGridBoxes(ui: Overlay, reveal: number, alpha: number) {
  if (alpha <= 0.003) return;
  for (let rank = 1; rank <= TABLES[0].length; rank++) {
    const a = alpha * clamp(reveal - (rank - 1));
    if (a <= 0) continue;
    const [x, y] = gridSlot(rank);
    ui.line(x - 10, y - 4, x + 330, y - 4, '#ffffff', 2, 0.35 * a);
    ui.line(x - 10, y - 4, x - 10, y + 24, '#ffffff', 2, 0.35 * a);
    ui.line(x + 330, y - 4, x + 330, y + 24, '#ffffff', 2, 0.35 * a);
  }
}

/** The start-light gantry: five pods, each with a pair of red lamps. */
export function drawGantry(ui: Overlay, lit: number, alpha = 1) {
  if (alpha <= 0.003) return;
  const c = ui.ctx;
  const W = 104;
  const H = 214;
  const gap = 38;
  const x0 = 960 - (5 * W + 4 * gap) / 2;
  const y0 = 34;
  const r = 30;
  c.save();
  c.globalAlpha = alpha;
  // The beam the pods hang from.
  c.fillStyle = '#0d1016';
  c.fillRect(x0 - 40, y0 + 20, 5 * W + 4 * gap + 80, 26);
  for (let i = 0; i < 5; i++) {
    const x = x0 + i * (W + gap);
    c.fillStyle = '#07090d';
    c.beginPath();
    c.roundRect(x, y0, W, H, 14);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 2;
    c.stroke();
    const on = i < lit;
    for (const cy of [y0 + H * 0.3, y0 + H * 0.72]) {
      const cx = x + W / 2;
      if (on) {
        // Halo first (additive), then the lamp.
        c.save();
        c.globalCompositeOperation = 'lighter';
        const halo = c.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 3.2);
        halo.addColorStop(0, 'rgba(255,40,30,0.55)');
        halo.addColorStop(1, 'rgba(255,40,30,0)');
        c.fillStyle = halo;
        c.fillRect(cx - r * 3.2, cy - r * 3.2, r * 6.4, r * 6.4);
        c.restore();
        const lamp = c.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 0, cx, cy, r);
        lamp.addColorStop(0, '#ffd9d4');
        lamp.addColorStop(0.35, '#ff3a2e');
        lamp.addColorStop(1, '#b0100c');
        c.fillStyle = lamp;
      } else {
        c.fillStyle = '#1a0b0c';
      }
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}
