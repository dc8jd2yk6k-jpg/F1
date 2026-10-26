"""Offline audio analysis for the F1 music video.

Decodes the song with ffmpeg, fits a constant-tempo beat/bar grid, extracts
band envelopes and percussive hit lists, and writes everything the renderer
needs to `src/data/audio.json`. The renderer never analyses audio at runtime:
every visual cue is a pure function of time plus this file, which is what
keeps the offline frame render deterministic.

Usage:  analysis/.venv/bin/python analysis/analyze_audio.py [path/to/song]
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIO = ROOT / "public" / "audio" / "f1.m4a"
OUT = ROOT / "src" / "data" / "audio.json"

SR = 22050
HOP = 256
FEATURE_HZ = 60
NOMINAL_BPM = 110.0

# Section map, in 1-indexed bars. Boundaries were found from per-bar band
# energy (see docs/creative-brief.md); `check_sections` prints the loudness
# step at each one (hook boundaries are texture changes at similar loudness).
SECTIONS = [
    ("lights", 1, 5),
    ("threads", 6, 15),
    ("grid", 16, 19),
    ("hook1", 20, 36),
    ("charge", 37, 39),
    ("hook2", 40, 60),
    ("exposure", 61, 82),
    ("finale", 83, 89),
]

PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def band_flux(S: np.ndarray, freqs: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Positive log-spectral flux in a band, with a local-mean subtraction."""
    band = np.log1p(20.0 * S[(freqs >= lo) & (freqs < hi)])
    flux = np.maximum(0.0, np.diff(band, axis=1)).sum(axis=0)
    flux = np.concatenate([[0.0], flux])
    local = np.convolve(flux, np.ones(48) / 48, mode="same")
    return np.maximum(0.0, flux - local)


