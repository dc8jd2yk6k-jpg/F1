import '@fontsource/titillium-web/400.css';
import '@fontsource/titillium-web/600.css';
import '@fontsource/titillium-web/700.css';
import '@fontsource/titillium-web/900.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/big-shoulders-display/700.css';
import '@fontsource/big-shoulders-display/900.css';
import { Engine } from './engine/Engine';
import { DURATION, FPS, FRAME_COUNT, barTime } from './engine/Timeline';
import { ACTS } from './scenes';

// Two modes share one engine:
//   ?render      — offline: exposes window.mv for the frame-capture script
//   (default)    — preview: plays the song and renders in real time (dev aid)

declare global {
  interface Window {
    mv?: {
      ready: boolean;
      fps: number;
      frames: number;
      duration: number;
      renderFrame(t: number): void;
      capture(t: number, type?: string, quality?: number): Promise<string>;
    };
  }
}

const params = new URLSearchParams(location.search);
const W = Number(params.get('w')) || 1920;
const H = Number(params.get('h')) || 1080;

async function loadFonts() {
  const specs = [
    '400 40px "Titillium Web"', '600 40px "Titillium Web"', '700 40px "Titillium Web"', '900 40px "Titillium Web"',
    '400 40px "JetBrains Mono"', '700 40px "JetBrains Mono"',
    '700 40px "Big Shoulders Display"', '900 40px "Big Shoulders Display"',
  ];
  await Promise.all(specs.map((s) => document.fonts.load(s)));
  await document.fonts.ready;
}

async function boot() {
  await loadFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  document.body.appendChild(canvas);
  const engine = new Engine(canvas, W, H, { samples: Number(params.get('msaa') ?? 0) });
  engine.add(...ACTS.map((A) => new A()));

  if (params.has('render')) {
    window.mv = {
      ready: true,
      fps: FPS,
      frames: FRAME_COUNT,
      duration: DURATION,
      renderFrame: (t) => engine.renderFrame(t),
      capture: async (t, type = 'image/jpeg', quality = 0.95) => {
        engine.renderFrame(t);
        const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, quality));
        return new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1]);
          r.readAsDataURL(blob);
        });
      },
    };
    return;
  }

  // Preview: fit canvas to the window, play the song, render at audio time.
  canvas.style.width = '100vw';
  canvas.style.height = `${(100 * H) / W}vw`;
  const audio = new Audio('./audio/f1.m4a');
  const start = params.get('bar') ? barTime(Number(params.get('bar'))) : Number(params.get('t') ?? 0);
  audio.currentTime = start;
  const loop = () => {
    engine.renderFrame(audio.currentTime);
    requestAnimationFrame(loop);
  };
  document.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') audio.currentTime += 5;
    if (e.key === 'ArrowLeft') audio.currentTime -= 5;
    if (e.key === ' ') audio.paused ? audio.play() : audio.pause();
  });
  loop();
}

boot();
