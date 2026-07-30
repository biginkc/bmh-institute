#!/usr/bin/env python3
import json
import os
import pathlib
import shutil
import subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


ROOT = pathlib.Path(BMH_ROOT)
HG = ROOT / "course-assets/heygen/lesson6B"
SCENES = ROOT / "course-assets/scenes/module-06-lesson6B"
PUBLIC = ROOT / "docs/course-production/remotion/public/lesson6B"
FPS = 30
GAP = 1.0
BLUE = "62b3f3"
TAGS = [
    "b01_intro",
    "b02_crmnotes",
    "b03_briefam",
    "b04_transfer",
    "b05_frame",
    "b06_checklist",
    "b07_killers",
    "b08_outro",
]

state = json.load(open(HG / "_state.json"))
clips = json.load(open(HG / "_clips.json"))
animations_path = HG / "seedance/_animations.json"
animations = json.load(open(animations_path)) if animations_path.exists() else {}


def run(command):
    subprocess.run(command, check=True)


def duration(path):
    return float(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nw=1:nk=1",
                str(path),
            ],
            text=True,
        ).strip()
    )


def word_frame(tag, needle, occurrence=1):
    match_number = 0
    cleaned_needle = needle.lower().strip('.,?!"“”$—-·:')
    for word in state[tag].get("words") or []:
        cleaned_word = word["word"].lower().strip('.,?!"“”$—-·:')
        if cleaned_needle in cleaned_word:
            match_number += 1
            if match_number == occurrence:
                return max(0, round(float(word["start"]) * FPS))
    raise ValueError(f"missing trigger {tag}: {needle} occurrence {occurrence}")


def sample_hex(path, x, y):
    command = (
        f'ffmpeg -v error -ss 1 -i "{path}" '
        f'-vf "crop=2:2:{x}:{y},scale=1:1" -frames:v 1 '
        '-f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6'
    )
    return subprocess.check_output(command, shell=True, text=True).strip()


def normalize_standing(source, destination, target_seconds):
    own_blue = sample_hex(source, 410, 8)
    filter_graph = (
        f"color=c=0x{BLUE}:s=1600x900:r={FPS}[bg];"
        f"[0:v]crop=480:720:400:0,scale=600:900,format=rgb24,"
        f"colorkey=0x{own_blue}:0.16:0.05[fg];"
        f"[bg][fg]overlay=x=500:y=0:shortest=1,"
        f"tpad=stop_mode=clone:stop_duration={target_seconds + 1:.3f},"
        "fps=30,format=yuv420p[v]"
    )
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(source),
            "-filter_complex",
            filter_graph,
            "-map",
            "[v]",
            "-t",
            f"{target_seconds:.3f}",
            "-an",
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "medium",
            "-color_range",
            "tv",
            "-colorspace",
            "bt709",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            str(destination),
            "-y",
        ]
    )


def normalize_animation(source, destination, target_seconds):
    own_blue = sample_hex(source, 8, 8)
    filter_graph = (
        f"color=c=0x{BLUE}:s=1600x900:r={FPS}[bg];"
        f"[0:v]scale=1600:900,format=rgb24,colorkey=0x{own_blue}:0.13:0.04[fg];"
        f"[bg][fg]overlay=shortest=1,"
        f"tpad=stop_mode=clone:stop_duration={target_seconds + 1:.3f},"
        "fps=30,format=yuv420p[v]"
    )
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(source),
            "-filter_complex",
            filter_graph,
            "-map",
            "[v]",
            "-t",
            f"{target_seconds:.3f}",
            "-an",
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "medium",
            "-color_range",
            "tv",
            "-colorspace",
            "bt709",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            str(destination),
            "-y",
        ]
    )


for folder in ("audio", "hero", "circle", "anim", "stills"):
    (PUBLIC / folder).mkdir(parents=True, exist_ok=True)

gap = PUBLIC / "audio/gap.wav"
run(
    [
        "ffmpeg",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=mono",
        "-t",
        str(GAP),
        str(gap),
        "-y",
    ]
)
concat_lines = []
for index, tag in enumerate(TAGS):
    source = pathlib.Path(state[tag]["wav"])
    destination = PUBLIC / f"audio/{tag}.wav"
    shutil.copy2(source, destination)
    concat_lines.append(f"file '{destination.resolve()}'")
    if index < len(TAGS) - 1:
        concat_lines.append(f"file '{gap.resolve()}'")
concat = PUBLIC / "audio/_concat.txt"
concat.write_text("\n".join(concat_lines) + "\n")
run(
    [
        "ffmpeg",
        "-v",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(PUBLIC / "master.m4a"),
        "-y",
    ]
)

for path in SCENES.glob("*.png"):
    shutil.copy2(path, PUBLIC / "stills" / path.name)

beat_seconds = {
    tag: duration(state[tag]["wav"]) + (GAP if index < len(TAGS) - 1 else 0)
    for index, tag in enumerate(TAGS)
}

hero_sources = {
    "b01_intro": clips["hero_b01_intro"]["file"],
    "b08_outro": clips["hero_b08_outro"]["file"],
}
for tag, source in hero_sources.items():
    normalize_standing(source, PUBLIC / f"hero/{tag}.mp4", beat_seconds[tag])

normalize_standing(
    clips["circle_b03_briefam"]["file"],
    PUBLIC / "circle/b03_briefam.mp4",
    beat_seconds["b03_briefam"],
)

