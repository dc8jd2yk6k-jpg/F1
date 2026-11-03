import manifest from '../data/sounds.json';

// Recorded sound from Wikimedia Commons (free licences only), written by
// analysis/mix_sfx.py from each file's Commons metadata. The start-light tones
// are synthesised and need no credit. Each recording is credited on screen
// while it plays, and again on the closing card.

export interface Sound {
  id: string;
  caption: string;
  author: string;
  license: string;
  licenseUrl: string;
  page: string;
}

export const SOUNDS: Sound[] = (manifest as unknown as { sounds: Sound[] }).sounds;
export const soundFor = (id: string) => SOUNDS.find((s) => s.id === id) ?? null;
