import { featAvg } from '../engine/AudioFeatures';
import type { PostParams } from '../engine/Compositor';
import { Background } from '../leaderboard/Background';

// Shared look for every act: one backdrop, calm post-processing. There is no
// camera, no shake and no beat-driven flashing anywhere in the video: the
// music lands through *when* things change, not through jitter.

let bg: Background | null = null;
export function background(aspect: number) {
  if (!bg) bg = new Background(aspect);
  return bg;
}

export function calmPost(p: PostParams) {
  p.bloom = 0.45;
  p.bloomThreshold = 0.9;
  p.streak = 0;
  p.ca = 0;
  p.grain = 0.016;
  p.vignette = 0.45;
  p.saturation = 1.0;
  p.lift = [0, 0, 0];
  p.gain = [1, 1, 1];
}

/** Slow (≈1 s) bass envelope for gentle breathing glows. Never per-beat. */
export const breath = (t: number) => Math.min(1, featAvg('low', t - 1.2, t, 12) * 1.4);
