#!/usr/bin/env python3
"""Build Lesson 4B manifest ("The Five-Step Conversation Framework").

This is a deterministic assembly scaffold. It does not select an animation
model: set BMH4B_MODEL after Jarrad/Claude chooses a bake-off winner.
"""
import json
import os
import subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson4B"
GK = f"{HG}/grok"
SCN = f"{B}/course-assets/scenes/module-04-lesson4B"
PUB = f"{B}/docs/course-production/remotion/public/lesson4B"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0
MODEL = os.environ.get("BMH4B_MODEL", "static").strip()
ANIM_BEATS = {
    "b02_step1_intro",
    "b03_step2_factfind",
    "b04a_pitch",
    "b04b_offer",
    "b05_step5_close",
    "b06_structure_vs_execution",
    "b07_8020_rule",
    "b08_slow_down",
}

BEATS = [
    ("b01_bridge", "hero", 0, None, "hero_b01_bridge.mp4", True),
    ("b02_step1_intro", "scene", 0, "m04_L4B_v2_intro_split_screen_reroll.png", None, False),
    ("b03_step2_factfind", "scene", 2, "m04_L4B_v2_factfind_listen_nobubble.png", None, False),
    ("b04a_pitch", "scene", 3, "m04_L4B_v4a_pitch_grounded.png", None, False),
    ("b04b_offer", "scene", 4, "m04_L4B_v4b_offer_handoff_animated_base.png", None, False),
    ("b05_step5_close", "scene", 5, "m04_L4B_v5_rep_closeup_headset.png", None, False),
    ("b06_structure_vs_execution", "scene", 0, "m04_L4B_v6_conveyor_call_candidate_1600x900.png", None, False),
    ("b07_8020_rule", "rule8020", 0, "m04_L4B_v7_person_situation_8020.png", None, False),
    ("b08_slow_down", "scene", 0, "m04_L4B_v8_slow_down_care_reroll.png", None, False),
    ("b09_outro", "hero", 0, None, "hero_b09_outro.mp4", False),
]

LABELS = {
    "b02_step1_intro": [
        ("STEP 1 · INTRO", "Step", "top"),
    ],
    "b03_step2_factfind": [
        ("STEP 2 · FACT FIND", "Step", "top"),
        ("80% LISTEN", "eighty", "bottom"),
    ],
    "b04a_pitch": [
        ("STEP 3 · PITCH", "Pitch", "top"),
    ],
    "b04b_offer": [
        ("STEP 4 · OFFER", "Offer", "top"),
        ("TEE UP THE HANDOFF", "handoff", "bottom"),
    ],
    "b05_step5_close": [
        ("STEP 5 · CLOSE", "step", "top"),
        ("GET COMMITMENT", "commitment", "bottom"),
    ],
    "b06_structure_vs_execution": [
        ("PIPELINE = WHERE", "pipeline", "top"),
        ("FRAMEWORK = HOW", "execute", "bottom"),
    ],
    "b07_8020_rule": [
        ("80% PERSON / 20% HOUSE", "eighty", "top"),
        ("THE PERSON'S SITUATION", "problem", "bottom"),
    ],
    "b08_slow_down": [
        ("SLOW DOWN", "Slow", "top"),
        ("CARE FIRST", "care", "bottom"),
    ],
}

ANIMATIONS = {
    "seedance_2_0": {
        "b04b_offer": f"{GK}/anim_b04b_seedance_2_0.mp4",
        "b05_step5_close": f"{GK}/anim_b05_seedance_2_0.mp4",
    },
    "kling3_0": {
        "b04b_offer": f"{GK}/anim_b04b_kling3_0.mp4",
        "b05_step5_close": f"{GK}/anim_b05_kling3_0.mp4",
    },
    "wan2_7": {
        "b04b_offer": f"{GK}/anim_b04b_wan2_7.mp4",
        "b05_step5_close": f"{GK}/anim_b05_wan2_7.mp4",
    },
    "minimax_hailuo": {
        "b04b_offer": f"{GK}/anim_b04b_minimax_hailuo.mp4",
        "b05_step5_close": f"{GK}/anim_b05_minimax_hailuo.mp4",
    },
    "veo3_1_lite": {
        "b05_step5_close": f"{GK}/anim_b05_veo3_1_lite.mp4",
    },
    "mixed_kling_b4b_seedance_b5": {},
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


def bg_hex(path):
    return (
        subprocess.check_output(
            f'ffmpeg -v error -i "{path}" -vf "crop=2:2:8:8,scale=1:1" '
            f"-frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6",
            shell=True,
        )
        .decode()
        .strip()
    )


def word_frame(state, tag, trigger, fallback=8, which="first"):
    words = state.get(tag, {}).get("words") or []
    needle = trigger.lower().strip('.,?!"“”')
    hits = []
    for w in words:
        cleaned = str(w.get("word", "")).lower().strip('.,?!"“”')
        if needle and needle in cleaned:
            hits.append(float(w.get("start", 0)))
    if not hits:
        return fallback
    t = hits[-1] if which == "last" else hits[0]
    return max(0, round(t * FPS))


def normalize_still(name):
    src = f"{SCN}/{name}"
    if not os.path.exists(src):
        return None
    dst = f"{PUB}/stills/{name}"
    bgc = bg_hex(src)
    subprocess.run(
        f'ffmpeg -v error -i "{src}" -i "{src}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y',
        shell=True,
        check=True,
    )
    return f"lesson4B/stills/{name}"


def rekey_hero(name):
    src = f"{HG}/{name}"
    if not os.path.exists(src):
        return None, None
    bgc = (
        subprocess.check_output(
            f'ffmpeg -v error -ss 1 -i "{src}" -vf "crop=8:8:16:16,scale=1:1" '
            f"-frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6",
            shell=True,
        )
        .decode()
        .strip()
    )
    dst_name = name.replace(".mp4", ".mov")
    dst = f"{PUB}/hero/{dst_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{src}" -filter_complex '
        f'"[0:v]scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
        f'colorkey=0x{bgc}:0.12:0.05,format=rgba[v]" '
        f'-map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
        shell=True,
        check=True,
    )
    return f"lesson4B/hero/{dst_name}", round(dur(dst) * FPS)


