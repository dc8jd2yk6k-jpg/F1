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

  it('adds no synthetic beeps: real start lights are silent', () => {
    expect(sfx).not.toHaveProperty('beep');
    expect(sounds).not.toHaveProperty('beeps');
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
