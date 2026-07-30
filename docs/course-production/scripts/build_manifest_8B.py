#!/usr/bin/env python3
import json
import os
import shutil
import subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson8B"
SD = f"{HG}/seedance"
SCN = f"{B}/course-assets/scenes/module-08-lesson8B"
PUB = f"{B}/docs/course-production/remotion/public/lesson8B"
FPS = 30
GAP = 1.0

BEATS = [
    ("b01_bridge", "hero", None, None, "hero_b01_bridge.mp4", None, True),
    ("b02_flip_profit", "scene", "m08_L8B_b02_zillow-listing.png", "anim_b02_flip_profit.mp4", None, None, False),
    ("b03_scam_concerns", "scene", "m08_L8B_b03_scam-proof-path.png", "anim_b03_scam_concerns.mp4", None, None, False),
    ("b04_attorney", "scene", "m08_L8B_b04_attorney-ally.png", "anim_b04_attorney.mp4", None, None, False),
    ("b05_family_dynamics", "scene", "m08_L8B_b05_bed-family-dynamics.png", "anim_b05_family_dynamics.mp4", None, None, False),
    ("b06_disclosure_issues", "hero", None, None, "hero_b06_disclosure_issues.mp4", None, False),
    ("b07_belongings_relief", "scene", "m08_L8B_b07_belongings-relief.png", "anim_b07_belongings_relief.mp4", None, None, False),
    ("b08_pattern_framework", "framework", None, None, None, None, False),
    ("b09_heart_of_the_work", "scene", "m08_L8B_b09_emotion-grid.png", "anim_b09_heart_of_the_work.mp4", None, None, False),
    ("b10_roleplay_drill", "scene", "m08_L8B_b10_roleplay-drill.png", "anim_b10_roleplay_drill.mp4", None, None, False),
    ("b11_next_stop_faq", "hero", None, None, "hero_b11_next_stop_faq.mp4", None, False),
]

FORCE_STILL = {
    "b02_flip_profit": "Seedance invented baked listing numbers/text; using approved still.",
}

STICKERS = {
    "b02_flip_profit": [("WE ARE A BUSINESS", "business", 1, "bottom"), ("FAST CASH, NO REPAIRS", "fast", 1, "bottom"), ("BOTH SIDES GET SOMETHING", "Both", 1, "bottom")],
    "b03_scam_concerns": [("DO NOT GET DEFENSIVE", "defensive", 1, "bottom"), ("LICENSED TITLE COMPANY", "licensed", 1, "bottom"), ("ATTORNEY REVIEW", "attorney", 1, "bottom"), ("$0 UPFRONT", "upfront", 1, "bottom"), ("VERIFY FIRST", "verify", 1, "bottom")],
    "b04_attorney": [("WELCOME THAT", "welcome", 1, "bottom"), ("NEVER FIGHT THE ATTORNEY", "fight", 1, "bottom"), ("MAKE THEM AN ALLY", "ally", 1, "bottom")],
    "b05_family_dynamics": [("WHAT IS THEIR MAIN CONCERN?", "concern", 1, "bottom"), ("SHOW THE FULL PICTURE", "full", 1, "bottom"), ("OFFER TO TALK DIRECTLY", "talk", 1, "bottom")],
    "b06_disclosure_issues": [("ANY CONDITION", "any", 1, "bottom"), ("STILL INTERESTED", "interest", 1, "bottom"), ("FACTOR IT IN", "factor", 1, "bottom")],
    "b07_belongings_relief": [("TAKE WHAT YOU WANT", "take", 1, "bottom"), ("WE HANDLE WHAT'S LEFT", "handle", 1, "bottom"), ("NO FULL CLEANOUT", "clean", 1, "bottom")],
    "b08_pattern_framework": [("THE FRAMEWORK DOESN'T CHANGE", "doesn't", 1, "bottom")],
    "b09_heart_of_the_work": [("HEAVY EMOTIONAL WEIGHT", "weight", 1, "bottom"), ("GENUINELY CARE", "genuinely", 1, "bottom"), ("SELLERS CAN TELL", "tell", 1, "bottom"), ("GRIEF", "Grief", 1, [98, 127]), ("EMBARRASSMENT", "embarrassment", 1, [98, 598]), ("FEAR", "fear", 1, [98, 1100]), ("FAMILY CONFLICT", "family", 1, [362, 94])],
    "b10_roleplay_drill": [("ROLEPLAY:\nPRE-FORECLOSURE", "pre-foreclosure", 1, [86, 1118]), ("SCAM CONCERN DRILL", "scam", 1, [276, 1118]), ("AS REAL AS IT GETS", "real", 1, [596, 1138])],
    "b11_next_stop_faq": [("QUESTIONS SELLERS ASK", "questions", 1, "bottom"), ("NOT OBJECTIONS", "objections", 1, "bottom"), ("ANSWER WITHOUT FLINCHING", "flinching", 1, "bottom")],
}
FRAMEWORK = [("LISTEN", "Listen"), ("ACKNOWLEDGE", "Acknowledge"), ("ASK", "Ask"), ("REDIRECT", "redirect")]


def run(cmd):
    subprocess.run(cmd, check=True)


