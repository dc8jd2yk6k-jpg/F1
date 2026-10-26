import * as THREE from 'three';
import type { CarCode } from './RaceSim';

// Procedural 2026-regulation car. Low-poly by design: it lives at night,
// under rim light and bloom, usually at 300 km/h. What matters is the
// silhouette: narrow 2026 proportions (3.4 m wheelbase, 1.9 m width), halo,
// airbox + T-cam, active-aero wings (flaps open in straight mode), and the
// rear lights that turn into light trails.
// Local frame: +Z forward, +Y up, +X left. Origin at the floor centre.

export interface Livery {
  base: string;
  accent: string;
  second: string;
  helmet: string;
  tcam: string;
  /** Accent glows slightly (reads at night). */
  glow: number;
}

export const LIVERIES: Record<CarCode, Livery> = {
  ANT: { base: '#2b3036', accent: '#22E6C8', second: '#F5C542', helmet: '#F5C542', tcam: '#F5C542', glow: 0.55 },
  RUS: { base: '#2b3036', accent: '#22E6C8', second: '#c9d1d9', helmet: '#3a8dde', tcam: '#111111', glow: 0.55 },
  HAM: { base: '#c50f2a', accent: '#f4f4f4', second: '#121212', helmet: '#f2d230', tcam: '#f2d230', glow: 0.15 },
  LEC: { base: '#c50f2a', accent: '#f4f4f4', second: '#121212', helmet: '#e8e8e8', tcam: '#111111', glow: 0.15 },
  VER: { base: '#18234d', accent: '#e2231a', second: '#ffd400', helmet: '#1f3fa8', tcam: '#ffd400', glow: 0.25 },
  NOR: { base: '#ff7a00', accent: '#111111', second: '#2fb8ff', helmet: '#d8ff3a', tcam: '#111111', glow: 0.2 },
};

