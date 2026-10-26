import * as THREE from 'three';
import season from '../data/season.json';
import { feat, hitEnvelope } from '../engine/AudioFeatures';
import type { Act, Engine, FrameCtx } from '../engine/Engine';
import { clamp, easeInOutSine, easeOutCubic, easeOutExpo, lerp, smoothstep, window01 } from '../engine/math';
import { BEAT, barTime } from '../engine/Timeline';
import { hex } from '../overlay/Cards';
import type { CarCode } from '../world/RaceSim';
import { Trail } from '../world/Trails';
import { teamColor } from '../world/World';
import { lens } from './rigs';

// Bars 6–15. The bass verse.
//  6–9   The runaway: a single gold thread (#12) tears past and away to the
//        horizon — out of reach. 365 points, nine wins.
//  10–15 Behind him: four threads braid through one gate per beat, one gate
//        per round run so far, crossing and re-crossing, and converge into a
//        knot nine points wide. Stylised: only the endpoints are data.

const GATE_SPACING = 40;
const CONTENDERS = season.contenders.map((c) => c.code as CarCode);
const ROUNDS = season.roundsRun;

const FLOOR_FRAG = /* glsl */ `
varying vec3 vW;
uniform float fade;
void main() {
  float d = length(vW.xz - cameraPosition.xz);
  vec2 g = abs(fract(vec2(vW.x / 4.0, vW.z / 10.0) - 0.5) - 0.5) / fwidth(vec2(vW.x / 4.0, vW.z / 10.0));
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  float fall = exp(-d / 140.0);
  vec3 c = vec3(0.012, 0.016, 0.03) + vec3(0.12, 0.16, 0.25) * line * fall;
  gl_FragColor = vec4(c * fade, 0.86);
}
`;

