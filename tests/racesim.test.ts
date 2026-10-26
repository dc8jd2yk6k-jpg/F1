import { describe, expect, it } from 'vitest';
import { barTime } from '../src/engine/Timeline';
import { CONTENDERS, ORDER_KEYS, gapOf, orderAt, project, projectedP2At, timingOrderAt } from '../src/world/RaceSim';

const holderAtBar = (bar: number) => projectedP2At(barTime(bar));

describe('race choreography', () => {
  it('keeps every key a permutation of the six cars', () => {
    for (const k of ORDER_KEYS) expect([...k.order].sort()).toEqual(['ANT', 'HAM', 'LEC', 'NOR', 'RUS', 'VER']);
  });

  it('projects with real arithmetic', () => {
    const p = project(['ANT', 'RUS', 'HAM', 'VER', 'LEC', 'NOR']);
    expect(p[0]).toMatchObject({ code: 'RUS', total: 242 + 18 });
    expect(p.find((x) => x.code === 'LEC')?.total).toBe(233 + 10);
  });

  it('passes projected P2 around as the story says', () => {
    expect(holderAtBar(21)).toBe('RUS');
    expect(holderAtBar(27)).toBe('HAM');
    expect(holderAtBar(35)).toBe('RUS');
    expect(holderAtBar(47)).toBe('VER');
    expect(holderAtBar(57.5)).toBe('LEC');
  });

  it('lets each of the four hold projected P2 during the hooks', () => {
    const seen = new Set<string>();
    for (let b = 20; b < 60; b += 0.25) seen.add(holderAtBar(b));
    for (const c of CONTENDERS) expect(seen.has(c)).toBe(true);
  });

  it('keeps cars from occupying the same spot outside of passes', () => {
    for (const bar of [22, 30, 38, 47, 51]) {
      const t = barTime(bar);
      const gaps = orderAt(t).map((c) => gapOf(c, t));
      for (let i = 1; i < gaps.length; i++) expect(gaps[i] - gaps[i - 1]).toBeGreaterThan(5);
    }
  });

  it('timing order is a stable permutation', () => {
    expect(new Set(timingOrderAt(barTime(44.9))).size).toBe(6);
  });
});
