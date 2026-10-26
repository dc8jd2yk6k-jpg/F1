// Small, allocation-free helpers used everywhere. Everything here is pure.

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, x));
export const fract = (x: number) => x - Math.floor(x);

export const smoothstep = (a: number, b: number, x: number) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};

export const easeInCubic = (t: number) => t * t * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOutCubic = (t: number) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export const easeInExpo = (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * clamp(t) - 10));
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
export const easeOutBack = (t: number, s = 1.70158) => {
  t = clamp(t) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
};

/** 0 → 1 over [t0, t0 + attack], then decays back to 0 over `decay`. */
export const pulse = (t: number, t0: number, attack: number, decay: number) => {
  if (t < t0) return 0;
  if (t < t0 + attack) return (t - t0) / attack;
  return Math.exp(-(t - t0 - attack) / decay);
};

/** Visible window: fades in over `fin`, holds, fades out over `fout`. */
export const window01 = (t: number, t0: number, t1: number, fin: number, fout: number) =>
  Math.min(smoothstep(t0, t0 + fin, t), 1 - smoothstep(t1 - fout, t1, t));

export const TAU = Math.PI * 2;
