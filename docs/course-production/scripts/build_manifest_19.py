#!/usr/bin/env python3
"""Build Lesson 19 manifest ("Career Growth Path") for the v6 review cut.

Audio is the master clock with 1.0s inter-beat gaps. Corrected scene art stays on the documented
static fallback with a restrained Remotion push-in. Static prop text is baked into the corrected
art; Remotion owns only timed callouts, list rows, and checklist state.
"""
import json
import os
import subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson19"
SCN = f"{B}/course-assets/scenes/module-19"
PUB = f"{B}/docs/course-production/remotion/public/lesson19"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0

BEATS = [
    ("b01_career_path_opener", "hero"),
    ("b02_foundation_role", "still"),
    ("b03_clean_handoffs", "still"),
    ("b04_readiness_checkpoint", "checkpoint"),
    ("b05_complex_leads_mentor", "still"),
    ("b06_deal_closer_level", "still"),
    ("b07_creative_deal_skill", "hero"),
    ("b08_management_path", "still"),
    ("b09_no_fixed_schedule", "side"),
    ("b10_daily_performance_criteria", "scorecard"),
    ("b11_team_contribution_coachability", "feedback"),
    ("b12_revenue_opportunity", "revenue"),
    ("b13_course_close", "hero"),
]

HEROES = {
    "b01_career_path_opener": "hero_b01_career_path_opener.mp4",
    "b07_creative_deal_skill": "hero_b07_creative_deal_skill-v7.mp4",
}
HERO_TAKES = {
    "b13_course_close": (
        "hero_b13_growth_close_take1.mp4",
        "hero_b13_growth_close_take2.mp4",
    )
}
BADGE = {"b01_career_path_opener"}
CIRCLES = {
    "b03_clean_handoffs": "circle_b03_clean_handoffs-v7.mp4",
    "b10_daily_performance_criteria": "circle_b10_daily_performance_criteria.mp4",
}
SIDES = {"b09_no_fixed_schedule": "side_b09_no_fixed_schedule.mp4"}

STILLS = {
    "b02_foundation_role": "m19_L19_b02_foundation-conveyor-v6.png",
    "b03_clean_handoffs": "m19_L19_b03_clean-file-hug-v6b.png",
    "b05_complex_leads_mentor": "m19_L19_b05_complex-lead-maze-v6.png",
    "b06_deal_closer_level": "m19_L19_b06_deal-conference-v6.png",
    "b08_management_path": "m19_L19_b08_priya-coaching-v6.png",
    "b10_daily_performance_criteria": "m19_L19_b10_promotion-scorecard.png",
}

# tag -> [(text, trigger, place, which)]
LABELS = {
    "b01_career_path_opener": [],
    "b02_foundation_role": [
        ("FOUNDATION", "foundation", "bottom", "first"),
    ],
    "b03_clean_handoffs": [
        ("MASTER IT", "Master", "bottom", "first"),
        ("UNDERSTAND SELLERS", "Understand", "bottom", "first"),
        ("KPIs CONSISTENTLY", "KPIs", "bottom", "first"),
    ],
    "b04_readiness_checkpoint": [
        ("CONSISTENCY", "consistently", "row", "first"),
        ("90+ DAYS", "90-plus", "row", "first"),
        ("SPOTLESS CRM", "CRM", "row", "first"),
        ("LEADERSHIP", "leadership", "row", "first"),
        ("MOVE UP", "move", "row", "first"),
    ],
    "b05_complex_leads_mentor": [
        ("MENTOR OTHERS", "mentoring", "bottom", "first"),
        ("MORE AUTONOMY", "autonomy", "bottom", "first"),
    ],
    "b06_deal_closer_level": [],
    "b07_creative_deal_skill": [],
    "b08_management_path": [
        ("BUILD THE TEAM", "building", "b08callout", "first"),
        ("HIRING", "hiring", "b08callout", "first"),
        ("TRAINING", "training", "b08callout", "first"),
        ("COACHING", "coaching", "b08callout", "first"),
        ("TEAM OUTPUT", "output", "b08callout", "first"),
        ("WHEN THEY WIN, YOU WIN", "win", "b08callout", "last"),
    ],
    "b09_no_fixed_schedule": [
        ("NOT TIME", "time", "row", "first"),
        ("NO FIXED SCHEDULE", "fixed", "row", "first"),
        ("PERFORMANCE", "performance", "row", "first"),
        ("READINESS", "readiness", "row", "first"),
    ],
    "b10_daily_performance_criteria": [
        ("HIT NUMBERS", "numbers", "score1", "first"),
        ("CALLS SOUND GOOD", "calls", "score2", "first"),
        ("CLEAN CRM", "CRM", "score3", "first"),
        ("NOTES + STAGE + NEXT ACTION", "notes", "score4", "first"),
        ("NO LEADS WITH NO PLAN", "plan", "score5", "last"),
    ],
    "b11_team_contribution_coachability": [
        ("HELP PEOPLE", "help", "row", "first"),
        ("SHARE WHAT'S WORKING", "Share", "row", "first"),
        ("COACHABLE", "coachable", "row", "first"),
        ("FIX THE GAP", "fix", "row", "first"),
        ("COME BACK BETTER", "better", "row", "first"),
    ],
    "b12_revenue_opportunity": [
        ("REVENUE-PRODUCING LEADS", "revenue", "row", "first"),
        ("CLOSED DEALS", "closed", "row", "first"),
        ("NEW MARKETS", "markets", "row", "first"),
        ("NEW TEAMS", "teams", "row", "first"),
        ("NEW POSITIONS", "positions", "row", "first"),
        ("UP TO YOU", "you", "row", "last"),
    ],
    "b13_course_close": [],
}


