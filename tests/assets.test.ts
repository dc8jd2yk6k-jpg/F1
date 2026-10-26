import { describe, expect, it } from 'vitest';
import { DRIVERS, EVENTS, TEAMS } from '../src/leaderboard/data';
import { F1_MARK, TEAM_CODES, hasMark, markFor } from '../src/leaderboard/logos';

describe('brand assets', () => {
  it('gives every team either its own mark or a code', () => {
    for (const team of Object.keys(TEAMS)) expect(hasMark(team) || !!TEAM_CODES[team]).toBe(true);
  });

  it('covers every team a driver raced for, stand-in stints included', () => {
    const teams = new Set([...DRIVERS.map((d) => d.team), ...EVENTS.flatMap((e) => e.classification.map((c) => c.team).filter(Boolean))]);
    for (const t of teams) expect(hasMark(t as string) || !!TEAM_CODES[t as string]).toBe(true);
  });

  it('uses each brand mark for its own team only', () => {
    expect(markFor('redbull')?.title).toBe('Red Bull');
    expect(markFor('racingbulls')).toBeNull();
    expect(markFor('ferrari')?.title).toBe('Ferrari');
    expect(F1_MARK.title).toBe('F1');
  });
});
