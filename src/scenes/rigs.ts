import * as THREE from 'three';
import { noise1 } from '../engine/rng';
import type { CarState, World } from '../world/World';

// Camera rigs. Each one is a pure function of the car states it frames.

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export function lens(cam: THREE.PerspectiveCamera, fov: number, aspect: number) {
  if (cam.fov !== fov || cam.aspect !== aspect) {
    cam.fov = fov;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }
}

/** Behind/above a car, looking past it. */
export function chase(cam: THREE.PerspectiveCamera, world: World, st: CarState, back: number, up: number, side = 0, lookAhead = 18, lookUp = 0.6) {
  world.localToWorld(st, _v.set(side, up, -back), cam.position);
  world.localToWorld(st, _w.set(0, lookUp, lookAhead), _w);
  cam.lookAt(_w);
}

/** The T-cam: on the airbox, looking over the halo. */
export function tcam(cam: THREE.PerspectiveCamera, world: World, st: CarState) {
  world.localToWorld(st, _v.set(0, 1.3, -0.95), cam.position);
  world.localToWorld(st, _w.set(0, 0.15, 40), _w);
  cam.lookAt(_w);
}

/** Fixed trackside position that pans to follow a target. */
export function trackside(cam: THREE.PerspectiveCamera, world: World, s: number, lateral: number, height: number, target: THREE.Vector3) {
  world.track.offsetPoint(s, lateral, height, cam.position);
  cam.lookAt(target);
}

/** Overhead drone tracking a point, tilted forward. */
export function drone(cam: THREE.PerspectiveCamera, center: THREE.Vector3, forward: THREE.Vector3, height: number, back: number) {
  cam.position.copy(center).addScaledVector(forward, -back).setY(center.y + height);
  _w.copy(center).addScaledVector(forward, back * 0.4);
  cam.lookAt(_w);
}

/** Orbit around a point. */
export function orbit(cam: THREE.PerspectiveCamera, center: THREE.Vector3, radius: number, angle: number, height: number, lookY = 0.5) {
  cam.position.set(center.x + Math.cos(angle) * radius, center.y + height, center.z + Math.sin(angle) * radius);
  _w.copy(center).setY(center.y + lookY);
  cam.lookAt(_w);
}

/** Handheld/impact shake applied after aiming. */
export function shake(cam: THREE.Camera, t: number, amount: number, freq = 9) {
  if (amount <= 0) return;
  cam.rotateX(noise1(t * freq, 1) * amount * 0.012);
  cam.rotateY(noise1(t * freq, 2) * amount * 0.012);
  cam.rotateZ(noise1(t * freq * 0.7, 3) * amount * 0.008);
}
