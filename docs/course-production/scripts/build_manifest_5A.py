#!/usr/bin/env python3
"""Build Lesson 5A "Opening the Call" manifest. Audio = master clock; 1.0s silence between beats.
Modes: hero | prop | video | flip | fork | gauge | bar. Text = word-timed Sticker (never baked)."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson5A"
GROK = f"{HG}/grok"
SCN = f"{B}/course-assets/scenes/module-05"
PUB = f"{B}/docs/course-production/remotion/public/lesson5A"
FPS = 30
GAP = 30           # 1.0s inter-beat silence (Jarrad standing rule 2026-07-04)
BLUE = "0x62b3f3"

# tag, mode, still, video(anim), hero, badge
BEATS = [
 ("b01_intro",       "hero",      None,                      None,               "hero_b01_intro.mp4", True),
 ("b02_15sec",       "stopwatch", None,                      None,               None, False),
 ("b03_demo",        "hero",      None,                      None,               "lip_b03_demo.mp4", False),      # HeyGen Avatar IV lip-sync
 ("b04a_thatsit",    "hero",      None,                      None,               "hero_b04a_thatsit.mp4", False), # full-body 1A avatar
 ("b04b_breakdown",  "prop",      "m05_L5A_breakdown.png",   None,               None, False),
 ("b05_intrigue",    "stamp",     None,                      None,               None, False),
 ("b06_goodtime",    "fork",      None,                      None,               None, False),
 ("b07_penpaper",    "video",     "m05_L5A_pen-notepad.png", "anim_pennote.mp4", None, False),
 ("b08_control",     "prop",      "m05_L5A_seller-couch.png",None,               None, False), # still (Jarrad: seller-grab-pen anim read as walking → freeze)
 ("b09_compliance",  "gauge",     None,                      None,               None, False),
 ("b10_trust",       "video",     "m05_L5A_card-handoff.png","anim_card.mp4",    None, False),
 ("b11_landline",    "prop",      "m05_L5A_phones.png",      None,               None, False),
 ("b12_8020",        "bar",       None,                      None,               None, False),
 ("b13_outro",       "hero",      None,                      None,               "hero_b13_outro.mp4", False),
]

# hero clips whose portrait avatar HeyGen gray-pads inside the 16:9 frame → clip to blue strip
HERO_INSET = {"b04a_thatsit"}

# code-graphic word cues: beat -> {name: (trigger, which)} -> frame in manifest e["cues"]
CUES = {
 "b05_intrigue": {"approved": ("approval","first"), "denied": ("denial","first")},
}

# per-beat word-timed stickers: (text, trigger, which, pos, role)
#   pos: "tc" topCenter | "bc" bottomCenter | [top,left] explicit
TC, BC = "tc", "bc"
STICKERS = {
 "b01_intro": [("Step 1 · how to open the call","@40","first",BC,"caption")],
 "b04b_breakdown": [("They feel evaluated, not sold","evaluated","first",BC,"caption")],
 "b06_goodtime": [("Did I catch you at a good time?","time","first",TC,"caption"),
                  ("NO  →  callback","callback","first",[560,150],"label"),
                  ("YES  →  continue","continue","first",[560,1010],"label")],
 "b07_penpaper": [("Grab a pen","pen","first",BC,"caption"),
                  ("YOUR NAME","name","first",[64,1150],"label"),
                  ("SPELL LAST NAME","spell","first",[172,1030],"label"),
                  ("COMPANY","company","first",[280,1150],"label"),
                  ("PHONE NUMBER","number","last",[388,1085],"label")],
 "b08_control": [("TAKING CONTROL","control","first",TC,"label"),
                 ("= engagement","engagement","first",BC,"caption")],
 "b09_compliance": [("COMPLIANCE TEST","compliance","first",TC,"title")],
 "b10_trust": [("BUILD TRUST EARLY","trust","first",TC,"label"),
               ("Your real name · your real number","real","first",BC,"caption")],
 "b11_landline": [("Landline or cell?","landline","first",TC,"caption"),
                  ("cell  →  you can text","text","first",[650,140],"label"),
                  ("landline  →  you call","home","first",[650,930],"label")],
 "b12_8020": [("Assume they're motivated","motivated","first",TC,"caption")],
 "b13_outro": [("Next: the Fact Find","fact","first",BC,"caption")],
}

def word_frame(tag, trigger, which):
    if trigger.startswith("@"):          # fixed frame delay, e.g. "@12"
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
    return f"lesson5A/stills/{src_name}"

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
    # stickers
    if tag in STICKERS:
        arr = []
        for text, trig, which, pos, role in STICKERS[tag]:
            delay = word_frame(tag, trig, which)
            arr.append({"text": text, "delay": delay if delay is not None else 10, "role": role, **pos_fields(pos)})
        e["stickers"] = arr
    if tag in CUES:
        e["cues"] = {name: (word_frame(tag, trig, which) or 12) for name, (trig, which) in CUES[tag].items()}
    if hero:
        src = f"{HG}/{hero}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src,f"{PUB}/hero/{hero}"], check=True); e["hero"] = f"lesson5A/hero/{hero}"
            if tag in HERO_INSET: e["heroInset"] = True
        else: missing.append(f"hero:{tag}")
    if still:
        r = normalize(still)
        if r: e["still"] = r
        else: missing.append(f"still:{still}")
    if video:
        src = f"{GROK}/{video}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src,f"{PUB}/video/{video}"], check=True)
            e["video"] = f"lesson5A/video/{video}"
            e["videoFrames"] = round(dur(src)*FPS)
        else: missing.append(f"video:{tag}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson5A/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total/FPS,1), "missing": missing}, indent=1))
