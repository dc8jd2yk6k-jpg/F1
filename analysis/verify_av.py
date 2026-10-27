"""Objective checks on a rendered video.

1. Stream specs (resolution, fps, frame count, duration).
2. Audio is the source stream, byte-identical (packet MD5, stream copied).
3. Every round change in the schedule becomes visible within one frame of
   its downbeat.
4. Stability: during holds the picture is still (no shake, no pulsing).

Usage: analysis/.venv/bin/python analysis/verify_av.py out/F1_MV_2026_1080p.mp4
"""

from __future__ import annotations

import json
import re
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
    diff = np.concatenate([[0.0], np.abs(Y[1:] - Y[:-1]).mean(axis=(1, 2))])
    bar_t = lambda b: meta["barOrigin"] + (b - 1) * meta["barLength"]

    # 1. Every round lands on its beat: the first frame that visibly changes
    #    after the scheduled start should be displayed within one frame of it.
    plan = re.findall(r"\['([A-Z]{3})', '(race|sprint)', ([0-9.]+), ([0-9.]+)\]",
                      (ROOT / "src" / "leaderboard" / "schedule.ts").read_text())
    offs = []
    for code, kind, bar, _ in plan:
        ts = bar_t(float(bar))
        lo = max(1, int(np.floor(ts * fps)) - 3)
        win = diff[lo:lo + 12]
        quiet = float(np.median(diff[max(1, lo - 20):lo])) if lo > 20 else 0.0
        thresh = quiet + 0.5 * (win.max() - quiet)
        f = lo + int(np.argmax(win > thresh))
        offs.append(1000 * (f / fps - ts))
    offs_a = np.abs(np.array(offs))
    report["round_changes"] = {
        "count": len(plan),
        "median_abs_offset_ms": round(float(np.median(offs_a)), 1),
        "max_abs_offset_ms": round(float(offs_a.max()), 1),
        "within_one_frame": int(np.sum(offs_a <= 1000 / fps + 0.5)),
        "frame_ms": round(1000 / fps, 1),
    }

    # 2. No shake: during holds nothing but slow background drift should move.
    # Summer break, "today", and the P2 chart's final hold.
    holds = [(36.6, 39.8), (57.6, 60.8), (81.2, 82.8)]
    stab = []
    for a0, a1 in holds:
        f0, f1 = int(bar_t(a0) * fps), int(bar_t(a1) * fps)
        stab.append(float(np.percentile(diff[f0:f1], 95)))
    report["stability"] = {"holds_p95_frame_change": [round(x, 5) for x in stab],
                           "note": "mean |ΔY| per frame (0..1 luma); < 0.003 means visually still"}

    out_path = ROOT / "out" / f"{video.stem}.av-report.json"
    out_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
