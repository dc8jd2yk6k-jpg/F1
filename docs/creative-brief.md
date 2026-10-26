# Creative brief: "F1" · the 2026 championship, race by race

## The assignment

This is a music video for **"F1"**, an instrumental track, about the 2026 Formula 1 season. The focus is the fight for second place, now that the title is all but gone.

### Revision 2: what changed and why

The first cut was a cinematic 3D race: an imagined Abu Dhabi decider. Review found three problems:

1. **Geometry bugs.** Cars clipped through walls. A section of track ran inside one of the hotel buildings, and cars passed through each other in the photo finish.
2. **Beat-synced camera shake.** It was distracting and fought the picture.
3. **Wrong subject.** The real goal was to **follow every driver's score in every race of 2026**.

So the video became a **dynamic leaderboard**: a bar-chart race of the whole drivers' championship, all 23 drivers who have raced, re-ranking round by round to the music.
- There is no 3D camera. That removes both the clipping and the shake.
- Nothing pulses on the beat. The music lands through *when* things change: every round starts on a downbeat, then eases.

### Revision 3: real photographs and brand marks

The leaderboard was purely typographic. Revision 3 adds real-world material without giving up legibility or the no-shake rule:

- **Brand marks.** The F1 logo and team marks (simple-icons, CC0 path data) identify every row. Teams without a free mark show a short code instead.
- **Photographs** from Wikimedia Commons, free licences only, each credited on screen while it is shown:
  - **Behind the board:** each round's own venue. Where Commons has it, the photo is from that 2026 weekend and shows the race winner's car: Antonelli at Suzuka and in Shanghai, Russell at the Red Bull Ring, Leclerc at Silverstone, Norris at Zandvoort, Verstappen in the Bahrain GP. Otherwise it is a captioned photo of the circuit from an earlier year. The photo dissolves in on the round's downbeat (an ease-out, so the biggest change lands on the beat) and only pushes in very slowly. It is blurred, darkened and graded toward the board's palette, so it reads as atmosphere and never competes with a number.
  - **The winner card:** under the weekend's classification, the winner's photo and name.
  - **The fight for P2:** a portrait in each of the four contenders' blocks.
  - **The finale venue:** Yas Marina under lights, from the "today" hold onward, turning gold for the ending. That's where P2 will be decided.
- **Honest captions.** Who or what a photo shows comes from its Commons metadata. Captions say where and when it was taken, for example "Hamilton · 2025 Japanese GP" for the one contender without a 2026 portrait on Commons.

## What the music says

Measured by `analysis/analyze_audio.py`:

- **Tempo:** 110 BPM, 4/4. One bar = 2.1818 s.
- **Key:** D minor, turning to D major in the outro.
- **Shape:** a swell, a bass verse, two full-energy hooks, a three-bar dip between them, then a long, sparse breakdown that never returns to full energy, and a fade.

The season has a strikingly similar shape. It started fast, paused for the summer, and arrived at a tense, unresolved now.

## Structure: the season mapped onto the song

| Bars | Song | Leaderboard |
|---|---|---|
| 1–5 | Swell | 23 drivers on zero, in entry-list order. Five start lights come on, one per bar |
| 6 | Bass drop | Lights out. **Round 1, Australia** |
| 6–36 | Verse → Hook 1 | Rounds 1–11 with their sprints. A Grand Prix takes 2–3 bars, a sprint 1. Bars grow first, then rows re-sort |
| 36–40 | **The dip** | **Summer break.** The table holds; Grand Prix wins so far; Antonelli leads by 50 |
| 40–57 | Hook 2 | Rounds 12–18: Zandvoort to Austin, including the Bahrain GP held at Sepang |
| 57–61 | Hook 2 end | **Today.** The P2 places are bracketed: 4 drivers, 9 points. The 5 rounds still to run are listed |
| 61–82 | Breakdown | **The fight for P2.** Russell, Hamilton, Verstappen and Leclerc, each with a strip of every score they made this season. On the bass pulses (bars 67, 71, 75, 79) one driver at a time is brought forward with their record |
| 83–end | D-major outro | The full table as it stands. The background warms to gold. **P2 — ?** Title card |

## Data

The data is the point of this video, so it has to be right.

- `src/data/results.json` holds every points-scoring classification of 2026: **18 Grands Prix and 6 sprints**, with sources listed per event.
- Each event was cross-checked between at least two outlets: formula1.com, motorsport.com, crash.net, GPFans, RaceFans, Sky Sports, ESPN and Formula1points.

Integrity, enforced by `tests/results.test.ts`:
- Each of the 23 drivers' summed points equals the official standings after the United States GP.
- The Singapore checkpoint matches for the top six.
- The Mercedes, Ferrari, McLaren and Red Bull constructor totals match, with Lawson's stand-in points counted to Red Bull.
- Every event awards exactly 25-18-15-12-10-8-6-4-2-1 (races) or 8-7-6-5-4-3-2-1 (sprints).
- The final order matches the official table, including the three-way countback on 7 points (Ocon, Alonso, Sainz).

Facts this work surfaced and corrected:
- **2026 has 23 rounds, not 22.** The Bahrain GP was re-run at Sepang, Malaysia, on 4 October as Round 16. Austin was Round 18. The first cut's "Round 17 of 22" was wrong.
- **Stand-ins.** Isack Hadjar missed Zandvoort, Monza and Madrid with a wrist injury. Liam Lawson drove for Red Bull and reserve Yuki Tsunoda took the Racing Bulls seat. Tsunoda's point at Monza is why 23 drivers appear.

## Visual system

- **One table, always legible.** Each row has rank, team chip, car number, surname, the bar on a shared points axis, a count-up total, this round's **+N** chip, and ▲/▼ rank changes. The right-hand panel lists the weekend's points scorers in finishing order. Sprints carry a gold SPRINT tag.
- **Team colours** are team-inspired, chosen so that neighbouring bars stay distinguishable.
- **Calm motion.** Points ease up over the first part of a round, then rows glide to their new places, softening as they pass. Labels never fight.
- **Background.** Out-of-focus floodlight bokeh drifting slowly, a pure function of time, turning gold for the D-major ending. During the season it sits under the round's photograph.
- **Credits on screen.** Each photo's caption, author and licence are shown while it is visible, and all of them appear together on the closing card. The full list is in [`CREDITS.md`](../CREDITS.md).
- **Typography.** Titillium Web for names, JetBrains Mono for numbers and data, and Big Shoulders Display for big numerals.
