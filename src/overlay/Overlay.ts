import * as THREE from 'three';
import { clamp } from '../engine/math';

// 2D layer for typography and broadcast graphics. Drawn with Canvas2D every
// frame into a texture that the compositor lays over the graded image.
// All coordinates are in a fixed 1920×1080 design space regardless of the
// actual render resolution.

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

export const FONTS = {
  display: '"Big Shoulders Display"',
  title: '"Titillium Web"',
  mono: '"JetBrains Mono"',
} as const;

export interface TextStyle {
  font?: keyof typeof FONTS;
  size?: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Letter spacing in em. */
  tracking?: number;
  alpha?: number;
  stroke?: string;
  strokeWidth?: number;
  glow?: string;
  glowBlur?: number;
  italic?: boolean;
}

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private readonly scale: number;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.scale = width / DESIGN_W;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  begin() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.globalAlpha = 1;
  }

  end() {
    this.texture.needsUpdate = true;
  }

  font(s: TextStyle) {
    const fam = FONTS[s.font ?? 'title'];
    return `${s.italic ? 'italic ' : ''}${s.weight ?? 700} ${s.size ?? 48}px ${fam}`;
  }

  private apply(s: TextStyle) {
    const c = this.ctx;
    c.font = this.font(s);
    c.textAlign = s.align ?? 'left';
    c.textBaseline = s.baseline ?? 'alphabetic';
    c.letterSpacing = `${(s.tracking ?? 0) * (s.size ?? 48)}px`;
    c.globalAlpha = clamp(s.alpha ?? 1);
  }

  measure(str: string, s: TextStyle): number {
    this.ctx.save();
    this.apply(s);
    const w = this.ctx.measureText(str).width;
    this.ctx.restore();
    return w;
  }

  text(str: string, x: number, y: number, s: TextStyle = {}) {
    if ((s.alpha ?? 1) <= 0.001 || !str) return;
    const c = this.ctx;
    c.save();
    this.apply(s);
    if (s.glow) {
      c.shadowColor = s.glow;
      c.shadowBlur = (s.glowBlur ?? 24) * this.scale;
    }
    if (s.stroke) {
      c.strokeStyle = s.stroke;
      c.lineWidth = s.strokeWidth ?? 2;
      c.lineJoin = 'round';
      c.strokeText(str, x, y);
    }
    if (s.color !== 'none') {
      c.fillStyle = s.color ?? '#fff';
      c.fillText(str, x, y);
    }
    c.restore();
  }

  /** Text revealed by a horizontal wipe (0..1), the way broadcast graphics wipe on. */
  wipeText(str: string, x: number, y: number, progress: number, s: TextStyle = {}) {
    if (progress <= 0) return;
    const w = this.measure(str, s);
    const size = s.size ?? 48;
    const align = s.align ?? 'left';
    const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(left - size, y - size * 1.4, (w + size * 2) * clamp(progress), size * 2.2);
    c.clip();
    this.text(str, x, y, s);
    c.restore();
  }

  /** Typewriter reveal by character count. */
  typeText(str: string, x: number, y: number, progress: number, s: TextStyle = {}, cursor = true) {
    const n = Math.floor(clamp(progress) * str.length + 1e-6);
    const shown = str.slice(0, n);
    this.text(shown, x, y, s);
    if (cursor && progress > 0 && progress < 1.0001) {
      const w = this.measure(shown, s);
      const size = s.size ?? 48;
      const align = s.align ?? 'left';
      const left = align === 'center' ? x - this.measure(str, s) / 2 : x;
      this.rect(left + (align === 'center' ? this.measure(shown, s) : w) + size * 0.12, y - size * 0.78, size * 0.5, size * 0.9,
        s.color ?? '#fff', (s.alpha ?? 1) * 0.85);
    }
  }

  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1) {
    if (alpha <= 0.001) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = clamp(alpha);
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
    c.restore();
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string, width = 2, alpha = 1) {
    if (alpha <= 0.001) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = clamp(alpha);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.restore();
  }

  /** Parallelogram (the slanted broadcast-graphics shape). */
  slant(x: number, y: number, w: number, h: number, skew: number, color: string, alpha = 1) {
    if (alpha <= 0.001 || w <= 0) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = clamp(alpha);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x + skew, y);
    c.lineTo(x + w + skew, y);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.closePath();
    c.fill();
    c.restore();
  }
}
