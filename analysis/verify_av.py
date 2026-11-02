"""Objective checks on a rendered video.

1. Stream specs (resolution, fps, frame count, duration).
2. Audio. A music-only cut must carry the source stream byte for byte
   (packet MD5). A cut with the start-light sound must keep the song intact
   outside the recording (residual after alignment far below the music), add
   nothing while the lamps light (real start lights are silent), start the
   launch on the first dark frame (measured from the picture), and stay clear
   of clipping where the recording plays.
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
SFX_JSON = ROOT / "src" / "data" / "sfx.json"
SR = 48_000


def run(cmd: list[str]) -> bytes:
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def probe(path: Path) -> dict:
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-count_frames", "-of", "json", str(path)]))


def audio_md5(path: Path) -> str:
    out = run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"]).decode().strip()
    return out.split("=")[-1]


def pcm(path: Path) -> np.ndarray:
    raw = run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"])
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def envelope(x: np.ndarray, ms: float) -> np.ndarray:
    """RMS envelope, one value per sample (centred moving window)."""
    k = max(1, int(SR * ms / 1000))
    return np.sqrt(np.convolve(x ** 2, np.ones(k) / k, mode="same"))


def lamp_frames(Y: np.ndarray, fps: float, t0: float, t1: float) -> tuple[list[int], int]:
    """From the picture: the first frame each gantry lamp is lit, and the first frame all are dark again.

    The gantry (Opening.ts) has five pods, 104 px wide with 38 px gaps, centred on
    x = 960; the upper lamp of each sits at y = 34 + 0.3 * 214. Sampled at the
    lamp centre on the 96x54 thumbnails (1/20 scale).
    """
    h, w = Y.shape[1:]
    sx, sy = w / 1920, h / 1080
    x0 = 960 - (5 * 104 + 4 * 38) / 2
    f0, f1 = int(t0 * fps), int(t1 * fps)
    lit, out = [], -1
    for i in range(5):
        cx, cy = int((x0 + i * 142 + 52) * sx), int((34 + 0.3 * 214) * sy)
        lum = Y[f0:f1, cy, cx]
        on = np.flatnonzero(lum > 0.25)
        lit.append(f0 + int(on[0]) if len(on) else -1)
        if i == 0 and len(on):
            off = np.flatnonzero(lum[on[0]:] < 0.15)
            out = f0 + int(on[0] + off[0]) if len(off) else -1
    return lit, out


def sound_report(video: Path, Y: np.ndarray, fps: float, meta: dict) -> dict:
    """Checks for a cut with the start-light sound mixed onto the song."""
    cfg = json.loads(SFX_JSON.read_text())
    bar_t = lambda b: meta["barOrigin"] + (b - 1) * meta["barLength"]
    src, out = pcm(AUDIO_SRC), pcm(video)
    n = min(len(src), len(out))
    src, out = src[:n], out[:n]

    # Alignment: cross-correlate a loud stretch of the hook (bar 20).
    a = int(bar_t(20) * SR)
    s_, o_ = src[a:a + SR, 0], out[a - 2400:a + SR + 2400, 0]
    corr = np.correlate(o_, s_, mode="valid")
    lag = int(np.argmax(corr)) - 2400

    # The picture says when each lamp lights and when they go out.
    lit, dark = lamp_frames(Y, fps, bar_t(2.5), bar_t(6.5))
    lamp_t = [f / fps for f in lit]
    out_t = dark / fps

    res = out - np.roll(src, lag, axis=0)
    mono = res.mean(1)
    spec = np.fft.rfft(mono)
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    hp = np.fft.irfft(spec * (f > 150), len(mono))
    roar_env = envelope(hp, 5)

    def onset(env: np.ndarray, t: float, before: float, after: float, frac: float) -> float:
        i0, i1 = int((t - before) * SR), int((t + after) * SR)
        w = env[i0:i1]
        return (i0 + int(np.argmax(w >= frac * w.max()))) / SR

    roar_off = 1000 * (onset(roar_env, out_t, 0.3, 0.6, 0.5) - out_t)

    # Music preserved: outside the recording, the output is the song plus re-encode noise.
    r = cfg["roar"]
    pre = r.get("preroll", 0.05) if r else 0.0
    keep = np.ones(n, bool)
    if r:
        keep[int((out_t - pre - 0.2) * SR):int((out_t + r["length"] + 0.2) * SR)] = False
    music = np.sqrt((src[keep] ** 2).mean())
    noise = np.sqrt((res[keep] ** 2).mean())
    # Nothing added while the lamps light: the countdown (first lamp to just
    # before the recording starts) is the song alone.
    cd = slice(int((lamp_t[0] - 0.2) * SR), int((out_t - pre - 0.2) * SR))
    cd_snr = 20 * np.log10(np.sqrt((src[cd] ** 2).mean()) / max(np.sqrt((res[cd] ** 2).mean()), 1e-12))
    fx = ~keep
    peak = float(np.abs(out[fx]).max()) if fx.any() else 0.0
    return {
        "alignment_lag_samples": lag,
        "music_preserved_snr_db": round(20 * np.log10(music / max(noise, 1e-12)), 1),
        "lamps_lit_at_s": [round(t, 4) for t in lamp_t],
        "countdown_is_song_only_snr_db": round(cd_snr, 1),
        "lights_out_at_s": round(out_t, 4),
        "launch_onset_vs_lights_out_ms": round(roar_off, 1),
        "peak_where_effects_play_dbfs": round(20 * np.log10(peak), 2),
    }


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
    if src != out:
        report["sound_effects"] = sound_report(video, Y, fps, meta)
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
    holds = [(36.6, 39.8), (58.6, 60.8), (81.3, 82.8)]
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
