#!/usr/bin/env python3
"""Build Lesson 12A manifest ("KPIs & Sales Telemetry").

Audio is the master clock with 1.0s gaps. Most KPI visuals are code-rendered in
Remotion. B07 is intentionally a static fallback because the Higgsfield MCP
upload and cost-preflight endpoints returned generic errors before job submit.
v5 removes role-variable targets, the role-specific target beat, and the old
next-topic tease per Jarrad's evergreen role-agnostic direction.
"""
import json
import os
import shutil
import subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson12A"
SCN = f"{B}/course-assets/scenes/module-12"
PUB = f"{B}/docs/course-production/remotion/public/lesson12A"
FPS = 30
GAP_FRAMES = 30
GAP_SECONDS = 1.0

BEATS = [
    ("b01_numbers_work", "hero", None, "hero_b01_numbers_work.mp4", True),
    ("b02_gaps_not_guesses", "gap", None, None, False),
    ("b03_kpi_definition", "gauges", None, None, False),
    ("b04_flying_blind", "still", "m12_L12A_b04_flying-blind_priya-standing-cane-redo.png", None, False),
    ("b05_six_metrics_funnel", "pipeline", None, None, False),
    ("b06_dial_count", "dial", None, None, False),
    ("b07_dial_quality", "dialQuality", "m12_L12A_b07_dial-quality_priya-phone-front-v5.png", None, False),
    ("b08_connection_rate", "connection", None, None, False),
    ("b09_quality_conversations", "quality", None, None, False),
    ("b10_process_calls", "process", None, None, False),
    ("b11_offers_made", "offers", "m12_L12A_b11_offers-made.png", None, False),
    ("b12_contracts_signed", "contracts", None, None, False),
    ("b13_breakdown_map", "breakdown", None, None, False),
    ("b14_funnel_health", "funnelHealth", None, None, False),
    ("b16_coaching_questions", "reportcard", "m12_L12A_b16_report-card.png", None, False),
    ("b17_embrace_numbers", "hero", None, "hero_b17_embrace_numbers.mp4", False),
    ("b18_final_close", "hero", None, "hero_b18_final_close.mp4", False),
]

LABELS = {
    "b01_numbers_work": [],
    "b02_gaps_not_guesses": [
        ("LOOK AT THE NUMBERS", "numbers", "bottom", "caption"),
        ("FIND THE GAP", "gaps", "bottom", "label"),
        ("FIX IT", "fix", "bottom", "label"),
    ],
    "b03_kpi_definition": [
        ("KEY PERFORMANCE INDICATOR", "KPI", "bottom", "caption"),
        ("NEEDS FIXING", "fixing", "bottom", "label"),
    ],
    "b04_flying_blind": [
        ("BUSY IS NOT PRODUCTIVE", "productive", "bottom", "caption"),
        ("KPIs SEPARATE THEM", "separates", "bottom", "label"),
    ],
    "b05_six_metrics_funnel": [
        ("6 METRICS", "six", "bottom", "label"),
        ("LEFT TO RIGHT", "left", "bottom", "label"),
        ("TRACE THE BREAK", "broke", "bottom", "caption"),
    ],
    "b06_dial_count": [
        ("DIAL COUNT", "dial", "bottom", "label"),
    ],
    "b07_dial_quality": [],
    "b08_connection_rate": [
        ("CONNECTION RATE", "connection", "bottom", "label"),
        ("FLAG IT", "flag", "bottom", "label"),
    ],
    "b09_quality_conversations": [],
    "b10_process_calls": [
        ("PROCESS CALLS", "process", "bottom", "label"),
        ("COACHING MOMENT", "coaching", "bottom", "label"),
    ],
    "b11_offers_made": [
        ("LOOK INTO IT", "looking", "bottom", "label"),
    ],
    "b12_contracts_signed": [
        ("CONTRACTS SIGNED", "contracts", "bottom", "caption"),
    ],
    "b13_breakdown_map": [("PINPOINT THE BREAKDOWN", "pinpoint", "bottom", "caption")],
    "b14_funnel_health": [
        ("KEEP THE FUNNEL HEALTHY", "healthy", "bottom", "caption"),
        ("YOU CONTROL: DIALS -> HANDOFF", "control", "bottom", "caption"),
    ],
    "b16_coaching_questions": [
        ("WHERE'S THE GAP?", "gap", "bottom", "label"),
        ("WHAT DO WE DO ABOUT IT?", "what", "bottom", "caption"),
    ],
    "b17_embrace_numbers": [],
    "b18_final_close": [],
}


