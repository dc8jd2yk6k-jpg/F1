import audio from '../data/audio.json';

// Pre-analysed audio (see analysis/analyze_audio.py), sampled by time.
// Envelopes are 0..1 with fast attack / slower release already applied.

export type Feature = 'rms' | 'low' | 'mid' | 'high' | 'kick' | 'snare' | 'hat';
export type Hit = readonly [time: number, strength: number];

const HZ = audio.featureHz;
const FEATURES = audio.features as Record<Feature, number[]>;
const HITS = { kicks: audio.kicks as unknown as Hit[], snares: audio.snares as unknown as Hit[] };

export function feat(name: Feature, t: number): number {
  const a = FEATURES[name];
  const x = t * HZ;
  if (x <= 0) return a[0];
  const i = Math.floor(x);
  if (i >= a.length - 1) return a[a.length - 1];
  const f = x - i;
  return a[i] * (1 - f) + a[i + 1] * f;
}

/** Average of a feature over [t0, t1] — used for smoothed, slow-moving reactions. */
export function featAvg(name: Feature, t0: number, t1: number, steps = 8): number {
  let s = 0;
  for (let i = 0; i < steps; i++) s += feat(name, t0 + ((t1 - t0) * (i + 0.5)) / steps);
  return s / steps;
}

function lowerBound(list: Hit[], t: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Detected percussive hits with time in [t0, t1) and strength ≥ minStrength. */
export function hitsIn(kind: keyof typeof HITS, t0: number, t1: number, minStrength = 0): Hit[] {
  const list = HITS[kind];
  const out: Hit[] = [];
  for (let i = lowerBound(list, t0); i < list.length && list[i][0] < t1; i++) {
    if (list[i][1] >= minStrength) out.push(list[i]);
  }
  return out;
}

/** Sum of exponentially-decaying impulses from recent hits: a "kick meter". */
export function hitEnvelope(kind: keyof typeof HITS, t: number, decay = 0.12, minStrength = 0.2): number {
  let v = 0;
  for (const [ht, s] of hitsIn(kind, t - decay * 5, t + 1e-6, minStrength)) v += s * Math.exp(-(t - ht) / decay);
  return Math.min(1.5, v);
}