def band_energy(S: np.ndarray, freqs: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.sqrt((S[(freqs >= lo) & (freqs < hi)] ** 2).mean(axis=0))


def normalize(x: np.ndarray, pct: float = 99.0) -> np.ndarray:
    ref = np.percentile(x, pct)
    return np.clip(x / (ref + 1e-12), 0.0, 1.0)


def envelope(x: np.ndarray, rate: float, attack: float, release: float) -> np.ndarray:
    """One-pole attack/release follower: snappy on hits, smooth on decay."""
    a = np.exp(-1.0 / (attack * rate))
    r = np.exp(-1.0 / (release * rate))
    out = np.empty_like(x)
    y = 0.0
    for i, v in enumerate(x):
        c = a if v > y else r
        y = c * y + (1.0 - c) * v
        out[i] = y
    return out


def resample(x: np.ndarray, src_rate: float, n_out: int) -> np.ndarray:
    t_src = np.arange(len(x)) / src_rate
    t_out = np.arange(n_out) / FEATURE_HZ
    return np.interp(t_out, t_src, x)


def pick_hits(env: np.ndarray, rate: float, min_gap: float, thresh: float) -> list[list[float]]:
    peaks = librosa.util.peak_pick(
        env, pre_max=3, post_max=3, pre_avg=12, post_avg=12, delta=thresh, wait=int(min_gap * rate)
    )
    return [[round(float(p / rate), 4), round(float(env[p]), 3)] for p in peaks]


def fit_grid(beats: np.ndarray) -> tuple[float, float]:
    """Least-squares constant-tempo grid through tracked beats (outliers trimmed)."""
    period = 60.0 / NOMINAL_BPM
    idx = np.round((beats - beats[0]) / period)
    for _ in range(3):
        A = np.vstack([idx, np.ones_like(idx)]).T
        (p, t0), *_ = np.linalg.lstsq(A, beats, rcond=None)
        resid = beats - (idx * p + t0)
        keep = np.abs(resid) < max(0.03, 2.5 * np.std(resid))
        idx, beats = idx[keep], beats[keep]
        idx = np.round((beats - t0) / p)
    return float(p), float(t0 % p)


def loudness_db(y: np.ndarray, win_s: float = 0.01) -> np.ndarray:
    win = int(win_s * SR)
    env = np.sqrt(np.convolve(y.astype(np.float64) ** 2, np.ones(win) / win, mode="same"))
    return 20 * np.log10(env + 1e-9)


def biggest_jump(db: np.ndarray, t0: float, t1: float, lookback: float = 0.06) -> float:
    """Time of the steepest loudness rise in [t0, t1]: the leading edge of a hit."""
    lb = int(lookback * SR)
    a, b = int(t0 * SR), int(t1 * SR)
    jump = db[a:b] - db[a - lb:b - lb]
    return (a + int(np.argmax(jump))) / SR - lookback / 2


def harmonic_novelty(y: np.ndarray) -> tuple[np.ndarray, float]:
    """Rate of change of the bass/low-mid pitch-class profile."""
    hop = 128
    C = np.abs(librosa.cqt(y, sr=SR, hop_length=hop, fmin=librosa.note_to_hz("C1"),
                           n_bins=48, bins_per_octave=12))
    chroma = np.zeros((12, C.shape[1]))
    for i in range(48):
        chroma[i % 12] += C[i]
    chroma /= chroma.sum(axis=0, keepdims=True) + 1e-9
    k = np.ones(8) / 8
    chroma = np.array([np.convolve(c, k, mode="same") for c in chroma])
    nov = np.linalg.norm(np.diff(chroma, axis=1), axis=0)
    return np.concatenate([[0.0], nov]), SR / hop


def key_of(chroma: np.ndarray) -> str:
    best = (-2.0, "")
    for k in range(12):
        for prof, mode in ((KS_MAJOR, "major"), (KS_MINOR, "minor")):
            c = float(np.corrcoef(chroma, np.roll(prof, k))[0, 1])
            if c > best[0]:
                best = (c, f"{PITCH_NAMES[k]} {mode}")
    return best[1]


def main() -> None:
    audio_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_AUDIO
    y = decode(audio_path)
    duration = len(y) / SR
    rate = SR / HOP

    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)

    onset = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    _, beat_frames = librosa.beat.beat_track(onset_envelope=onset, sr=SR, hop_length=HOP,
                                             start_bpm=NOMINAL_BPM, tightness=400)
    tracked = librosa.frames_to_time(beat_frames, sr=SR, hop_length=HOP)
    period, _ = fit_grid(tracked)
    bpm = 60.0 / period

    kick_flux = band_flux(S, freqs, 20, 150)
    snare_flux = band_flux(S, freqs, 1500, 5000)
    hat_flux = band_flux(S, freqs, 7000, 11000)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]

    # Anchoring the bar grid. The drums are syncopated (most kicks and snares
    # sit off the harmonic beat), so onset-based phase fitting locks onto the
    # wrong eighth. The structure is unambiguous though: the hit into the verse
    # is the biggest loudness jump in the first 20 s, and it lands on a
    # downbeat. The grid is anchored there and then cross-checked against the
    # breakdown hit and the harmonic rhythm (see `verify_grid`).
    bar_len = 4 * period
    db = loudness_db(y)
    anchor = biggest_jump(db, 1.0, 20.0)
    origin = anchor - np.ceil(anchor / bar_len) * bar_len
    if origin + bar_len <= 0:
        origin += bar_len
    n_bars = int(np.ceil((duration - origin) / bar_len))

    n_feat = int(np.ceil(duration * FEATURE_HZ)) + 1
    low = normalize(band_energy(S, freqs, 20, 150))
    mid = normalize(band_energy(S, freqs, 300, 3000))
    high = normalize(band_energy(S, freqs, 5000, 11000))
    loud = normalize(rms)

    kick_n = normalize(kick_flux, 99.5)
    snare_n = normalize(snare_flux, 99.5)
    hat_n = normalize(hat_flux, 99.5)

    features = {
        "rms": resample(envelope(loud, rate, 0.02, 0.25), rate, n_feat),
        "low": resample(envelope(low, rate, 0.01, 0.18), rate, n_feat),
        "mid": resample(envelope(mid, rate, 0.02, 0.25), rate, n_feat),
        "high": resample(envelope(high, rate, 0.01, 0.15), rate, n_feat),
        "kick": resample(envelope(kick_n, rate, 0.004, 0.16), rate, n_feat),
        "snare": resample(envelope(snare_n, rate, 0.004, 0.14), rate, n_feat),
        "hat": resample(envelope(hat_n, rate, 0.003, 0.07), rate, n_feat),
    }

    kicks = pick_hits(kick_n, rate, 0.18, 0.12)
    snares = pick_hits(snare_n, rate, 0.18, 0.12)

    # Per-bar summaries.
    chroma = librosa.feature.chroma_stft(S=S ** 2, sr=SR, hop_length=HOP)
    bars = []
    for b in range(n_bars):
        t0 = origin + b * bar_len
        f0, f1 = max(0, int(t0 * rate)), max(1, int((t0 + bar_len) * rate))
        seg_rms = rms[f0:f1]
        bars.append({
            "n": b + 1,
            "t": round(t0, 4),
            "db": round(float(20 * np.log10(np.sqrt((seg_rms ** 2).mean()) + 1e-9)) if len(seg_rms) else -120.0, 2),
            "pc": [PITCH_NAMES[i] for i in np.argsort(chroma[:, f0:f1].mean(axis=1))[::-1][:3]] if f1 > f0 else [],
        })

    sections = []
    for name, a, b in SECTIONS:
        t0 = max(0.0, origin + (a - 1) * bar_len)
        t1 = min(duration, origin + b * bar_len)
        f0, f1 = int(t0 * rate), int(t1 * rate)
        sections.append({
            "name": name, "barStart": a, "barEnd": b,
            "t0": round(t0, 4), "t1": round(t1, 4),
            "key": key_of(chroma[:, f0:f1].mean(axis=1)),
        })

    check_sections(bars)
    verify_grid(y, db, origin, bar_len, period, duration)

    out = {
        "source": audio_path.name,
        "duration": round(duration, 4),
        "bpm": round(bpm, 4),
        "beatPeriod": round(period, 6),
        "barLength": round(bar_len, 6),
        "barOrigin": round(origin, 4),
        "bars": bars,
        "sections": sections,
        "kicks": kicks,
        "snares": snares,
        "featureHz": FEATURE_HZ,
        "features": {k: [round(float(v), 3) for v in arr] for k, arr in features.items()},
        "key": key_of(chroma.mean(axis=1)),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))

    print(f"duration {duration:.3f}s  bpm {bpm:.3f}  bar {bar_len:.4f}s  origin {origin:.3f}s  bars {n_bars}")
    print(f"tracked beats {len(tracked)}  kicks {len(kicks)}  snares {len(snares)}  key {out['key']}")
    for s in sections:
        print(f"  {s['name']:9s} bars {s['barStart']:2d}-{s['barEnd']:2d}  {s['t0']:7.2f}-{s['t1']:7.2f}s  {s['key']}")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


