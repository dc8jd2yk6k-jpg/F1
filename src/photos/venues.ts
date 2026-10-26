import { clamp, easeOutCubic } from '../engine/math';
import { EVENTS } from '../leaderboard/data';
import { SLOTS, TODAY } from '../leaderboard/schedule';
import type { PlateLayer } from './PhotoPlate';
import { type Photo, photoFor } from './photos';

// Which photograph sits behind the board, bar by bar. Each round's circuit
// takes over on the downbeat its first event starts on (a sprint and its
// Grand Prix share one venue and one continuous shot). After Austin, the
// backdrop moves to the finale venue: that's where P2 will be decided.

interface Leg {
  code: string;
  photo: Photo | null;
  from: number;
}

export const LEGS: Leg[] = [];
for (const s of SLOTS) {
  const code = EVENTS[s.event].code;
  if (LEGS.at(-1)?.code !== code) LEGS.push({ code, photo: photoFor('venue', code), from: s.bar });
}
LEGS.push({ code: 'FINALE', photo: photoFor('finale', 'FINALE'), from: TODAY.from });

/** Dissolve length in bars. Ease-out, so the change is biggest on the downbeat itself. */
const FADE = 0.3;
/** Push-in per bar: slow enough to read as stillness. */
export const PUSH = 0.01;
export const zoomAt = (age: number) => 1.04 + PUSH * Math.max(0, age);

export function legAt(bar: number) {
  let i = -1;
  LEGS.forEach((l, j) => {
    if (l.from <= bar) i = j;
  });
  return i;
}

export function venueLayers(bar: number): PlateLayer[] {
  const i = legAt(bar);
  if (i < 0) return [];
  const cur = LEGS[i];
  const prev = LEGS[i - 1];
  const a = easeOutCubic(clamp((bar - cur.from) / FADE));
  const layers: PlateLayer[] = [];
  if (prev?.photo && a < 1) layers.push({ photo: prev.photo, alpha: cur.photo ? 1 : 1 - a, zoom: zoomAt(bar - prev.from) });
  if (cur.photo) layers.push({ photo: cur.photo, alpha: a, zoom: zoomAt(bar - cur.from) });
  return layers;
}

export const FINALE_PHOTO = LEGS.at(-1)!.photo;
