import audio from '../data/audio.json';

// Musical time. The whole video is choreographed in bars, not seconds:
// bar n (1-indexed, fractional allowed) starts at ORIGIN + (n - 1) * BAR.

export const FPS = 30;
export const DURATION = audio.duration;
export const FRAME_COUNT = Math.ceil(DURATION * FPS);
export const BPM = audio.bpm;
export const BEAT = audio.beatPeriod;
export const BAR = audio.barLength;
export const ORIGIN = audio.barOrigin;

export type SectionName = 'intro' | 'verse' | 'build' | 'hook1' | 'dip' | 'hook2' | 'breakdown' | 'outro';

export interface Section {
  name: SectionName;
  barStart: number;
  barEnd: number;
  t0: number;
  t1: number;
}

export const SECTIONS = audio.sections as Section[];

/** Song time (s) at the start of a (fractional) bar. */
export const barTime = (bar: number) => ORIGIN + (bar - 1) * BAR;

/** Fractional bar position at song time t (bar 6.5 = halfway through bar 6). */
export const barAt = (t: number) => 1 + (t - ORIGIN) / BAR;

/** Song time of beat `beat` (1-indexed) within bar `bar`. */
export const beatTime = (bar: number, beat = 1) => barTime(bar) + (beat - 1) * BEAT;

/** Fractional beats elapsed since the start of bar 1. */
export const beatsAt = (t: number) => (t - ORIGIN) / BEAT;

export const frameTime = (frame: number) => frame / FPS;

export function sectionAt(t: number): Section {
  for (const s of SECTIONS) if (t < s.t1) return s;
  return SECTIONS[SECTIONS.length - 1];
}

export function section(name: SectionName): Section {
  const s = SECTIONS.find((x) => x.name === name);
  if (!s) throw new Error(`unknown section ${name}`);
  return s;
}

/** Progress 0..1 through a bar range [a, b) (bars inclusive of a, exclusive of b). */
export const barProgress = (t: number, a: number, b: number) => {
  const x = (barAt(t) - a) / (b - a);
  return x < 0 ? 0 : x > 1 ? 1 : x;
};

/** Phase within the current beat (0 at the beat, → 1 just before the next). */
export const beatPhase = (t: number) => {
  const b = beatsAt(t);
  return b - Math.floor(b);
};

/** Exponentially decaying pulse on every grid beat (structural, not percussive). */
export const beatPulse = (t: number, decay = 0.18) => Math.exp(-(beatPhase(t) * BEAT) / decay);

/** Same, on every downbeat. */
export const barPulse = (t: number, decay = 0.35) => {
  const b = barAt(t);
  return Math.exp(-((b - Math.floor(b)) * BAR) / decay);
};
