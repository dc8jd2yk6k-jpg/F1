"""Mix the start-light sound onto the song.

    analysis/.venv/bin/python analysis/mix_sfx.py

Reads public/audio/f1.m4a (the song, untouched) and src/data/sfx.json (the
cues, in bars: the video draws its lamps from the same numbers) and writes
public/audio/f1_sfx.m4a, which the renderer and the preview play.

- The start-light tone on each lamp: a short 500 Hz beep over a deep thud
  near 53 Hz, dry and mono, about half a second long, as heard when F1's
  start lights come on. Synthesised here; its pitch, partial levels, glide
  and envelope were measured from a reference clip (not used or included).
- A held silence, then the launch: a real recording from Wikimedia Commons
  (credited; see src/data/sounds.json and CREDITS.md), high-passed so the
  song's bass drop keeps the low end, fading out into the verse.

The song itself is never processed: no ducking, no limiter, no EQ. Effects
are added on top, and if the sum would come within 1 dB of full scale the
recording is turned down, never the song. Each tone starts exactly when the
first frame showing its lamp lit is displayed, and the launch on the first
dark frame (frames are rendered at mid-frame time, (f + 0.5) / 30), so the
sound never leads the picture.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "audio" / "f1.m4a"
OUT = ROOT / "public" / "audio" / "f1_sfx.m4a"
WAV = ROOT / "out" / "f1_sfx.wav"
CFG = ROOT / "src" / "data" / "sfx.json"
AUDIO = ROOT / "src" / "data" / "audio.json"
SOUNDS = ROOT / "src" / "data" / "sounds.json"
CACHE = Path(__file__).resolve().parent / "cache" / "sfx"
SR = 48_000
FPS = 30
CEILING_DB = -1.0


def db(x: float) -> float:
    return 20 * math.log10(max(x, 1e-12))


def decode(path: Path | str) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def cue_times(cfg: dict, au: dict) -> tuple[list[float], float]:
    """Display time of the first frame on which each lamp is lit, and of the first dark frame."""
    def at(bar: float) -> float:
        t = au["barOrigin"] + (bar - 1) * au["barLength"]
        return math.ceil(t * FPS - 0.5) / FPS
    return [at(b) for b in cfg["lamps"]], at(cfg["lightsOut"])


def light_tone(cfg: dict) -> np.ndarray:
    """One start-light tone (stereo, identical channels), normalised to its peak level."""
    L = cfg["light"]
    n = int(L["length"] * SR)
    t = np.arange(n) / SR
    # The beep: a 500 Hz tone with a faint echo.
    b = L["beep"]
    gate = lambda t0: np.clip((t - t0) / 0.003, 0, 1) * np.clip((t0 + b["length"] - t) / 0.004, 0, 1)
    e = b["echo"]
    te = t - e["delay"]
    echo_env = 10 ** (e["db"] / 20) * np.clip(te / 0.003, 0, 1) * np.where(te < e["hold"], 1.0, np.exp(-(te - e["hold"]) / e["decay"]))
    beep = 10 ** (b["db"] / 20) * np.sin(2 * np.pi * b["hz"] * t) * (gate(0.0) + echo_env * (te > 0))
    # The thud: a low tone that drops from startHz to hz, wavering slightly, with weak upper partials.
    th = L["thud"]
    f = th["hz"] + (th["startHz"] - th["hz"]) * np.exp(-np.maximum(t - th["glideAt"], 0) / th["glide"])
    f = f + th["wobbleHz"] * (0.6 * np.sin(2 * np.pi * 9 * t) + 0.4 * np.sin(2 * np.pi * 13 * t + 1.0))
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) + sum(10 ** (db / 20) * np.sin(k * phase) for k, db in th["partials"])
    # Sounds at once, then swells to full over the attack time.
    rise = np.clip(t / 0.003, 0, 1) * (th["onset"] + (1 - th["onset"]) * (0.5 - 0.5 * np.cos(np.pi * np.clip(t / th["attack"], 0, 1))))
    end = np.clip((L["length"] - t) / 0.03, 0, 1)
    env = rise * np.where(t < th["hold"], 1.0, np.exp(-(t - th["hold"]) / th["decay"])) * end
    tone = body * env + beep * end
    tone *= 10 ** (L["peakDb"] / 20) / np.abs(tone).max()
    return np.stack([tone, tone], 1)


def launch(cfg: dict) -> tuple[np.ndarray, dict | None]:
    """The launch roar (stereo, peak 1.0) and its credit, from the Commons recording in sfx.json."""
    r = cfg["roar"]
    if not r:
        return np.zeros((0, 2)), None
    d = commons.info([r["title"]], 320)[0]
    if d.get("missing"):
        sys.exit(f"{r['title']} not found on Commons")
    fam = commons.licence_ok(d)
    artist = d["artist"] or d["credit"]
    if not fam or not artist:
        sys.exit(f"{r['title']}: licence '{d['license']}' / author '{artist}' not accepted")
    src = CACHE / r["title"].removeprefix("File:").replace(" ", "_")
    if not src.exists():
        commons.download(d["url"], src)
        print(f"  ↓ {src.name}")
    x = decode(src)
    a = int(r["attack"] * SR)
    pre = int(r.get("preroll", 0.03) * SR)
    seg = x[max(0, a - pre): a + int(r["length"] * SR)].copy()
    n = len(seg)
    t = np.arange(n) / SR
    fade_in = np.clip(t / max(r.get("fadeIn", pre / SR), 1e-3), 0, 1)
    fo = r["fade"]
    k = np.clip((t - (n / SR - fo)) / fo, 0, 1)
    fade_out = 0.5 * (1 + np.cos(np.pi * k))
    seg *= (fade_in * fade_out)[:, None]
    sos = butter(2, r.get("highpassHz", 120), "highpass", fs=SR, output="sos")
    seg = sosfilt(sos, seg, axis=0)
    seg /= np.abs(seg).max()
    credit = {
        "id": "sfx-launch", "role": "sound", "caption": r["caption"], "title": d["title"], "page": d["page"],
        "author": r.get("author") or artist, "authorFull": artist, "license": d["license"], "licenseFamily": fam,
        "licenseUrl": d["license_url"], "date": d["date"],
        "changes": r.get("changes", "trimmed to the launch, high-passed, faded out and mixed with the song"),
        "description": d["description"][:300], "categories": d["categories"],
    }
    return seg, {"pre": pre / SR, **credit}


def place(buf: np.ndarray, clip: np.ndarray, t0: float, gain: float = 1.0) -> None:
    i = int(round(t0 * SR))
    j = min(len(buf), i + len(clip))
    buf[i:j] += gain * clip[: j - i]


def main() -> None:
    cfg = json.loads(CFG.read_text())
    au = json.loads(AUDIO.read_text())
    song = decode(SRC)
    lamps, out_t = cue_times(cfg, au)

    lights = np.zeros_like(song)
    one = light_tone(cfg)
    for t in lamps:
        place(lights, one, t)

    roar, credit = launch(cfg)
    roars = np.zeros_like(song)
    gain = 0.0
    if credit:
        place(roars, roar, out_t - credit["pre"])
        # As loud as asked, but never within 1 dB of full scale: turn the launch down, never the song.
        want = 10 ** (cfg["roar"]["peakDb"] / 20)
        ceiling = 10 ** (CEILING_DB / 20)
        lo, hi = 0.0, want
        base = song + lights
        win = slice(int((out_t - 0.1) * SR), int((out_t + cfg["roar"]["length"] + 0.1) * SR))
        if np.abs(base[win] + hi * roars[win]).max() > ceiling:
            for _ in range(40):
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if np.abs(base[win] + mid * roars[win]).max() <= ceiling else (lo, mid)
            gain = lo
        else:
            gain = hi

    mix = song + lights + gain * roars
    # Where the effects play, the sum must stay under the ceiling (the song
    # alone peaks near full scale in the hooks, which is left as it is).
    fx = (np.abs(lights) + np.abs(roars)).max(1) > 0
    peak = np.abs(mix[fx]).max() if fx.any() else 0.0
    if peak > 10 ** (CEILING_DB / 20):
        sys.exit(f"effects push the mix to {db(peak):.2f} dBFS")

    WAV.parent.mkdir(parents=True, exist_ok=True)
    import soundfile as sf
    sf.write(WAV, mix.astype(np.float32), SR, subtype="FLOAT")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(WAV), "-c:a", "aac", "-b:a", "320k", "-ar", str(SR),
                    "-movflags", "+faststart", str(OUT)], check=True)

    sounds = [{k: v for k, v in credit.items() if k != "pre"}] if credit else []
    SOUNDS.write_text(json.dumps({
        "source": "Wikimedia Commons",
        "policy": "CC0, public domain, CC BY or CC BY-SA only; author and licence from Commons metadata",
        "startLightTone": "synthesised for this video, modelled on the F1 start-light sound",
        "sounds": sounds,
    }, indent=1, ensure_ascii=False) + "\n")
    import fetch_commons
    fetch_commons.write_credits(json.loads(fetch_commons.MANIFEST.read_text())["photos"])

    report = {
        "tones_at": [round(t, 4) for t in lamps],
        "tone_peak_dbfs": cfg["light"]["peakDb"],
        "lights_out_at": round(out_t, 4),
        "launch": credit and {"file": credit["title"], "author": credit["authorFull"], "licence": credit["license"],
                              "gain_db": round(db(gain), 2), "asked_db": cfg["roar"]["peakDb"]},
        "song_peak_dbfs": round(db(np.abs(song).max()), 2),
        "mix_peak_where_effects_play_dbfs": round(db(peak), 2),
        "wrote": str(OUT.relative_to(ROOT)),
    }
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
