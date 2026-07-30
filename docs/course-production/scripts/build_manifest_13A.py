#!/usr/bin/env python3
"""Build Lesson 13A manifest ("Compensation Engine").

Audio is the master clock with 1.0s inter-beat gaps. Most compensation
visuals are code-rendered in Remotion. Approved B4/B12 Seedance clips are
keyed to alpha so code owns the canonical blue; B11 remains a static still to
preserve the approved EMPLOYEE OF THE MONTH plaque text.
"""
import json
import os
import shutil
import subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson13A"
ANIM = f"{HG}/seedance"
SCN = f"{B}/course-assets/scenes/module-13"
PUB = f"{B}/docs/course-production/remotion/public/lesson13A"
FPS = 30
GAP_SECONDS = 1.0
GAP_FRAMES = 30
BLUE = "0x62b3f3"

BEATS = [
    ("b01_money_connection", "hero"),
    ("b02_three_pieces", "pieces"),
    ("b03_ramp_to_commission", "ramp"),
    ("b04_your_deal", "sceneVideo"),
    ("b05_commission_tiers", "tiers"),
    ("b06_appointment_bonus", "appointments"),
    ("b07_example_tier_two", "example2"),
    ("b08_example_tier_three", "example3"),
    ("b09_direct_math_no_cap", "curve"),
    ("b10_attribution_pipeline", "attributionHero"),
    ("b11_what_top_earners_do", "topEarners"),
    ("b12_money_on_table", "sceneVideo"),
    ("b13_operator_playbook_tease", "hero"),
]

HEROES = {
    "b01_money_connection": "hero_b01_money_connection.mp4",
    "b10_attribution_pipeline": "hero_b10_attribution_pipeline.mp4",
    "b13_operator_playbook_tease": "hero_b13_operator_playbook_tease.mp4",
}

BADGE = {"b01_money_connection"}

STILLS = {
    "b04_your_deal": "m13_L13A_b04_your-deal.png",
    "b11_what_top_earners_do": "m13_L13A_b11_top-earners.png",
    "b12_money_on_table": "m13_L13A_b12_money-table.png",
}

ANIMS = {
    "b04_your_deal": "anim_b04_your_deal.mp4",
    "b12_money_on_table": "anim_b12_money_table.mp4",
}

# tag -> [(text, trigger, place, role)]
LABELS = {
    "b01_money_connection": [
        ("PERFORMANCE -> PAYCHECK", "performance", "top", "caption"),
        ("NO MYSTERY", "mystery", "bottom", "label"),
    ],
    "b02_three_pieces": [
        ("3 PIECES", "three", "top", "title"),
        ("BASE PAY", "Base", "card1", "label"),
        ("COMMISSIONS", "commissions", "card2", "label"),
        ("BONUSES", "bonuses", "card3", "label"),
    ],
    "b03_ramp_to_commission": [
        ("RAMP PERIOD", "ramping", "left", "label"),
        ("30+ KPI DAYS", "30", "top", "label"),
        ("FULL COMMISSION", "full commission", "right", "label"),
        ("TRANSITION POINT", "transition", "bottom", "caption"),
    ],
    "b04_your_deal": [
        ("WINNING DEAL", "closed", "top", "label"),
        ("THAT'S YOUR DEAL", "your deal", "bottom", "caption"),
    ],
    "b05_commission_tiers": [
        ("TIER 1: $500", "one", "tier1", "label"),
        ("TIER 2: $750", "Three", "tier2", "label"),
        ("TIER 3: $1,000", "Five", "tier3", "label"),
        ("HIGHEST TIER PAYS ALL DEALS", "highest tier", "bottom2", "caption"),
        ("5 x $1,000 = $5,000", "five grand", "bottom", "label"),
    ],
    "b06_appointment_bonus": [
        ("KEPT APPOINTMENTS COUNT", "actually shows", "top", "caption"),
        ("25 KEPT = $250", "25", "left", "label"),
        ("50 KEPT = $500", "50", "right", "label"),
    ],
    "b07_example_tier_two": [
        ("30 KEPT APPTS", "30", "input1", "label"),
        ("3 CLOSED DEALS", "3 deals", "input2", "label"),
        ("3 x $750 = $2,250", "$2,250", "math1", "label"),
        ("$250 + $2,250 = $2,500", "$2,500", "bottom", "caption"),
    ],
    "b08_example_tier_three": [
        ("40 APPTS + 5 DEALS", "40", "top", "label"),
        ("TIER 3", "Tier 3", "left", "label"),
        ("5 x $1,000 = $5,000", "$5,000", "math1", "label"),
        ("TOTAL: $5,250", "$5,250", "bottom", "label"),
        ("50 APPTS = +$250", "50", "right", "label"),
    ],
    "b09_direct_math_no_cap": [
        ("THE MATH IS DIRECT", "direct", "top", "caption"),
        ("FOLLOW-UP + QUALIFICATION", "follow-up", "left", "label"),
        ("NO CAP", "no cap", "bottom", "label"),
    ],
    "b10_attribution_pipeline": [
        ("WORKED -> HANDOFF -> CLOSED", "worked", "bottom2", "caption"),
        ("3 MONTHS LATER", "three months", "left", "label"),
        ("CREDIT STAYS WITH YOU", "still get credit", "bottom", "label"),
    ],
    "b11_what_top_earners_do": [
        ("THOROUGH", "thorough", "left", "label"),
        ("CONSISTENT", "consistent", "right", "label"),
        ("CLEAN HANDOFFS", "clean handoffs", "bottom", "caption"),
    ],
    "b12_money_on_table": [
        ("DON'T LET LEADS SLIP", "let slip", "top", "caption"),
        ("LEFT ON THE TABLE", "left on the table", "leftLow", "label"),
        ("IT'S THAT DIRECT", "direct", "bottom", "label"),
    ],
    "b13_operator_playbook_tease": [
        ("NEXT: OPERATOR PLAYBOOK", "next up", "top", "caption"),
        ("REAL DAY WORKFLOW", "real day", "bottom2", "label"),
        ("RUN YOUR DAY + STAY IN SYNC", "stays in sync", "bottom", "caption"),
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


def clean_word(word):
    return str(word).lower().strip('.,?!"“”():;$')


def word_frame(state, tag, trigger, fallback=10):
    words = state.get(tag, {}).get("words") or []
    parts = [clean_word(part) for part in str(trigger).split() if clean_word(part)]
    if not parts:
        return fallback
    cleaned = [clean_word(word.get("word", "")) for word in words]
    hits = []
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
    return max(4, round(hits[0] * FPS))


def bg_hex(path):
    return (
        subprocess.check_output(
            f'ffmpeg -v error -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
            shell=True,
        )
        .decode()
        .strip()
    )


def normalize_still(name):
    src = f"{SCN}/{name}"
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    dst = f"{PUB}/stills/{name}"
    bgc = bg_hex(src)
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            src,
            "-i",
            src,
            "-filter_complex",
            f"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];[1:v]colorkey=0x{bgc}:0.13:0.03[k];[bg][k]overlay=0:0",
            dst,
            "-y",
        ]
    )
    return f"lesson13A/stills/{name}"


