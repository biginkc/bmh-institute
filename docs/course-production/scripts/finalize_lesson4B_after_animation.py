#!/usr/bin/env python3
"""Finalize Lesson 4B after Jarrad/Claude selects an animation model.

This is a deterministic guardrail script. It does not choose an animation
model, does not generate clips, and does not approve visual quality.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = Path(BMH_ROOT)
REMOTION = B / "docs/course-production/remotion"
SCRIPTS = B / "docs/course-production/scripts"
STATE = B / "course-assets/heygen/lesson4B/_state.json"
QUEUE_ROOT = B / "course-assets/review-lesson4B/animation-queue"
REVIEW = B / "course-assets/review-lesson4B"
QC_QUEUE = B / "docs/course-production/_QC-QUEUE.md"
MANIFEST = B / "docs/course-production/remotion/public/lesson4B/manifest.json"
FINAL_RENDER = REVIEW / "LESSON-4B-v1.mp4"
FINALIZE_REPORT = REVIEW / "LESSON-4B-finalize-report.md"

MODELS = ["seedance_2_0", "kling3_0", "wan2_7", "minimax_hailuo", "veo3_1_lite", "mixed_kling_b4b_seedance_b5"]
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


def run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    print("$ " + " ".join(cmd))
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env, check=True)


def duration(path: Path) -> float:
    return float(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ]
        ).strip()
    )


def streams(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type,width,height,r_frame_rate",
                "-show_entries",
                "format=duration,size",
                "-of",
                "json",
                str(path),
            ]
        )
    )


def load_state() -> dict:
    if not STATE.exists():
        raise SystemExit(f"Missing state file: {STATE}")
    return json.loads(STATE.read_text())


def load_queue(model: str) -> dict:
    path = QUEUE_ROOT / model / "queue.json"
    if not path.exists():
        raise SystemExit(f"Missing animation queue for {model}: {path}")
    return json.loads(path.read_text())


def inspect_clip_coverage(model: str) -> tuple[list[dict], list[str]]:
    state = load_state()
    queue = load_queue(model)
    clips = queue.get("clips", [])
    rows: list[dict] = []
    failures: list[str] = []

    for beat in ANIM_BEATS:
        expected = [c for c in clips if c.get("beat") == beat]
        if not expected:
            failures.append(f"{beat}: no queued clips")
            rows.append({"beat": beat, "required": 0, "clipDuration": 0, "clips": 0, "status": "missing-queue"})
            continue

        required = float(state[beat]["duration"])
        total = 0.0
        found = 0
        missing_paths: list[str] = []
        clip_records = []

        for item in expected:
            path = Path(item["outputPath"])
            if not path.exists():
                missing_paths.append(str(path))
                continue
            meta = streams(path)
            video = [s for s in meta.get("streams", []) if s.get("codec_type") == "video"]
            audio = [s for s in meta.get("streams", []) if s.get("codec_type") == "audio"]
            clip_duration = float(meta.get("format", {}).get("duration") or 0)
            total += clip_duration
            found += 1
            clip_records.append(
                {
                    "path": str(path),
                    "duration": clip_duration,
                    "video": bool(video),
                    "audio": bool(audio),
                    "size": f"{video[0].get('width')}x{video[0].get('height')}" if video else "none",
                }
            )
            if not video:
                failures.append(f"{beat}: {path} has no video stream")

        if missing_paths:
            failures.append(f"{beat}: missing clips: " + "; ".join(missing_paths))
        if total < required - 0.25:
            failures.append(f"{beat}: clip coverage short ({total:.2f}s < {required:.2f}s)")

        rows.append(
            {
                "beat": beat,
                "required": required,
                "clipDuration": total,
                "clips": found,
                "expectedClips": len(expected),
                "status": "covered" if found == len(expected) and total >= required - 0.25 else "not-ready",
                "records": clip_records,
            }
        )

    return rows, failures


def write_report(model: str, rows: list[dict], failures: list[str], notes: list[str]) -> None:
    lines = [
        "# Lesson 4B Finalize Report",
        "",
        f"Model: `{model}`",
        "",
        "This report is deterministic only. It does not approve stills, faces, noses, brand fit, animation quality, or final cut quality.",
        "",
        "## Clip Coverage",
        "",
        "| Beat | Required | Clip Duration | Clips | Status |",
        "|---|---:|---:|---:|---|",
    ]
    for row in rows:
        lines.append(
            f"| `{row['beat']}` | {row['required']:.2f}s | {row['clipDuration']:.2f}s | "
            f"{row['clips']}/{row.get('expectedClips', row['clips'])} | `{row['status']}` |"
        )

    lines.extend(["", "## Failures", ""])
    if failures:
        lines.extend(f"- {failure}" for failure in failures)
    else:
        lines.append("- None")

    lines.extend(["", "## Notes", ""])
    if notes:
        lines.extend(f"- {note}" for note in notes)
    else:
        lines.append("- None")

    FINALIZE_REPORT.write_text("\n".join(lines) + "\n")


def validate_manifest(model: str) -> list[str]:
    if not MANIFEST.exists():
        return [f"Missing manifest: {MANIFEST}"]
    manifest = json.loads(MANIFEST.read_text())
    failures = []
    if manifest.get("selectedModel") != model:
        failures.append(f"Manifest selectedModel is {manifest.get('selectedModel')}, expected {model}")
    if manifest.get("draft"):
        failures.append("Manifest still has draft=true")
    for beat in manifest.get("beats", []):
        tag = beat.get("tag")
        if tag not in ANIM_BEATS:
            continue
        status = str(beat.get("animationStatus", ""))
        if "full-coverage" not in status or not status.endswith("-full"):
            failures.append(f"{tag}: animationStatus is {status}")
        if not beat.get("videos"):
            failures.append(f"{tag}: no videos in manifest")
        if sum(beat.get("videoFrames") or []) < int(beat.get("voFrames", 0)) - 3:
            failures.append(f"{tag}: manifest video frames do not cover VO")
    return failures


def append_qc_queue(model: str, render: Path) -> str:
    rel = os.path.relpath(render, B)
    row = f"| 4B | {rel} | AWAITING-QC | model `{model}`; Codex mechanical render only, needs Claude/Jarrad QC |"
    text = QC_QUEUE.read_text() if QC_QUEUE.exists() else ""
    if rel in text:
        return f"QC queue already contains {rel}; no duplicate row appended."
    with QC_QUEUE.open("a") as f:
        if text and not text.endswith("\n"):
            f.write("\n")
        f.write(row + "\n")
    return f"Appended QC queue row for {rel}."


def validate_render(render: Path) -> list[str]:
    if not render.exists():
        return [f"Render missing: {render}"]
    meta = streams(render)
    video = [s for s in meta.get("streams", []) if s.get("codec_type") == "video"]
    audio = [s for s in meta.get("streams", []) if s.get("codec_type") == "audio"]
    failures = []
    if not video:
        failures.append("Final render has no video stream")
    if not audio:
        failures.append("Final render has no audio stream")
    if video and (video[0].get("width"), video[0].get("height")) != (1600, 900):
        failures.append(f"Final render dimensions are {video[0].get('width')}x{video[0].get('height')}, expected 1600x900")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, choices=MODELS, help="Jarrad/Claude-approved model to finalize.")
    parser.add_argument("--check-only", action="store_true", help="Validate full clip coverage only.")
    parser.add_argument("--skip-render", action="store_true", help="Build manifest and QC sheets but do not render.")
    parser.add_argument("--no-queue-qc", action="store_true", help="Do not append the final render to _QC-QUEUE.md.")
    args = parser.parse_args()

    REVIEW.mkdir(parents=True, exist_ok=True)
    rows, failures = inspect_clip_coverage(args.model)
    notes: list[str] = []

    if failures:
        notes.append("Full animation clips are not ready. Choose a model visually, generate every queued clip, then rerun.")
        write_report(args.model, rows, failures, notes)
        print(json.dumps({"ready": False, "report": str(FINALIZE_REPORT), "failures": failures}, indent=2))
        return 2

    if args.check_only:
        notes.append("Check-only mode passed. No manifest, render, or QC queue changes were made.")
        write_report(args.model, rows, failures, notes)
        print(json.dumps({"ready": True, "report": str(FINALIZE_REPORT)}, indent=2))
        return 0

    run(["python3", str(SCRIPTS / "qc_animation_clips_4B.py"), "--source", "full", "--model", args.model], cwd=B)

    env = os.environ.copy()
    env["BMH4B_MODEL"] = args.model
    run(["python3", str(SCRIPTS / "build_manifest_4B.py")], cwd=B, env=env)

    manifest_failures = validate_manifest(args.model)
    if manifest_failures:
        notes.append("Manifest build did not prove full animation coverage.")
        write_report(args.model, rows, manifest_failures, notes)
        print(json.dumps({"ready": False, "report": str(FINALIZE_REPORT), "failures": manifest_failures}, indent=2))
        return 3

    if args.skip_render:
        notes.append("Skip-render mode stopped after manifest build and mechanical animation sweep.")
        write_report(args.model, rows, [], notes)
        print(json.dumps({"ready": True, "rendered": False, "report": str(FINALIZE_REPORT)}, indent=2))
        return 0

    run(["npx", "remotion", "render", "src/index4B.ts", "Lesson4B", str(FINAL_RENDER)], cwd=REMOTION)
    render_failures = validate_render(FINAL_RENDER)
    if render_failures:
        notes.append("Render command completed but output failed deterministic stream checks.")
        write_report(args.model, rows, render_failures, notes)
        print(json.dumps({"ready": False, "report": str(FINALIZE_REPORT), "failures": render_failures}, indent=2))
        return 4

    if args.no_queue_qc:
        notes.append("Final render was not queued for QC because --no-queue-qc was set.")
    else:
        notes.append(append_qc_queue(args.model, FINAL_RENDER))

    run(["python3", str(SCRIPTS / "audit_lesson4B_goal.py")], cwd=B)
    notes.append("Goal audit rerun. Completion still depends on Claude/Jarrad QC PASS.")
    write_report(args.model, rows, [], notes)
    print(json.dumps({"ready": True, "render": str(FINAL_RENDER), "report": str(FINALIZE_REPORT)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
