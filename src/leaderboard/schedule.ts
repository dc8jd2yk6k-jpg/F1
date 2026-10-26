import { easeInOutCubic, clamp } from '../engine/math';
import { barAt } from '../engine/Timeline';
import { EVENTS } from './data';
import { TABLES } from './model';

// The season, cut to the song. Each scoring event owns a span of bars and
// starts on a beat (downbeat or mid-bar): a Grand Prix gets 2–3 bars, a
// sprint 1. Two holds are written into the music:
//   bars 36–40 — the song's dip is F1's summer break (after Hungary)
//   bars 57–61 — after Austin: the standings as they are today
// Bars grow and rows re-rank over the first part of each span, then hold, so
// the eye can read the result before the next round lands.

export interface Slot {
  /** Index into EVENTS. */
  event: number;
  bar: number;
  bars: number;
}

const PLAN: [code: string, type: 'race' | 'sprint', bar: number, bars: number][] = [
  ['AUS', 'race', 6, 3],
  ['CHN', 'sprint', 9, 1],
  ['CHN', 'race', 10, 2],
  ['JPN', 'race', 12, 2],
  ['MIA', 'sprint', 14, 1],
  ['MIA', 'race', 15, 2],
  ['CAN', 'sprint', 17, 1],
  ['CAN', 'race', 18, 2],
  ['MON', 'race', 20, 2.5],
  ['BAR', 'race', 22.5, 2.5],
  ['AUT', 'race', 25, 2.5],
  ['GBR', 'sprint', 27.5, 1],
  ['GBR', 'race', 28.5, 2.5],
  ['BEL', 'race', 31, 2.5],
  ['HUN', 'race', 33.5, 2.5],
  ['NED', 'sprint', 40, 1],
  ['NED', 'race', 41, 2],
  ['ITA', 'race', 43, 2],
  ['MAD', 'race', 45, 2],
  ['AZE', 'race', 47, 2],
  ['MAS', 'race', 49, 2],
  ['SIN', 'sprint', 51, 1],
  ['SIN', 'race', 52, 2],
  ['USA', 'race', 54, 3],
];

export const SLOTS: Slot[] = PLAN.map(([code, type, bar, bars]) => {
  const event = EVENTS.findIndex((e) => e.code === code && e.type === type);
  if (event < 0) throw new Error(`no event ${code} ${type}`);
  return { event, bar, bars };
});

export const SUMMER_BREAK = { from: 36, to: 40 };
export const TODAY = { from: 57, to: 61 };
export const SEASON_START_BAR = SLOTS[0].bar;

/** Fraction of a slot over which points grow and ranks move. */
const GROW = (bars: number) => Math.min(1, bars * 0.55);

export interface DriverState {
  code: string;
  points: number;
  /** Fractional row position (1 = top). */
  pos: number;
  rank: number;
  prevRank: number;
  /** Points scored at the current event (0 if none). */
  delta: number;
}

export interface BoardState {
  /** Index of the current event in EVENTS (-1 before the season). */
  k: number;
  slot: Slot | null;
  /** Animation progress 0..1 within the current slot. */
  p: number;
  /** Bars elapsed since the current slot started. */
  age: number;
  rows: DriverState[];
  leaderPoints: number;
}

export function slotIndexAt(bar: number) {
  let s = -1;
  for (let i = 0; i < SLOTS.length; i++) if (SLOTS[i].bar <= bar) s = i;
  return s;
}

export function stateAt(t: number): BoardState {
  const bar = barAt(t);
  const si = slotIndexAt(bar);
  if (si < 0) {
    const rows = TABLES[0].map((r) => ({ code: r.code, points: 0, pos: r.rank, rank: r.rank, prevRank: r.rank, delta: 0 }));
    return { k: -1, slot: null, p: 0, age: 0, rows, leaderPoints: 0 };
  }
  const slot = SLOTS[si];
  const k = slot.event;
  const age = bar - slot.bar;
  const grow = GROW(slot.bars);
  // Bars grow first, then rows re-sort: the eye reads the score, then the order.
  const pPts = easeInOutCubic(clamp(age / (grow * 0.6)));
  const pPos = easeInOutCubic(clamp((age - grow * 0.35) / (grow * 0.65)));
  const before = TABLES[k];
  const after = TABLES[k + 1];
  const ev = EVENTS[k];
  const rows: DriverState[] = after.map((r) => {
    const b = before.find((x) => x.code === r.code)!;
    return {
      code: r.code,
      points: b.points + (r.points - b.points) * pPts,
      pos: b.rank + (r.rank - b.rank) * pPos,
      rank: pPos < 0.5 ? b.rank : r.rank,
      prevRank: b.rank,
      delta: ev.classification.find((e) => e.driver === r.code)?.pts ?? 0,
    };
  });
  const leaderPoints = Math.max(...rows.map((r) => r.points));
  return { k, slot, p: pPts, age, rows, leaderPoints };
}

/** Last time point covered by the season run (end of the Austin slot). */
export const SEASON_END_BAR = SLOTS[SLOTS.length - 1].bar + SLOTS[SLOTS.length - 1].bars;
