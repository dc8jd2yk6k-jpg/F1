import season from '../data/season.json';
import { clamp, easeOutCubic, smoothstep } from '../engine/math';
import { type CarCode, project, timingOrderAt } from '../world/RaceSim';
import { teamColor } from '../world/World';
import type { Overlay } from './Overlay';

// Broadcast graphics. Deliberately sober — the race is the show; the HUD is
// the data that gives it stakes.

const css = (code: CarCode) => `#${teamColor(code).getHexString()}`;
const DRIVER = Object.fromEntries([season.leader, ...season.contenders, ...season.others].map((d) => [d.code, d]));

/** "Battle for P2" tower: the four contenders ordered by projected points. */
export function drawTower(ui: Overlay, t: number, opts: { appear: number; x?: number; y?: number; frozen?: boolean; mystery?: number }) {
  const a = clamp(opts.appear);
  if (a <= 0) return;
  const x = opts.x ?? 64;
  const y = opts.y ?? 112;
  const order = timingOrderAt(t);
  const proj = project(order);
  const rowH = 46;
  const w = 380;
  const slide = (1 - easeOutCubic(a)) * -60;

  ui.slant(x + slide, y, w, 38, 0, '#0b0d12', 0.86 * a);
  ui.rect(x + slide, y, 6, 38, '#ffffff', a);
  ui.text('BATTLE FOR P2', x + 20 + slide, y + 26, { font: 'title', size: 20, weight: 700, tracking: 0.14, alpha: a });
  ui.text('PROJECTED', x + w - 14 + slide, y + 26, { font: 'mono', size: 13, weight: 700, color: '#9aa3b2', align: 'right', tracking: 0.12, alpha: a });

  proj.forEach((p, i) => {
    const ra = clamp(a * 1.4 - i * 0.12);
    if (ra <= 0) return;
    const ry = y + 44 + i * rowH;
    const rx = x + (1 - easeOutCubic(ra)) * -40;
    const leader = i === 0;
    ui.rect(rx, ry, w, rowH - 4, leader ? '#151a24' : '#0b0d12', 0.82 * ra);
    ui.rect(rx, ry, 6, rowH - 4, css(p.code), ra);
    ui.text(String(i + 2), rx + 30, ry + 30, { font: 'title', size: 22, weight: 700, align: 'center', alpha: ra, color: leader ? '#fff' : '#c8ced8' });
    ui.text(p.code, rx + 62, ry + 30, { font: 'title', size: 22, weight: 700, tracking: 0.08, alpha: ra });
    ui.text(`P${p.position}`, rx + 150, ry + 29, { font: 'mono', size: 15, weight: 700, color: '#8b93a3', alpha: ra });
    const mystery = clamp(opts.mystery ?? 0);
    const total = mystery > 0.5 ? '???' : String(p.total);
    ui.text(total, rx + 262, ry + 30, { font: 'mono', size: 21, weight: 700, align: 'right', alpha: ra });
    const gap = i === 0 ? 'P2' : `−${proj[0].total - p.total}`;
    ui.text(mystery > 0.5 ? '—' : gap, rx + w - 16, ry + 30, {
      font: 'mono', size: 17, weight: 700, align: 'right', color: leader ? css(p.code) : '#9aa3b2', alpha: ra,
    });
  });
  const foot = y + 44 + proj.length * rowH + 22;
  ui.text('CURRENT PTS + POINTS FOR RUNNING POSITION', x + 2 + slide, foot, { font: 'mono', size: 11, color: '#7b8494', tracking: 0.06, alpha: a * 0.9 });
}

export function drawLap(ui: Overlay, lap: number, total: number, appear: number) {
  const a = clamp(appear);
  if (a <= 0) return;
  const x = 1920 - 64;
  const y = 112;
  ui.slant(x - 200, y, 200, 38, 0, '#0b0d12', 0.86 * a);
  ui.text('LAP', x - 186, y + 26, { font: 'title', size: 18, weight: 700, tracking: 0.14, color: '#9aa3b2', alpha: a });
  ui.text(`${lap}`, x - 70, y + 28, { font: 'mono', size: 24, weight: 700, align: 'right', alpha: a });
  ui.text(`/${total}`, x - 14, y + 28, { font: 'mono', size: 18, weight: 400, align: 'right', color: '#9aa3b2', alpha: a });
  ui.text('YAS MARINA', x - 2, y + 64, { font: 'mono', size: 12, weight: 700, align: 'right', tracking: 0.2, color: '#7b8494', alpha: a });
}

