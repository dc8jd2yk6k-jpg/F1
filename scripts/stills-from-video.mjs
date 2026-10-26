// Pull README stills and a one-frame-per-bar contact sheet out of a finished render.
//   node scripts/stills-from-video.mjs out/F1_MV_2026_1080p.mp4
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

const video = path.resolve(ROOT, process.argv[2] ?? 'out/F1_MV_2026_1080p.mp4');
const outDir = path.join(ROOT, 'docs/stills');
const tmp = path.join(ROOT, 'out/sheet-frames');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });

const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/audio.json'), 'utf8'));
const barTime = (b) => audio.barOrigin + (b - 1) * audio.barLength;
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

const hero = {
  '01-lights': 4.6, '02-runaway': 8.4, '03-threads': 15.3, '04-grid': 17.5, '05-lights-out': 20.3, '06-onboard': 25.1,
  '07-gridshell': 30.6, '08-bullet-time': 38.6, '09-split': 45, '10-ferrari-duel': 53, '11-too-close': 59.9,
  '12-portrait': 72.5, '13-p2': 86.4,
};
for (const [name, bar] of Object.entries(hero)) {
  ff(['-ss', barTime(bar).toFixed(3), '-i', video, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '4', path.join(outDir, `${name}.jpg`)]);
  console.log(`docs/stills/${name}.jpg`);
}

const nBars = Math.floor((audio.duration - audio.barOrigin) / audio.barLength);
const files = [];
for (let b = 1; b <= nBars; b++) {
  const f = path.join(tmp, `b${String(b).padStart(2, '0')}.jpg`);
  ff(['-ss', Math.max(0, barTime(b + 0.5)).toFixed(3), '-i', video, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '3', f]);
  files.push(f);
}
const list = path.join(tmp, 'list.txt');
fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
const cols = 8;
ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `tile=${cols}x${Math.ceil(files.length / cols)}:padding=4:color=black`, '-frames:v', '1', '-q:v', '4',
  path.join(outDir, 'contact-sheet.jpg')]);
console.log('docs/stills/contact-sheet.jpg');
