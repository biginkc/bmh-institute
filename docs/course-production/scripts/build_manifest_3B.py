#!/usr/bin/env python3
"""Build Lesson 3B manifest ("BMH Offer Playbook B") — 8 beats, verbatim master Slot 05-B.
audio = master clock + 1.0s inter-beat gaps (PLAYBOOK 7.14). 1A solo-Andrea hero bookends.
Modes: hero | panel | rows(check/x) | transform | monologue. All text/marks = CODE, word-timed,
and each appears ONLY on its trigger word — no empty placeholder (Jarrad 2026-07-05).
Zero Seedance. B6 uses the talking-doodle clip if present, else the homeowner still (placeholder)."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson3B"
SCN = f"{B}/course-assets/scenes/module-03-lesson3B"
PUB = f"{B}/docs/course-production/remotion/public/lesson3B"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0

state = json.load(open(f"{HG}/_state.json"))
b06 = json.load(open(f"{HG}/_b06.json")) if os.path.exists(f"{HG}/_b06.json") else {}

TAGS = ["b01_intro", "b02_offer-recap", "b03_ideal-seller", "b04_not-a-fit",
        "b05_core-problems", "b06_seller-monologue", "b07_transformation", "b08_outro"]

def wav_for(tag):
    return b06.get("wav") if tag == "b06_seller-monologue" else state[tag]["wav"]

def words_for(tag):
    return (b06.get("words") if tag == "b06_seller-monologue" else state.get(tag, {}).get("words")) or []

def word_frame(tag, trig, fallback=8):
    t = trig.lower().strip('.,?!"“”$·')
    hits = [w["start"] for w in words_for(tag) if t in w["word"].lower().strip('.,?!"“”$·')]
    return max(0, round(hits[0] * FPS)) if hits else fallback

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", p]).strip())

def bg_hex(path):
    return subprocess.check_output(
        f'ffmpeg -v error -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()

def normalize(src_name):
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp):
        return None
    bgc = bg_hex(sp); dst = f"{PUB}/stills/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y', shell=True, check=True)
    return f"lesson3B/stills/{src_name}"

# spec: sticker tuple = (text, trigger, top, left, bg, role, bottomCenter)
SPEC = {
 "b01_intro": {"mode": "hero", "hero": "hero_b01_intro.mp4", "badge": True},
 "b02_offer-recap": {"mode": "panel", "still": "m03_L3B_s02_offer-recap.png", "push": True,
   "stickers": [("As-is · close fast · no repairs, no commissions", "as-is", None, None, "white", "caption", True)]},
 "b03_ideal-seller": {"mode": "rows", "still": "m03_L3B_s03_ideal-seller.png", "clip": 785,
   "title": "IDEAL SELLER PROFILE", "rowKind": "check", "rowsTop": 205, "rowStep": 112,
   "rows": [("Motivated to sell", "motivated"), ("Sells within 30 days", "thirty"),
            ("Legal authority to sell", "authority"), ("Not listed with an agent", "realtor"),
            ("Wants speed over top price", "convenience"), ("Distressed / problem property", "condition")]},
 "b04_not-a-fit": {"mode": "rows", "still": "m03_L3B_s04_andrea-stop.png", "clip": 785,
   "title": "NOT A FIT", "rowKind": "x", "rowsTop": 250, "rowStep": 130,
   "rows": [("Already listed with an agent", "realtor"), ("Unrealistic price", "unrealistic"),
            ("Can't legally sell", "legally"), ("Hazards over our budget", "hazards")]},
 "b05_core-problems": {"mode": "panel", "still": "m03_L3B_s05_rundown-house.png", "push": True,
   "stickers": [("CAN'T AFFORD REPAIRS", "afford", 110, 120, "white", "label", False),
                ("NEEDS CASH NOW", "cash", 110, 1040, "white", "label", False)]},
 "b06_seller-monologue": {"mode": "monologue", "still": "m03_L3B_s06_homeowner.png"},
 "b07_transformation": {"mode": "transform", "still": "m03_L3B_s05_rundown-house.png",
   "still2": "m03_L3B_s07_relieved-seller.png", "slide": "transformation",
   "stickers": [("SOLD AS-IS", "as-is", 110, 120, "white", "label", False),
                ("CASH IN HAND", "cash", 110, 1050, "white", "label", False),
                ("NO BURDEN LEFT", "burden", None, None, "white", "caption", True)]},
 "b08_outro": {"mode": "hero", "hero": "hero_b08_outro.mp4"},
}

os.makedirs(f"{PUB}/stills", exist_ok=True)
os.makedirs(f"{PUB}/hero", exist_ok=True)
os.makedirs(f"{PUB}/anim", exist_ok=True)

# 1. master audio with 1.0s inter-beat gaps
silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP), silence, "-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i, tag in enumerate(TAGS):
        f.write(f"file '{wav_for(tag)}'\n")
        if i < len(TAGS) - 1:
            f.write(f"file '{silence}'\n")
subprocess.run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list,
    "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"], check=True)

missing = []
beats = []
for i, tag in enumerate(TAGS):
    sp = SPEC[tag]
    d = dur(wav_for(tag))
    frames = round((d + (GAP if i < len(TAGS) - 1 else 0)) * FPS)
    e = {"tag": tag, "mode": sp["mode"], "durationInFrames": frames}
    if sp.get("badge"): e["badge"] = True
    if sp.get("push"): e["push"] = True
    if sp.get("clip"): e["clip"] = sp["clip"]
    if sp.get("title"): e["title"] = sp["title"]
    if sp.get("rowKind"): e["rowKind"] = sp["rowKind"]
    if sp.get("rowsTop"): e["rowsTop"] = sp["rowsTop"]
    if sp.get("rowStep"): e["rowStep"] = sp["rowStep"]
    if sp.get("rows"):
        e["rows"] = [{"label": lb, "delay": word_frame(tag, tr, fallback=8 + k * 22)}
                     for k, (lb, tr) in enumerate(sp["rows"])]
    if sp.get("slide"):
        e["slideFrame"] = word_frame(tag, sp["slide"], fallback=round(frames * 0.35))
    if sp.get("stickers"):
        e["stickers"] = []
        for k, (text, trig, top, left, bg, role, bc) in enumerate(sp["stickers"]):
            st = {"text": text, "delay": word_frame(tag, trig, fallback=8 + k * 20), "bg": bg, "role": role}
            if bc: st["bottomCenter"] = True
            if top is not None: st["top"] = top
            if left is not None: st["left"] = left
            e["stickers"].append(st)
    # hero clip
    if sp.get("hero"):
        src = f"{HG}/{sp['hero']}"
        if os.path.exists(src):
            subprocess.run(["cp", "-f", src, f"{PUB}/hero/{sp['hero']}"], check=True)
            e["hero"] = f"lesson3B/hero/{sp['hero']}"
        else:
            missing.append(f"hero:{tag}")
    # b06 talking-doodle clip if present, else homeowner still placeholder
    if sp["mode"] == "monologue":
        clip = f"{HG}/char_b06_homeowner.mp4"
        if os.path.exists(clip):
            subprocess.run(["cp", "-f", clip, f"{PUB}/anim/char_b06_homeowner.mp4"], check=True)
            e["video"] = "lesson3B/anim/char_b06_homeowner.mp4"
        else:
            r = normalize(sp["still"]);  e["still"] = r if r else None
            missing.append("b06 talking clip (placeholder still — voice pending Jarrad)")
    # stills
    for fld in ("still", "still2"):
        if sp.get(fld) and sp["mode"] != "monologue":
            r = normalize(sp[fld])
            if r: e[fld] = r
            else: missing.append(f"{fld}:{sp[fld]}")
    beats.append(e)

total = sum(b["durationInFrames"] for b in beats)
out = {"fps": FPS, "beats": beats, "audio": "lesson3B/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(beats), "totalSec": round(total / FPS, 1), "missing": missing}, indent=1))
