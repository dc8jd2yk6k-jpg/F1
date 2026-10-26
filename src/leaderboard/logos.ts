import { siAstonmartin, siAudi, siCadillac, siF1, siFerrari, siMclaren, siRedbull } from 'simple-icons';
import type { Overlay } from '../overlay/Overlay';

// Brand marks, from the simple-icons project (CC0 path data; the marks
// themselves are trademarks of their owners, used here to identify teams).
// Teams without a mark in that set get a short code in the same tile, so
// every row reads the same way. Never substitute one team's mark for another's.

interface Mark {
  path: string;
  title: string;
  hex: string;
}

const MARKS: Record<string, Mark | null> = {
  ferrari: siFerrari,
  mclaren: siMclaren,
  redbull: siRedbull,
  astonmartin: siAstonmartin,
  audi: siAudi,
  cadillac: siCadillac,
  mercedes: null,
  williams: null,
  haas: null,
  alpine: null,
  racingbulls: null,
};

/** Fallback codes for teams without a mark. */
export const TEAM_CODES: Record<string, string> = {
  mercedes: 'MER',
  williams: 'WIL',
  haas: 'HAA',
  alpine: 'ALP',
  racingbulls: 'RB',
};

export const F1_MARK: Mark = siF1;
export const hasMark = (team: string) => !!MARKS[team];
export const markFor = (team: string) => MARKS[team] ?? null;

const cache = new Map<string, Path2D>();
function path2d(m: Mark) {
  let p = cache.get(m.title);
  if (!p) {
    p = new Path2D(m.path);
    cache.set(m.title, p);
  }
  return p;
}

/** Draw a simple-icons mark (24×24 design box) with its top-left at (x, y). */
export function drawMark(ui: Overlay, m: Mark, x: number, y: number, size: number, color: string, alpha = 1) {
  if (alpha <= 0.003) return;
  const c = ui.ctx;
  c.save();
  c.globalAlpha = Math.min(1, alpha);
  c.translate(x, y);
  c.scale(size / 24, size / 24);
  c.fillStyle = color;
  c.fill(path2d(m));
  c.restore();
}

/** A team's identity tile: its mark in white, or its code if it has none. */
export function drawTeamTile(ui: Overlay, team: string, x: number, cy: number, size: number, alpha = 1) {
  if (alpha <= 0.003) return;
  const m = MARKS[team];
  ui.rect(x, cy - size / 2, size, size, '#ffffff', 0.07 * alpha);
  if (m) {
    const inner = size * 0.74;
    drawMark(ui, m, x + (size - inner) / 2, cy - inner / 2, inner, '#f2f4f7', alpha);
  } else {
    const code = TEAM_CODES[team] ?? '';
    ui.text(code, x + size / 2, cy + size * 0.17, {
      font: 'mono', size: size * (code.length > 2 ? 0.34 : 0.42), weight: 700, align: 'center', color: '#dfe3ea', alpha,
    });
  }
}
