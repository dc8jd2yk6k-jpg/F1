# F1 · Nine Points

**A music video for "F1" about the 2026 Formula 1 fight for second place.** Every frame is generated in code, rendered deterministically, and cut to the song's bar grid.

![Contact sheet: one frame per bar](docs/stills/contact-sheet.jpg)

Kimi Antonelli has 365 points and the title all but won. Behind him, four drivers are separated by **9 points** with five races left: Russell 242, Hamilton 241, Verstappen 236, Leclerc 233. The video follows that fight to its destination, the season finale at Yas Marina on 6 December. It ends on the only honest answer available today: **P2 — ?**

| | |
|---|---|
| Length | 3:13.7, 1920×1080, 30 fps, H.264 + the original AAC stream (copied, not re-encoded) |
| Engine | TypeScript + Three.js, custom HDR post pipeline, Canvas2D broadcast graphics |
| Renderer | Headless Chromium with software WebGL (SwiftShader), parallel workers, resumable chunks, x264 |
| Analysis | Python + librosa: tempo, bar grid, section map, band envelopes, kick and snare hits, key |
| Data | Real provisional standings after Round 17 (United States GP, 25 Oct 2026), in one JSON file |

## Reading the song

The track is instrumental, so the music itself is the brief. Full reasoning is in [`docs/creative-brief.md`](docs/creative-brief.md).

- **110 BPM, D minor.** The track is heavy and mid-tempo: brooding and determined rather than frantic.
- **It peaks in the middle.** After 2:10 it drops into a long breakdown and never returns to full energy.
- **The last bars turn to D major.** That makes the ending unresolved but hopeful, which is the emotional shape of a fight for second place.

The structure drives the edit:

- **Bars 1–5** become the five start lights, going out on the bass drop at bar 6.
- **The hi-hats arriving (bar 16)** reveal Yas Marina at dusk.
- **Bars 37–39, the dip,** become bullet time.
- **The breakdown's four bass pulses** each paint one contender as a neon numeral.
- **The major-key turn** arrives as gold on the horizon.

**Finding the grid.** The drums are syncopated, so onset-based beat trackers lock onto the off-beat. The grid is anchored on the structural hit into the verse. Two independent checks confirm it:

- The breakdown hit lands **3 ms** from bar 61.
- Harmonic change concentrates on beats 1 and 3.

## How it works

```
analysis/analyze_audio.py ──► src/data/audio.json ─┐   (bars, sections, envelopes, hits)
src/data/season.json ──────────────────────────────┤   (standings, rounds, numbers, sources)
                                                   ▼
                        Engine.renderFrame(t)  — a pure function of time
                         ├─ Timeline / AudioFeatures   musical time, sampled envelopes
                         ├─ World                      track, cars, trails, sparks, gridshell
                         │    └─ RaceSim               bar-keyed running order → projected P2
                         ├─ Acts (one per section)     cameras, choreography, words
                         ├─ Overlay (Canvas2D)         HUD, typography
                         └─ Compositor                 HDR → bloom/streak → grade → frame
                                                   ▼
scripts/render.mjs: N headless Chromium workers ─► JPEG ─► x264 chunks ─► concat ─► mux original audio
```

### Design decisions

- **Determinism first.** Nothing integrates state over frames. As a result, any frame renders identically in any order, and parallel rendering is trivial.
  - Car positions come from a closed-form lap model: a curvature-limited speed profile, plus choreographed gaps keyed to bars.
  - Each spark is solved analytically from its emission time.
  - Light trails are re-sampled from the past every frame.
  - All randomness is hashed.
- **Two clocks.** The race runs on *choreography time* (who is ahead, keyed to the music) and *sim time* (where on the lap the pack is). Each shot maps song time onto them, which is how bullet time, freeze frames and per-phrase locations work without special cases.
- **Real arithmetic, imagined race.**
  - The "Battle for P2" tower uses current points plus the points for each car's running position (25-18-15-12-10-8).
  - The choreography is written so that projected P2 changes hands **RUS → HAM → RUS → VER → LEC**.
  - A unit test enforces that all four contenders hold it at some point.
- **A post pipeline built for a CPU rasteriser.** Under SwiftShader, full-resolution passes dominate the cost, so only two passes touch every pixel: the scene and one composite. Bloom and the anamorphic streak run on a quarter-resolution mip chain. Three.js's stock bloom cost about 3× more in testing.
- **2026 details.**
  - Narrow cars, active-aero flaps that flatten on straights, an energy-store meter, rear-wing endplate lights.
  - Verstappen in #3 and Norris in #1.
  - The Yas Hotel's LED gridshell rendered as an audio-reactive instanced shader.

## Run it

```bash
npm install
python3 -m venv analysis/.venv && analysis/.venv/bin/pip install -r analysis/requirements.txt

# Put the song at public/audio/f1.m4a (not committed), then:
npm run analyze                 # → src/data/audio.json
npm test                        # timeline, data and choreography invariants
npm run dev                     # real-time preview with audio (?bar=40 to jump)

npm run stills -- --bars 20,45,67 --w 1920 --h 1080     # look-dev frames
npm run stills -- --sheet                               # one frame per bar
npm run render -- --workers 3 --msaa 4                  # full 1080p30 render
analysis/.venv/bin/python analysis/verify_av.py out/F1_MV_2026_1080p.mp4
```

**Re-rendering after the next race.** Edit `src/data/season.json`: the points, `afterRound`, `remaining`, and `championDecided` once the title is settled. Every caption is derived from that file.

## Data and sources

Standings are **provisional**, after the 2026 United States Grand Prix (Round 17 of 22, 25 Oct 2026). They were cross-checked across RaceFans, Crash.net, RacingNews365, SI, GPFans and GrandPrix.com. The 22-round calendar follows the cancellation of Bahrain and Saudi Arabia (Sky Sports). Driver numbers come from Formula1.com. The full URL list is in `season.json`.

*Unofficial fan work. Not affiliated with Formula 1, the FIA or any team. No logos, liveries or likenesses are reproduced: the cars are original procedural models in team-inspired colours, and the race depicted is imagined.*
