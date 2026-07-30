#!/usr/bin/env python3
"""Build LessonB v2 manifest: audio = master clock. Modes: hero|scene|card|map|landlord|movie|calendar|recap."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lessonB"
SCN = f"{B}/course-assets/scenes/module-01"
PUB = f"{B}/docs/course-production/remotion/public/lessonB"
FPS = 30
BLUE = "0x62b3f3"

# tag, mode, still, still2, hero clip, circle clip, badge
BEATS = [
 ("b01_intro",   "hero",     None, None, "hero_b01_intro.mp4", None, True),
 ("b02_guide",   "scene",    "m01_LB_s02_guide-not-buyer_v2_clean.png", None, None, None, False),
 ("b03_clarity", "scene",    "m01_LB_s03_clarity-shift_v5.png", None, None, None, False),
 ("b04_doctor",  "scene",    "m01_LB_s04_doctor-analogy_clean.png", None, None, "circle_b04.mp4", False),
 ("b05_board",   "scene",    "m01_LB_s07_ten-principles-board_v2.png", None, None, None, False),
 ("b06a_p1",     "card",     "m01_LB_p01_service_clean.png", None, None, None, False),
 ("b06b_story1", "map",      "m01_LB_story1_inherited_v2_labeled.png", None, None, "circle_b06b.mp4", False),
 ("b07a_p2",     "card",     "m01_LB_p02_alignment_v2.png", None, None, None, False),
 ("b07b_story2", "landlord", "m01_LB_story2_landlord_centered.png", "m01_LB_story2_landlord_centered_poseB.png", None, None, False),
 ("b08a_p3",     "hero",     None, None, "cafe_b08a.mp4", None, False),
 ("b08b_story3", "movie",    "m01_LB_p03_clarity_clean.png", "m01_LB_story3_frozen_v2.png", None, None, False),
 ("b09_p4",      "card",     "m01_LB_p04_detach_v2.png", None, None, None, False),
 ("b10_p5",      "card",     "m01_LB_p05_curiosity_clean.png", None, None, None, False),
 ("b11_p6",      "card",     "m01_LB_p06_equal-status_v2.png", None, None, None, False),
 ("b12_p7",      "calendar", "m01_LB_p07_calendar_frame.png", None, None, None, False),
 ("b13_p8",      "card",     "m01_LB_p08_puzzles_clean.png", None, None, None, False),
 ("b14_p9",      "scene",    "m01_LB_p09_reps_v2.png", None, None, None, False),
 ("b15_p10",     "card",     "m01_LB_p10_same-lens.png", None, None, None, False),
 ("b16_recap",   "recap",    "m01_LB_s07_ten-principles-board_v2.png", None, None, None, False),
 ("b17_outro",   "hero",     None, None, "hero_b17_outro.mp4", None, False),
]

LABELS = {
 "b02_guide":("YOU ARE THE GUIDE","guide","last"),
 "b03_clarity":("WIN CLARITY","clarity","first"),
 "b04_doctor":("“What seems to be the problem?”","problem","first"),
 "b05_board":("10 PRINCIPLES","ten","first"),
 "b06a_p1":("1 · SERVICE OVER SELF","First","first"),
 "b07a_p2":("2 · ALIGNMENT","Second","first"),
 "b07b_story2":("He wants his life back","life","first"),
 "b08a_p3":("3 · CLARITY BEATS PRESSURE","Third","first"),
 "b09_p4":("4 · DETACH","Fourth","first"),
 "b10_p5":("5 · CURIOSITY","Fifth","first"),
 "b11_p6":("6 · EQUAL STATUS","Sixth","first"),
 "b12_p7":("7 · LONG GAME","Seventh","first"),
 "b13_p8":("8 · PUZZLES, NOT WALLS","Eighth","first"),
 "b14_p9":("9 · REPS CREATE CALM","Ninth","first"),
 "b15_p10":("10 · SAME LENS","Tenth","first"),
}
# per-beat word-timed extras: beat -> {key: (trigger, first|last)}
EXTRAS = {
 "b08b_story3": {"movie": ("movie", "first"), "fork": ("living", "first"), "end": ("end", "first")},
}

def word_frame(tag, trigger, which):
    words = state.get(tag, {}).get("words") or []
    hits = [w["start"] for w in words if trigger.lower().strip('.,?') in w["word"].lower().strip('.,?”“"')]
    if not hits: return None
    t0 = hits[-1] if which == "last" else hits[0]
    return max(0, round(t0 * FPS))

def dur(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1", p]).strip())

os.makedirs(f"{PUB}/stills", exist_ok=True)
os.makedirs(f"{PUB}/hero", exist_ok=True)
os.makedirs(f"{PUB}/circle", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# 1. master audio
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for tag, *_ in BEATS:
        f.write(f"file '{HG}/{tag}.wav'\n")
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
    return f"lessonB/stills/{src_name}"

manifest, missing = [], []
for tag, mode, still, still2, hero, circle, badge in BEATS:
    d = dur(f"{HG}/{tag}.wav")
    e = {"tag": tag, "mode": mode, "durationInFrames": round(d*FPS)}
    if badge: e["badge"] = True
    if tag in LABELS:
        text, trig, which = LABELS[tag]
        e["label"] = text
        e["labelDelay"] = word_frame(tag, trig, which) or 8
    if tag in EXTRAS:
        e["extras"] = {}
        for key, (trig, which) in EXTRAS[tag].items():
            v = word_frame(tag, trig, which)
            if v is not None: e["extras"][key] = v
    if hero:
        src = f"{HG}/{hero}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/hero/{hero}"], check=True)
            e["hero"] = f"lessonB/hero/{hero}"
        else: missing.append(f"hero:{tag}")
    if circle:
        src = f"{HG}/{circle}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/circle/{circle}"], check=True)
            e["circle"] = f"lessonB/circle/{circle}"
        else: missing.append(f"circle:{tag}")
    if still:
        r = normalize(still)
        if r: e["still"] = r
        else: missing.append(f"still:{still}")
    if still2:
        r = normalize(still2)
        if r: e["still2"] = r
        else: missing.append(f"still2:{still2}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lessonB/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total/FPS,1), "missing": missing}, indent=1))
