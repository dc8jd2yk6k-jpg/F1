import { describe, expect, it } from 'vitest';
import { DRIVERS, EVENTS, OFFICIAL, RACE_POINTS, SEASON, SPRINT_POINTS, teamAt } from '../src/leaderboard/data';
import { FINAL, TABLES, rowAfter } from '../src/leaderboard/model';

// The data must reproduce the official championship exactly, or it doesn't ship.

const sumFor = (code: string, upTo = EVENTS.length) =>
  EVENTS.slice(0, upTo).reduce((s, ev) => s + (ev.classification.find((e) => e.driver === code)?.pts ?? 0), 0);

describe('2026 results data', () => {
  it('covers 18 Grands Prix and 6 sprints, in date order', () => {
    expect(EVENTS.filter((e) => e.type === 'race')).toHaveLength(18);
    expect(EVENTS.filter((e) => e.type === 'sprint')).toHaveLength(6);
    for (let i = 1; i < EVENTS.length; i++) expect(EVENTS[i].date >= EVENTS[i - 1].date).toBe(true);
  });

  it('agrees with the calendar metadata', () => {
    const lastRace = EVENTS.filter((e) => e.type === 'race').at(-1)!;
    expect(lastRace.round).toBe(SEASON.afterRound.round);
    expect(lastRace.date).toBe(SEASON.afterRound.date);
    expect(SEASON.afterRound.round + SEASON.remaining.length).toBe(SEASON.totalRounds);
  });

  it('awards exactly the points scale at every event', () => {
    for (const ev of EVENTS) {
      const scale = ev.type === 'race' ? RACE_POINTS : SPRINT_POINTS;
      expect(ev.classification.map((e) => e.pts)).toEqual(scale);
      expect(ev.classification.map((e) => e.pos)).toEqual(scale.map((_, i) => i + 1));
      expect(new Set(ev.classification.map((e) => e.driver)).size).toBe(scale.length);
      for (const e of ev.classification) expect(DRIVERS.some((d) => d.code === e.driver)).toBe(true);
    }
  });

  it('sums to the official standings after Austin for every driver', () => {
    for (const d of DRIVERS) expect([d.code, sumFor(d.code)]).toEqual([d.code, OFFICIAL[d.code]]);
    const total = Object.values(OFFICIAL).reduce((a, b) => a + b, 0);
    expect(total).toBe(18 * 101 + 6 * 36);
  });

  it('matches the checkpoint after Singapore', () => {
    const sin = EVENTS.findIndex((e) => e.code === 'SIN' && e.type === 'race') + 1;
    for (const [code, pts] of Object.entries(SEASON.checkpoints.afterSingapore)) expect(sumFor(code, sin)).toBe(pts);
  });

  it('matches the constructors table, stand-in stints included', () => {
    for (const [team, pts] of Object.entries(SEASON.constructors)) {
      const s = EVENTS.reduce((acc, ev) => acc + ev.classification.filter((e) => teamAt(e.driver, ev) === team).reduce((a, e) => a + e.pts, 0), 0);
      expect([team, s]).toEqual([team, pts]);
    }
  });
});

describe('championship model', () => {
  it('ends in the official order', () => {
    expect(FINAL.map((r) => r.code)).toEqual(Object.keys(OFFICIAL).filter((c) => FINAL.some((r) => r.code === c)));
    expect(FINAL.map((r) => r.points)).toEqual(FINAL.map((r) => OFFICIAL[r.code]));
  });

  it('counts wins and podiums from Grands Prix only', () => {
    const ant = FINAL.find((r) => r.code === 'ANT')!;
    expect(ant.wins).toBe(9);
    expect(FINAL.find((r) => r.code === 'RUS')!.sprintWins).toBe(3);
  });

  it('breaks ties by countback (Ocon/Alonso/Sainz all on 7)', () => {
    const order = FINAL.filter((r) => r.points === 7).map((r) => r.code);
    expect(order).toEqual(['OCO', 'ALO', 'SAI']);
  });

  it('never loses points between tables', () => {
    for (let k = 1; k < TABLES.length; k++) for (const d of DRIVERS) expect(rowAfter(d.code, k).points).toBeGreaterThanOrEqual(rowAfter(d.code, k - 1).points);
  });
});
