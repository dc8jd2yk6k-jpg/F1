"""Objective checks on a rendered video.

1. Stream specs (resolution, fps, frame count, duration).
2. Audio is the source stream, byte-identical (packet MD5, stream copied).
3. A/V sync: per-frame luminance onsets cross-correlated with the song's kick
   envelope; the peak should sit at lag 0 (±1 frame).
4. Structural cuts land on their downbeats (bar 6 "lights out", bar 20 race
   start, bar 61 whiteout).

Usage: analysis/.venv/bin/python analysis/verify_av.py out/F1_MV_2026_1080p.mp4
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
AUDIO_SRC = ROOT / "public" / "audio" / "f1.m4a"
AUDIO_JSON = ROOT / "src" / "data" / "audio.json"


def run(cmd: list[str]) -> bytes:
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def probe(path: Path) -> dict:
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-count_frames", "-of", "json", str(path)]))


def audio_md5(path: Path) -> str:
    out = run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"]).decode().strip()
    return out.split("=")[-1]


def luma_frames(path: Path, w: int = 96, h: int = 54) -> np.ndarray:
    raw = run(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"scale={w}:{h},format=gray", "-f", "rawvideo", "-"])
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w).astype(np.float32) / 255.0


def main() -> None:
    video = Path(sys.argv[1])
    meta = json.loads(AUDIO_JSON.read_text())
    report: dict = {"file": str(video)}

    info = probe(video)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next(s for s in info["streams"] if s["codec_type"] == "audio")
    num, den = (int(x) for x in v["r_frame_rate"].split("/"))
    fps = num / den
    report["video"] = {"codec": v["codec_name"], "width": v["width"], "height": v["height"], "fps": fps,
                       "frames": int(v["nb_read_frames"]), "duration": float(v.get("duration", 0))}
    report["audio"] = {"codec": a["codec_name"], "sample_rate": int(a["sample_rate"]), "channels": a["channels"],
                       "bit_rate": int(a.get("bit_rate", 0))}
    src, out = audio_md5(AUDIO_SRC), audio_md5(video)
    report["audio"]["identical_to_source"] = src == out
    report["size_mb"] = round(video.stat().st_size / 1e6, 1)

    Y = luma_frames(video)
    n = len(Y)
    t = (np.arange(n) + 0.5) / fps  # each frame's display interval centre
    # Visual onset: brightness that appears from one frame to the next.
    vis = np.concatenate([[0.0], np.maximum(0.0, Y[1:] - Y[:-1]).mean(axis=(1, 2))])
    # Audio reference: positive change of the kick envelope at the same instants.
    hz = meta["featureHz"]
    kick = np.array(meta["features"]["kick"])
    k_at = np.interp(t, np.arange(len(kick)) / hz, kick)
    aud = np.concatenate([[0.0], np.maximum(0.0, np.diff(k_at))])

    def xcorr(x: np.ndarray, y: np.ndarray, max_lag: int) -> dict[int, float]:
        x = (x - x.mean()) / (x.std() + 1e-9)
        y = (y - y.mean()) / (y.std() + 1e-9)
        res = {}
        for lag in range(-max_lag, max_lag + 1):
            if lag >= 0:
                res[lag] = float(np.mean(x[lag:] * y[: len(y) - lag]))
            else:
                res[lag] = float(np.mean(x[: lag] * y[-lag:]))
        return res

    # Only the race sections react to kicks frame-by-frame.
    race = (t > meta["sections"][3]["t0"]) & (t < meta["sections"][5]["t1"])
    xc = xcorr(vis[race], aud[race], 12)
    best = max(xc, key=xc.get)
    report["sync"] = {"best_lag_frames": best, "corr_at_best": round(xc[best], 4), "corr_at_0": round(xc[0], 4),
                      "note": "positive lag = picture after sound"}

    # Hard cuts: frames whose change from the previous frame is an outlier.
    # Each should start being displayed within half a frame of a beat.
    diff = np.concatenate([[0.0], np.abs(Y[1:] - Y[:-1]).mean(axis=(1, 2))])
    thresh = max(0.06, float(np.percentile(diff, 99)))
    cut_frames = [f for f in range(1, n - 1) if diff[f] > thresh and diff[f] >= diff[f - 1] and diff[f] >= diff[f + 1]]
    beat = meta["beatPeriod"]
    offs = []
    for f in cut_frames:
        ts = f / fps  # display start of the first changed frame
        k = round((ts - meta["barOrigin"]) / (beat / 2))  # nearest half-beat
        offs.append(1000 * (ts - (meta["barOrigin"] + k * beat / 2)))
    offs_a = np.abs(np.array(offs)) if offs else np.array([0.0])
    report["cuts"] = {
        "count": len(cut_frames),
        "median_abs_offset_ms": round(float(np.median(offs_a)), 1),
        "p90_abs_offset_ms": round(float(np.percentile(offs_a, 90)), 1),
        "within_one_frame": int(np.sum(offs_a <= 1000 / fps + 0.5)),
        "frame_ms": round(1000 / fps, 1),
    }
    # Named moments.
    named = {}
    for name, bar in (("lights_out_bar6", 6), ("race_start_bar20", 20), ("breakdown_bar61", 61), ("finale_bar83", 83)):
        tb = meta["barOrigin"] + (bar - 1) * meta["barLength"]
        f = int(np.ceil(tb * fps - 0.5))  # first frame sampled after the downbeat
        named[name] = {"downbeat_s": round(tb, 3), "frame": f, "change_vs_prev": round(float(diff[f]), 3),
                       "max_change_in_window": round(float(diff[f - 3:f + 4].max()), 3)}
    report["named"] = named

    out_path = ROOT / "out" / f"{video.stem}.av-report.json"
    out_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
