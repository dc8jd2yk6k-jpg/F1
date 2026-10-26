import { DRIVERS, EVENTS, OFFICIAL_ORDER, type SeasonEvent } from './data';

// Championship tables after every event, computed once from the results.
//
// Ranking follows the FIA order: points, then countback on Grand Prix
// finishing positions (sprints don't count). Our data stops at the points
// places, so ties that countback can't separate (non-scorers, or identical
// top-ten records) fall back to the official table's order — which is the
// result of the full countback. Before the first race everyone is on zero,
// shown in race-number order like an entry list.

export interface Row {
  code: string;
  points: number;
  rank: number;
  wins: number;
  podiums: number;
  sprintWins: number;
  /** Grand Prix finishes by position: gp[0] = wins, gp[1] = second places, … */
  gp: number[];
}

function fresh(code: string): Row {
  return { code, points: 0, rank: 0, wins: 0, podiums: 0, sprintWins: 0, gp: new Array(10).fill(0) };
}

function countback(a: Row, b: Row) {
  for (let i = 0; i < 10; i++) if (a.gp[i] !== b.gp[i]) return b.gp[i] - a.gp[i];
  return 0;
}

const officialIndex = (code: string) => {
  const i = OFFICIAL_ORDER.indexOf(code);
  return i < 0 ? 999 : i;
};

function rankRows(rows: Row[]) {
  rows.sort((a, b) => b.points - a.points || countback(a, b) || officialIndex(a.code) - officialIndex(b.code));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function apply(rows: Map<string, Row>, ev: SeasonEvent) {
  for (const e of ev.classification) {
    const r = rows.get(e.driver)!;
    r.points += e.pts;
    if (ev.type === 'race') {
      r.gp[e.pos - 1]++;
      if (e.pos === 1) r.wins++;
      if (e.pos <= 3) r.podiums++;
    } else if (e.pos === 1) {
      r.sprintWins++;
    }
  }
}

/** TABLES[k] = standings after the first k events (TABLES[0] = before the season). */
export const TABLES: Row[][] = (() => {
  const live = new Map(DRIVERS.map((d) => [d.code, fresh(d.code)]));
  const snap = () => [...live.values()].map((r) => ({ ...r, gp: [...r.gp] }));
  const start = snap().sort((a, b) => DRIVERS.find((d) => d.code === a.code)!.number - DRIVERS.find((d) => d.code === b.code)!.number);
  start.forEach((r, i) => (r.rank = i + 1));
  const out = [start];
  for (const ev of EVENTS) {
    apply(live, ev);
    out.push(rankRows(snap()));
  }
  return out;
})();

export const FINAL = TABLES[TABLES.length - 1];

export function rowAfter(code: string, k: number): Row {
  return TABLES[k].find((r) => r.code === code)!;
}

/** Points a driver scored at each event, in season order. */
export function pointsByEvent(code: string): number[] {
  return EVENTS.map((ev) => ev.classification.find((e) => e.driver === code)?.pts ?? 0);
}

/** Points scored from event index `from` (inclusive) to the end. */
export function pointsSince(code: string, from: number): number {
  return pointsByEvent(code).slice(from).reduce((a, b) => a + b, 0);
}
