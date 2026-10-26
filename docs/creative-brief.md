# Creative brief: "F1" · Nine Points

## The assignment

This is a music video for **"F1"**, an instrumental track, about the 2026 Formula 1 season at the moment the title is all but gone and the fight for **second place** is wide open.

## What the music says

There are no lyrics, so the music itself is the text. It was analysed before any visuals were designed (`analysis/analyze_audio.py`).

| | |
|---|---|
| Tempo | **110 BPM**, 4/4. One bar = 2.1818 s |
| Key | **D minor**. The breakdown is the purest D minor in the track (key-profile correlation 0.94). The **outro turns to D major** (F♯ and C♯ appear) |
| Shape | Near-silent swell → bass verse → hi-hats build → two full-energy hooks → a long sparse breakdown that **never returns to full energy** → fade |
| Groove | Mid-tempo and heavy. The drums are syncopated against the harmony, so most kicks and snares land on the off-beat |

How that reads emotionally:

- **Brooding and determined, not frantic.** At 110 BPM with this much bass, the song walks heavily rather than runs.
- **It peaks in the middle and ends reflective.** The climax is not the ending. The last minute belongs to the aftermath.
- **It resolves to major.** The ending is unresolved but hopeful.

That is the shape of a fight for second place:

- The crown is spoken for: Antonelli is on 365 points and needs P9 in Mexico.
- Four drivers are left fighting for something only they care about this much, with **9 points** between them: 242 / 241 / 236 / 233.
- The video does not pretend to know who wins. It ends on **P2 — ?**

### Decisions that follow from the music

- **Edit weight.** Cuts fall on bars, and on half-bars only in the hooks. There is slow motion in the dips. The camera hits on detected kicks, not on the grid, because the groove is syncopated.
- **The intro's five bars become five start lights.** They go out on the downbeat of bar 6, the exact moment the bass drops.
- **The hats arriving (bar 16)** is when the place appears: Yas Marina at dusk and the LED gridshell, with one contender introduced per bar.
- **Hook 1 begins with the real "lights out"** (bar 20).
- **The three-bar dip (bars 37–39)** becomes bullet time. The stakes land one per bar: *5 races · 4 drivers · 9 points*.
- **Hook 2 is the peak.** Projected P2 changes hands until all four drivers have held it, ending in a four-abreast photo finish that **freezes before the line**.
- **The breakdown is the emotional core.** The cars are gone and only their light remains, like a long exposure. The four bass pulses (bars 67, 71, 75 and 79) each paint one contender as a neon numeral.
- **The D-major turn** arrives as gold on the horizon. The final card is *P2 — ?*

## Shot list (bar-locked)

| Bars | Time | Act | Picture | Words |
|---|---|---|---|---|
| 1–5 | 0:00–0:10.8 | Five Lights | Behind the pole car, looking up at the gantry; 2.39:1 | `SEASON 2026 · ROUND 17 OF 22 COMPLETE` → `5 RACES LEFT` → `ONE TITLE ALL BUT DECIDED.` → `ONE FIGHT WIDE OPEN.` |
| 6–9 | 0:10.8–0:19.5 | The Runaway | A gold thread tears past and away to the horizon | `ANTONELLI · 365 PTS · 9 WINS` · `THE CROWN IS ALL BUT HIS.` |
| 10–15 | 0:19.5–0:32.6 | The Threads | Four threads braid through 17 gates (one per round, one per beat) into a knot | `BEHIND HIM —` · `17 ROUNDS OF CHANGING PLACES.` · `4 DRIVERS · 9 POINTS` |
| 16–19 | 0:32.6–0:41.4 | The Grid | Dusk. A hero shot of each contender's car, one per bar; the five lights again, fast | Driver slams: number · name · points · gap to P2 |
| 20–36 | 0:41.4–1:18.4 | Hook 1 | Standing start → HAM onboard pass → hotel section → RUS override on the back straight | `LIGHTS OUT` · Battle-for-P2 tower · lap counter |
| 37–39 | 1:18.4–1:25.0 | Charge | Bullet-time orbit, sparks hanging in the air, energy store charging | `5 RACES / 4 DRIVERS / 9 POINTS` |
| 40–60 | 1:25.0–2:10.8 | Hook 2 | VER charge → 2×2 onboards → RUS–HAM duel → Ferrari duel under the gridshell → LEC leads → four abreast → freeze | P2-change banners · `TOO CLOSE TO CALL` |
| 61–82 | 2:10.8–2:58.8 | Long Exposure | Whiteout → light trails without cars → trails rise into the sky → four neon portraits | `THE CROWN IS SPOKEN FOR.` · `SECOND IS STILL A FIGHT.` · portraits |
| 83–end | 2:58.8–3:13.7 | Yas Marina, 6 Dec | Trails stop at the line, gold horizon, title | `P2 — ?` · `DECIDED UNDER THE LIGHTS AT YAS MARINA` · `F1` |

## Visual system

- **Light is identity.** Each driver is a coloured light: Mercedes teal (Russell), Ferrari red (Hamilton with a white core, Leclerc solid), Red Bull blue (Verstappen), and **gold for Antonelli**, the champion-elect.
- **Night race, sodium and LED.** The image is mostly dark. Saturation is reserved for the cars, their trails and the gridshell.
- **2026 regulations, honoured.** The cars have narrow proportions, active-aero flaps that flatten on the straights, an energy-store meter, and Verstappen in #3 with Norris carrying #1.
- **Broadcast typography, used sparingly.** Titillium Web for names, JetBrains Mono for data, and Big Shoulders Display for numerals.
- **Honest data.**
  - Every number on screen comes from `src/data/season.json`.
  - The "threads" are stylised: only their endpoints are data.
  - The race is imagined, and labelled as such.
  - The projected tower is real arithmetic on real points.

## What is real and what is imagined

| Real (provisional after Austin, 25 Oct 2026) | Imagined |
|---|---|
| Standings: ANT 365, RUS 242, HAM 241, VER 236, LEC 233, NOR 211 | The race shown, its overtakes and its running order |
| Round 17 of 22, 5 rounds left, finale at Yas Marina on 6 December | The car models and the stylised track |
| 2026 driver numbers | The photo finish |
| Career facts: 7× and 4× champions, Leclerc runner-up in 2022, Hamilton's last P2 in 2021, Russell's best finish P4 | |