def run(cmd):
    subprocess.run(cmd, check=True)


def dur(path):
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
                path,
            ]
        ).strip()
    )


def clean_word(word):
    return str(word).lower().strip('.,?!"“”():;')


def word_frame(state, tag, trigger, occurrence=1, fallback=10):
    words = state.get(tag, {}).get("words") or []
    parts = [clean_word(p) for p in str(trigger).split() if clean_word(p)]
    if not parts:
        return fallback
    hits = []
    cleaned = [clean_word(w.get("word", "")) for w in words]
    for i in range(0, len(cleaned) - len(parts) + 1):
        if cleaned[i : i + len(parts)] == parts:
            hits.append(float(words[i].get("start", 0)))
    if not hits and len(parts) == 1:
        needle = parts[0]
        for i, got in enumerate(cleaned):
            if needle and (needle == got or needle in got):
                hits.append(float(words[i].get("start", 0)))
    if not hits:
        return fallback
    idx = min(max(occurrence - 1, 0), len(hits) - 1)
    return max(4, round(hits[idx] * FPS))


def copy_still(name):
    if not name:
        return None
    src = f"{SCN}/{name}"
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    dst = f"{PUB}/stills/{name}"
    shutil.copyfile(src, dst)
    return f"lesson12A/stills/{name}"


def copy_hero(name):
    if not name:
        return None
    src = f"{HG}/{name}"
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    dst = f"{PUB}/hero/{name}"
    shutil.copyfile(src, dst)
    return f"lesson12A/hero/{name}"


for sub in ("stills", "hero"):
    os.makedirs(f"{PUB}/{sub}", exist_ok=True)

state = json.load(open(f"{HG}/_state.json"))

silence = f"{PUB}/_gap.wav"
run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP_SECONDS), "-ac", "1", silence, "-y"])
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as file:
    for i, (tag, *_rest) in enumerate(BEATS):
        file.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS) - 1:
            file.write(f"file '{silence}'\n")
run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list, "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"])

manifest = []
for i, (tag, mode, still_name, hero_name, badge) in enumerate(BEATS):
    wav = f"{HG}/{tag}.wav"
    voice_frames = round(dur(wav) * FPS)
    duration_frames = voice_frames + (0 if i == len(BEATS) - 1 else GAP_FRAMES)
    entry = {
        "tag": tag,
        "mode": mode,
        "durationInFrames": duration_frames,
        "voFrames": voice_frames,
        "labels": [
            {
                "text": text,
                "delay": word_frame(state, tag, trigger),
                "place": place,
                "role": role,
            }
            for text, trigger, place, role in LABELS.get(tag, [])
        ],
        "animationStatus": "not-required",
    }
    if badge:
        entry["badge"] = True
    if still_name:
        entry["still"] = copy_still(still_name)
    if hero_name:
        entry["hero"] = copy_hero(hero_name)
    if tag == "b07_dial_quality":
        entry["animationStatus"] = "higgsfield_unavailable_static_fallback"
    manifest.append(entry)

total = sum(beat["durationInFrames"] for beat in manifest)
out = {
    "fps": FPS,
    "gapFrames": GAP_FRAMES,
    "beats": manifest,
    "audio": "lesson12A/master.m4a",
    "totalFrames": total,
    "animationFallbacks": {
        "b07_dial_quality": "Higgsfield MCP media_upload and generate_video get_cost returned generic errors before job submission; used approved still with Remotion push-in."
    },
}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 2), "fallbacks": out["animationFallbacks"]}, indent=1))