/** Box with independently sized front/back faces: the basic F1 body primitive. */
function taper(z0: number, z1: number, w0: number, w1: number, h0: number, h1: number, y0: number, y1: number,
               x = 0, topW0 = w0, topW1 = w1) {
  // z0 = rear face, z1 = front face. y* are bottom heights at each end.
  const v = [
    [-w0 / 2 + x, y0, z0], [w0 / 2 + x, y0, z0], [topW0 / 2 + x, y0 + h0, z0], [-topW0 / 2 + x, y0 + h0, z0],
    [-w1 / 2 + x, y1, z1], [w1 / 2 + x, y1, z1], [topW1 / 2 + x, y1 + h1, z1], [-topW1 / 2 + x, y1 + h1, z1],
  ];
  const f = [
    [0, 2, 1], [0, 3, 2], // rear
    [4, 5, 6], [4, 6, 7], // front
    [0, 1, 5], [0, 5, 4], // bottom
    [3, 7, 6], [3, 6, 2], // top
    [0, 4, 7], [0, 7, 3], // right (-x)
    [1, 2, 6], [1, 6, 5], // left (+x)
  ];
  const pos: number[] = [];
  for (const tri of f) for (const i of tri) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function numberTexture(text: string, fg: string, bg: string | null, font: string, w = 256, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  if (bg) {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
  }
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 8;
  x.strokeStyle = 'rgba(0,0,0,0.8)';
  x.strokeText(text, w / 2, h / 2 + 4);
  x.fillStyle = fg;
  x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Car {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly wheels: THREE.Object3D[] = [];
  readonly frontFlaps: THREE.Object3D[] = [];
  readonly rearFlap: THREE.Object3D;
  readonly rainLight: THREE.MeshBasicMaterial;
  readonly endplateLight: THREE.MeshBasicMaterial;
  readonly shadow: THREE.Mesh;
  /** World-space rear-light anchors for trails (local positions). */
  static readonly LIGHT_POINTS = {
    rain: new THREE.Vector3(0, 0.33, -2.3),
    left: new THREE.Vector3(0.5, 0.86, -2.36),
    right: new THREE.Vector3(-0.5, 0.86, -2.36),
  };

  constructor(readonly code: CarCode, number: number, shadowTex: THREE.Texture) {
    const L = LIVERIES[code];
    const livery = new THREE.MeshStandardMaterial({
      color: L.base, metalness: 0.5, roughness: 0.2, envMapIntensity: 1.6,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: L.accent, metalness: 0.2, roughness: 0.35, emissive: new THREE.Color(L.accent), emissiveIntensity: L.glow,
    });
    const second = new THREE.MeshStandardMaterial({ color: L.second, metalness: 0.3, roughness: 0.35 });
    const carbon = new THREE.MeshStandardMaterial({ color: '#0c0d10', metalness: 0.3, roughness: 0.42, envMapIntensity: 0.9 });
    const tire = new THREE.MeshStandardMaterial({ color: '#0f0f10', metalness: 0.0, roughness: 0.85, envMapIntensity: 0.4 });
    const halo = new THREE.MeshStandardMaterial({ color: '#1a1c20', metalness: 0.7, roughness: 0.3 });
    const helmet = new THREE.MeshStandardMaterial({ color: L.helmet, metalness: 0.4, roughness: 0.25, envMapIntensity: 1.6 });
    const tcam = new THREE.MeshStandardMaterial({ color: L.tcam, roughness: 0.4 });
    this.rainLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.25, 0.2) });
    this.endplateLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.12, 0.1) });

    const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = this.body) => {
      const mesh = new THREE.Mesh(g, m);
      parent.add(mesh);
      return mesh;
    };

    // Floor + plank.
    add(taper(-2.0, 1.25, 1.55, 1.0, 0.035, 0.035, 0.04, 0.05), carbon);
    add(box(0.32, 0.02, 3.0, 0, 0.025, -0.3), carbon);
    // Nose (slopes down to the wing).
    add(taper(1.2, 2.25, 0.46, 0.18, 0.34, 0.14, 0.2, 0.14, 0, 0.36, 0.12), livery);
    add(taper(1.2, 2.25, 0.1, 0.05, 0.02, 0.02, 0.54, 0.285), accent);
    // Monocoque / cockpit.
    add(taper(-0.3, 1.25, 0.78, 0.48, 0.58, 0.42, 0.12, 0.16, 0, 0.6, 0.38), livery);
    // Sidepods (coke bottle) with dark undercut.
    for (const s of [1, -1]) {
      add(taper(-1.35, 0.55, 0.22, 0.42, 0.24, 0.44, 0.18, 0.12, s * 0.58, 0.16, 0.36), livery);
      add(taper(-1.0, 0.45, 0.2, 0.36, 0.1, 0.12, 0.08, 0.06, s * 0.56), carbon);
      add(box(0.05, 0.05, 0.8, s * 0.79, 0.5, -0.2), accent);
      // Mirrors.
      add(box(0.16, 0.06, 0.05, s * 0.52, 0.72, 0.62), carbon);
    }
    // Engine cover + shark fin.
    add(taper(-1.95, -0.3, 0.22, 0.62, 0.34, 0.78, 0.2, 0.12, 0, 0.12, 0.34), livery);
    add(taper(-2.0, -0.6, 0.012, 0.012, 0.36, 0.2, 0.48, 0.86), livery);
    add(taper(-1.9, -0.35, 0.06, 0.08, 0.02, 0.02, 0.54, 0.9), second);
    // Airbox + T-cam.
    add(taper(-0.6, -0.15, 0.24, 0.3, 0.12, 0.22, 0.86, 0.76, 0, 0.18, 0.26), livery);
    add(box(0.22, 0.12, 0.02, 0, 0.88, -0.14), new THREE.MeshBasicMaterial({ color: '#000' }));
    add(box(0.14, 0.05, 0.09, 0, 1.0, -0.3), tcam);
    // Driver.
    const head = new THREE.SphereGeometry(0.125, 18, 12);
    head.translate(0, 0.78, 0.12);
    add(head, helmet);
    add(box(0.2, 0.04, 0.05, 0, 0.79, 0.24), new THREE.MeshStandardMaterial({ color: '#08090c', metalness: 0.9, roughness: 0.1 }));
    // Halo.
    const ring = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.34, 0.66, -0.12), new THREE.Vector3(-0.3, 0.8, 0.22), new THREE.Vector3(-0.14, 0.86, 0.44),
      new THREE.Vector3(0, 0.87, 0.48), new THREE.Vector3(0.14, 0.86, 0.44), new THREE.Vector3(0.3, 0.8, 0.22),
      new THREE.Vector3(0.34, 0.66, -0.12),
    ]);
    add(new THREE.TubeGeometry(ring, 24, 0.022, 6), livery);
    add(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0.6, 0.86), new THREE.Vector3(0, 0.87, 0.48)), 2, 0.03, 6), halo);

    // Front wing: main plane, two active flaps, endplates.
    add(box(1.78, 0.025, 0.34, 0, 0.09, 2.36), carbon);
    for (let i = 0; i < 2; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.13 + i * 0.06, 2.24 - i * 0.1);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.018, 0.16), i === 1 ? accent : livery);
      flap.position.z = -0.06;
      pivot.add(flap);
      this.body.add(pivot);
      this.frontFlaps.push(pivot);
    }
    for (const s of [1, -1]) add(taper(2.08, 2.52, 0.02, 0.02, 0.26, 0.2, 0.04, 0.06, s * 0.89), livery);

    // Rear: crash structure, beam wing, main plane, active flap, endplates with lights.
    add(taper(-2.32, -1.9, 0.14, 0.2, 0.16, 0.2, 0.26, 0.24), carbon);
    add(box(0.9, 0.03, 0.18, 0, 0.46, -2.2), carbon);
    add(box(1.0, 0.03, 0.28, 0, 0.8, -2.24), carbon);
    this.rearFlap = new THREE.Group();
    this.rearFlap.position.set(0, 0.85, -2.12);
    const rf = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.022, 0.2), livery);
    rf.position.z = -0.1;
    this.rearFlap.add(rf);
    this.body.add(this.rearFlap);
    for (const s of [1, -1]) {
      add(taper(-2.42, -2.0, 0.022, 0.022, 0.62, 0.5, 0.36, 0.42, s * 0.5), livery);
      add(box(0.03, 0.2, 0.02, s * 0.5, 0.86, -2.43), this.endplateLight);
      add(box(0.02, 0.36, 0.02, s * 0.36, 0.58, -2.18), carbon); // wing pillar
    }
    add(box(0.12, 0.07, 0.03, 0, 0.33, -2.33), this.rainLight);

    // Suspension (single thin arms, just enough to read).
    for (const [z, wz] of [[1.7, 1.05], [-1.7, -1.25]] as const) {
      for (const s of [1, -1]) {
        for (const y of [0.2, 0.34]) {
          const a = new THREE.Vector3(s * 0.25, y + 0.05, wz);
          const b = new THREE.Vector3(s * 0.78, y + (y > 0.3 ? 0.04 : 0), z);
          add(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, 0.014, 4), carbon);
        }
      }
    }

    // Wheels: 18" with covers. Front narrower than rear (2026).
    const coverTex = this.coverTexture(L.accent);
    for (const [z, width] of [[1.7, 0.29], [-1.7, 0.37]] as const) {
      for (const s of [1, -1]) {
        const w = new THREE.Group();
        w.position.set(s * (0.95 - width / 2), 0.36, z);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, width, 28, 1), tire);
        t.rotation.z = Math.PI / 2;
        w.add(t);
        const cover = new THREE.Mesh(new THREE.CircleGeometry(0.25, 28), new THREE.MeshStandardMaterial({
          map: coverTex, metalness: 0.6, roughness: 0.35,
        }));
        cover.position.x = s * (width / 2 + 0.002);
        cover.rotation.y = s * Math.PI / 2;
        w.add(cover);
        const ringM = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.315, 28), new THREE.MeshBasicMaterial({ color: '#c9b13a' }));
        ringM.position.x = s * (width / 2 + 0.003);
        ringM.rotation.y = s * Math.PI / 2;
        w.add(ringM);
        this.body.add(w);
        this.wheels.push(w);
      }
    }

    // Numbers: nose top and engine-cover flanks.
    const numTex = numberTexture(String(number), '#ffffff', null, '900 104px "Big Shoulders Display"');
    const nose = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshStandardMaterial({
      map: numTex, transparent: true, roughness: 0.4, depthWrite: false,
    }));
    nose.rotation.x = -Math.PI / 2 + 0.16;
    nose.rotation.z = Math.PI;
    nose.position.set(0, 0.47, 1.55);
    this.body.add(nose);
    const codeTex = numberTexture(code, '#ffffff', null, '800 92px "Titillium Web"');
    for (const s of [1, -1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshStandardMaterial({
        map: codeTex, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      side.position.set(s * 0.215, 0.62, -1.0);
      side.rotation.y = s * Math.PI / 2;
      side.rotation.x = 0;
      this.body.add(side);
    }

    // Soft contact shadow (no shadow maps on a software renderer).
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.8), new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, depthWrite: false, color: '#000', opacity: 0.85,
    }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);
    this.root.add(this.body);
  }

  private coverTexture(accent: string) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, '#2a2c30');
    g.addColorStop(0.7, '#16171a');
    g.addColorStop(1, '#0b0b0c');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = accent;
    x.lineWidth = 5;
    x.beginPath();
    x.arc(64, 64, 44, 0.2, 1.4);
    x.stroke();
    x.beginPath();
    x.arc(64, 64, 44, 3.3, 4.5);
    x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * Pose the car. `aero` 0 = corner mode (flaps loaded), 1 = straight mode
   * (flaps flattened: the 2026 active-aero signature). `lightBlink` drives the
   * rear lights (on in overtake/energy-deploy moments).
   */
  pose(pos: THREE.Vector3, forward: THREE.Vector3, opts: { yaw?: number; roll?: number; pitch?: number; wheelAngle?: number;
    aero?: number; lights?: number; steer?: number }) {
    this.root.position.copy(pos);
    const yaw = Math.atan2(forward.x, forward.z) + (opts.yaw ?? 0);
    this.root.rotation.set(0, yaw, 0);
    this.body.rotation.set(opts.pitch ?? 0, 0, opts.roll ?? 0);
    const spin = opts.wheelAngle ?? 0;
    this.wheels.forEach((w, i) => {
      w.rotation.set(spin, i < 2 ? (opts.steer ?? 0) : 0, 0, 'YXZ');
    });
    const aero = opts.aero ?? 0;
    this.frontFlaps.forEach((f, i) => (f.rotation.x = (0.42 + i * 0.18) * (1 - aero) + 0.05 * aero));
    this.rearFlap.rotation.x = 0.55 * (1 - aero) - 0.02 * aero;
    const l = opts.lights ?? 1;
    this.rainLight.color.setRGB(6 * l + 0.4, 0.25 * l, 0.2 * l);
    this.endplateLight.color.setRGB(3.2 * l + 0.3, 0.12 * l, 0.1 * l);
  }
}

export function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 64, 4, 32, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.save();
  x.scale(1, 1);
  x.fillRect(0, 0, 64, 128);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  return t;
}