animation_refs = {}
for tag in ("b03_briefam", "b05_frame"):
    entry = animations.get(tag) or {}
    source = pathlib.Path(entry.get("file", ""))
    if source.exists():
        destination = PUBLIC / f"anim/{tag}.mp4"
        normalize_animation(source, destination, beat_seconds[tag])
        animation_refs[tag] = f"lesson6B/anim/{tag}.mp4"


def still(name):
    return f"lesson6B/stills/{name}"


beats = [
    {
        "tag": "b01_intro",
        "mode": "hero",
        "hero": "lesson6B/hero/b01_intro.mp4",
        "badge": True,
        "transitionIn": "fade",
        "transitionOut": "slide",
    },
    {
        "tag": "b02_crmnotes",
        "mode": "progressive",
        "transitionIn": "slide",
        "transitionOut": "slide",
        "progress": [
            {"src": still("m06_L6B_b02_form_01.png"), "delay": 0},
            {"src": still("m06_L6B_b02_form_02.png"), "delay": word_frame("b02_crmnotes", "CRM")},
            {"src": still("m06_L6B_b02_form_03.png"), "delay": word_frame("b02_crmnotes", "field")},
            {"src": still("m06_L6B_b02_form_04.png"), "delay": word_frame("b02_crmnotes", "detail")},
            {"src": still("m06_L6B_b02_form_05.png"), "delay": word_frame("b02_crmnotes", "situation")},
            {"src": still("m06_L6B_b02_form_06.png"), "delay": word_frame("b02_crmnotes", "basic")},
        ],
        "labels": [{"text": "COMPLETE YOUR NOTES", "delay": word_frame("b02_crmnotes", "CRM")}],
    },
    {
        "tag": "b03_briefam",
        "mode": "corner",
        "still": still("m06_L6B_b03_briefam.png"),
        "anim": animation_refs.get("b03_briefam"),
        "circle": "lesson6B/circle/b03_briefam.mp4",
        "transitionIn": "slide",
        "transitionOut": "cut",
        "labels": [{"text": "BRIEF THE AM", "delay": word_frame("b03_briefam", "brief")}],
    },
    {
        "tag": "b04_transfer",
        "mode": "still",
        "still": still("m06_L6B_b04_transfer.png"),
        "transitionIn": "cut",
        "transitionOut": "slide",
    },
    {
        "tag": "b05_frame",
        "mode": "scene",
        "still": still("m06_L6B_b05_frame.png"),
        "anim": animation_refs.get("b05_frame"),
        "transitionIn": "slide",
        "transitionOut": "cut",
        "labels": [{"text": "NO PRESSURE, NO OBLIGATION", "delay": word_frame("b05_frame", "pressure")}],
    },
    {
        "tag": "b06_checklist",
        "mode": "progressive",
        "transitionIn": "cut",
        "transitionOut": "cut",
        "progress": [
            {"src": still("m06_L6B_b06_check_00.png"), "delay": 0},
            *[
                {"src": still(f"m06_L6B_b06_check_{index:02d}.png"), "delay": word_frame("b06_checklist", trigger)}
                for index, trigger in enumerate(
                    ["story", "motivation", "timeline", "condition", "price", "decision-maker", "financial", "contact", "hot", "manager"],
                    start=1,
                )
            ],
        ],
        "labels": [{"text": "10-POINT CHECKLIST", "delay": word_frame("b06_checklist", "sure")}],
    },
    {
        "tag": "b07_killers",
        "mode": "still",
        "still": still("m06_L6B_b07_killers.png"),
        "transitionIn": "cut",
        "transitionOut": "fade",
        "push": True,
        "labels": [
            {"text": "INCOMPLETE INFO", "delay": word_frame("b07_killers", "Incomplete")},
            {"text": "NO MOTIVATION CONTEXT", "delay": word_frame("b07_killers", "context")},
            {"text": "NO WARM INTRO", "delay": word_frame("b07_killers", "warm")},
        ],
    },
    {
        "tag": "b08_outro",
        "mode": "hero",
        "hero": "lesson6B/hero/b08_outro.mp4",
        "transitionIn": "fade",
        "transitionOut": "fade",
    },
]

for index, beat in enumerate(beats):
    tag = beat["tag"]
    vo_frames = round(duration(state[tag]["wav"]) * FPS)
    beat["voFrames"] = vo_frames
    beat["durationInFrames"] = vo_frames + (round(GAP * FPS) if index < len(beats) - 1 else 0)

manifest = {
    "fps": FPS,
    "audio": "lesson6B/master.m4a",
    "beats": beats,
    "totalFrames": sum(beat["durationInFrames"] for beat in beats),
    "circleCrop": {"width": 1600, "height": 900, "left": -580, "top": 65, "diameter": 440},
    "notes": {
        "stills": "All 21 stills approved by Jarrad 2026-07-10.",
        "videoTail": "Hero, circle, and Seedance media are extended with decoded last-frame clone inside MP4. No PNG tail frames.",
        "b05Fallback": "static push-in" if "b05_frame" not in animation_refs else "Seedance roll accepted",
    },
}
(PUBLIC / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"totalFrames": manifest["totalFrames"], "seconds": round(manifest["totalFrames"] / FPS, 3), "animations": animation_refs}, indent=2))
for beat in beats:
    details = [beat["tag"], f"{beat['durationInFrames']}f", beat["mode"]]
    for item in beat.get("progress", []):
        details.append(f"progress@{item['delay']}")
    for label in beat.get("labels", []):
        details.append(f"label@{label['delay']}:{label['text']}")
    print("  ".join(details))
