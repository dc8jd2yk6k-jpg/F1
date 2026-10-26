// Render individual frames for look-dev and QA.
//   node scripts/stills.mjs --bars 6,20.5,41 [--w 960 --h 540] [--out out/stills] [--no-build]
//   node scripts/stills.mjs --times 12.5,80
//   node scripts/stills.mjs --sheet [--every 1]     one frame per bar → contact sheet
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, build, launch, openRenderer, parseArgs, serve } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const w = Number(args.w ?? 960);
const h = Number(args.h ?? 540);
const outDir = path.resolve(ROOT, args.out ?? 'out/stills');
fs.mkdirSync(outDir, { recursive: true });

const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/audio.json'), 'utf8'));
const barTime = (b) => audio.barOrigin + (b - 1) * audio.barLength;

let shots = [];
if (args.sheet) {
  const every = Number(args.every ?? 1);
  const nBars = Math.floor((audio.duration - audio.barOrigin) / audio.barLength);
  for (let b = 1; b <= nBars; b += every) shots.push({ name: `bar${String(b).padStart(2, '0')}`, t: Math.max(0, barTime(b + 0.5)) });
} else if (args.bars) {
  shots = String(args.bars).split(',').map((b) => ({ name: `bar${b}`, t: Math.max(0, barTime(Number(b))) }));
} else if (args.times) {
  shots = String(args.times).split(',').map((t) => ({ name: `t${t}`, t: Number(t) }));
} else {
  console.error('nothing to render: pass --bars, --times or --sheet');
  process.exit(1);
}

if (!args['no-build']) build();
const { server, port } = await serve();
const browser = await launch();
const { page, errors } = await openRenderer(browser, port, w, h, args.msaa ? `&msaa=${args.msaa}` : '');
const files = [];
for (const s of shots) {
  const t0 = Date.now();
  const b64 = await page.evaluate(([t]) => window.mv.capture(t, 'image/png'), [s.t]);
  const file = path.join(outDir, `${s.name}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  files.push(file);
  console.log(`${s.name} t=${s.t.toFixed(2)} → ${path.relative(ROOT, file)} (${Date.now() - t0} ms)`);
}
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
await browser.close();
server.close();

if (args.sheet) {
  const cols = Number(args.cols ?? 8);
  const list = path.join(outDir, 'sheet.txt');
  fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
  const rows = Math.ceil(files.length / cols);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `scale=320:-1,tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', path.join(outDir, 'contact-sheet.jpg')]);
  if (r.status !== 0) console.error(String(r.stderr));
  else console.log(`contact sheet → ${path.relative(ROOT, path.join(outDir, 'contact-sheet.jpg'))}`);
}
