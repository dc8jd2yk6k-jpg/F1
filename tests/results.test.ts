import { describe, expect, it } from 'vitest';
import { CHAMPION, CLINCHED_AT, DRIVERS, EVENTS, OFFICIAL, RACES_TO_SPARE, RACE_POINTS, SEASON, SPRINT_POINTS, teamAt } from '../src/leaderboard/data';
import { FINAL, TABLES, rowAfter } from '../src/leaderboard/model';

// The data must reproduce the official championship exactly, or it doesn't ship.

const sumFor = (code: string, upTo = EVENTS.length) =>
  EVENTS.slice(0, upTo).reduce((s, ev) => s + (ev.classification.find((e) => e.driver === code)?.pts ?? 0), 0);

describe('2026 results data', () => {
  it('covers every Grand Prix run so far and 6 sprints, in date order', () => {
    expect(EVENTS.filter((e) => e.type === 'race')).toHaveLength(SEASON.afterRound.round);
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

  it('sums to the official standings after the latest round for every driver', () => {
    for (const d of DRIVERS) expect([d.code, sumFor(d.code)]).toEqual([d.code, OFFICIAL[d.code]]);
    const total = Object.values(OFFICIAL).reduce((a, b) => a + b, 0);
    expect(total).toBe(SEASON.afterRound.round * 101 + 6 * 36);
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

  it('breaks ties by countback (Russell/Norris on 264: equal wins, Russell more seconds; Bortoleto/Hülkenberg on 14)', () => {
    const tied = (pts: number) => FINAL.filter((r) => r.points === pts).map((r) => r.code);
    expect(tied(264)).toEqual(['RUS', 'NOR']);
    expect(tied(14)).toEqual(['BOR', 'HUL']);
  });

  it('dates the title to the round it was clinched in, with the races to spare as of then', () => {
    const k = EVENTS.findIndex((e) => e.code === CLINCHED_AT && e.type === 'race');
    expect(EVENTS[k].round).toBe(19);
    expect(RACES_TO_SPARE).toBe(4);
    // Mathematically decided: the lead after that round beats every point still on offer.
    const table = TABLES[k + 1];
    expect(table[0].code).toBe(CHAMPION);
    expect(table[0].points - table[1].points).toBeGreaterThan(RACES_TO_SPARE! * RACE_POINTS[0]);
  });

  it('never loses points between tables', () => {
    for (let k = 1; k < TABLES.length; k++) for (const d of DRIVERS) expect(rowAfter(d.code, k).points).toBeGreaterThanOrEqual(rowAfter(d.code, k - 1).points);
  });
});