def prep_anim(src):
    if not src or not os.path.exists(src):
        return None, None, None
    base = os.path.basename(src)
    dst = f"{PUB}/anim/{base}"
    tail = f"{PUB}/tails/{os.path.splitext(base)[0]}_tail.png"
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            src,
            "-vf",
            "scale=1600:900:force_original_aspect_ratio=increase,crop=1600:900",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            dst,
            "-y",
        ]
    )
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-sseof",
            "-1",
            "-i",
            dst,
            "-update",
            "1",
            tail,
            "-y",
        ]
    )
    if not os.path.exists(tail) or os.path.getsize(tail) == 0:
        raise RuntimeError(f"failed to extract animation tail frame: {tail}")
    return f"lesson4B/anim/{base}", round(dur(dst) * FPS), f"lesson4B/tails/{os.path.basename(tail)}"


def full_anim_sources(model, tag):
    """Return future full-coverage clips for a selected model.

    Expected naming:
      course-assets/heygen/lesson4B/grok/full/<model>/<tag>_part01.mp4
      course-assets/heygen/lesson4B/grok/full/<model>/<tag>_part02.mp4
    """
    root = f"{GK}/full/{model}"
    if not os.path.isdir(root):
        return []
    out = []
    n = 1
    while True:
        p = f"{root}/{tag}_part{n:02d}.mp4"
        if not os.path.exists(p):
            break
        out.append(p)
        n += 1
    return out


for d in ("stills", "hero", "anim", "tails"):
    os.makedirs(f"{PUB}/{d}", exist_ok=True)

state = json.load(open(f"{HG}/_state.json"))

silence = f"{PUB}/_gap.wav"
run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP), silence, "-y"])
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i, (tag, *_rest) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS) - 1:
            f.write(f"file '{silence}'\n")
run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list, "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"])

missing = []
manifest = []
selected_anims = ANIMATIONS.get(MODEL, {}) if MODEL != "static" else {}
if MODEL != "static" and MODEL not in ANIMATIONS:
    missing.append(f"unknown_model:{MODEL}")

for i, (tag, mode, step, still, hero, badge) in enumerate(BEATS):
    wav = f"{HG}/{tag}.wav"
    d = dur(wav)
    frames = round((d + (GAP if i < len(BEATS) - 1 else 0)) * FPS)
    entry = {
        "tag": tag,
        "mode": mode,
        "step": step,
        "durationInFrames": frames,
        "voFrames": round(d * FPS),
        "animationStatus": "pending" if tag in ANIM_BEATS else "not-required",
    }
    if badge:
        entry["badge"] = True
    if still:
        normalized = normalize_still(still)
        if normalized:
            entry["still"] = normalized
        else:
            missing.append(f"still:{still}")
    if hero:
        ref = rekey_hero(hero)
        if ref[0]:
            entry["hero"], entry["heroFrames"] = ref
        else:
            missing.append(f"hero:{hero}")
    labels = []
    for text, trigger, placement in LABELS.get(tag, []):
        labels.append({"text": text, "delay": word_frame(state, tag, trigger), "placement": placement})
    if labels:
        entry["labels"] = labels
    clip_sources = full_anim_sources(MODEL, tag) if MODEL != "static" else []
    if not clip_sources and tag in selected_anims:
        clip_sources = [selected_anims[tag]]
    if clip_sources:
        videos = []
        video_frames = []
        tail_frames = []
        for clip in clip_sources:
            ref = prep_anim(clip)
            if ref[0]:
                videos.append(ref[0])
                video_frames.append(ref[1])
                tail_frames.append(ref[2])
            else:
                missing.append(f"anim:{tag}:{clip}")
        if videos:
            entry["videos"] = videos
            entry["videoFrames"] = video_frames
            if tail_frames:
                entry["tailFrame"] = tail_frames[-1]
            total_video_frames = sum(video_frames)
            coverage = "full" if total_video_frames >= entry["voFrames"] - 3 else "partial"
            source = "full-coverage" if len(clip_sources) > 1 or clip_sources[0].startswith(f"{GK}/full/") else "bakeoff"
            entry["animationStatus"] = f"{source}-{MODEL}-{coverage}"
    manifest.append(entry)

total = sum(b["durationInFrames"] for b in manifest)
out = {
    "fps": FPS,
    "draft": MODEL == "static",
    "selectedModel": MODEL,
    "visualGate": "pending Jarrad/Claude model selection and final visual QC",
    "beats": manifest,
    "audio": "lesson4B/master.m4a",
    "totalFrames": total,
}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 2), "selectedModel": MODEL, "missing": missing}, indent=1))
