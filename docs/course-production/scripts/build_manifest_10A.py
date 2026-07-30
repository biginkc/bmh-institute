#!/usr/bin/env python3
"""Build Lesson 10A manifest ("Follow-Up Cadence").

Audio is the master clock with 1.0s silence between beats. Visuals are
full-frame generated stills or Andrea clips; Remotion only adds transitions,
word-timed text overlays, calendar marks, and phone-message text.
"""
import json
import os
import shutil
import subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson10A"
SD = f"{HG}/seedance"
SCN = f"{B}/course-assets/scenes/module-10"
PUB = f"{B}/docs/course-production/remotion/public/lesson10A"
FPS = 30
GAP = 30
BLUE = "#62b3f3"
HERO_ALPHA = {"hero_b06_monthly_cadence.mp4", "hero_b12_daily_priority.mp4"}

BEATS = [
    ("b01_intro", "hero", None, None, "hero_b01_intro.mp4", True),
    ("b02_deals_happen", "scene", "m10_L10A_b02_touch-squares.png", None, None, False),
    ("b03_not_ready", "scene", "m10_L10A_b03_not-ready.png", "anim_b03_seedance_2_0.mp4", None, False),
    ("b04_fifth_touch", "scene", "m10_L10A_b04_persist-squares.png", None, None, False),
    ("b05_day_1_to_30", "calendar", "m10_L10A_b05_calendar-checks.png", None, None, False),
    ("b06_monthly_cadence", "hero", None, None, "hero_b06_monthly_cadence.mp4", False),
    ("b07_second_call", "scene", "m10_L10A_b07_second-call.png", None, None, False),
    ("b08_bring_new", "scene", "m10_L10A_b08_newspaper-clipping.png", "anim_b08_seedance_2_0.mp4", None, False),
    ("b09_silent_seller", "scene", "m10_L10A_b09_ghost-sheet-seller.png", "anim_b09_seedance_2_0.mp4", None, False),
    ("b10_ghost_texts", "messages", "m10_L10A_b10_phone-messages.png", None, None, False),
    ("b11_when_to_stop", "scene", "m10_L10A_b11_crossroads-stop.png", None, None, False),
    ("b12_daily_priority", "hero", None, None, "hero_b12_daily_priority.mp4", False),
    ("b13_outro", "hero", None, None, "hero_b13_outro.mp4", False),
]

TC, BC = "tc", "bc"
STICKERS = {
    "b02_deals_happen": [
        ("FIRST CALL", "first", 1, [328, 360], "label"),
        ("SECOND CALL", "second", 1, [328, 875], "label"),
        ("THIRD CALL", "third", 1, [756, 365], "label"),
        ("SEVENTH CALL", "seventh", 1, [756, 870], "label"),
    ],
    "b03_not_ready": [
        ("NOT READY TODAY DOES NOT MEAN NOT INTERESTED", "ready", 2, BC, "caption"),
        ("BE THERE WHEN THEY'RE READY", "there", 1, BC, "caption"),
    ],
    "b04_fifth_touch": [
        ("MOST QUIT AFTER TWO", "one", 1, BC, "caption"),
        ("FIVE OR MORE TOUCHES", "five", 1, BC, "label"),
    ],
    "b06_monthly_cadence": [
        ("MONTHLY CADENCE", "monthly", 1, BC, "label"),
    ],
    "b07_second_call": [
        ("REFERENCE THE LAST CONVERSATION", "previous", 1, BC, "caption"),
        ("WE TALKED A FEW DAYS AGO", "talked", 1, BC, "caption"),
    ],
    "b08_bring_new": [
        ("BRING SOMETHING NEW", "new", 1, BC, "label"),
        ("NOT JUST CHECKING IN", "check", 1, BC, "caption"),
    ],
    "b09_silent_seller": [
        ("GHOST TEXTS", "ghost", 1, BC, "label"),
    ],
    "b12_daily_priority": [
        ("FOLLOW-UPS FIRST", "follow-up", 2, BC, "label"),
    ],
    "b13_outro": [
        ("PROBATE LEAD - ST. LOUIS", "probate", 1, BC, "caption"),
        ("NEXT: ONE FLOW", "one", 1, BC, "label"),
    ],
}

CALENDAR_MARKS = [
    ("DAY 1", "first", 1, 1),
    ("DAY 2", "two", 1, 2),
    ("DAY 4", "four", 1, 4),
    ("DAY 7", "seven", 1, 7),
    ("DAY 14", "fourteen", 1, 14),
    ("DAY 21", "twenty-one", 1, 21),
    ("DAY 30", "thirty", 1, 30),
]

MESSAGE_MARKS = [
    ("CASUAL CHECK-IN", "casual", 1, 0),
    ("ASSUMPTIVE", "assumptive", 1, 1),
    ("VALUE ADD", "value", 1, 2),
    ("YES OR NO", "yes/no", 1, 3),
]


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
    if isinstance(trigger, str) and trigger.startswith("@"):
        return int(trigger[1:])
    words = state.get(tag, {}).get("words") or []
    needle = clean_word(trigger)
    hits = []
    for w in words:
        got = clean_word(w.get("word", ""))
        if needle and (needle == got or needle in got):
            hits.append(float(w.get("start", 0)))
    if not hits:
        return fallback
    idx = min(max(occurrence - 1, 0), len(hits) - 1)
    return max(4, round(hits[idx] * FPS))


