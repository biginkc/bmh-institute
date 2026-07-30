#!/usr/bin/env python3
"""Deterministic animation sweep helper for Lesson 4B.

This script does not approve visual quality. It verifies mechanical metadata and
creates 0.5s-cadence contact sheets for Jarrad/Claude review.
"""
import argparse
import json
import math
import os
import subprocess
from pathlib import Path

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = Path(BMH_ROOT)
HG = B / "course-assets/heygen/lesson4B"
GK = HG / "grok"
REVIEW = B / "course-assets/review-lesson4B/animation-qc"
STATE = HG / "_state.json"

ANIM_BEATS = [
    "b02_step1_intro",
    "b03_step2_factfind",
    "b04a_pitch",
    "b04b_offer",
    "b05_step5_close",
    "b06_structure_vs_execution",
    "b07_8020_rule",
    "b08_slow_down",
]

BAKEOFF = {
    "seedance_2_0": {
        "b04b_offer": GK / "anim_b04b_seedance_2_0.mp4",
        "b05_step5_close": GK / "anim_b05_seedance_2_0.mp4",
    },
    "kling3_0": {
        "b04b_offer": GK / "anim_b04b_kling3_0.mp4",
        "b05_step5_close": GK / "anim_b05_kling3_0.mp4",
    },
    "wan2_7": {
        "b04b_offer": GK / "anim_b04b_wan2_7.mp4",
        "b05_step5_close": GK / "anim_b05_wan2_7.mp4",
    },
    "minimax_hailuo": {
        "b04b_offer": GK / "anim_b04b_minimax_hailuo.mp4",
        "b05_step5_close": GK / "anim_b05_minimax_hailuo.mp4",
    },
    "veo3_1_lite": {
        "b05_step5_close": GK / "anim_b05_veo3_1_lite.mp4",
    },
}


def ffprobe(path: Path) -> dict:
    raw = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=index,codec_type,width,height,r_frame_rate,duration",
            "-show_entries",
            "format=duration,size",
            "-of",
            "json",
            str(path),
        ]
    )
    return json.loads(raw)


def media_meta(path: Path) -> dict:
    data = ffprobe(path)
    video = next((s for s in data["streams"] if s.get("codec_type") == "video"), {})
    audio = [s for s in data["streams"] if s.get("codec_type") == "audio"]
    return {
        "path": str(path),
        "exists": path.exists(),
        "width": video.get("width"),
        "height": video.get("height"),
        "fps": video.get("r_frame_rate"),
        "duration": float(data.get("format", {}).get("duration") or 0),
        "size": int(data.get("format", {}).get("size") or 0),
        "hasAudio": bool(audio),
    }


def contact_sheet(path: Path, out: Path) -> None:
    meta = media_meta(path)
    frames = max(1, math.ceil(meta["duration"] * 2))
    cols = min(6, frames)
    rows = math.ceil(frames / cols)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vf",
            f"fps=2,scale=320:-1,tile={cols}x{rows}:padding=8:margin=8:color=white",
            "-frames:v",
            "1",
            str(out),
            "-y",
        ],
        check=True,
    )


def full_sources(model: str, beat: str) -> list[Path]:
    root = GK / "full" / model
    out = []
    n = 1
    while True:
        p = root / f"{beat}_part{n:02d}.mp4"
        if not p.exists():
            break
        out.append(p)
        n += 1
    return out


def selected_sources(source: str, model: str) -> dict[str, list[Path]]:
    if source == "bakeoff":
        models = BAKEOFF.keys() if model == "all" else [model]
        clips: dict[str, list[Path]] = {}
        for m in models:
            for beat, path in BAKEOFF.get(m, {}).items():
                clips[f"{m}/{beat}"] = [path]
        return clips

    clips = {}
    for beat in ANIM_BEATS:
        clips[beat] = full_sources(model, beat)
    return clips


def write_report(out_dir: Path, source: str, model: str, records: list[dict], coverage: list[dict]) -> None:
    report = out_dir / "index.md"
    lines = [
        "# Lesson 4B Animation Mechanical Sweep",
        "",
        f"Source: `{source}`",
        f"Model: `{model}`",
        "",
        "This report is mechanical only. It does not approve face, nose, style, brand fit, or motion quality.",
        "",
        "## Coverage",
        "",
        "| Group | Beat | VO duration | Clip duration | Status |",
        "|---|---|---:|---:|---|",
    ]
    for c in coverage:
        lines.append(f"| `{c['group']}` | `{c['beat']}` | {c['voDuration']:.2f}s | {c['clipDuration']:.2f}s | {c['status']} |")
    lines.extend(["", "## Clips", "", "| Clip | Duration | Size | Audio | Contact sheet |", "|---|---:|---|---|---|"])
    for r in records:
        rel = os.path.relpath(r["sheet"], B)
        size = f"{r['width']}x{r['height']} @ {r['fps']}"
        lines.append(
            f"| `{r['name']}` | {r['duration']:.2f}s | {size} | {r['hasAudio']} | `{rel}` |"
        )
    report.write_text("\n".join(lines) + "\n")
    (out_dir / "records.json").write_text(json.dumps({"records": records, "coverage": coverage}, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["bakeoff", "full"], default="bakeoff")
    parser.add_argument("--model", default="all", help="Model name, or all for bakeoff.")
    args = parser.parse_args()

    state = json.loads(STATE.read_text())
    out_dir = REVIEW / (args.source if args.source == "bakeoff" else f"full-{args.model}")
    out_dir.mkdir(parents=True, exist_ok=True)

    clips = selected_sources(args.source, args.model)
    records = []
    coverage = []
    for key, paths in clips.items():
        beat = key.split("/")[-1]
        vo = float(state.get(beat, {}).get("duration") or 0)
        total = 0.0
        found = 0
        for path in paths:
            if not path.exists():
                continue
            found += 1
            meta = media_meta(path)
            total += meta["duration"]
            safe_name = key.replace("/", "__") + "__" + path.stem + ".jpg"
            sheet = out_dir / safe_name
            contact_sheet(path, sheet)
            records.append(
                {
                    "name": key,
                    "clip": str(path),
                    "sheet": str(sheet),
                    **meta,
                }
            )
        if vo:
            status = "covered" if total >= vo - 0.25 else "short"
            coverage.append({"group": key, "beat": beat, "voDuration": vo, "clipDuration": total, "clipsFound": found, "status": status})

    write_report(out_dir, args.source, args.model, records, coverage)
    print(json.dumps({"outDir": str(out_dir), "clips": len(records), "coverage": coverage}, indent=2))


if __name__ == "__main__":
    main()
