import { describe, expect, it } from 'vitest';
import { EVENTS, OFFICIAL } from '../src/leaderboard/data';
import { SLOTS, SUMMER_BREAK, TODAY, stateAt } from '../src/leaderboard/schedule';
import { barTime, DURATION, section } from '../src/engine/Timeline';

describe('season schedule', () => {
  it('places every event exactly once, in order', () => {
    expect(SLOTS.map((s) => s.event)).toEqual(EVENTS.map((_, i) => i));
  });

  it('starts every event on a beat and never overlaps', () => {
    for (const s of SLOTS) expect(Number.isInteger(s.bar * 4)).toBe(true);
    for (let i = 1; i < SLOTS.length; i++) expect(SLOTS[i].bar).toBeGreaterThanOrEqual(SLOTS[i - 1].bar + SLOTS[i - 1].bars);
  });

  it('opens on the bass drop and fits the song structure', () => {
    expect(SLOTS[0].bar).toBe(6);
    const hun = SLOTS.find((s) => EVENTS[s.event].code === 'HUN')!;
    expect(hun.bar + hun.bars).toBeLessThanOrEqual(SUMMER_BREAK.from);
    expect(SUMMER_BREAK.from).toBeLessThan(section('dip').barStart);
    const ned = SLOTS.find((s) => EVENTS[s.event].code === 'NED')!;
    expect(ned.bar).toBe(section('hook2').barStart);
    const usa = SLOTS.at(-1)!;
    expect(usa.bar + usa.bars).toBe(TODAY.from);
    expect(TODAY.to).toBe(section('breakdown').barStart);
    expect(barTime(TODAY.to)).toBeLessThan(DURATION);
  });

  it('lands on the official standings after Austin', () => {
    const s = stateAt(barTime(TODAY.from + 0.5));
    for (const r of s.rows) expect(r.points).toBeCloseTo(OFFICIAL[r.code], 6);
    const order = [...s.rows].sort((a, b) => a.pos - b.pos).map((r) => r.code);
    expect(order.slice(0, 6)).toEqual(['ANT', 'RUS', 'HAM', 'VER', 'LEC', 'NOR']);
  });

  it('only ever increases points as time moves forward', () => {
    let prev = stateAt(0);
    for (let t = 0.5; t < barTime(TODAY.from); t += 0.25) {
      const cur = stateAt(t);
      for (const r of cur.rows) expect(r.points).toBeGreaterThanOrEqual(prev.rows.find((x) => x.code === r.code)!.points - 1e-9);
      prev = cur;
    }
  });
});
