import * as THREE from 'three';

// Lean HDR post pipeline, written for software WebGL (SwiftShader) where
// full-resolution passes are the dominant cost. Only two passes touch every
// pixel: the scene render and one composite. Bloom and the anamorphic streak
// run on a quarter-resolution mip chain.
//
//   scene (HDR, W×H) ─┬─ prefilter W/2 ─ down W/4 … W/32 ─ up … W/4 ── bloom
//                     │                     └─ horizontal streak W/4×H/8 ── streak
//                     └──────────── composite (tonemap, CA, grade, letterbox,
//                                   overlay, grain, fades) ─► canvas

export interface PostParams {
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  streak: number;
  streakTint: [number, number, number];
  ca: number;
  vignette: number;
  grain: number;
  /** 0 = full 16:9, 1 = 2.39:1 scope bars. */
  letterbox: number;
  /** 0 = visible, 1 = black. */
  fade: number;
  /** Additive white flash 0..1. */
  flash: number;
  saturation: number;
  lift: [number, number, number];
  gain: [number, number, number];
  gamma: number;
  /** Zoom/radial blur toward `radialCenter` (uv), 0 = off. */
  radial: number;
  radialCenter: [number, number];
  overlay: number;
}

export const defaultPost = (): PostParams => ({
  exposure: 1,
  bloom: 0.7,
  bloomThreshold: 1.0,
  streak: 0.35,
  streakTint: [0.9, 0.95, 1.2],
  ca: 0.0008,
  vignette: 0.55,
  grain: 0.026,
  letterbox: 0,
  fade: 0,
  flash: 0,
  saturation: 1.05,
  lift: [0.0, 0.004, 0.012],
  gain: [1, 1, 1],
  gamma: 1,
  radial: 0,
  radialCenter: [0.5, 0.5],
  overlay: 1,
});

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PREFILTER = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold;
varying vec2 vUv;
vec3 bright(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  float knee = threshold * 0.5;
  float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, l - threshold) / max(l, 1e-4);
  return c * w;
}
void main() {
  vec3 a = texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + texel * vec2( 1.0, -1.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + texel * vec2(-1.0,  1.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + texel * vec2( 1.0,  1.0)).rgb;
  // Karis average: tames single-pixel fireflies (sparks, specular glints).
  float wa = 1.0 / (1.0 + max(a.r, max(a.g, a.b)));
  float wb = 1.0 / (1.0 + max(b.r, max(b.g, b.b)));
  float wc = 1.0 / (1.0 + max(c.r, max(c.g, c.b)));
  float wd = 1.0 / (1.0 + max(d.r, max(d.g, d.b)));
  vec3 avg = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  gl_FragColor = vec4(bright(min(avg, vec3(64.0))), 1.0);
}
`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb;
  s += texture2D(tSrc, vUv + texel * vec2( 1.0, -1.0)).rgb;
  s += texture2D(tSrc, vUv + texel * vec2(-1.0,  1.0)).rgb;
  s += texture2D(tSrc, vUv + texel * vec2( 1.0,  1.0)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}
`;

const UP = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 texel; uniform float spread; uniform float falloff;
varying vec2 vUv;
void main() {
  vec2 o = texel * spread;
  vec3 s = vec3(0.0);
  s += texture2D(tSrc, vUv + vec2(-2.0, 0.0) * o).rgb;
  s += texture2D(tSrc, vUv + vec2( 2.0, 0.0) * o).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0, -2.0) * o).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0,  2.0) * o).rgb;
  s += texture2D(tSrc, vUv + vec2(-1.0,  1.0) * o).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2( 1.0,  1.0) * o).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * o).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2( 1.0, -1.0) * o).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 * falloff + texture2D(tBase, vUv).rgb, 1.0);
}
`;

const STREAK = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel; uniform float stride;
varying vec2 vUv;
void main() {
  vec3 s = vec3(0.0); float w = 0.0;
  for (int i = -4; i <= 4; i++) {
    float k = exp(-float(i * i) / 10.0);
    s += texture2D(tSrc, vUv + vec2(float(i) * stride * texel.x, 0.0)).rgb * k;
    w += k;
  }
  gl_FragColor = vec4(s / w, 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tStreak; uniform sampler2D tOverlay;
uniform vec2 resolution;
uniform float exposure, bloom, streak, ca, vignette, grain, letterbox, fade, flash, saturation, gamma, radial, overlay, seed;
uniform vec3 streakTint, lift, gain;
uniform vec2 radialCenter;
varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 sceneCA(vec2 uv) {
  vec2 d = (uv - 0.5) * ca;
  return vec3(texture2D(tScene, uv + d).r, texture2D(tScene, uv).g, texture2D(tScene, uv - d).b);
}

void main() {
  vec2 uv = vUv;
  vec3 col;
  if (radial > 0.0) {
    vec2 dir = (uv - radialCenter) * radial;
    col = vec3(0.0);
    for (int i = 0; i < 8; i++) col += sceneCA(uv - dir * (float(i) / 7.0));
    col /= 8.0;
  } else {
    col = sceneCA(uv);
  }
  col += texture2D(tBloom, uv).rgb * bloom;
  col += texture2D(tStreak, uv).rgb * streak * streakTint;
  col = aces(col * exposure);
  col = toSRGB(col);

  // Grade (display space): lift / gain / gamma / saturation.
  col = gain * (col + lift * (1.0 - col));
  col = pow(max(col, 0.0), vec3(1.0 / gamma));
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);

  vec2 q = uv - 0.5;
  q.x *= resolution.x / resolution.y;
  col *= 1.0 - vignette * smoothstep(0.35, 1.25, length(q));

  float bar = letterbox * 0.5 * (1.0 - (16.0 / 9.0) / 2.39);
  float inBar = step(uv.y, bar) + step(1.0 - bar, uv.y);
  col = mix(col, vec3(0.0), clamp(inBar, 0.0, 1.0));

  vec4 o = texture2D(tOverlay, uv);
  col = mix(col, o.rgb, o.a * overlay);

  float n = hash12(gl_FragCoord.xy + seed * 17.0) - 0.5;
  col += n * grain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));

  col = mix(col, vec3(1.0), clamp(flash, 0.0, 1.0));
  col *= 1.0 - clamp(fade, 0.0, 1.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

function rt(w: number, h: number, opts: Partial<THREE.RenderTargetOptions> = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    ...opts,
  });
}

export class Compositor {
  readonly scene: THREE.WebGLRenderTarget;
  private readonly mips: THREE.WebGLRenderTarget[] = [];
  private readonly ups: THREE.WebGLRenderTarget[] = [];
  private readonly streaks: THREE.WebGLRenderTarget[];
  private readonly quad: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mats: Record<'prefilter' | 'down' | 'up' | 'streak' | 'composite', THREE.ShaderMaterial>;
  private readonly black: THREE.WebGLRenderTarget;

  constructor(private readonly renderer: THREE.WebGLRenderer, readonly width: number, readonly height: number,
              readonly overlay: THREE.Texture, samples = 0) {
    this.scene = rt(width, height, { depthBuffer: true, samples });
    let w = width >> 1;
    let h = height >> 1;
    for (let i = 0; i < 5; i++) {
      this.mips.push(rt(w, h));
      if (i >= 1 && i <= 3) this.ups.push(rt(w, h));
      w >>= 1;
      h >>= 1;
    }
    this.streaks = [rt(width >> 2, height >> 3), rt(width >> 2, height >> 3)];
    this.black = rt(1, 1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mats = {
      prefilter: mk(PREFILTER, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 } }),
      down: mk(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } }),
      up: mk(UP, { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() }, spread: { value: 1 }, falloff: { value: 0.7 } }),
      streak: mk(STREAK, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, stride: { value: 1 } }),
      composite: mk(COMPOSITE, {
        tScene: { value: this.scene.texture },
        tBloom: { value: null },
        tStreak: { value: null },
        tOverlay: { value: overlay },
        resolution: { value: new THREE.Vector2(width, height) },
        exposure: { value: 1 }, bloom: { value: 1 }, streak: { value: 0 }, ca: { value: 0 }, vignette: { value: 0 },
        grain: { value: 0 }, letterbox: { value: 0 }, fade: { value: 0 }, flash: { value: 0 }, saturation: { value: 1 },
        gamma: { value: 1 }, radial: { value: 0 }, overlay: { value: 1 }, seed: { value: 0 },
        streakTint: { value: new THREE.Vector3(1, 1, 1) }, lift: { value: new THREE.Vector3() },
        gain: { value: new THREE.Vector3(1, 1, 1) }, radialCenter: { value: new THREE.Vector2(0.5, 0.5) },
      }),
    };
    this.quad = new THREE.Mesh(geo, this.mats.composite);
    this.quad.frustumCulled = false;
    renderer.setRenderTarget(this.black);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(null);
  }

  /** Clear the HDR scene target. Acts then draw one or more views into it. */
  begin(clear = new THREE.Color(0, 0, 0)) {
    const r = this.renderer;
    r.setRenderTarget(this.scene);
    this.scene.scissorTest = false;
    this.scene.viewport.set(0, 0, this.width, this.height);
    r.setClearColor(clear, 1);
    r.clear(true, true, false);
  }

  /** Render a scene into the HDR target, optionally into a pixel rect (split screens). */
  draw(scene: THREE.Scene, camera: THREE.Camera, rect?: [x: number, y: number, w: number, h: number]) {
    const r = this.renderer;
    const t = this.scene;
    if (rect) {
      t.viewport.set(...rect);
      t.scissor.set(...rect);
      t.scissorTest = true;
    } else {
      t.viewport.set(0, 0, this.width, this.height);
      t.scissorTest = false;
    }
    r.setRenderTarget(t);
    r.autoClear = false;
    r.clearDepth();
    r.render(scene, camera);
    t.scissorTest = false;
    t.viewport.set(0, 0, this.width, this.height);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }

  finish(p: PostParams, frame: number) {
    const m = this.mats;
    const bloomOn = p.bloom > 0 || p.streak > 0;
    if (bloomOn) {
      m.prefilter.uniforms.tSrc.value = this.scene.texture;
      m.prefilter.uniforms.texel.value.set(1 / this.width, 1 / this.height);
      m.prefilter.uniforms.threshold.value = p.bloomThreshold;
      this.pass(m.prefilter, this.mips[0]);
      for (let i = 1; i < this.mips.length; i++) {
        const src = this.mips[i - 1];
        m.down.uniforms.tSrc.value = src.texture;
        m.down.uniforms.texel.value.set(1 / src.width, 1 / src.height);
        this.pass(m.down, this.mips[i]);
      }
      // Upsample: mip4 → up[2] (mip3 size) → up[1] → up[0] (mip1 size = W/4).
      let src = this.mips[4];
      for (let i = 2; i >= 0; i--) {
        m.up.uniforms.tSrc.value = src.texture;
        m.up.uniforms.tBase.value = this.mips[i + 1].texture;
        m.up.uniforms.texel.value.set(1 / src.width, 1 / src.height);
        m.up.uniforms.spread.value = 1;
        this.pass(m.up, this.ups[i]);
        src = this.ups[i];
      }
      if (p.streak > 0) {
        let s = this.mips[1];
        const strides = [1.5, 5, 14];
        for (let i = 0; i < strides.length; i++) {
          const dst = this.streaks[i % 2];
          m.streak.uniforms.tSrc.value = s.texture;
          m.streak.uniforms.texel.value.set(1 / dst.width, 1 / dst.height);
          m.streak.uniforms.stride.value = strides[i];
          this.pass(m.streak, dst);
          s = dst;
        }
      }
    }
    const u = m.composite.uniforms;
    u.tBloom.value = bloomOn ? this.ups[0].texture : this.black.texture;
    u.tStreak.value = p.streak > 0 ? this.streaks[0].texture : this.black.texture;
    u.exposure.value = p.exposure;
    u.bloom.value = p.bloom;
    u.streak.value = p.streak;
    u.streakTint.value.set(...p.streakTint);
    u.ca.value = p.ca;
    u.vignette.value = p.vignette;
    u.grain.value = p.grain;
    u.letterbox.value = p.letterbox;
    u.fade.value = p.fade;
    u.flash.value = p.flash;
    u.saturation.value = p.saturation;
    u.lift.value.set(...p.lift);
    u.gain.value.set(...p.gain);
    u.gamma.value = p.gamma;
    u.radial.value = p.radial;
    u.radialCenter.value.set(...p.radialCenter);
    u.overlay.value = p.overlay;
    u.seed.value = frame % 997;
    this.pass(m.composite, null);
  }
}
