import manifest from '../data/photos.json';

// Real photographs from Wikimedia Commons, all under free licences (CC0,
// public domain, CC BY, CC BY-SA). The manifest is written by
// analysis/fetch_commons.py from the Commons metadata of each file, and every
// photo carries its credit wherever it is shown. Who or what a photo shows is
// taken from that metadata (file title, description, categories).

export interface Photo {
  id: string;
  /** venue: a round's circuit · driver: a driver's 2026 portrait or car · finale: the last venue */
  role: 'venue' | 'driver' | 'finale';
  /** Event code (venue), driver code (driver) or 'FINALE'. */
  key: string;
  file: string;
  width: number;
  height: number;
  /** Short on-screen caption, e.g. "Albert Park · 2026 Australian GP". */
  caption: string;
  author: string;
  license: string;
  licenseUrl: string;
  page: string;
  /** Point of interest in image coordinates (0..1, y down) used for cropping. */
  focus: [number, number];
}

export const PHOTOS: Photo[] = (manifest as unknown as { photos: Photo[] }).photos;

const images = new Map<string, HTMLImageElement>();

/** Load and decode every photo before the first frame, so renders stay deterministic. */
export async function loadPhotos(base = './assets/photos/') {
  await Promise.all(PHOTOS.map(async (p) => {
    const img = new Image();
    img.src = base + p.file;
    await img.decode();
    images.set(p.id, img);
  }));
}

export const imageOf = (p: Photo | null) => (p ? images.get(p.id) ?? null : null);
export const photoFor = (role: Photo['role'], key: string) => PHOTOS.find((p) => p.role === role && p.key === key) ?? null;

/** "PHOTO: AUTHOR · CC BY-SA 4.0 · WIKIMEDIA COMMONS" */
export function credit(p: Photo, label = 'PHOTO') {
  return `${label}: ${p.author} · ${p.license} · WIKIMEDIA COMMONS`.toUpperCase();
}

/** Draw a photo into a rect, cropped to cover it around its focus point. */
export function drawCover(ctx: CanvasRenderingContext2D, p: Photo, x: number, y: number, w: number, h: number, zoom = 1) {
  const img = imageOf(p);
  if (!img) return false;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const s = Math.max(w / iw, h / ih) * zoom;
  const sw = w / s;
  const sh = h / s;
  const sx = Math.min(Math.max(p.focus[0] * iw - sw / 2, 0), iw - sw);
  const sy = Math.min(Math.max(p.focus[1] * ih - sh / 2, 0), ih - sh);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  return true;
}
