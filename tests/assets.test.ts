import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import photos from '../src/data/photos.json';
import { FINAL } from '../src/leaderboard/model';
import { PHOTOS, type Photo } from '../src/photos/photos';
import { DRIVERS, EVENTS, TEAMS } from '../src/leaderboard/data';
import { F1_MARK, TEAM_CODES, hasMark, markFor } from '../src/leaderboard/logos';

describe('brand assets', () => {
  it('gives every team either its own mark or a code', () => {
    for (const team of Object.keys(TEAMS)) expect(hasMark(team) || !!TEAM_CODES[team]).toBe(true);
  });

  it('covers every team a driver raced for, stand-in stints included', () => {
    const teams = new Set([...DRIVERS.map((d) => d.team), ...EVENTS.flatMap((e) => e.classification.map((c) => c.team).filter(Boolean))]);
    for (const t of teams) expect(hasMark(t as string) || !!TEAM_CODES[t as string]).toBe(true);
  });

  it('uses each brand mark for its own team only', () => {
    expect(markFor('redbull')?.title).toBe('Red Bull');
    expect(markFor('racingbulls')).toBeNull();
    expect(markFor('ferrari')?.title).toBe('Ferrari');
    expect(F1_MARK.title).toBe('F1');
  });
});

describe('photographs', () => {
  const ROOT = path.resolve(__dirname, '..');
  const ACCEPTED = ['CC0', 'PD', 'CC BY', 'CC BY-SA'];
  const credits = fs.existsSync(path.join(ROOT, 'CREDITS.md')) ? fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8') : '';
  const all = photos.photos as unknown as (Photo & { licenseFamily: string; title: string })[];

  it('only uses free licences, with author and source from Commons', () => {
    for (const p of all) {
      expect(ACCEPTED, p.id).toContain(p.licenseFamily);
      expect(p.license, p.id).not.toMatch(/\bNC\b|\bND\b/i);
      expect(p.author.trim().length, p.id).toBeGreaterThan(1);
      expect(p.page, p.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(p.licenseUrl || p.licenseFamily === 'PD', p.id).toBeTruthy();
    }
  });

  it('ships every photo file and credits each one', () => {
    for (const p of all) {
      expect(fs.existsSync(path.join(ROOT, 'public/assets/photos', p.file)), p.file).toBe(true);
      expect(credits, p.id).toContain(`\`${p.id}\``);
      expect(p.focus.every((v) => v >= 0 && v <= 1), p.id).toBe(true);
    }
  });

  it('ties each photo to something real in the season', () => {
    const codes = new Set(EVENTS.map((e) => e.code));
    const drivers = new Set(DRIVERS.map((d) => d.code));
    for (const p of all) {
      if (p.role === 'venue') expect(codes.has(p.key), p.id).toBe(true);
      if (p.role === 'driver') expect(drivers.has(p.key), p.id).toBe(true);
      if (p.role === 'finale') expect(p.key).toBe('FINALE');
    }
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it('has a photo for every winner and every P2 contender, once photos exist', () => {
    if (!all.length) return;
    const need = new Set([...EVENTS.map((e) => e.classification[0].driver), ...FINAL.slice(1, 5).map((r) => r.code)]);
    for (const code of need) expect(PHOTOS.some((p) => p.role === 'driver' && p.key === code), code).toBe(true);
  });
});
