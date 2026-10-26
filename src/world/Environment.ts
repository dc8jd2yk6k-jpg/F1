import * as THREE from 'three';
import { mulberry32 } from '../engine/rng';
import { TRACK_WIDTH, Track } from './Track';

// Static night-race world: track surface, kerbs, floodlight pools, light
// towers, sky dome, marina water, skyline, and the Yas hotel with its LED
// gridshell (the one landmark that makes it unmistakably Abu Dhabi).

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const rnd = mulberry32(7);
  x.fillStyle = '#151619';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 18 + rnd() * 34;
    x.fillStyle = `rgb(${v},${v},${v + 3})`;
    x.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // Rubbered-in racing line darkening along the middle.
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function radialTexture(stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function windowsTexture(seed: number) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d')!;
  const rnd = mulberry32(seed);
  x.fillStyle = '#000';
  x.fillRect(0, 0, 64, 128);
  for (let yy = 2; yy < 128; yy += 4) {
    for (let xx = 2; xx < 64; xx += 4) {
      if (rnd() < 0.32) {
        const warm = rnd() < 0.7;
        const b = 120 + rnd() * 135;
        x.fillStyle = warm ? `rgb(${b},${b * 0.78},${b * 0.5})` : `rgb(${b * 0.7},${b * 0.85},${b})`;
        x.fillRect(xx, yy, 2, 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Ribbon along the track between two lateral offsets (+ = left). */
function ribbon(track: Track, a: number, b: number, y: number, step = 1, uScale = 1 / 8, colorAt?: (i: number, side: number) => THREE.Color) {
  const n = Math.floor(track.samples / step);
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let k = 0; k <= n; k++) {
    const i = (k * step) % track.samples;
    const s = k * step * track.ds;
    for (const [side, off] of [[0, a], [1, b]] as const) {
      track.offsetPoint(s, off, y, p);
      pos.push(p.x, p.y, p.z);
      uv.push(s * uScale, side);
      if (colorAt) {
        const c = colorAt(i, side);
        col.push(c.r, c.g, c.b);
      }
    }
    if (k < n) {
      const o = k * 2;
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colorAt) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const SKY_FRAG = /* glsl */ `
uniform float twilight; uniform float stars; uniform float time; uniform vec3 horizonTint; uniform float gold;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 zenith = mix(vec3(0.0015, 0.0025, 0.008), vec3(0.03, 0.05, 0.14), twilight);
  vec3 horizon = mix(vec3(0.012, 0.016, 0.035), vec3(0.75, 0.32, 0.16), twilight) + horizonTint;
  float az = atan(d.z, d.x);
  horizon += gold * vec3(1.2, 0.62, 0.22) * pow(max(0.0, cos(az - 1.2)), 3.0);
  vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.45));
  // City glow just above the horizon.
  col += vec3(0.08, 0.05, 0.03) * exp(-max(h, 0.0) * 18.0) * (1.0 - twilight * 0.5);
  if (stars > 0.0 && h > 0.05) {
    vec3 cell = floor(d * 1400.0);
    float r = hash(cell);
    float tw = 0.7 + 0.3 * sin(time * 2.0 + r * 40.0);
    col += vec3(step(0.9993, r) * stars * tw * (0.3 + 1.6 * fract(r * 91.0))) * smoothstep(0.08, 0.35, h);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const CANOPY_VERT = /* glsl */ `
attribute vec2 aUV;
varying vec2 vUV;
varying float vFacing;
void main() {
  vUV = aUV;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * vec3(0.0, 0.0, 1.0));
  vFacing = abs(dot(n, normalize(cameraPosition - wp.xyz)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CANOPY_FRAG = /* glsl */ `
uniform float time, level, kick, mode, intensity;
uniform vec3 c0, c1, c2, c3;
varying vec2 vUV;
varying float vFacing;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = vUV;
  float sweep = 0.5 + 0.5 * sin((uv.x * 9.0 - time * 1.8) + sin(uv.y * 5.0 + time * 0.7) * 1.5);
  float sparkle = step(0.86, hash(floor(uv * vec2(70.0, 28.0)) + floor(time * 8.0)));
  vec3 base = mix(vec3(0.18, 0.3, 0.95), vec3(0.8, 0.86, 1.0), sweep);
  // Mode 1: four contender bands racing along the shell.
  float band = fract(uv.x * 2.0 - time * 0.55);
  vec3 team = band < 0.25 ? c0 : band < 0.5 ? c1 : band < 0.75 ? c2 : c3;
  float teamMask = smoothstep(0.35, 0.9, sweep);
  vec3 col = mix(base, mix(base, team * 1.1, teamMask), clamp(mode, 0.0, 1.0));
  float b = 0.2 + 0.6 * sweep * (0.4 + level) + kick * 1.1 + sparkle * 0.5 * level;
  col *= b * intensity * (0.55 + 0.45 * vFacing);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Environment {
  readonly group = new THREE.Group();
  readonly skyMat: THREE.ShaderMaterial;
  readonly canopyMat: THREE.ShaderMaterial;
  readonly canopy: THREE.InstancedMesh;
  readonly canopyCenter = new THREE.Vector3();
  readonly hotelS: number;
  readonly poolsMat: THREE.MeshBasicMaterial;
  readonly towerHeads: THREE.InstancedMesh;
  readonly sky: THREE.Mesh;
  readonly trackGroup = new THREE.Group();

  constructor(readonly track: Track) {
    const W = TRACK_WIDTH;

    // Sky.
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: SKY_FRAG,
      uniforms: { twilight: { value: 0 }, stars: { value: 1 }, time: { value: 0 }, horizonTint: { value: new THREE.Vector3() }, gold: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    // Ground and marina.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#050608', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    this.group.add(ground);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(520, 260), new THREE.MeshStandardMaterial({
      color: '#05080f', metalness: 1, roughness: 0.12, envMapIntensity: 1.6,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(-430, -0.05, -150);
    this.group.add(water);

    // Track surface layers.
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), color: '#6a6a6a', roughness: 0.6, metalness: 0.05, envMapIntensity: 0.1 });
    this.trackGroup.add(new THREE.Mesh(ribbon(this.track, -W / 2, W / 2, 0, 1, 1 / 10), asphalt));
    const runoff = new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.85 });
    this.trackGroup.add(new THREE.Mesh(ribbon(this.track, W / 2 + 1.3, W / 2 + 14, -0.02, 2), runoff));
    this.trackGroup.add(new THREE.Mesh(ribbon(this.track, -W / 2 - 14, -W / 2 - 1.3, -0.02, 2), runoff));
    const line = new THREE.MeshStandardMaterial({ color: '#bfbfbf', roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.03 });
    this.trackGroup.add(new THREE.Mesh(ribbon(this.track, W / 2 - 0.45, W / 2 - 0.25, 0.01), line));
    this.trackGroup.add(new THREE.Mesh(ribbon(this.track, -W / 2 + 0.25, -W / 2 + 0.45, 0.01), line));
    // Kerbs: red/white where the track bends.
    const red = new THREE.Color('#c41a1a');
    const white = new THREE.Color('#e6e6e6');
    const asph = new THREE.Color('#1f2023');
    const kerbColor = (i: number) => {
      const bend = Math.abs(this.track.curv[i]) > 0.006;
      if (!bend) return asph;
      return Math.floor((i * this.track.ds) / 3) % 2 === 0 ? red : white;
    };
    const kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    this.trackGroup.add(new THREE.Mesh(ribbon(this.track, W / 2, W / 2 + 1.3, 0.015, 1, 1, kerbColor), kerbMat));
    this.trackGroup.add(new THREE.Mesh(ribbon(this.track, -W / 2 - 1.3, -W / 2, 0.015, 1, 1, kerbColor), kerbMat));
    // Chequered finish line across the track at s = 0.
    {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 32;
      const x = c.getContext('2d')!;
      for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) {
        x.fillStyle = (i + j) % 2 ? '#e8e8e8' : '#0a0a0a';
        x.fillRect(i * 8, j * 8, 8, 8);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      const p0 = this.track.pointAt(0);
      const t0 = this.track.tangentAt(0);
      line.rotation.set(-Math.PI / 2, Math.atan2(t0.x, t0.z), 0, 'YXZ');
      line.position.copy(p0).setY(0.02);
      this.trackGroup.add(line);
    }
    // Barriers with LED bands.
    this.trackGroup.add(this.barrier(W / 2 + 14, 1));
    this.trackGroup.add(this.barrier(-W / 2 - 14, -1));
    this.group.add(this.trackGroup);

    // Floodlight towers and the light pools they throw on the asphalt.
    const towerGeo = new THREE.CylinderGeometry(0.35, 0.5, 26, 6);
    towerGeo.translate(0, 13, 0);
    const spacing = 70;
    const nT = Math.floor(this.track.length / spacing);
    const towers = new THREE.InstancedMesh(towerGeo, new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.7 }), nT);
    const headGeo = new THREE.BoxGeometry(3.2, 1.4, 0.6);
    this.towerHeads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 4.2, 3.8) }), nT);
    const poolGeo = new THREE.PlaneGeometry(58, 46);
    poolGeo.rotateX(-Math.PI / 2);
    this.poolsMat = new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,240,220,0.55)'], [0.45, 'rgba(255,230,200,0.22)'], [1, 'rgba(255,220,180,0)']]),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0.42, 0.4, 0.37),
    });
    const pools = new THREE.InstancedMesh(poolGeo, this.poolsMat, nT);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const tg = new THREE.Vector3();
    for (let i = 0; i < nT; i++) {
      const s = i * spacing + 20;
      const side = i % 2 === 0 ? 1 : -1;
      this.track.offsetPoint(s, side * (W / 2 + 16), 0, p);
      this.track.tangentAt(s, tg);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(tg.x, tg.z));
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      towers.setMatrixAt(i, m);
      const hp = p.clone().setY(26.5);
      const toward = this.track.pointAt(s).sub(p).setY(0).normalize();
      const hq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toward);
      m.compose(hp, hq, new THREE.Vector3(1, 1, 1));
      this.towerHeads.setMatrixAt(i, m);
      this.track.offsetPoint(s, side * 3, 0.03, p);
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      pools.setMatrixAt(i, m);
    }
    this.group.add(towers, this.towerHeads, pools);

    // Skyline ring.
    this.group.add(this.skyline());

    // Yas hotel + LED gridshell spanning the track.
    this.hotelS = this.track.nearestS(new THREE.Vector3(-245, 0, -140));
    const built = this.hotel();
    this.canopy = built.canopy;
    this.canopyMat = built.mat;
  }

  private barrier(offset: number, side: number) {
    const n = Math.floor(this.track.samples / 2);
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const p = new THREE.Vector3();
    const rnd = mulberry32(side > 0 ? 3 : 5);
    let ledColor = new THREE.Color(0.1, 0.1, 0.12);
    for (let k = 0; k <= n; k++) {
      const s = k * 2 * this.track.ds;
      if (k % 30 === 0) {
        const r = rnd();
        ledColor = r < 0.35 ? new THREE.Color(0.06, 0.06, 0.07)
          : r < 0.55 ? new THREE.Color(2.2, 0.25, 0.2) : r < 0.75 ? new THREE.Color(0.3, 1.4, 2.4) : new THREE.Color(1.8, 1.6, 1.4);
      }
      this.track.offsetPoint(s, offset, 0, p);
      for (const h of [0, 0.7, 0.7, 1.2]) {
        pos.push(p.x, h, p.z);
      }
      const dark = [0.05, 0.05, 0.06];
      col.push(...dark, ...dark, ledColor.r, ledColor.g, ledColor.b, ledColor.r, ledColor.g, ledColor.b);
      if (k < n) {
        const o = k * 4;
        idx.push(o, o + 4, o + 1, o + 1, o + 4, o + 5, o + 2, o + 6, o + 3, o + 3, o + 6, o + 7);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  }

  private skyline() {
    const group = new THREE.Group();
    const rnd = mulberry32(11);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    for (let variant = 0; variant < 3; variant++) {
      const tex = windowsTexture(20 + variant);
      const mat = new THREE.MeshStandardMaterial({ color: '#07080b', roughness: 0.9, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.6 });
      const n = 70;
      const inst = new THREE.InstancedMesh(geo, mat, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 1100 + rnd() * 900;
        const h = 25 + Math.pow(rnd(), 2) * 190;
        const w = 25 + rnd() * 45;
        m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r - 200), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 3),
          new THREE.Vector3(w, h, w * (0.6 + rnd() * 0.8)));
        inst.setMatrixAt(i, m);
      }
      group.add(inst);
    }
    return group;
  }

  private hotel() {
    const s = this.hotelS;
    const center = this.track.pointAt(s);
    const along = this.track.tangentAt(s).clone();
    const across = this.track.leftAt(s).clone();
    this.canopyCenter.copy(center).setY(28);

    // Hotel towers either side of the track, windows lit.
    const winMat = new THREE.MeshStandardMaterial({ color: '#0b0c10', roughness: 0.6, emissive: '#ffffff', emissiveMap: windowsTexture(99), emissiveIntensity: 1.2 });
    for (const side of [1, -1]) {
      const g = new THREE.BoxGeometry(140, 26, 26);
      const b = new THREE.Mesh(g, winMat);
      b.position.copy(center).addScaledVector(across, side * 40).setY(13);
      b.rotation.y = Math.atan2(along.x, along.z) + Math.PI / 2;
      this.group.add(b);
    }

    // Gridshell: diamond panels on a hull surface over both towers + bridge.
    const NU = 72;
    const NV = 30;
    const L = 230;
    const Wd = 150;
    const panel = new THREE.PlaneGeometry(1, 1);
    panel.rotateZ(Math.PI / 4);
    const count = NU * NV;
    const mat = new THREE.ShaderMaterial({
      vertexShader: CANOPY_VERT,
      fragmentShader: CANOPY_FRAG,
      uniforms: {
        time: { value: 0 }, level: { value: 0.5 }, kick: { value: 0 }, mode: { value: 0 }, intensity: { value: 1 },
        c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() },
      },
      side: THREE.DoubleSide,
    });
    const inst = new THREE.InstancedMesh(panel, mat, count);
    const uvs = new Float32Array(count * 2);
    const m = new THREE.Matrix4();
    const surf = (u: number, v: number, out: THREE.Vector3) => {
      const su = Math.sin(Math.PI * u);
      const halfW = (Wd / 2) * Math.pow(su, 0.35);
      const a = (v - 0.5) * Math.PI * 0.9;
      out.copy(center)
        .addScaledVector(along, (u - 0.5) * L)
        .addScaledVector(across, Math.sin(a) * halfW);
      out.y = 27 + 26 * Math.cos(a) * Math.pow(su, 0.5);
      return out;
    };
    const p = new THREE.Vector3();
    const pu = new THREE.Vector3();
    const pv = new THREE.Vector3();
    const n = new THREE.Vector3();
    const basis = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const u = (i + 0.5 + (j % 2) * 0.5) / (NU + 0.5);
        const v = (j + 0.5) / NV;
        surf(u, v, p);
        surf(u + 0.002, v, pu).sub(p).normalize();
        surf(u, v + 0.002, pv).sub(p).normalize();
        n.crossVectors(pu, pv).normalize();
        const du = (L / NU) * 0.92;
        const dv = ((Math.PI * 0.9 * Wd) / 2 / NV) * 0.75;
        basis.makeBasis(pu, pv, n);
        m.copy(basis).scale(new THREE.Vector3(du * 0.72, dv * 0.72, 1)).setPosition(p);
        inst.setMatrixAt(k, m);
        uvs[k * 2] = u;
        uvs[k * 2 + 1] = v;
        k++;
      }
    }
    inst.geometry = panel.clone();
    inst.geometry.setAttribute('aUV', new THREE.InstancedBufferAttribute(uvs, 2));
    inst.frustumCulled = false;
    this.group.add(inst);
    return { canopy: inst, mat };
  }
}