def word_frame(state, tag, trigger, which="first"):
    words = state.get(tag, {}).get("words") or []
    target = trigger.lower().strip('.,?!"“”')
    hits = [w["start"] for w in words if target in w["word"].lower().strip('.,?!"“”')]
    if not hits:
        return None
    t0 = hits[-1] if which == "last" else hits[0]
    return max(0, round(t0 * FPS))


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
            f'ffmpeg -v error -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
            shell=True,
        )
        .decode()
        .strip()
    )


def normalize(src_name):
    src = f"{SCN}/{src_name}"
    if not os.path.exists(src):
        return None
    dst = f"{PUB}/stills/{src_name}"
    bgc = bg_hex(src)
    subprocess.run(
        f'ffmpeg -v error -i "{src}" -i "{src}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.16:0.04[k];[bg][k]overlay=0:0" "{dst}" -y',
        shell=True,
        check=True,
    )
    return f"lesson19/stills/{src_name}"


def copy_asset(kind, name):
    src = f"{HG}/{name}"
    if not os.path.exists(src):
        return None
    dst = f"{PUB}/{kind}/{name}"
    subprocess.run(["cp", "-f", src, dst], check=True)
    return f"lesson19/{kind}/{name}"


for sub in ("stills", "hero", "circle", "side"):
    os.makedirs(f"{PUB}/{sub}", exist_ok=True)

state = json.load(open(f"{HG}/_state.json"))

silence = f"{PUB}/_gap.wav"
subprocess.run(
    ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP), silence, "-y"],
    check=True,
)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i, (tag, _mode) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS) - 1:
            f.write(f"file '{silence}'\n")
subprocess.run(
    ["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list, "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"],
    check=True,
)

missing = []
manifest = []
for i, (tag, mode) in enumerate(BEATS):
    wav = f"{HG}/{tag}.wav"
    spoken = dur(wav)
    frames = round((spoken + (GAP if i < len(BEATS) - 1 else 0)) * FPS)
    if tag == "b13_course_close":
        frames += 18
    entry = {
        "tag": tag,
        "mode": mode,
        "durationInFrames": frames,
        "voFrames": round(spoken * FPS),
        "labels": [],
    }
    if tag in BADGE:
        entry["badge"] = True
    if tag in STILLS:
        still = normalize(STILLS[tag])
        if still:
            entry["still"] = still
        else:
            missing.append(f"still:{STILLS[tag]}")
    if tag in HEROES:
        hero = copy_asset("hero", HEROES[tag])
        if hero:
            entry["hero"] = hero
        else:
            missing.append(f"hero:{HEROES[tag]}")
    if tag in HERO_TAKES:
        hero_takes = []
        for name in HERO_TAKES[tag]:
            take = copy_asset("hero", name)
            if take:
                hero_takes.append(take)
            else:
                missing.append(f"hero:{name}")
        if len(hero_takes) == 2:
            split_at = float(state[tag]["avatar_split"]["split_at_seconds"])
            split_frame = round(split_at * FPS)
            entry["heroTakes"] = hero_takes
            entry["heroTakeFrames"] = [split_frame, max(1, entry["voFrames"] - split_frame)]
    if tag in CIRCLES:
        circle = copy_asset("circle", CIRCLES[tag])
        if circle:
            entry["circle"] = circle
        else:
            missing.append(f"circle:{CIRCLES[tag]}")
    if tag in SIDES:
        side = copy_asset("side", SIDES[tag])
        if side:
            entry["side"] = side
        else:
            missing.append(f"side:{SIDES[tag]}")

    previous = -12
    for text, trigger, place, which in LABELS.get(tag, []):
        wf = word_frame(state, tag, trigger, which)
        if wf is None:
            wf = max(previous + 30, 8)
            missing.append(f"trigger:{tag}:{trigger}")
        wf = max(wf, previous + 10)
        previous = wf
        entry["labels"].append({"text": text, "delay": wf, "place": place})

    manifest.append(entry)

total = sum(b["durationInFrames"] for b in manifest)
out = {
    "fps": FPS,
    "beats": manifest,
    "audio": "lesson19/master.m4a",
    "totalFrames": total,
    "staticFallback": True,
    "staticFallbackReason": "Seedance status/download tool was not exposed in this session; approved stills use Remotion push-in only.",
}
summary = {"beats": len(manifest), "totalSec": round(total / FPS, 1), "missing": missing, "totalFrames": total}
if missing:
    print(json.dumps(summary, indent=1))
    raise SystemExit("Lesson 19 manifest validation failed")
tmp_manifest = f"{PUB}/manifest.json.tmp"
json.dump(out, open(tmp_manifest, "w"), indent=1)
os.replace(tmp_manifest, f"{PUB}/manifest.json")
print(json.dumps(summary, indent=1))
