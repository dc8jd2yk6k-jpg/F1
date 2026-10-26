import * as THREE from 'three';
import { type Photo, imageOf } from './photos';

// A photograph as the backdrop: cropped to cover the frame around its focus
// point, softened (a Gaussian blur baked once at load), darkened and graded toward the board's palette
// so the numbers always read on top. Two layers so one photo can dissolve
// into the next on a downbeat. The only motion is a very slow push-in; there
// is no shake and nothing moves on the beat.

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float alpha, zoom, imgAspect, viewAspect, exposure, sat;
uniform vec2 focus;
uniform vec3 tint;
varying vec2 vUv;
void main() {
  float r = viewAspect / imgAspect;
  vec2 s = r > 1.0 ? vec2(1.0, 1.0 / r) : vec2(r, 1.0);
  s /= zoom;
  vec2 c = clamp(focus, s * 0.5, 1.0 - s * 0.5);
  vec2 uv = c + (vUv - 0.5) * s;
  vec3 col = texture2D(map, uv).rgb;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, sat) * tint * exposure;
  // Keep the top (header) and the bottom (credits) a little darker.
  col *= 0.55 + 0.45 * smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y));
  gl_FragColor = vec4(col, alpha);
}
`;

export interface PlateLayer {
  photo: Photo | null;
  alpha: number;
  /** ≥ 1; grows slowly for the push-in. */
  zoom: number;
}

export interface PlateGrade {
  exposure: number;
  sat: number;
  tint: [number, number, number];
}

export const NIGHT: PlateGrade = { exposure: 0.06, sat: 0.65, tint: [0.85, 0.95, 1.15] };
/** The D-major ending: the finale venue in gold. */
export const GOLD: PlateGrade = { exposure: 0.085, sat: 0.55, tint: [1.25, 0.95, 0.62] };

const SOFT_W = 768;
const SOFT_PX = 3;

export class PhotoPlate {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly layers: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = [];
  private readonly textures = new Map<string, THREE.Texture>();

  constructor(private readonly aspect: number) {
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: FRAG,
        uniforms: {
          map: { value: null }, alpha: { value: 0 }, zoom: { value: 1 }, imgAspect: { value: 1.5 }, viewAspect: { value: aspect },
          exposure: { value: 1 }, sat: { value: 1 }, focus: { value: new THREE.Vector2(0.5, 0.5) },
          tint: { value: new THREE.Vector3(1, 1, 1) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = i;
      this.scene.add(mesh);
      this.layers.push({ mesh, mat });
    }
  }

  private texture(p: Photo) {
    let tex = this.textures.get(p.id);
    if (!tex) {
      const img = imageOf(p);
      if (!img) return null;
      // Soften once, at low resolution: a smooth blur that costs nothing per frame.
      const w = SOFT_W;
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.filter = `blur(${SOFT_PX}px)`;
      g.drawImage(img, -2 * SOFT_PX, -2 * SOFT_PX, w + 4 * SOFT_PX, h + 4 * SOFT_PX);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      this.textures.set(p.id, tex);
    }
    return tex;
  }

  /** Set up to two layers (bottom first). Returns false if nothing is visible. */
  set(layers: PlateLayer[], grade: PlateGrade) {
    let any = false;
    this.layers.forEach((l, i) => {
      const spec = layers[i];
      const tex = spec?.photo ? this.texture(spec.photo) : null;
      const on = !!tex && spec.alpha > 0.002;
      l.mesh.visible = on;
      if (!on || !spec.photo) return;
      any = true;
      const u = l.mat.uniforms;
      u.map.value = tex;
      u.alpha.value = Math.min(1, spec.alpha);
      u.zoom.value = spec.zoom;
      u.imgAspect.value = spec.photo.width / spec.photo.height;
      u.viewAspect.value = this.aspect;
      u.focus.value.set(spec.photo.focus[0], 1 - spec.photo.focus[1]);
      u.exposure.value = grade.exposure;
      u.sat.value = grade.sat;
      u.tint.value.set(...grade.tint);
    });
    return any;
  }
}
