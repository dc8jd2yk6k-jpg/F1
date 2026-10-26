import season from '../data/season.json';
import { clamp, easeInOutSine, smoothstep } from '../engine/math';
import { noise1 } from '../engine/rng';
import { barAt } from '../engine/Timeline';

// The race the video imagines: a deterministic, bar-keyed choreography of
// running order. It is a dramatisation (the deciding race hasn't happened),
// but the "projected P2" it drives is real arithmetic on the real standings:
// current points + the points each car would score finishing in its current
// running position.

export const CAR_CODES = ['ANT', 'RUS', 'HAM', 'VER', 'LEC', 'NOR'] as const;
export type CarCode = (typeof CAR_CODES)[number];
export const CONTENDERS = season.contenders.map((c) => c.code) as CarCode[];

interface OrderKey {
  bar: number;
  order: CarCode[];
  /** Bars taken to complete the position changes into this order. */
  dur: number;
  /** Which side passing cars take (+1 = left of travel). */
  side?: 1 | -1;
}

// Running order (P1 first). Narrative: projected P2 goes
// RUS → HAM (bar 25) → RUS (bar 33) → VER (bar 46, wins it from the front)
// → LEC (bar 56, takes the lead) → photo-finish at bar 60, unresolved.
export const ORDER_KEYS: OrderKey[] = [
  { bar: 1, dur: 0, order: ['ANT', 'RUS', 'HAM', 'VER', 'LEC', 'NOR'] },
  { bar: 24.5, dur: 1.25, side: 1, order: ['ANT', 'HAM', 'RUS', 'VER', 'LEC', 'NOR'] },
  { bar: 28.5, dur: 1.25, side: -1, order: ['ANT', 'HAM', 'RUS', 'LEC', 'VER', 'NOR'] },
  { bar: 32.25, dur: 1.5, side: 1, order: ['ANT', 'RUS', 'HAM', 'LEC', 'VER', 'NOR'] },
  { bar: 40.5, dur: 1.0, side: 1, order: ['ANT', 'RUS', 'HAM', 'VER', 'LEC', 'NOR'] },
  { bar: 42.5, dur: 1.0, side: -1, order: ['ANT', 'RUS', 'VER', 'HAM', 'LEC', 'NOR'] },
  { bar: 44.25, dur: 1.75, side: 1, order: ['VER', 'ANT', 'RUS', 'HAM', 'LEC', 'NOR'] },
  { bar: 48.5, dur: 1.5, side: -1, order: ['VER', 'ANT', 'HAM', 'RUS', 'LEC', 'NOR'] },
  { bar: 52.25, dur: 1.75, side: 1, order: ['VER', 'ANT', 'LEC', 'HAM', 'RUS', 'NOR'] },
  { bar: 55.0, dur: 1.75, side: -1, order: ['LEC', 'VER', 'ANT', 'HAM', 'RUS', 'NOR'] },
];

/** Bars over which the four contenders fan out abreast for the photo-finish. */
export const PHOTO_FINISH = { start: 57, full: 59.5 };
const ABREAST_LANE: Partial<Record<CarCode, number>> = { LEC: 5.4, VER: 1.8, HAM: -1.8, RUS: -5.4 };

export const SPACING = 10;

function keyIndexAt(bar: number) {
  let k = 0;
  for (let i = 0; i < ORDER_KEYS.length; i++) if (ORDER_KEYS[i].bar <= bar) k = i;
  return k;
}

/** Continuous running slot (0 = leading) of a car at song time t. */
export function slotOf(code: CarCode, t: number): number {
  const bar = barAt(t);
  const k = keyIndexAt(bar);
  const key = ORDER_KEYS[k];
  const to = key.order.indexOf(code);
  if (k === 0 || key.dur <= 0) return to;
  const from = ORDER_KEYS[k - 1].order.indexOf(code);
  const p = easeInOutSine(clamp((bar - key.bar) / key.dur));
  return from + (to - from) * p;
}

/** Lateral offset (m, + = left) — overtaking lines plus a little life. */
export function laneOf(code: CarCode, t: number): number {
  const bar = barAt(t);
  const k = keyIndexAt(bar);
  const key = ORDER_KEYS[k];
  let lane = noise1(t * 0.35, CAR_CODES.indexOf(code) * 7.1) * 0.9;
  if (k > 0 && key.dur > 0) {
    const p = clamp((bar - key.bar) / key.dur);
    if (p > 0 && p < 1) {
      const from = ORDER_KEYS[k - 1].order.indexOf(code);
      const to = key.order.indexOf(code);
      const side = key.side ?? 1;
      const arc = Math.sin(Math.PI * p);
      if (to < from) lane += side * 3.4 * arc;
      else if (to > from) lane -= side * 1.3 * arc;
    }
  }
  const pf = smoothstep(PHOTO_FINISH.start, PHOTO_FINISH.full, bar);
  if (pf > 0) {
    const target = ABREAST_LANE[code];
    if (target !== undefined) lane = lane * (1 - pf) + target * pf;
  }
  return lane;
}

/** Metres behind the pace point. */
export function gapOf(code: CarCode, t: number): number {
  const bar = barAt(t);
  let gap = slotOf(code, t) * SPACING + noise1(t * 0.5, 31 + CAR_CODES.indexOf(code)) * 1.2;
  const pf = smoothstep(PHOTO_FINISH.start, PHOTO_FINISH.full, bar);
  if (pf > 0) {
    const abreast = ABREAST_LANE[code] !== undefined;
    // Contenders converge onto one line (tiny stagger keeps it legible);
    // the others fall back out of the picture.
    const target = abreast ? 2 + CONTENDERS.indexOf(code) * 0.35 : 26 + slotOf(code, t) * SPACING;
    gap = gap * (1 - pf) + target * pf;
  }
  return gap;
}

/** Running order at t, P1 first. */
export function orderAt(t: number): CarCode[] {
  return [...CAR_CODES].sort((a, b) => gapOf(a, t) - gapOf(b, t));
}

export interface Projection {
  code: CarCode;
  current: number;
  gained: number;
  total: number;
  position: number;
}

const POINTS = season.racePoints;
const CURRENT: Record<string, number> = Object.fromEntries(
  [season.leader, ...season.contenders, ...season.others].map((d) => [d.code, d.points]),
);

/** Championship projection for the four contenders if the race ended in `order`. */
export function project(order: readonly CarCode[]): Projection[] {
  return CONTENDERS.map((code) => {
    const position = order.indexOf(code) + 1;
    const gained = POINTS[position - 1] ?? 0;
    return { code, current: CURRENT[code], gained, total: CURRENT[code] + gained, position };
  }).sort((a, b) => b.total - a.total || b.current - a.current);
}

/** Integer-slot order (ignores mid-pass ties): what a timing screen would show. */
export function timingOrderAt(t: number): CarCode[] {
  return [...CAR_CODES].sort((a, b) => Math.round(slotOf(a, t)) - Math.round(slotOf(b, t)) || slotOf(a, t) - slotOf(b, t));
}

export const projectedP2At = (t: number) => project(timingOrderAt(t))[0].code;
