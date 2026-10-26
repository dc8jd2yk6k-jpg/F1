import * as THREE from 'three';
import type { Track } from './Track';

// The start-light gantry over the grid: five pods, each with two lit rows of
// red lamps. Hidden unless an act shows it.

export class Gantry {
  readonly group = new THREE.Group();
  private readonly lamps: THREE.MeshBasicMaterial[] = [];

  constructor(track: Track, s: number) {
    const p = track.pointAt(s);
    const t = track.tangentAt(s);
    this.group.position.copy(p).setY(6.2);
    this.group.rotation.y = Math.atan2(t.x, t.z) + Math.PI; // lamps face the grid
    const dark = new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: 0.6, metalness: 0.4 });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(17, 0.5, 0.6), dark);
    beam.position.y = 1.15;
    this.group.add(beam);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.6, 0.4), dark);
      post.position.set(side * 8.4, -2.4, 0);
      this.group.add(post);
    }
    const lampGeo = new THREE.CircleGeometry(0.17, 20);
    const housingGeo = new THREE.BoxGeometry(0.62, 1.95, 0.32);
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.95;
      const housing = new THREE.Mesh(housingGeo, dark);
      housing.position.set(x, 0, 0);
      this.group.add(housing);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0, 0) });
      this.lamps.push(mat);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 2; c++) {
          const lit = r >= 2;
          const lamp = new THREE.Mesh(lampGeo, lit ? mat : new THREE.MeshBasicMaterial({ color: '#120405' }));
          lamp.position.set(x + (c - 0.5) * 0.27, 0.7 - r * 0.45, 0.17);
          this.group.add(lamp);
        }
      }
    }
    this.group.visible = false;
  }

  /** Brightness 0..1 per pod (HDR scaled). */
  set(levels: number[], gain = 1) {
    this.lamps.forEach((m, i) => {
      const l = Math.max(0, Math.min(1.2, levels[i] ?? 0));
      m.color.setRGB(0.06 + 9 * l * gain, 0.02 + 0.5 * l * gain, 0.015 + 0.3 * l * gain);
    });
  }
}
