import { describe, expect, it } from 'vitest';
import { EVENTS, OFFICIAL } from '../src/leaderboard/data';
import { CONTENDERS, CUMULATIVE, valueAt } from '../src/leaderboard/PointsChart';

describe('P2 points chart', () => {
  it('follows places 2–5 of the official table', () => {
    expect(CONTENDERS).toEqual(['RUS', 'HAM', 'VER', 'LEC']);
  });

  it('ends every line on the official total', () => {
    for (const code of CONTENDERS) {
      const s = CUMULATIVE[code];
      expect(s.length).toBe(EVENTS.length + 1);
      expect(s[0]).toBe(0);
      expect(s[EVENTS.length]).toBe(OFFICIAL[code]);
      expect(valueAt(code, EVENTS.length)).toBe(OFFICIAL[code]);
    }
  });

  it('only ever climbs, by exactly each event\'s points', () => {
    for (const code of CONTENDERS) {
      const s = CUMULATIVE[code];
      EVENTS.forEach((ev, i) => {
        const pts = ev.classification.find((e) => e.driver === code)?.pts ?? 0;
        expect(s[i + 1] - s[i]).toBe(pts);
      });
    }
  });
});