def pos_fields(pos):
    if pos == "tc":
        return {"topCenter": True}
    if pos == "bc":
        return {"bottomCenter": True}
    return {"top": pos[0], "left": pos[1]}


def copy_still(name):
    src = f"{SCN}/{name}"
    if not os.path.exists(src):
        return None
    dst = f"{PUB}/stills/{name}"
    shutil.copyfile(src, dst)
    return f"lesson10A/stills/{name}"


def _sample_hex(path, x, y):
    return subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-ss",
            "1",
            "-i",
            path,
            "-vf",
            f"crop=8:8:{x}:{y},scale=1:1",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ]
    ).hex()[:6]


def rekey_headset_hero(name):
    src = f"{HG}/{name}"
    if not os.path.exists(src):
        return None
    dst_name = name.replace(".mp4", ".mov")
    dst = f"{PUB}/hero/{dst_name}"
    panel = _sample_hex(src, 430, 690)
    vf = (
        f"[0:v]crop=440:720:420:0,"
        f"scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,"
        f"colorkey=0x{panel}:0.18:0.07,format=rgba,"
        f"pad=1280:720:420:0:color=0x00000000[v]"
    )
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            src,
            "-filter_complex",
            vf,
            "-map",
            "[v]",
            "-c:v",
            "prores_ks",
            "-profile:v",
            "4444",
            "-pix_fmt",
            "yuva444p10le",
            "-an",
            dst,
            "-y",
        ]
    )
    return f"lesson10A/hero/{dst_name}"


def copy_hero(name):
    src = f"{HG}/{name}"
    if not os.path.exists(src):
        return None, False
    if name in HERO_ALPHA:
        return rekey_headset_hero(name), True
    dst = f"{PUB}/hero/{name}"
    shutil.copyfile(src, dst)
    return f"lesson10A/hero/{name}", False


def prep_anim(name):
    src = f"{SD}/{name}"
    if not os.path.exists(src):
        return None, None, None
    dst = f"{PUB}/anim/{name}"
    tail_name = name.replace(".mp4", "_tail.png")
    tail = f"{PUB}/tails/{tail_name}"
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
    run(["ffmpeg", "-v", "error", "-sseof", "-1", "-i", dst, "-update", "1", tail, "-y"])
    if not os.path.exists(tail) or os.path.getsize(tail) == 0:
        raise RuntimeError(f"failed to extract animation tail frame: {tail}")
    return f"lesson10A/anim/{name}", round(dur(dst) * FPS), f"lesson10A/tails/{tail_name}"


for d in ("stills", "hero", "anim", "tails"):
    os.makedirs(f"{PUB}/{d}", exist_ok=True)

state = json.load(open(f"{HG}/_state.json"))

sil = f"{PUB}/_silence.wav"
run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "1.0", "-ac", "1", sil, "-y"])
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i, (tag, *_rest) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS) - 1:
            f.write(f"file '{sil}'\n")
run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list, "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"])

manifest = []
missing = []
for i, (tag, mode, still, video, hero, badge) in enumerate(BEATS):
    voice_frames = round(dur(f"{HG}/{tag}.wav") * FPS)
    frames = voice_frames + (0 if i == len(BEATS) - 1 else GAP)
    entry = {"tag": tag, "mode": mode, "durationInFrames": frames, "voFrames": voice_frames}
    if badge:
        entry["badge"] = True
    if still:
        ref = copy_still(still)
        if ref:
            entry["still"] = ref
        else:
            missing.append(f"still:{still}")
    if hero:
        ref, alpha = copy_hero(hero)
        if ref:
            entry["hero"] = ref
            if alpha:
                entry["heroAlpha"] = True
        else:
            missing.append(f"hero:{hero}")
    if video:
        ref, vf, tail = prep_anim(video)
        if ref:
            entry["video"] = ref
            entry["videoFrames"] = vf
            entry["tailFrame"] = tail
            entry["animationStatus"] = "seedance_2_0"
        else:
            entry["animationStatus"] = "static-pending-seedance"
    else:
        entry["animationStatus"] = "not-required"
    stickers = []
    for text, trig, occurrence, pos, role in STICKERS.get(tag, []):
        stickers.append(
            {
                "text": text,
                "delay": word_frame(state, tag, trig, occurrence),
                "role": role,
                **pos_fields(pos),
            }
        )
    if stickers:
        entry["stickers"] = stickers
    if tag == "b05_day_1_to_30":
        entry["calendarMarks"] = [
            {"text": text, "delay": word_frame(state, tag, trig, occurrence), "day": day}
            for text, trig, occurrence, day in CALENDAR_MARKS
        ]
    if tag == "b10_ghost_texts":
        entry["messageMarks"] = [
            {"text": text, "delay": word_frame(state, tag, trig, occurrence), "slot": slot}
            for text, trig, occurrence, slot in MESSAGE_MARKS
        ]
    if tag == "b11_when_to_stop":
        entry["stopSignText"] = True
    manifest.append(entry)

total = sum(b["durationInFrames"] for b in manifest)
out = {
    "fps": FPS,
    "beats": manifest,
    "audio": "lesson10A/master.m4a",
    "totalFrames": total,
    "selectedModel": "seedance_2_0",
}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 2), "missing": missing}, indent=1))