def verify_grid(y: np.ndarray, db: np.ndarray, origin: float, bar_len: float,
                period: float, duration: float) -> None:
    """Independent checks that the anchored grid is the musical grid."""
    t61 = origin + 60 * bar_len
    hit = biggest_jump(db, t61 - 0.5, t61 + 0.5)
    print(f"  breakdown hit {hit:.3f}s vs bar 61 {t61:.3f}s: {1000 * (hit - t61):+.0f} ms")
    hnov, hrate = harmonic_novelty(y)
    beats = np.arange(origin, duration, period)
    beats = beats[beats > 0]
    h = np.interp(beats, np.arange(len(hnov)) / hrate, hnov)
    pos = np.round((beats - origin) / period).astype(int) % 4
    on13, on24 = h[(pos == 0) | (pos == 2)].mean(), h[(pos == 1) | (pos == 3)].mean()
    off = np.interp(beats + period / 2, np.arange(len(hnov)) / hrate, hnov).mean()
    print(f"  harmonic change: beats 1/3 {on13:.4f}, beats 2/4 {on24:.4f}, off-beats {off:.4f}")


def check_sections(bars: list[dict]) -> None:
    """Sanity check: every section boundary should coincide with an energy step."""
    db = np.array([b["db"] for b in bars])
    for name, a, _ in SECTIONS[1:]:
        if a - 2 < 0 or a >= len(db):
            continue
        step = db[a - 1] - db[a - 2]
        flag = "" if abs(step) >= 1.0 else "   (texture change; small loudness step)"
        print(f"  boundary {name:9s} bar {a:2d}: {db[a - 2]:6.1f} -> {db[a - 1]:6.1f} dB{flag}")


if __name__ == "__main__":
    main()
