#!/usr/bin/env python3
"""Build Lesson 5B "The Fact Find" manifest. Audio = master clock; 1.0s silence between beats.
Modes: hero | prop | contrast | checklist | emphasis | smile | mistakes.
Text = word-timed Sticker (never baked). Stills normalized to canonical blue at ingest."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson5B"
GROK = f"{HG}/grok"
SCN = f"{B}/course-assets/scenes/module-05-lesson5B"
PUB = f"{B}/docs/course-production/remotion/public/lesson5B"
FPS = 30
GAP = 30           # 1.0s inter-beat silence (Jarrad standing rule 2026-07-04)
BLUE = "0x62b3f3"

# tag, mode, still, video(anim), hero, badge
BEATS = [
 ("b01_intro",        "hero",      None,                     None, "hero_b01_intro.mp4", True),
 ("b02_conversation", "contrast",  None,                     None, None, False),
 ("b03_property",     "prop",      "m05_L5B_computer.png",   None, None, False),
 ("b04_ownership",    "checklist", None,                     None, None, False),
 ("b05_motivation",   "prop",      "m05_L5B_deed.png",       None, None, False),
 ("b06_power",        "emphasis",  None,                     None, None, False),
 ("b07_energy",       "smile",     None,                     None, None, False),
 ("b08_mistakes",     "mistakes",  None,                     None, None, False),
 ("b09_outro",        "hero",      None,                     None, "hero_b09_outro.mp4", False),
]

# b02 two-scene contrast: interrogation (WRONG) → conversation (RIGHT), cut on the word "conversation".
CONTRAST = {
 "b02_conversation": {"stillA": "m05_L5B_interrogation.png", "stillB": "m05_L5B_conversation.png",
                      "switch": ("conversation", "first")},
}

# code cards with word-timed rows: title + [(row text, trigger, which)]
CARDS = {
 "b04_ownership": {"title": "OWNERSHIP & DECISION",
                   "rows": [("Confirm they're the owner", "owner", "first"),
                            ("Anyone else on the title?", "title", "first"),
                            ("Mortgage? Roughly what's owed", "mortgage", "first")]},
 "b08_mistakes": {"title": "COMMON MISTAKES",
                  "rows": [("Rushing straight to the property", "Rushing", "first"),
                           ("Talking too much (listen 80%)", "much", "first"),
                           ("Reading the script like a robot", "robot", "first"),
                           ("Skipping the pen & paper", "Skipping", "first"),
                           ("Giving up after one weak reply", "giving", "first")]},
}

# static big-text beats (rendered by the component; reveal frame only)
EMPHASIS = {
 "b06_power": {"main": "What would happen\nif you didn't sell?", "sub": "Pain → urgency → deals",
               "at": ("didn't", "first")},
}

# per-beat word-timed stickers: (text, trigger, which, pos, role)
TC, BC = "tc", "bc"
STICKERS = {
 "b01_intro": [("Step 2 · The Fact Find", "fact", "first", BC, "caption")],
 "b03_property": [("Property basics", "basics", "first", TC, "label"),
                  ("Type of property", "type", "first", [250, 150], "label"),
                  ("Beds / baths", "bedrooms", "first", [360, 150], "label"),
                  ("Condition  1–10", "condition", "first", [470, 150], "label"),
                  ("Last major update", "updates", "first", [580, 150], "label")],
 "b05_motivation": [("Motivation & timeline", "motivation", "first", TC, "label"),
                    ("Why selling now?", "selling", "first", [250, 1050], "label"),
                    ("How long considering?", "long", "first", [360, 1050], "label"),
                    ("Any timeline?", "timeline", "first", [470, 1050], "label")],
 "b07_energy": [("Physically smile — they hear it", "smile", "first", BC, "caption")],
 "b09_outro": [("Next: your roleplay", "roleplay", "first", BC, "caption")],
}

def word_frame(tag, trigger, which):
    if trigger.startswith("@"):
        return int(trigger[1:])
    words = state.get(tag, {}).get("words") or []
    t = trigger.lower().strip('.,?"“”')
    hits = [w["start"] for w in words if t in w["word"].lower().strip('.,?"“”')]
    if not hits: return None
    t0 = hits[-1] if which == "last" else hits[0]
    return max(4, round(t0 * FPS))

def dur(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1", p]).strip())

for d in ("stills","hero","video"):
    os.makedirs(f"{PUB}/{d}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# 1. master audio with 1.0s silence between beats
sil = f"{PUB}/_silence.wav"
subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono",
    "-t","1.0","-ac","1", sil, "-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i,(tag,*_ ) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS)-1:
            f.write(f"file '{sil}'\n")
subprocess.run(["ffmpeg","-v","error","-f","concat","-safe","0","-i",concat_list,
    "-c:a","aac","-b:a","192k", f"{PUB}/master.m4a","-y"], check=True)

def normalize(src_name):
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp): return None
    bgc = subprocess.check_output(
        f'ffmpeg -v error -i "{sp}" -vf "crop=2:2:8:8,scale=1:1" -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()
    dst = f"{PUB}/stills/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y',
        shell=True, check=True)
    return f"lesson5B/stills/{src_name}"

def pos_fields(pos):
    if pos == "tc": return {"topCenter": True}
    if pos == "bc": return {"bottomCenter": True}
    return {"top": pos[0], "left": pos[1]}

manifest, missing = [], []
for tag, mode, still, video, hero, badge in BEATS:
    is_last = tag == BEATS[-1][0]
    d = dur(f"{HG}/{tag}.wav")
    frames = round(d*FPS) + (0 if is_last else GAP)
    e = {"tag": tag, "mode": mode, "durationInFrames": frames}
    if badge: e["badge"] = True
    if tag in STICKERS:
        arr = []
        for text, trig, which, pos, role in STICKERS[tag]:
            delay = word_frame(tag, trig, which)
            arr.append({"text": text, "delay": delay if delay is not None else 10, "role": role, **pos_fields(pos)})
        e["stickers"] = arr
    if tag in CARDS:
        c = CARDS[tag]
        rows = []
        for text, trig, which in c["rows"]:
            delay = word_frame(tag, trig, which)
            rows.append({"text": text, "delay": delay if delay is not None else 10})
        e["card"] = {"title": c["title"], "rows": rows}
    if tag in EMPHASIS:
        em = EMPHASIS[tag]
        at = word_frame(tag, em["at"][0], em["at"][1])
        e["emphasis"] = {"main": em["main"], "sub": em["sub"], "at": at if at is not None else 10}
    if tag in CONTRAST:
        c = CONTRAST[tag]
        rA = normalize(c["stillA"]); rB = normalize(c["stillB"])
        if rA: e["stillA"] = rA
        else: missing.append(f"stillA:{tag}")
        if rB: e["stillB"] = rB
        else: missing.append(f"stillB:{tag}")
        sw = word_frame(tag, c["switch"][0], c["switch"][1])
        e["switchAt"] = sw if sw is not None else round(frames*0.45)
    if hero:
        src = f"{HG}/{hero}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src,f"{PUB}/hero/{hero}"], check=True); e["hero"] = f"lesson5B/hero/{hero}"
        else: missing.append(f"hero:{tag}")
    if still:
        r = normalize(still)
        if r: e["still"] = r
        else: missing.append(f"still:{still}")
    if video:
        src = f"{GROK}/{video}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src,f"{PUB}/video/{video}"], check=True)
            e["video"] = f"lesson5B/video/{video}"
            e["videoFrames"] = round(dur(src)*FPS)
        else: missing.append(f"video:{tag}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson5B/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total/FPS,1), "missing": missing}, indent=1))
