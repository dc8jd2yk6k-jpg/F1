import * as THREE from 'three';
import { Overlay } from '../overlay/Overlay';
import { World } from '../world/World';
import { Compositor, type PostParams, defaultPost } from './Compositor';
import { FPS, type SectionName, barAt, sectionAt } from './Timeline';

export interface FrameCtx {
  /** Song time in seconds. */
  t: number;
  frame: number;
  /** Fractional bar position. */
  bar: number;
  post: PostParams;
  ui: Overlay;
  world: World;
  width: number;
  height: number;
  aspect: number;
  begin(clear?: THREE.ColorRepresentation): void;
  draw(scene: THREE.Scene, camera: THREE.Camera, rect?: [number, number, number, number]): void;
}

export interface Act {
  readonly name: SectionName;
  setup(engine: Engine): void;
  render(ctx: FrameCtx): void;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly comp: Compositor;
  readonly ui: Overlay;
  readonly world: World;
  private readonly acts = new Map<SectionName, Act>();

  constructor(readonly canvas: HTMLCanvasElement, readonly width: number, readonly height: number, opts: { samples?: number } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.ui = new Overlay(width, height);
    this.comp = new Compositor(this.renderer, width, height, this.ui.texture, opts.samples ?? 0);
    this.world = new World(this.renderer);
  }

  add(...acts: Act[]) {
    for (const a of acts) {
      a.setup(this);
      this.acts.set(a.name, a);
    }
  }

  renderFrame(t: number) {
    const frame = Math.round(t * FPS);
    const act = this.acts.get(sectionAt(t).name);
    const post = defaultPost();
    this.ui.begin();
    this.comp.begin();
    const ctx: FrameCtx = {
      t, frame, bar: barAt(t), post, ui: this.ui, world: this.world,
      width: this.width, height: this.height, aspect: this.width / this.height,
      begin: (c) => this.comp.begin(new THREE.Color(c ?? 0x000000)),
      draw: (scene, camera, rect) => this.comp.draw(scene, camera, rect),
    };
    act?.render(ctx);
    this.ui.end();
    this.comp.finish(post, frame);
  }
}
