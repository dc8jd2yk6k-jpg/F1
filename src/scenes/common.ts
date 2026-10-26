import * as THREE from 'three';
import type { PostParams } from '../engine/Compositor';
import type { Track } from '../world/Track';
import type { World } from '../world/World';

// Shared choreography helpers: named track locations, shot clocks, grades.

export interface Landmarks {
  start: number;
  t1: number;
  esses: number;
  backStraight: number;
  westHairpin: number;
  hotel: number;
  finalCorner: number;
}

export function landmarks(track: Track, hotelS: number): Landmarks {
  const at = (x: number, z: number) => track.nearestS(new THREE.Vector3(x, 0, z));
  return {
    start: 0,
    t1: at(700, -60),
    esses: at(580, -265),
    backStraight: at(560, -490),
    westHairpin: at(-690, -370),
    hotel: hotelS,
    finalCorner: at(-215, -30),
  };
}

/** tau offset so that the pace point is at distance `s` when the song is at `tAt`. */
export const offsetFor = (track: Track, s: number, tAt: number) => track.timeAtDistance(s) - tAt;

/** Standing-start pace: grid at `gridS`, exponential approach to racing speed. */
export function launchPace(gridS: number, vmax = 82, T = 4.2) {
  return (tau: number) => (tau <= 0 ? gridS : gridS + vmax * (tau - T * (1 - Math.exp(-tau / T))));
}

/** Night grade presets (display-space lift/gain). */
export function gradeNight(p: PostParams) {
  p.lift = [0.0, 0.006, 0.016];
  p.gain = [1.0, 1.0, 1.04];
  p.saturation = 1.08;
}

export function gradeTwilight(p: PostParams) {
  p.lift = [0.012, 0.006, 0.0];
  p.gain = [1.06, 1.0, 0.95];
  p.saturation = 1.1;
}


/** Night race lighting (floodlights). */
export function lightNight(w: World) {
  w.key.color.set('#dfe8ff');
  w.key.intensity = 1.0;
  w.key.position.set(-300, 400, 200);
  w.rim.color.set('#ffd2a8');
  w.rim.intensity = 2.0;
  w.rim.position.set(0, 50, -300);
  w.hemi.intensity = 0.35;
  w.env.skyMat.uniforms.twilight.value = 0;
  w.env.skyMat.uniforms.gold.value = 0;
  w.env.skyMat.uniforms.stars.value = 1;
}

/** Dusk: low warm sun from the west, sky still glowing. */
export function lightDusk(w: World, amount = 1) {
  w.key.color.set('#ffb98a');
  w.key.intensity = 1.0 + 0.6 * amount;
  w.key.position.set(-500, 90, 120);
  w.rim.color.set('#9fb6ff');
  w.rim.intensity = 1.4;
  w.rim.position.set(300, 120, -200);
  w.hemi.intensity = 0.35 + 0.25 * amount;
  w.env.skyMat.uniforms.twilight.value = 0.55 * amount;
  w.env.skyMat.uniforms.gold.value = 0;
  w.env.skyMat.uniforms.stars.value = 1 - amount * 0.7;
}
