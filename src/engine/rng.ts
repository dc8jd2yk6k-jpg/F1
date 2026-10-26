// Deterministic randomness. Nothing in the renderer may call Math.random():
// every frame must be reproducible in isolation, in any order.

/** Integer hash → [0, 1). Stateless, so "random" values can be looked up by index. */
export function hash(...keys: number[]): number {
  let h = 0x811c9dc5 | 0;
  for (const k of keys) {
    let x = Math.floor(k * 1000003) | 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x ^= x >>> 16;
    h = Math.imul(h ^ x, 0x01000193);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Signed variant in [-1, 1). */
export const hashS = (...keys: number[]) => hash(...keys) * 2 - 1;

/** Seeded sequential PRNG for one-time construction work (geometry layout). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise, deterministic. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hashS(i, seed) * (1 - u) + hashS(i + 1, seed) * u;
}
