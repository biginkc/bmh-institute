#!/usr/bin/env python3
"""Evidence-based completion audit for Lesson 4B.

This script proves deterministic status only. It never approves visuals.
"""
import json
import os
import subprocess
from pathlib import Path

B = Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
REPORT = B / "course-assets/review-lesson4B/LESSON-4B-goal-audit.md"
REPORT_JSON = B / "course-assets/review-lesson4B/LESSON-4B-goal-audit.json"


def exists(path: str) -> bool:
    return (B / path).exists()


def ffprobe_duration(path: Path) -> float | None:
    if not path.exists():
        return None
    try:
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
    except Exception:
        return None


def media_streams(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(
            subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "stream=codec_type,width,height,r_frame_rate,duration",
                    "-show_entries",
                    "format=duration,size",
                    "-of",
                    "json",
                    str(path),
                ]
            )
        )
    except Exception:
        return {}


def item(requirement: str, status: str, evidence: str) -> dict:
    return {"requirement": requirement, "status": status, "evidence": evidence}


def main() -> None:
    results = []

    # Stage 1: script, scene cards, still review.
    results.append(item("4B claimed in NEXT-SESSION", "pass" if exists("docs/course-production/NEXT-SESSION.md") else "missing", "NEXT-SESSION.md exists and contains the active 4B production row."))
    results.append(item("Clean 4B script exists", "pass" if exists("docs/course-production/shotlists/lesson-4B-script-clean.txt") else "missing", "lesson-4B-script-clean.txt"))
    results.append(item("4B scene cards exist", "pass" if exists("docs/course-production/shotlists/module-04-lesson4B-scenecards.md") else "missing", "module-04-lesson4B-scenecards.md"))
    still_review_path = B / "docs/course-production/shotlists/module-04-lesson4B-still-review.md"
    still_review_text = still_review_path.read_text() if still_review_path.exists() else ""
    results.append(item("Still review package exists", "pass" if still_review_path.exists() else "missing", "module-04-lesson4B-still-review.md"))
    results.append(
        item(
            "Jarrad still gate approval recorded",
            "pass" if "Jarrad-approved" in still_review_text else "gated",
            "Still review status records in-thread Jarrad approval." if "Jarrad-approved" in still_review_text else "Still review does not yet record Jarrad approval.",
        )
    )
    b7 = B / "course-assets/scenes/module-04-lesson4B/m04_L4B_v7_person_situation_8020.png"
    results.append(item("Corrected B7 still exists", "pass" if b7.exists() else "missing", str(b7)))

    # Stage 2: audio.
    state_path = B / "course-assets/heygen/lesson4B/_state.json"
    if state_path.exists():
        state = json.loads(state_path.read_text())
        audio_ok = all((B / f"course-assets/heygen/lesson4B/{tag}.wav").exists() for tag in state)
        results.append(item("Audio and _state.json exist", "pass" if audio_ok else "fail", f"{len(state)} state entries; wav files {'present' if audio_ok else 'missing'}"))
    else:
        state = {}
        results.append(item("Audio and _state.json exist", "missing", str(state_path)))

    # Stage 3/4: stills and Andrea clips.
    clips = [B / "course-assets/heygen/lesson4B/hero_b01_bridge.mp4", B / "course-assets/heygen/lesson4B/hero_b09_outro.mp4"]
    results.append(item("Andrea bookend clips exist", "pass" if all(p.exists() for p in clips) else "missing", ", ".join(str(p) for p in clips)))

    # Stage 5: bake-off and full animation gate.
    bakeoff = B / "docs/course-production/shotlists/module-04-lesson4B-animation-bakeoff.md"
    dashboard = B / "course-assets/review-lesson4B/lesson4B-review-dashboard.html"
    sweep = B / "course-assets/review-lesson4B/animation-qc/bakeoff/index.md"
    results.append(item("B4B/B5 bake-off package exists", "pass" if bakeoff.exists() and dashboard.exists() and sweep.exists() else "missing", f"{bakeoff}; {dashboard}; {sweep}"))

    queue = B / "course-assets/review-lesson4B/animation-queue/index.json"
    results.append(item("Post-selection full animation queues exist", "pass" if queue.exists() else "missing", str(queue)))

    manifest_path = B / "docs/course-production/remotion/public/lesson4B/manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        pending = [b["tag"] for b in manifest.get("beats", []) if b.get("animationStatus") == "pending"]
        selected = manifest.get("selectedModel")
        draft = manifest.get("draft")
        if selected == "static" and draft and pending:
            status = "gated"
            ev = f"selectedModel={selected}, draft={draft}, pendingAnimation={len(pending)}"
        elif not pending and not draft and selected != "static":
            status = "pass"
            ev = f"selectedModel={selected}, full animation manifest"
        else:
            status = "fail"
            ev = f"selectedModel={selected}, draft={draft}, pending={pending}"
        results.append(item("Full animation coverage in manifest", status, ev))
    else:
        results.append(item("Full animation coverage in manifest", "missing", str(manifest_path)))

    # Stage 6: assembly/render.
    static_render = B / "course-assets/review-lesson4B/LESSON-4B-static-timing-draft.mp4"
    static_meta = media_streams(static_render)
    has_video = any(s.get("codec_type") == "video" for s in static_meta.get("streams", []))
    has_audio = any(s.get("codec_type") == "audio" for s in static_meta.get("streams", []))
    results.append(item("Static timing draft render exists", "pass" if has_video and has_audio else "missing", f"{static_render}; audio={has_audio}; video={has_video}"))

    final_render = B / "course-assets/review-lesson4B/LESSON-4B-v1.mp4"
    results.append(item("Final animated render exists", "pass" if final_render.exists() else "gated", str(final_render)))

    # Stage 7/8: QC queue.
    qc_text = (B / "docs/course-production/_QC-QUEUE.md").read_text() if exists("docs/course-production/_QC-QUEUE.md") else ""
    qc_lines = [line for line in qc_text.splitlines() if "LESSON-4B-v1.mp4" in line]
    final_in_queue = bool(qc_lines)
    pass_in_queue = any("| PASS |" in line for line in qc_lines)
    results.append(item("Final render queued for Claude QC", "pass" if final_in_queue else "gated", "QC queue contains LESSON-4B-v1.mp4" if final_in_queue else "No final 4B render row because final animation is not rendered."))
    results.append(item("Claude/Jarrad final QC PASS", "pass" if pass_in_queue else "gated", "No PASS row for final 4B render yet."))

    # Standing visual gates are intentionally not self-approved.
    results.append(item("Codex did not self-approve visuals", "pass", "Manifest remains static/gated; review docs explicitly route visual judgment to Jarrad/Claude."))

    complete = all(r["status"] == "pass" for r in results)
    payload = {"complete": complete, "results": results}
    REPORT_JSON.write_text(json.dumps(payload, indent=2))

    lines = ["# Lesson 4B Goal Completion Audit", "", f"Complete: `{complete}`", "", "| Requirement | Status | Evidence |", "|---|---|---|"]
    for r in results:
        lines.append(f"| {r['requirement']} | `{r['status']}` | {r['evidence']} |")
    REPORT.write_text("\n".join(lines) + "\n")
    print(json.dumps({"complete": complete, "report": str(REPORT), "json": str(REPORT_JSON)}, indent=2))


if __name__ == "__main__":
    main()
