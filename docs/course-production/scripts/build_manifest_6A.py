#!/usr/bin/env python3
import os
"""Build Lesson 6A manifest ("Discovery") — master Slot 08 cues 1-8, 9 beats.
audio = master clock + 1.0s inter-beat gaps (PLAYBOOK 7.14). Cafe-Andrea hero bookends (b01/b09).
Modes:
  hero       — full-frame cafe Andrea clip (b01 badge, b09 outro), plays its VO then holds last frame.
  video      — full-frame Seedance scene clip, LOOPED to cover the (longer) narration. b02 office, b07 fork.
  bob        — normalized still that rocks ±8px vertically like it floats. b03 iceberg.
  maskreveal — Andrea front clip until swapFrame, then the mask still with a push-in. b04.
  scene      — normalized still with a slow push-in; b05 dig, b06 notices, b08 deciders.
Every beat gets a word-timed white Sticker label (delay from _state.json word timestamps).
Seedance clips are FULL scenes (not keyed elements) -> copied as-is, Remotion scales 1280x720 -> 1600x900.
Stills normalized to canonical blue at ingest (sample native bg -> colorkey -> overlay on #62b3f3).
"""
import json, os, subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson6A"
SCN = f"{B}/course-assets/scenes/module-06"
ANIM = f"{B}/remotion/public/lesson6A/anim"          # Seedance clips already downloaded here
PUB = f"{B}/docs/course-production/remotion/public/lesson6A"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0

# tag, mode, still, hero_clip, video_clip, badge
BEATS = [
 ("b01_intro",     "hero",       None,                    f"{HG}/hero_b01_intro.mp4", None,                      True),
 ("b02_qualify",   "video",      None,                    None,                       f"{ANIM}/anim_office_15s.mp4",  False),
 ("b03_discovery", "bob",        "m06_L6A_iceberg_v2.png",None,                       None,                      False),
 ("b04_motivation","maskreveal", "m06_L6A_mask.png",      f"{HG}/hero_b04_front.mp4", None,                      False),
 ("b05_askwhy",    "scene",      "m06_L6A_dig_v2.png",    None,                       None,                      False),
 ("b06_financial", "scene",      "m06_L6A_notices.png",   None,                       None,                      False),
 ("b07_whatif",    "video",      None,                    None,                       f"{ANIM}/anim_fork_15s.mp4",   False),
 ("b08_decision",  "scene",      "m06_L6A_deciders.png",  None,                       None,                      False),
 ("b09_outro",     "hero",       None,                    f"{HG}/hero_b09_outro.mp4", None,                      False),
]

# word-timed label:  tag -> (text, trigger word)
LABELS = {
 "b02_qualify":    ("QUALIFICATION", "qualification"),
 "b03_discovery":  ("DISCOVERY", "Discovery"),
 "b04_motivation": ("THE POLISHED ANSWER", "polished"),
 "b05_askwhy":     ("THE REAL REASON", "underneath"),
 "b06_financial":  ("FINANCIAL BURDEN", "burden"),
 "b07_whatif":     ("WHAT IF?", "what"),
 "b08_decision":   ("WHO SIGNS?", "call"),
}

# two-phase maskreveal: frame at which Andrea front clip cuts to the mask still. 12.319s @30fps = 370.
SWAP = {"b04_motivation": 370}

def word_frame(tag, trigger, which="first"):
    words = state.get(tag, {}).get("words") or []
    t = trigger.lower().strip('.,?!"“”')
    hits = [w["start"] for w in words if t in w["word"].lower().strip('.,?!"“”')]
    if not hits:
        return None
    t0 = hits[-1] if which == "last" else hits[0]
    return max(0, round(t0 * FPS))

def dur(p):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", p]).strip())

def bg_hex(path):
    return subprocess.check_output(
        f'ffmpeg -v error -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()

def normalize(src_name):
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp):
        return None
    bgc = bg_hex(sp)
    dst = f"{PUB}/stills/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y', shell=True, check=True)
    return f"lesson6A/stills/{src_name}"

def copy_video(src_path, sub):
    if not os.path.exists(src_path):
        return None, None
    base = os.path.basename(src_path)
    dst = f"{PUB}/{sub}/{base}"
    subprocess.run(["cp", src_path, dst], check=True)
    return f"lesson6A/{sub}/{base}", round(dur(dst) * FPS)

for d_ in ("stills", "hero", "anim"):
    os.makedirs(f"{PUB}/{d_}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# 1. master audio = beat wavs + 1.0s silence between beats
silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP), silence, "-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i, (tag, *_ ) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS) - 1:
            f.write(f"file '{silence}'\n")
subprocess.run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list,
                "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"], check=True)

# 2. per-beat manifest
missing = []
manifest = []
for i, (tag, mode, still, hero, video, badge) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    frames = round((d + (GAP if i < len(BEATS) - 1 else 0)) * FPS)
    e = {"tag": tag, "mode": mode, "durationInFrames": frames, "voFrames": round(d * FPS)}
    if badge:
        e["badge"] = True
    if tag in SWAP:
        e["swapFrame"] = SWAP[tag]
    if tag in LABELS:
        text, trig = LABELS[tag]
        e["label"] = text
        e["labelDelay"] = word_frame(tag, trig) or 12
    if still:
        r = normalize(still)
        if r: e["still"] = r
        else: missing.append(f"still:{still}")
    if hero:
        r, fr = copy_video(hero, "hero")
        if r: e["hero"], e["heroFrames"] = r, fr
        else: missing.append(f"hero:{os.path.basename(hero)}")
    if video:
        r, fr = copy_video(video, "anim")
        if r: e["video"], e["clipFrames"] = r, fr
        else: missing.append(f"video:{os.path.basename(video)}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson6A/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1), "missing": missing}, indent=1))
