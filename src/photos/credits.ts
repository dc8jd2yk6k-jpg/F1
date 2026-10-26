import { clamp, easeOutCubic, smoothstep } from '../engine/math';
import type { SeasonEvent } from '../leaderboard/data';
import { driver, teamAt, teamColor } from '../leaderboard/data';
import type { Overlay } from '../overlay/Overlay';
import { type Photo, credit, drawCover, photoFor } from './photos';

// Photos on the overlay, always with their credit: the race winner's card
// under the weekend classification, and the credit line for the backdrop.

const CREDIT = { font: 'mono', size: 11, weight: 700, tracking: 0.04 } as const;

/** Credit for the photo behind the board, bottom right. */
export function drawBackdropCredit(ui: Overlay, p: Photo | null, alpha: number) {
  if (!p || alpha <= 0.01) return;
  ui.text(`BACKDROP: ${p.caption.toUpperCase()} · ${credit(p, 'PHOTO')}`, 1848, 1064, { ...CREDIT, align: 'right', color: '#8d96a6', alpha: alpha * 0.9 });
}

export const CARD = { x: 1360, y: 688, w: 488, h: 252 };

/** The winner of this event, in a photo, under the classification. */
export function drawWinnerCard(ui: Overlay, ev: SeasonEvent, age: number, alpha = 1) {
  if (alpha <= 0) return;
  const code = ev.classification[0].driver;
  const p = photoFor('driver', code);
  if (!p) return;
  const reveal = easeOutCubic(clamp((age - 0.12) / 0.45));
  if (reveal <= 0) return;
  const { x, y, w, h } = CARD;
  const col = teamColor(teamAt(code, ev));
  const c = ui.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  c.rect(x, y, w * reveal, h);
  c.clip();
  drawCover(c, p, x, y, w, h);
  const g = c.createLinearGradient(0, y + h * 0.4, 0, y + h);
  g.addColorStop(0, 'rgba(3,4,8,0)');
  g.addColorStop(1, 'rgba(3,4,8,0.88)');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.restore();
  ui.rect(x, y, 5, h, col, alpha * reveal);

  const ta = alpha * smoothstep(0.3, 0.55, age);
  ui.text(ev.type === 'sprint' ? 'SPRINT WINNER' : 'WINNER', x + 22, y + h - 56, { font: 'mono', size: 14, weight: 700, tracking: 0.24, color: '#F5C542', alpha: ta });
  ui.text(driver(code).last.toUpperCase(), x + 20, y + h - 18, { font: 'title', size: 38, weight: 900, tracking: 0.02, alpha: ta });
  ui.text(p.caption.toUpperCase(), x, y + h + 24, { ...CREDIT, color: '#aab2bf', alpha: ta });
  ui.text(credit(p), x, y + h + 42, { ...CREDIT, color: '#7b8596', alpha: ta });
}
