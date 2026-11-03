import { describe, expect, it } from 'vitest';
import sfx from '../src/data/sfx.json';
import sounds from '../src/data/sounds.json';
import { LAMPS_ON, LIGHTS_OUT, lampsLit } from '../src/leaderboard/Opening';
import { SOUNDS } from '../src/photos/sounds';

describe('start-light sound effects', () => {
  it('lights the lamps from the same cues the sound mix uses', () => {
    expect(LAMPS_ON).toEqual(sfx.lamps);
    expect(LIGHTS_OUT).toBe(sfx.lightsOut);
  });

  it('lights five lamps half a bar apart and holds a full bar before lights out', () => {
    expect(LAMPS_ON).toHaveLength(5);
    LAMPS_ON.slice(1).forEach((b, i) => expect(b - LAMPS_ON[i]).toBe(0.5));
    expect(LIGHTS_OUT - LAMPS_ON[4]).toBe(1);
    expect(lampsLit(LIGHTS_OUT - 0.01)).toBe(5);
    expect(lampsLit(LIGHTS_OUT)).toBe(0);
  });

  it('gives each lamp the F1 start-light tone: a 500 Hz beep over a deep thud, about half a second', () => {
    expect(sfx.light.beep.hz).toBe(500);
    expect(sfx.light.thud.hz).toBeGreaterThan(40);
    expect(sfx.light.thud.hz).toBeLessThan(70);
    expect(sfx.light.length).toBeGreaterThan(0.4);
    expect(sfx.light.length).toBeLessThan(0.6);
    // Each tone ends well before the next lamp (half a bar, about 1.09 s, later).
    expect(sfx.light.length).toBeLessThan(0.5 * 2.18);
    expect(sounds.startLightTone).toMatch(/synthesised/);
  });

  it('credits every recording with an accepted free licence and its Commons page', () => {
    for (const s of sounds.sounds) {
      expect(['CC0', 'PD', 'CC BY', 'CC BY-SA']).toContain(s.licenseFamily);
      expect(s.author.length).toBeGreaterThan(0);
      expect(s.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(s.title).toBe(sfx.roar?.title);
    }
    expect(SOUNDS.map((s) => s.id)).toEqual(sfx.roar ? ['sfx-launch'] : []);
  });
});
