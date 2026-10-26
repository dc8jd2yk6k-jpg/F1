// Shared helpers for the offline scripts: a static server for dist/ and a
// headless Chromium with software WebGL (SwiftShader) — no GPU required.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(ROOT, 'dist');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.m4a': 'audio/mp4', '.png': 'image/png', '.jpg': 'image/jpeg',
};

export function build() {
  const r = spawnSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('vite build failed');
}

export function serve(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const p = path.join(DIST, path.normalize(u));
      if (!p.startsWith(DIST)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(p, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(port, '127.0.0.1', () => resolve({ server: srv, port: srv.address().port }));
  });
}

export async function launch() {
  const { chromium } = require('playwright');
  return chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'],
  });
}

export async function openRenderer(browser, port, w, h, extra = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/?render&w=${w}&h=${h}${extra}`);
  try {
    await page.waitForFunction(() => window.mv?.ready === true, null, { timeout: 120000 });
  } catch (e) {
    throw new Error(`renderer failed to boot: ${errors.join(' | ') || e}`);
  }
  return { page, errors };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    }
  }
  return out;
}