/** Lower-third name strap for a car on screen. */
export function drawStrap(ui: Overlay, code: CarCode, x: number, y: number, appear: number, sub?: string) {
  const a = clamp(appear);
  if (a <= 0) return;
  const d = DRIVER[code];
  const w = 360 * easeOutCubic(a);
  ui.slant(x, y, w, 54, 14, '#0b0d12', 0.88);
  ui.rect(x, y, 8, 54, css(code), a);
  ui.text(String(d.number), x + 46, y + 40, { font: 'display', size: 40, weight: 900, align: 'center', color: css(code), alpha: smoothstep(0.3, 0.7, a) });
  ui.text(d.last.toUpperCase(), x + 84, y + 37, { font: 'title', size: 26, weight: 700, tracking: 0.06, alpha: smoothstep(0.4, 0.9, a) });
  if (sub) ui.text(sub, x + 84 + 4, y + 76, { font: 'mono', size: 14, weight: 700, tracking: 0.1, color: '#c8ced8', alpha: smoothstep(0.6, 1, a) });
}

/** 2026 energy-deployment cue (the regulation's overtake mode). */
export function drawOverride(ui: Overlay, code: CarCode, amount: number, x = 960, y = 940) {
  const a = clamp(amount);
  if (a <= 0) return;
  const w = 320;
  ui.slant(x - w / 2, y, w, 40, 10, css(code), 0.92 * a);
  ui.text(`${code}  ·  OVERRIDE`, x + 5, y + 28, { font: 'title', size: 21, weight: 700, tracking: 0.22, align: 'center', color: '#05070a', alpha: a });
}

/** Thin progress meter, used for the 2026 energy store. */
export function drawEnergy(ui: Overlay, fill: number, segments: number, x: number, y: number, w: number, appear: number, color = '#22E6C8') {
  const a = clamp(appear);
  if (a <= 0) return;
  const gap = 10;
  const sw = (w - gap * (segments - 1)) / segments;
  for (let i = 0; i < segments; i++) {
    const f = clamp(fill * segments - i);
    ui.rect(x + i * (sw + gap), y, sw, 10, '#1a1f29', 0.9 * a);
    ui.rect(x + i * (sw + gap), y, sw * f, 10, color, a);
  }
}

// Moments when the projected P2 changes hands, found once by scanning the
// choreography (pure function of time, so this is deterministic).
let changes: { t: number; code: CarCode }[] | null = null;
export function p2Changes(t0: number, t1: number, holderAt: (t: number) => CarCode) {
  if (!changes) {
    changes = [];
    let prev = holderAt(t0);
    for (let t = t0; t <= t1; t += 1 / 60) {
      const h = holderAt(t);
      if (h !== prev) changes.push({ t, code: h });
      prev = h;
    }
  }
  return changes;
}

/** Centre banner when projected P2 changes hands. */
export function drawP2Banner(ui: Overlay, t: number, list: { t: number; code: CarCode }[], hold = 2.6) {
  for (const c of list) {
    const age = t - c.t;
    if (age < 0 || age > hold) continue;
    const a = Math.min(1, age / 0.12) * (1 - smoothstep(hold - 0.4, hold, age));
    const d = DRIVER[c.code];
    const col = css(c.code);
    const wFull = 760;
    const w = wFull * easeOutCubic(Math.min(1, age / 0.3));
    const x = 960 - w / 2;
    ui.rect(x, 168, w, 74, '#0b0d12', 0.9 * a);
    ui.rect(x, 168, w, 5, col, a);
    ui.text('NEW PROJECTED P2', 960, 198, { font: 'mono', size: 15, weight: 700, tracking: 0.3, align: 'center', color: '#9aa3b2', alpha: a });
    ui.text(`${d.number}  ${d.last.toUpperCase()}`, 960, 234, { font: 'title', size: 32, weight: 900, tracking: 0.08, align: 'center', color: col, alpha: a });
  }
}
