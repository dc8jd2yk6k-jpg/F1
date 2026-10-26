import * as THREE from 'three';

// A quiet night backdrop: deep gradient plus a few large, soft bokeh discs
// drifting slowly sideways — like out-of-focus floodlights behind a timing
// screen. One fullscreen pass, a pure function of time. `warm` shifts the
// palette to gold for the D-major outro.

const FRAG = /* glsl */ `
uniform float time, warm, intensity, aspect;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  vec2 uv = vUv;
  vec3 col = mix(vec3(0.0035, 0.0045, 0.010), vec3(0.010, 0.016, 0.034), uv.y);
  col += vec3(0.035, 0.020, 0.006) * warm * (1.0 - uv.y);
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    float speed = 0.004 + 0.006 * hash(fi * 1.7);
    float x = mod(hash(fi * 3.1) * (aspect + 0.4) + time * speed, aspect + 0.4) - 0.2;
    float y = hash(fi * 7.7) + 0.015 * sin(time * 0.15 + fi);
    float r = 0.035 + 0.11 * hash(fi * 1.3);
    float d = length(p - vec2(x, y));
    float disc = smoothstep(r, r * 0.72, d) * (0.6 + 0.4 * smoothstep(r * 0.4, r * 0.95, d));
    vec3 cool = mix(vec3(0.20, 0.45, 1.0), vec3(0.15, 0.95, 0.85), hash(fi * 5.3));
    vec3 hot = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.82, 0.40), hash(fi * 2.9));
    vec3 c = mix(cool, hot, clamp(warm * 1.2 - hash(fi * 8.3) * 0.4, 0.0, 1.0));
    acc += c * disc * (0.25 + 0.75 * hash(fi * 9.1));
  }
  gl_FragColor = vec4(col + acc * intensity, 1.0);
}
`;

export class Background {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat: THREE.ShaderMaterial;

  constructor(aspect: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG,
      uniforms: { time: { value: 0 }, warm: { value: 0 }, intensity: { value: 0.05 }, aspect: { value: aspect } },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  set(time: number, warm = 0, intensity = 0.05) {
    this.mat.uniforms.time.value = time;
    this.mat.uniforms.warm.value = warm;
    this.mat.uniforms.intensity.value = intensity;
  }
}
