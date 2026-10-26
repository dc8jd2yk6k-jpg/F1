// Offline renderer: every frame is rendered deterministically in headless
// Chromium (software WebGL), captured as JPEG, and piped into x264. Work is
// split across parallel browser workers in resumable chunks; the chunks are
// concatenated and muxed with the ORIGINAL audio stream (copied, not re-encoded).
//
//   node scripts/render.mjs [--w 1920 --h 1080] [--workers 3] [--step 1]
//                           [--out out/F1_MV_2026_1080p.mp4] [--crf 18] [--from 0 --to N] [--no-build]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { ROOT, build, launch, openRenderer, parseArgs, serve } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const W = Number(args.w ?? 1920);
const H = Number(args.h ?? 1080);
const WORKERS = Number(args.workers ?? 3);
const STEP = Number(args.step ?? 1); // render every Nth frame (drafts)
const CRF = String(args.crf ?? 19);
const QUALITY = Number(args.quality ?? 0.95);
const CHUNK = Number(args.chunk ?? 240);
const OUT = path.resolve(ROOT, args.out ?? `out/F1_MV_2026_${H}p.mp4`);
const AUDIO = path.resolve(ROOT, args.audio ?? 'public/audio/f1.m4a');
const WORK = path.resolve(ROOT, args.work ?? `out/chunks_${W}x${H}_s${STEP}`);

const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/audio.json'), 'utf8'));
const FPS = 30;
const FRAMES = Math.ceil(audio.duration * FPS);
const OUT_FPS = FPS / STEP;
const from = Number(args.from ?? 0);
const to = Math.min(Number(args.to ?? FRAMES), FRAMES);

fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// Chunk list over the frame indices we actually render.
const indices = [];
for (let f = from; f < to; f += STEP) indices.push(f);
const chunks = [];
for (let i = 0; i < indices.length; i += CHUNK) {
  const list = indices.slice(i, i + CHUNK);
  const file = path.join(WORK, `c${String(list[0]).padStart(5, '0')}.mp4`);
  chunks.push({ list, file, done: fs.existsSync(`${file}.done`) });
}
const todo = chunks.filter((c) => !c.done);
console.log(`render ${W}x${H} @ ${OUT_FPS} fps · ${indices.length} frames · ${chunks.length} chunks (${todo.length} to do) · ${WORKERS} workers`);

if (!args['no-build']) build();
const { server, port } = await serve();

let rendered = 0;
const total = todo.reduce((n, c) => n + c.list.length, 0);
const t0 = Date.now();

async function encodeChunk(page, chunk) {
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(OUT_FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-maxrate', String(args.maxrate ?? '12M'), '-bufsize', '24M', '-tune', 'film',
    '-pix_fmt', 'yuv420p', '-g', String(OUT_FPS * 2), '-r', String(OUT_FPS), chunk.file], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (const f of chunk.list) {
    // Sample each frame at the middle of its display interval: a cut on a
    // downbeat then lands within ±half a frame of the beat, never a full frame late.
    const b64 = await page.evaluate(([t, q]) => window.mv.capture(t, 'image/jpeg', q), [(f + 0.5) / FPS, QUALITY]);
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await once(ff.stdin, 'drain');
    rendered++;
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  if (code !== 0) throw new Error(`ffmpeg failed on ${chunk.file}`);
  fs.writeFileSync(`${chunk.file}.done`, '');
}

async function worker(id, queue) {
  const browser = await launch();
  const { page, errors } = await openRenderer(browser, port, W, H, args.msaa ? `&msaa=${args.msaa}` : '');
  while (queue.length) {
    const chunk = queue.shift();
    await encodeChunk(page, chunk);
    const el = (Date.now() - t0) / 1000;
    const rate = rendered / el;
    console.log(`[w${id}] ${path.basename(chunk.file)} ✓  ${rendered}/${total}  ${rate.toFixed(2)} f/s  eta ${((total - rendered) / rate / 60).toFixed(1)} min`);
    if (errors.length) console.error(`[w${id}] page errors: ${errors.splice(0).join(' | ')}`);
  }
  await browser.close();
}

const queue = [...todo];
await Promise.all(Array.from({ length: Math.min(WORKERS, Math.max(1, todo.length)) }, (_, i) => worker(i, queue)));
server.close();

// Concatenate and mux with the untouched source audio.
const list = path.join(WORK, 'list.txt');
fs.writeFileSync(list, chunks.map((c) => `file '${c.file}'`).join('\n'));
const silent = path.join(WORK, 'video.mp4');
let r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent], { stdio: 'inherit' });
if (r.status !== 0) throw new Error('concat failed');
const startOffset = from / FPS;
r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, ...(startOffset > 0 ? ['-ss', String(startOffset)] : []), '-i', AUDIO,
  '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', ...(to < FRAMES || from > 0 ? ['-shortest'] : []), '-movflags', '+faststart', OUT], { stdio: 'inherit' });
if (r.status !== 0) throw new Error('mux failed');
console.log(`done → ${path.relative(ROOT, OUT)} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