def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]).strip())


def word_frame(state, tag, trigger, occurrence=1, fallback=10):
    words = state.get(tag, {}).get("words") or []
    needle = str(trigger).lower().strip('.,?!"“”():;')
    hits = []
    for w in words:
        got = str(w.get("word", "")).lower().strip('.,?!"“”():;')
        if needle and (needle == got or needle in got):
            hits.append(float(w.get("start", 0)))
    if not hits:
        return fallback
    return max(4, round(hits[min(max(occurrence - 1, 0), len(hits) - 1)] * FPS))


def ensure_dirs():
    for d in ("stills", "hero", "circle", "anim", "tails", "fallback"):
        os.makedirs(f"{PUB}/{d}", exist_ok=True)


def copy_file(src, subdir, name=None):
    if not src or not os.path.exists(src):
        return None
    name = name or os.path.basename(src)
    dst = f"{PUB}/{subdir}/{name}"
    shutil.copyfile(src, dst)
    return f"lesson8B/{subdir}/{name}"


def first_frame(src, name):
    if not src or not os.path.exists(src):
        return None
    dst = f"{PUB}/fallback/{name}"
    run(["ffmpeg", "-v", "error", "-y", "-ss", "0.8", "-i", src, "-frames:v", "1", "-vf", "scale=1600:900:flags=lanczos", dst])
    return f"lesson8B/fallback/{name}"


def tail_frame(src, name):
    if not os.path.exists(src):
        return None
    dst = f"{PUB}/tails/{name}"
    run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.06", "-i", src, "-frames:v", "1", "-vf", "scale=1600:900:flags=lanczos", dst])
    return f"lesson8B/tails/{name}"


def prep_anim(tag, name):
    if tag in FORCE_STILL:
        return None, None, None
    src = f"{SD}/{name}"
    if not os.path.exists(src):
        return None, None, None
    rel = copy_file(src, "anim")
    tail = tail_frame(src, name.replace(".mp4", "_tail.png"))
    return rel, round(dur(src) * FPS), tail


def stickers_for(state, tag):
    out = []
    for text, trigger, occurrence, pos in STICKERS.get(tag, []):
        item = {"text": text, "delay": word_frame(state, tag, trigger, occurrence), "role": "caption" if len(text) > 22 else "label"}
        if pos == "bottom":
            item["bottomCenter"] = True
        else:
            item["top"], item["left"], item["role"] = pos[0], pos[1], "caption"
        out.append(item)
    bottom = sorted([s for s in out if s.get("bottomCenter")], key=lambda s: s["delay"])
    for i, s in enumerate(bottom[:-1]):
        s["until"] = max(s["delay"] + 20, bottom[i + 1]["delay"] - 6)
    return out


ensure_dirs()
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
beats = []
for i, (tag, mode, still_name, anim_name, hero_name, circle_name, badge) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    e = {"tag": tag, "mode": mode, "durationInFrames": round((d + (GAP if i < len(BEATS) - 1 else 0)) * FPS), "voFrames": round(d * FPS), "stickers": stickers_for(state, tag)}
    if badge:
        e["badge"] = True
    if mode == "hero":
        hero = copy_file(f"{HG}/{hero_name}", "hero") if hero_name else None
        if hero:
            e["hero"] = hero
        else:
            missing.append(f"hero:{hero_name}")
            e["fallback"] = f"missing required HeyGen clip {hero_name}; render blocked"
    elif mode == "scene":
        still = copy_file(f"{SCN}/{still_name}", "stills")
        if still:
            e["still"] = still
        else:
            missing.append(f"still:{still_name}")
        video, frames, tail = prep_anim(tag, anim_name)
        if video:
            e.update({"video": video, "videoFrames": frames, "tailFrame": tail, "animationStatus": "seedance"})
        else:
            e["animationStatus"] = "still-fallback"
            if tag in FORCE_STILL:
                e["fallback"] = FORCE_STILL[tag]
            else:
                missing.append(f"anim:{anim_name}")
        if circle_name:
            circle = copy_file(f"{HG}/{circle_name}", "circle")
            if circle:
                e["circle"] = circle
            else:
                missing.append(f"circle:{circle_name}")
                e["fallback"] = f"missing required HeyGen circle {circle_name}; render blocked"
    elif mode == "framework":
        e["framework"] = [{"text": text, "delay": word_frame(state, tag, trigger)} for text, trigger in FRAMEWORK]
    beats.append(e)

total = sum(b["durationInFrames"] for b in beats)
out = {"fps": FPS, "beats": beats, "audio": "lesson8B/master.m4a", "totalFrames": total, "missing": missing}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(beats), "totalSec": round(total / FPS, 1), "missing": missing, "totalFrames": total}, indent=1))
for e in beats:
    bits = [e["tag"], e["mode"], f"dur={e['durationInFrames']}f", e.get("animationStatus", "")]
    if e.get("fallback"):
        bits.append(f"fallback={e['fallback']}")
    for s in e.get("stickers", []):
        bits.append(f"txt@{s['delay']}f {s['text']}")
    print("  ".join([b for b in bits if b]))
if missing:
    raise SystemExit(2)
