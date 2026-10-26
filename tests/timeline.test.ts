import { describe, expect, it } from 'vitest';
import { BAR, BEAT, FPS, FRAME_COUNT, DURATION, barAt, barTime, section, sectionAt } from '../src/engine/Timeline';

describe('timeline', () => {
  it('runs at 110 BPM in 4/4', () => {
    expect(60 / BEAT).toBeCloseTo(110, 2);
    expect(BAR).toBeCloseTo(4 * BEAT, 5);
  });

  it('round-trips bars and seconds', () => {
    for (const b of [1, 6, 20.5, 61, 83.25]) expect(barAt(barTime(b))).toBeCloseTo(b, 9);
  });

  it('puts the structural hits on downbeats', () => {
    expect(barTime(6)).toBeCloseTo(10.8, 1);
    expect(barTime(61)).toBeCloseTo(130.8, 1);
    expect(barTime(61) - barTime(6)).toBeCloseTo(120, 2);
  });

  it('covers the song with contiguous sections', () => {
    expect(section('intro').t0).toBe(0);
    expect(sectionAt(DURATION - 0.01).name).toBe('outro');
    expect(sectionAt(barTime(40) + 0.01).name).toBe('hook2');
  });

  it('maps frames to the full duration', () => {
    expect(FRAME_COUNT).toBe(Math.ceil(DURATION * FPS));
    expect((FRAME_COUNT - 1) / FPS).toBeLessThan(DURATION);
  });
});
