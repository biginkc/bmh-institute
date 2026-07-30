#!/usr/bin/env python3
"""Build a local 4B review dashboard.

The dashboard is a navigation aid only. It does not rank or approve visuals.
"""
import json
import os
from pathlib import Path

B = Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
REVIEW = B / "course-assets/review-lesson4B"
GROK = B / "course-assets/heygen/lesson4B/grok"
QC = REVIEW / "animation-qc/bakeoff"
QUEUE = REVIEW / "animation-queue"
MOBILE = REVIEW / "mobile-bakeoff"
OUT = REVIEW / "lesson4B-review-dashboard.html"

MODELS = [
    ("seedance_2_0", "Seedance 2.0"),
    ("kling3_0", "Kling 3.0"),
    ("wan2_7", "Wan 2.7"),
    ("minimax_hailuo", "Minimax Hailuo"),
    ("veo3_1_lite", "Veo 3.1 Lite"),
]


def rel(path: Path) -> str:
    return os.path.relpath(path, REVIEW)


def video_path(model: str, beat: str) -> Path | None:
    stem = {
        "seedance_2_0": "seedance_2_0",
        "kling3_0": "kling3_0",
        "wan2_7": "wan2_7",
        "minimax_hailuo": "minimax_hailuo",
        "veo3_1_lite": "veo3_1_lite",
    }[model]
    prefix = "b04b" if beat == "b04b_offer" else "b05"
    path = GROK / f"anim_{prefix}_{stem}.mp4"
    return path if path.exists() else None


def sheet_path(model: str, beat: str, video: Path) -> Path:
    return QC / f"{model}__{beat}__{video.stem}.jpg"


def gif_path(model: str, beat: str) -> Path:
    prefix = "b04b" if beat == "b04b_offer" else "b05"
    return MOBILE / f"{prefix}_{model}.gif"


def load_coverage() -> dict[str, str]:
    p = QC / "records.json"
    if not p.exists():
        return {}
    data = json.loads(p.read_text())
    return {c["group"]: c["status"] for c in data.get("coverage", [])}


def card(model: str, label: str, beat: str, coverage: dict[str, str]) -> str:
    video = video_path(model, beat)
    if not video:
        return f"<section class='clip missing'><h3>{label} / {beat}</h3><p>Unavailable for this beat.</p></section>"
    sheet = sheet_path(model, beat, video)
    gif = gif_path(model, beat)
    status = coverage.get(f"{model}/{beat}", "unknown")
    sheet_html = f"<a href='{rel(sheet)}'><img src='{rel(sheet)}' alt='0.5s sweep sheet'></a>" if sheet.exists() else "<p>No sweep sheet generated.</p>"
    gif_html = f"<a href='{rel(gif)}'><img class='gif' src='{rel(gif)}' alt='mobile animation gif'></a>" if gif.exists() else "<p>No mobile GIF generated.</p>"
    return f"""
      <section class="clip">
        <h3>{label} / {beat} <span class="status">{status}</span></h3>
        <video controls preload="metadata" src="{rel(video)}"></video>
        {gif_html}
        {sheet_html}
      </section>
    """


def main() -> None:
    coverage = load_coverage()
    rows = []
    for model, label in MODELS:
        rows.append(f"<h2>{label}</h2>")
        rows.append("<div class='grid'>")
        rows.append(card(model, label, "b04b_offer", coverage))
        rows.append(card(model, label, "b05_step5_close", coverage))
        rows.append("</div>")

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lesson 4B Review Dashboard</title>
  <style>
    :root {{ --blue:#62b3f3; --ink:#111; --paper:#fff; --cream:#fff7de; --yellow:#ffd23f; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--blue); color: var(--ink); }}
    main {{ max-width: 1280px; margin: 0 auto; padding: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: 34px; }}
    h2 {{ margin: 30px 0 14px; font-size: 24px; }}
    h3 {{ margin: 0 0 10px; font-size: 17px; display: flex; justify-content: space-between; gap: 12px; align-items: center; }}
    p, li {{ font-size: 16px; line-height: 1.45; }}
    a {{ color: var(--ink); font-weight: 700; }}
    .notice, .panel, .clip {{ background: rgba(255,255,255,.94); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.10); }}
    .notice {{ padding: 16px 18px; margin: 18px 0; }}
    .panel {{ padding: 18px; margin: 18px 0; }}
    .grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }}
    .clip {{ padding: 14px; }}
    .clip video {{ width: 100%; aspect-ratio: 16 / 9; display: block; background: #111; border-radius: 6px; }}
    .clip img {{ width: 100%; display: block; margin-top: 12px; border-radius: 6px; background: #fff; }}
    .clip img.gif {{ background: #62b3f3; }}
    .missing {{ min-height: 180px; display: flex; flex-direction: column; justify-content: center; }}
    .status {{ font-size: 13px; padding: 3px 8px; border-radius: 999px; background: var(--cream); }}
    .links {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }}
    @media (max-width: 900px) {{ .grid, .links {{ grid-template-columns: 1fr; }} main {{ padding: 18px; }} }}
  </style>
</head>
<body>
<main>
  <h1>Lesson 4B Review Dashboard</h1>
  <div class="notice">
    <strong>Gate:</strong> Stills are Jarrad-approved. Jarrad/Claude still chooses the animation model. Codex has not approved clips, faces, noses, style, model choice, or final cut quality.
  </div>
  <section class="panel">
    <h2>Primary Review Links</h2>
    <div class="links">
      <a href="{rel(REVIEW / 'LESSON-4B-static-timing-draft.mp4')}">Static timing draft</a>
      <a href="{rel(REVIEW / 'LESSON-4B-static-frame-sheet.jpg')}">Static draft frame sheet</a>
      <a href="{rel(REVIEW / 'LESSON-4B-goal-audit.md')}">Goal completion audit</a>
      <a href="{rel(REVIEW / 'LESSON-4B-finalize-report.md')}">Finalizer guardrail report</a>
      <a href="../../docs/course-production/shotlists/module-04-lesson4B-current-gate.md">Current gate handoff</a>
      <a href="{rel(GROK / 'bakeoff-review.html')}">Original playable bake-off grid</a>
      <a href="{rel(QC / 'index.md')}">Mechanical sweep index</a>
      <a href="{rel(MOBILE)}">Mobile GIF folder</a>
      <a href="{rel(QUEUE / 'seedance_2_0/queue.md')}">Seedance full queue</a>
      <a href="{rel(QUEUE / 'kling3_0/queue.md')}">Kling full queue</a>
      <a href="{rel(QUEUE / 'wan2_7/queue.md')}">Wan full queue</a>
      <a href="{rel(QUEUE / 'minimax_hailuo/queue.md')}">Minimax full queue</a>
      <a href="{rel(QUEUE / 'veo3_1_lite/queue.md')}">Veo full queue</a>
      <a href="{rel(QUEUE / 'index.json')}">All queue metadata</a>
    </div>
  </section>
  <section class="panel">
    <h2>Decision Prompt</h2>
    <p>Choose the model that best preserves the locked seller and BMH representative identities across both B4B Offer and B5 Close-up. Reject any model with face/nose drift, clone characters, extra text, style-sheet flashes, prop morphing, or off-brand rendering. Mechanical duration coverage is shown as a status pill, but visual judgment wins.</p>
  </section>
  {''.join(rows)}
</main>
</body>
</html>
"""
    OUT.write_text(html)
    print(OUT)


if __name__ == "__main__":
    main()
