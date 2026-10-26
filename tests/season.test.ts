import { describe, expect, it } from 'vitest';
import season from '../src/data/season.json';

describe('season data', () => {
  const pts = season.contenders.map((c) => c.points);

  it('lists the P2 contenders in standings order', () => {
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
  });

  it('has the four contenders within 9 points', () => {
    expect(pts[0] - pts[pts.length - 1]).toBe(9);
    expect(pts[0] - pts[1]).toBe(1);
  });

  it('keeps the leader out of reach of P2 for the narrative', () => {
    expect(season.leader.points - pts[0]).toBe(123);
  });

  it('is consistent about rounds and points left', () => {
    expect(season.afterRound.round + season.remaining.length).toBe(season.totalRounds);
    expect(season.roundsRun).toHaveLength(season.afterRound.round);
    expect(season.sprintsRemaining).toBe(0);
    expect(season.remaining.length * season.racePoints[0]).toBe(125);
  });

  it('ends at Yas Marina on 6 December', () => {
    const finale = season.remaining[season.remaining.length - 1];
    expect(finale.venue).toBe('Yas Marina Circuit');
    expect(finale.date).toBe('2026-12-06');
  });
});