export class Threads implements Act {
  readonly name = 'threads' as const;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 6000);
  private readonly gold = new Trail(400);
  private readonly goldMirror = new Trail(400);
  private readonly threads: Trail[] = [];
  private readonly mirrors: Trail[] = [];
  private readonly gates: THREE.Mesh[] = [];
  private readonly gateMat: THREE.MeshBasicMaterial[] = [];
  private readonly floorMat: THREE.ShaderMaterial;
  private readonly pts: THREE.Vector3[] = [];
  private readonly heads: THREE.Vector3[] = CONTENDERS.map(() => new THREE.Vector3());

  constructor() {
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: FLOOR_FRAG,
      uniforms: { fade: { value: 1 } },
      transparent: true,
      depthWrite: false,
      extensions: { derivatives: true } as never,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -1500;
    floor.renderOrder = 1;
    this.scene.add(floor);
    for (const tr of [this.goldMirror, this.gold]) this.scene.add(tr.mesh);
    for (let i = 0; i < 4; i++) {
      const t = new Trail(500);
      const m = new Trail(500);
      m.mesh.renderOrder = 0;
      t.mesh.renderOrder = 2;
      this.threads.push(t);
      this.mirrors.push(m);
      this.scene.add(t.mesh, m.mesh);
    }
    this.gold.mesh.renderOrder = 2;
    // Gates: thin frames, one per round run.
    for (let k = 0; k < ROUNDS.length; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.45, 0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const shape = new THREE.Shape();
      shape.moveTo(-6, 0);
      shape.lineTo(6, 0);
      shape.lineTo(6, 6);
      shape.lineTo(-6, 6);
      shape.lineTo(-6, 0);
      const hole = new THREE.Path();
      hole.moveTo(-5.9, 0.0);
      hole.lineTo(-5.9, 5.9);
      hole.lineTo(5.9, 5.9);
      hole.lineTo(5.9, 0.0);
      shape.holes.push(hole);
      const g = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      g.position.set(0, 0, -GATE_SPACING * (k + 1));
      g.renderOrder = 3;
      this.scene.add(g);
      this.gates.push(g);
      this.gateMat.push(mat);
    }
    for (let i = 0; i < 500; i++) this.pts.push(new THREE.Vector3());
  }

  setup(_e: Engine) {}

  render(f: FrameCtx) {
    const { t, bar, post, ui } = f;
    post.letterbox = 1;
    post.bloom = 1.0;
    post.bloomThreshold = 0.8;
    post.streak = 0.55;
    post.vignette = 0.7;
    post.lift = [0, 0.004, 0.012];
    post.saturation = 1.1;
    const low = clamp(feat('low', t));
    const kick = hitEnvelope('kicks', t, 0.12, 0.3);
    post.ca = 0.002 + kick * 0.003;
    post.exposure = 1 + 0.08 * kick;
    if (bar >= 14.4) post.bloom = lerp(1.0, 0.55, smoothstep(14.4, 15, bar));
    f.begin(0x000000);
    if (bar < 10) this.runaway(f, low);
    else this.braid(f, low, kick);
    f.draw(this.scene, this.cam);
    void ui;
  }

  // ---- 6–9: the runaway ----------------------------------------------------
  private runaway(f: FrameCtx, low: number) {
    const { t, bar, ui } = f;
    const d = t - barTime(6);
    const headZ = 2 - 260 * (1 - Math.exp(-d / 0.9)) - 60 * d;
    const camZ = 8 - 6 * easeOutCubic(clamp(d / 6));
    this.cam.position.set(1.2, 1.5 + 0.1 * Math.sin(d * 0.6), camZ);
    this.cam.lookAt(0, 1.1, camZ - 50);
    lens(this.cam, 48, f.aspect);
    const n = 380;
    const len = Math.min(140 + d * 120, 1400);
    for (let i = 0; i < n; i++) {
      const z = headZ + (len * i) / (n - 1);
      this.pts[i].set(0.35 * Math.sin(z * 0.02), 0.9 + 0.12 * Math.sin(z * 0.035), z);
    }
    const gold = teamColor('ANT');
    const intensity = 5 + low * 3;
    this.gold.set(this.pts.slice(0, n), this.cam.position, gold, 0.11, intensity, 0.9, 3);
    for (let i = 0; i < n; i++) this.pts[i].y = -this.pts[i].y;
    this.goldMirror.set(this.pts.slice(0, n), this.cam.position, gold, 0.11, intensity * 0.22, 0.9, 1);
    for (const th of [...this.threads, ...this.mirrors]) th.hide();
    for (const g of this.gates) g.visible = false;
    this.floorMat.uniforms.fade.value = 1;

    const goldCss = hex('ANT');
    const L = season.leader;
    const a1 = window01(bar, 6.12, 9.85, 0.05, 0.2);
    ui.wipeText(L.last.toUpperCase(), 140, 470, easeOutExpo((bar - 6.12) / 0.6), { font: 'title', size: 118, weight: 900, tracking: 0.06, color: goldCss, alpha: a1 });
    ui.typeText(`#${L.number} · MERCEDES`, 146, 520, clamp((bar - 6.5) / 0.5), { font: 'mono', size: 24, weight: 700, tracking: 0.2, color: '#c9ced8', alpha: a1 }, false);
    const a2 = window01(bar, 7, 9.85, 0.04, 0.2);
    if (a2 > 0) {
      const s = lerp(1.15, 1, easeOutExpo((bar - 7) / 0.4));
      ui.text(String(L.points), 140, 760, { font: 'display', size: 230 * s, weight: 900, color: goldCss, alpha: a2, glow: goldCss, glowBlur: 30 });
      const w = ui.measure(String(L.points), { font: 'display', size: 230, weight: 900 });
      ui.text('PTS', 160 + w, 700, { font: 'title', size: 44, weight: 700, tracking: 0.2, alpha: a2 });
      ui.text(`${L.wins} WINS`, 160 + w, 760, { font: 'title', size: 44, weight: 700, tracking: 0.2, color: '#c9ced8', alpha: smoothstep(7.4, 7.6, bar) * a2 });
    }
    const crown = L.championDecided ? 'THE CROWN IS HIS.' : 'THE CROWN IS ALL BUT HIS.';
    ui.wipeText(crown, 140, 880, easeOutCubic((bar - 8) / 0.8), { font: 'title', size: 54, weight: 700, tracking: 0.06, alpha: window01(bar, 8, 9.85, 0.05, 0.2) });
    ui.text(L.championDecided ? '' : L.clinchNote.toUpperCase(), 142, 925, {
      font: 'mono', size: 18, weight: 700, tracking: 0.16, color: '#8d96a6', alpha: window01(bar, 8.5, 9.85, 0.2, 0.2),
    });
  }

  // ---- 10–15: the braid ----------------------------------------------------
  private braid(f: FrameCtx, low: number, kick: number) {
    const { t, bar, ui } = f;
    const beats = (t - barTime(10)) / BEAT;
    const total = ROUNDS.length * GATE_SPACING + 20;
    // Heads travel one gate per beat, then ease into the knot.
    const travel = beats < ROUNDS.length ? beats * GATE_SPACING : ROUNDS.length * GATE_SPACING + 20 * easeOutCubic((beats - ROUNDS.length) / 3);
    const headZ = -Math.min(travel, total);
    const knot = smoothstep(14.4, 15.2, bar);
    const settle = easeInOutSine(knot);

    // Two angles on the braid (cut on bar 12), then settle side-on to the knot.
    const orbitA = (t - barTime(bar < 12 ? 10 : 12)) / (barTime(2) - barTime(0));
    if (bar < 12) {
      this.cam.position.set(-7.5 + orbitA * 2.5, 4.6 - orbitA * 0.8, headZ + 22);
      this.cam.lookAt(0, 1.2, headZ - 28);
      lens(this.cam, 50, f.aspect);
    } else {
      // Low, under the threads, looking up as they braid overhead.
      const side = lerp(5.5, 2.5, clamp(orbitA));
      this.cam.position.set(lerp(side, 10, settle), lerp(0.35, 1.9, settle), headZ + lerp(16, 1.5, settle));
      this.cam.lookAt(lerp(-1, 0, settle), lerp(2.2, 1.25, settle), headZ - lerp(20, -5, settle));
      lens(this.cam, lerp(58, 30, settle), f.aspect);
    }

    const pts = CONTENDERS.map((c) => season.contenders.find((d) => d.code === c)!.points);
    const mid = (Math.max(...pts) + Math.min(...pts)) / 2;
    const n = 460;
    const span = 260;
    CONTENDERS.forEach((code, idx) => {
      const ph = (idx / 4) * Math.PI * 2;
      const endY = 1.25 + (pts[idx] - mid) * 0.07;
      const endX = (idx - 1.5) * 0.12;
      for (let i = 0; i < n; i++) {
        const z = headZ + (span * i) / (n - 1);
        const u = clamp(-z / total);
        const amp = 2.6 * Math.pow(1 - u, 1.1) + 0.05;
        const conv = smoothstep(0.8, 1, u);
        const x = amp * Math.sin(u * Math.PI * 7 + ph) * (1 - conv) + endX * conv;
        const y = 1.25 + amp * 0.45 * Math.cos(u * Math.PI * 5.5 + ph * 1.3) * (1 - conv) + (endY - 1.25) * conv;
        this.pts[i].set(x, Math.max(0.15, y), z);
      }
      this.heads[idx].copy(this.pts[0]);
      const col = teamColor(code);
      const stripe = season.contenders[idx].trail === 'stripe';
      const intensity = (2.2 + low * 1.4 + kick * 1.2) * (1 - 0.6 * settle);
      const tint = stripe ? col.clone().lerp(new THREE.Color(1, 1, 1), 0.3) : col;
      this.threads[idx].set(this.pts.slice(0, n), this.cam.position, tint, stripe ? 0.05 : 0.04, intensity, 2.0, 2.5);
      for (let i = 0; i < n; i++) this.pts[i].y = -this.pts[i].y;
      this.mirrors[idx].set(this.pts.slice(0, n), this.cam.position, col, 0.04, intensity * 0.18, 2.0, 1);
    });
    this.gold.hide();
    this.goldMirror.hide();
    this.gates.forEach((g, k) => {
      g.visible = true;
      const gz = -GATE_SPACING * (k + 1);
      const passed = headZ < gz;
      const age = passed ? (gz - headZ) / GATE_SPACING : 0;
      const flash = passed ? Math.exp(-age * 1.5) : 0;
      const v = 0.25 + flash * 2.5;
      this.gateMat[k].color.setRGB(v * 0.85, v * 0.9, v);
      this.gateMat[k].opacity = 1 - knot * 0.8;
    });
    this.floorMat.uniforms.fade.value = 1;

    // Round ticker.
    const k = Math.min(ROUNDS.length - 1, Math.floor(beats));
    const tickA = window01(bar, 10, 14.45, 0.05, 0.15);
    if (beats >= 0 && tickA > 0) {
      const pop = Math.exp(-(beats - Math.floor(beats)) * 4);
      ui.text(`R${String(k + 1).padStart(2, '0')}`, 960, 1010, { font: 'mono', size: 30, weight: 700, align: 'right', color: '#8d96a6', alpha: tickA });
      ui.text(ROUNDS[k], 980, 1012, { font: 'title', size: 34 + pop * 6, weight: 900, tracking: 0.2, alpha: tickA });
    }
    ui.wipeText('BEHIND HIM —', 140, 220, easeOutCubic((bar - 10.05) / 0.7), { font: 'title', size: 54, weight: 700, tracking: 0.08, alpha: window01(bar, 10.05, 12.4, 0.05, 0.3) });
    ui.wipeText(`${ROUNDS.length} ROUNDS OF CHANGING PLACES.`, 140, 220, easeOutCubic((bar - 12.5) / 0.7), { font: 'title', size: 54, weight: 700, tracking: 0.08, alpha: window01(bar, 12.5, 14.4, 0.05, 0.3) });

    // The knot: labels on each head + the headline.
    if (knot > 0) {
      const v = new THREE.Vector3();
      CONTENDERS.forEach((code, idx) => {
        v.copy(this.heads[idx]).project(this.cam);
        const x = (v.x * 0.5 + 0.5) * 1920;
        const y = (-v.y * 0.5 + 0.5) * 1080;
        const a = smoothstep(14.6 + idx * 0.1, 14.9 + idx * 0.1, bar) * window01(bar, 14.5, 15.98, 0.01, 0.06);
        const lx = 1300;
        const ly = 250 + idx * 62;
        ui.line(x + 6, y, lx - 16, ly - 10, hex(code), 1.5, a * 0.7);
        ui.text(code, lx, ly, { font: 'title', size: 36, weight: 900, tracking: 0.1, alpha: a });
        ui.text(String(pts[idx]), lx + 220, ly, { font: 'mono', size: 36, weight: 700, align: 'right', color: hex(code), alpha: a });
      });
      const ha = window01(bar, 14.9, 15.98, 0.04, 0.06);
      const spread = Math.max(...pts) - Math.min(...pts);
      ui.wipeText(`${CONTENDERS.length} DRIVERS · ${spread} POINTS`, 140, 900, easeOutCubic((bar - 14.9) / 0.5), {
        font: 'title', size: 72, weight: 900, tracking: 0.06, alpha: ha,
      });
      ui.text('FOR SECOND PLACE', 144, 950, { font: 'mono', size: 22, weight: 700, tracking: 0.3, color: '#9aa3b2', alpha: ha * smoothstep(15.2, 15.4, bar) });
    }
  }
}