def copy_hero(name):
    src = f"{HG}/{name}"
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    dst = f"{PUB}/hero/{name}"
    shutil.copyfile(src, dst)
    return f"lesson13A/hero/{name}"


def key_hero(name):
    src = f"{HG}/{name}"
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    out_name = name.replace(".mp4", ".mov")
    dst = f"{PUB}/hero/{out_name}"
    bgc = bg_hex(src)
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            src,
            "-filter_complex",
            f"[0:v]scale=1600:900:flags=lanczos,scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,colorkey=0x{bgc}:0.10:0.03,format=rgba[v]",
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
    return f"lesson13A/hero/{out_name}"


def key_anim(name):
    src = f"{ANIM}/{name}"
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    out_name = name.replace(".mp4", ".mov")
    dst = f"{PUB}/anim/{out_name}"
    bgc = bg_hex(src)
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            src,
            "-filter_complex",
            f"[0:v]scale=1600:900:flags=lanczos,scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,colorkey=0x{bgc}:0.15:0.03,format=rgba[v]",
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
    return f"lesson13A/anim/{out_name}", round(dur(dst) * FPS), dst


def tail_frame(anim_path, tag):
    dst = f"{PUB}/tails/{tag}_tail.png"
    run(["ffmpeg", "-v", "error", "-sseof", "-0.06", "-i", anim_path, "-frames:v", "1", "-pix_fmt", "rgba", dst, "-y"])
    return f"lesson13A/tails/{tag}_tail.png"


for sub in ("stills", "hero", "anim", "tails"):
    os.makedirs(f"{PUB}/{sub}", exist_ok=True)

state = json.load(open(f"{HG}/_state.json"))

silence = f"{PUB}/_gap.wav"
run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP_SECONDS), "-ac", "1", silence, "-y"])

concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as file:
    for i, (tag, _mode) in enumerate(BEATS):
        wav = f"{HG}/{tag}.wav"
        if not os.path.exists(wav):
            raise FileNotFoundError(wav)
        file.write(f"file '{wav}'\n")
        if i < len(BEATS) - 1:
            file.write(f"file '{silence}'\n")

run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list, "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"])

manifest = []
for i, (tag, mode) in enumerate(BEATS):
    wav = f"{HG}/{tag}.wav"
    vo_frames = round(dur(wav) * FPS)
    entry = {
        "tag": tag,
        "mode": mode,
        "durationInFrames": vo_frames + (0 if i == len(BEATS) - 1 else GAP_FRAMES),
        "voFrames": vo_frames,
        "labels": [
            {
                "text": text,
                "delay": word_frame(state, tag, trigger),
                "place": place,
                "role": role,
            }
            for text, trigger, place, role in LABELS.get(tag, [])
        ],
    }
    if tag in BADGE:
        entry["badge"] = True
    if tag == "b10_attribution_pipeline":
        entry["hero"] = key_hero(HEROES[tag])
        entry["heroTransparent"] = True
    elif tag in HEROES:
        entry["hero"] = copy_hero(HEROES[tag])
    if tag in STILLS:
        entry["still"] = normalize_still(STILLS[tag])
    if tag in ANIMS:
        anim, frames, abs_anim = key_anim(ANIMS[tag])
        entry["anim"] = anim
        entry["animFrames"] = frames
        entry["tail"] = tail_frame(abs_anim, tag)
    if tag == "b11_what_top_earners_do":
        entry["animationStatus"] = "static_to_preserve_approved_plaque_text"
    manifest.append(entry)

total = sum(item["durationInFrames"] for item in manifest)
out = {
    "fps": FPS,
    "gapFrames": GAP_FRAMES,
    "audio": "lesson13A/master.m4a",
    "beats": manifest,
    "totalFrames": total,
    "notes": {
        "b10": "Andrea digital-avatar speaking beat; no generated still.",
        "b11": "Static still by design to preserve approved EMPLOYEE OF THE MONTH plaque text.",
    },
}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 2), "public": PUB}, indent=1))
