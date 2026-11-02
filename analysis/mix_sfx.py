"""Mix the start-light sound effects onto the song.

    analysis/.venv/bin/python analysis/mix_sfx.py

Reads public/audio/f1.m4a (the song, untouched) and src/data/sfx.json (the
cues, in bars: the video draws its lamps from the same numbers) and writes
public/audio/f1_sfx.m4a, which the renderer and the preview play.

- One beep per lamp: a short tone at D6, the song's tonal centre, in the
  1–4 kHz band the intro leaves empty. Five identical beeps, as on the
  broadcast graphics.
- A held silence, then the launch: a real recording from Wikimedia Commons
  (credited; see src/data/sounds.json and CREDITS.md), high-passed so the
  song's bass drop keeps the low end, fading out into the verse.

The song itself is never processed: no ducking, no limiter, no EQ. Effects
are added on top, and if the sum would come within 1 dB of full scale the
launch is turned down, never the song. Each effect starts exactly when the
first video frame showing its cue is displayed (frames are rendered at
mid-frame time, (f + 0.5) / 30), so the sound never leads the picture.
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


def room(n: int, seed: int) -> np.ndarray:
    """A short, quiet stereo room tail: decaying noise, different on each side."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(0.32 * SR)) / SR
    ir = rng.standard_normal((len(t), 2)) * np.exp(-t / 0.07)[:, None]
    ir /= np.sqrt((ir ** 2).sum(0))
    return ir


def beep(cfg: dict) -> np.ndarray:
    """One lamp beep (stereo), normalised to its peak level."""
    b = cfg["beep"]
    n = int((b["length"] + 0.35) * SR)
    t = np.arange(n) / SR
    f = b["hz"]
    tone = np.sin(2 * np.pi * f * t) + 0.16 * np.sin(2 * np.pi * 2 * f * t) + 0.05 * np.sin(2 * np.pi * 3 * f * t)
    hold = b["length"] - 0.04
    env = np.clip(t / 0.004, 0, 1) * np.where(t < hold, 1.0, np.exp(-(t - hold) / 0.022))
    dry = tone * env
    ir = room(n, seed=6)
    wet = np.stack([np.convolve(dry, ir[:, c])[:n] for c in range(2)], 1)
    out = dry[:, None] + 0.12 * wet
    return out * (10 ** (b["peakDb"] / 20) / np.abs(out).max())


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
    fade_in = np.clip(t / max(pre / SR, 1e-3), 0, 1)
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
        "changes": "trimmed to the launch, high-passed, faded out and mixed with the song",
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

    beeps = np.zeros_like(song)
    one = beep(cfg)
    for t in lamps:
        place(beeps, one, t)

    roar, credit = launch(cfg)
    roars = np.zeros_like(song)
    gain = 0.0
    if credit:
        place(roars, roar, out_t - credit["pre"])
        # As loud as asked, but never within 1 dB of full scale: turn the launch down, never the song.
        want = 10 ** (cfg["roar"]["peakDb"] / 20)
        ceiling = 10 ** (CEILING_DB / 20)
        lo, hi = 0.0, want
        base = song + beeps
        win = slice(int((out_t - 0.1) * SR), int((out_t + cfg["roar"]["length"] + 0.1) * SR))
        if np.abs(base[win] + hi * roars[win]).max() > ceiling:
            for _ in range(40):
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if np.abs(base[win] + mid * roars[win]).max() <= ceiling else (lo, mid)
            gain = lo
        else:
            gain = hi

    mix = song + beeps + gain * roars
    # Where the effects play, the sum must stay under the ceiling (the song
    # alone peaks near full scale in the hooks, which is left as it is).
    fx = (np.abs(beeps) + np.abs(roars)).max(1) > 0
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
        "beeps": "synthesised for this video",
        "sounds": sounds,
    }, indent=1, ensure_ascii=False) + "\n")
    import fetch_commons
    fetch_commons.write_credits(json.loads(fetch_commons.MANIFEST.read_text())["photos"])

    report = {
        "beeps_at": [round(t, 4) for t in lamps],
        "lights_out_at": round(out_t, 4),
        "beep_peak_dbfs": cfg["beep"]["peakDb"],
        "launch": credit and {"file": credit["title"], "author": credit["authorFull"], "licence": credit["license"],
                              "gain_db": round(db(gain), 2), "asked_db": cfg["roar"]["peakDb"]},
        "song_peak_dbfs": round(db(np.abs(song).max()), 2),
        "mix_peak_where_effects_play_dbfs": round(db(peak), 2),
        "wrote": str(OUT.relative_to(ROOT)),
    }
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
