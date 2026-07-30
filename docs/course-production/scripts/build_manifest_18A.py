#!/usr/bin/env python3
"""Build Lesson 18A manifest ("Operator Playbook")."""
import json
import os
import shutil
import subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson18A"
SCN = f"{B}/course-assets/scenes/module-18-lesson18A"
PUB = f"{B}/docs/course-production/remotion/public/lesson18A"
FPS = 30
GAP_FRAMES = 30
GAP_SECONDS = 1.0

BEATS = [
    ("b01_put_it_together", "hero", None, "hero_b01_put_it_together.mp4", None, True),
    ("b02_command_center_priorities", "scene", "m18_L18A_b02_command-center-v2.png", None, None, False),
    ("b03_research_prep", "researchPrep", "m18_L18A_b03_research-prep-v2.png", "hero_b03_research_prep.mp4", "anim_b03_research_prep_v8.mp4", False),
    ("b04_first_call_block", "scene", "m18_L18A_b04_first-call-block-v2.png", None, None, False),
    ("b05_break_reset", "scene", "m18_L18A_b05_break-reset-v2.png", None, None, False),
    ("b06_second_block_lunch", "secondBlock", None, None, None, False),
    ("b07_admin_block", "leadTicker", "m18_L18A_b09_pipeline-review-v2.png", None, None, False),
    ("b08_final_call_block", "finalPush", None, None, None, False),
    ("b09_pipeline_review", "leadTicker", "m18_L18A_b09_pipeline-review-v2.png", None, None, False),
    ("b10_worked_the_day", "workedDay", None, None, None, False),
    ("b11_control_consistency", "consistency", None, None, None, False),
    ("b12_energy_management", "scene", "m18_L18A_b12_energy-management-v2.png", None, None, False),
    ("b13_one_call_humans", "scene", "m18_L18A_b13_one-call-humans.png", None, "anim_b13_one_call_humans.mp4", False),
    ("b14_daily_sync_tease", "hero", None, "hero_b14_daily_sync_tease.mp4", None, False),
]

ANIMATION_STATUS_BY_FILE = {
    "anim_b03_research_prep_v8.mp4": "generated-multishot-required",
    "anim_b13_one_call_humans.mp4": "local-full-frame-motion",
}

PREPROCESSED_HERO_BY_FILE = {
    "hero_b14_daily_sync_tease.mp4": "_preprocessed/hero_b14_daily_sync_tease_videoonly_30fps.mp4",
}

LABELS = {
    "b01_put_it_together": [],
    "b02_command_center_priorities": [
        ("COMMAND CENTER", "command center", "top", "label"),
        ("SORT PRIORITIES", "priorities", "right", "label"),
    ],
    "b03_research_prep": [
        ("30-MINUTE PREP", "half hour", "top", "label"),
        ("10-15 TOP LEADS", "10 to 15", "bottom", "caption"),
        ("DO YOUR HOMEWORK", "homework", "right", "label"),
    ],
    "b04_first_call_block": [
        ("FOLLOW-UPS FIRST", "Follow-ups", "top", "label"),
        ("60-80 DIALS", "60 to 80", "bottom", "caption"),
        ("LOG NOTES NOW", "log notes", "right", "label"),
    ],
    "b05_break_reset": [
        ("15-MINUTE RESET", "fifteen", "top", "label"),
        ("WATER + STRETCH", "water", "bottom", "caption"),
    ],
    "b06_second_block_lunch": [
        ("SECOND BLOCK", "Second", "top", "label"),
        ("110-150 BY LUNCH", "110 to 150", "bottom", "caption"),
        ("REAL FOOD", "real food", "right", "label"),
    ],
    "b07_admin_block": [
        ("ADMIN BLOCK", "admin block", "top", "label"),
        ("UPDATE STAGES", "stages", "bottom", "caption"),
        ("HANDOFF CHECKLISTS", "checklists", "right", "label"),
    ],
    "b08_final_call_block": [
        ("FINAL PUSH", "last push", "top", "label"),
        ("RE-DIALS", "re-dials", "right", "label"),
        ("150-200 TOTAL", "150 to 200", "bottom", "caption"),
    ],
    "b09_pipeline_review": [
        ("PIPELINE REVIEW", "pipeline review", "top", "label"),
        ("NEXT ACTION + DATE", "specific date", "bottom", "caption"),
        ("TOMORROW READY", "tomorrow", "right", "label"),
    ],
    "b10_worked_the_day": [
        ("WORKED THE DAY", "worked the day", "top", "title"),
    ],
    "b11_control_consistency": [],
    "b12_energy_management": [],
    "b13_one_call_humans": [],
    "b14_daily_sync_tease": [
        ("CAPSTONE ROLEPLAY COMING", "capstone", "top", "caption"),
        ("NEXT: DAILY MISSION CONTROL", "team stays in sync", "bottom", "label"),
    ],
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


def frame_count(path):
    value = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
            path,
        ]
    ).decode().strip()
    if value.isdigit():
        return int(value)
    return round(dur(path) * FPS)


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
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    return f"lesson18A/stills/{name}"


def copy_hero(name):
    if not name:
        return None
    src = f"{HG}/{PREPROCESSED_HERO_BY_FILE.get(name, name)}"
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    dst = f"{PUB}/hero/{name}"
    shutil.copyfile(src, dst)
    return f"lesson18A/hero/{name}"


def copy_anim(name, tag):
    if not name:
        return None, None, None
    src = f"{HG}/seedance/{name}"
    if not os.path.exists(src):
        return None, None, None
    dst = f"{PUB}/anim/{name}"
    shutil.copyfile(src, dst)
    tail = f"{PUB}/tails/{tag}_tail.png"
    run(["ffmpeg", "-v", "error", "-sseof", "-0.06", "-i", src, "-frames:v", "1", "-pix_fmt", "rgb24", tail, "-y"])
    return f"lesson18A/anim/{name}", f"lesson18A/tails/{tag}_tail.png", frame_count(src)


for sub in ("stills", "hero", "anim", "tails"):
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
fallbacks = {}
for i, (tag, mode, still_name, hero_name, anim_name, badge) in enumerate(BEATS):
    wav = f"{HG}/{tag}.wav"
    voice_frames = round(dur(wav) * FPS)
    duration_frames = voice_frames + (0 if i == len(BEATS) - 1 else GAP_FRAMES)
    anim, tail, anim_frames = copy_anim(anim_name, tag)
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
    if anim:
        entry["anim"] = anim
        entry["tail"] = tail
        entry["animFrames"] = anim_frames
        entry["animationStatus"] = ANIMATION_STATUS_BY_FILE.get(anim_name, "seedance")
    elif anim_name:
        entry["animationStatus"] = "static-fallback"
        fallbacks[tag] = f"Missing {anim_name}; using approved still full-frame only."
    manifest.append(entry)

total = sum(beat["durationInFrames"] for beat in manifest)
out = {
    "fps": FPS,
    "gapFrames": GAP_FRAMES,
    "beats": manifest,
    "audio": "lesson18A/master.m4a",
    "totalFrames": total,
    "animationFallbacks": fallbacks,
}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 2), "fallbacks": fallbacks}, indent=1))
