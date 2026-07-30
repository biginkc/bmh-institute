#!/usr/bin/env python3
"""Build Lesson 1C manifest: audio = master clock + 1.75s inter-beat gaps (NEW vs 1B).
Modes: hero|scene|card|calendar|movie|drive. Anim clips re-keyed to canonical blue."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson1C"
SCN = f"{B}/course-assets/scenes/module-01"
PUB = f"{B}/docs/course-production/remotion/public/lesson1C"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0  # seconds of silence between beats (Jarrad 2026-07-04: 1.75 read as "slowed down")

# tag, mode, still, anim clip, hero clip, badge
BEATS = [
 ("b01_intro",       "hero",     None, None, "hero_b01_intro.mp4",  True),
 ("b02_open-line",   "scene",    "m01_LC_b02_open-line_clean.png", "anim_b02_open-line.mp4", None, False),
 ("b03_intel",       "scene",    "m01_LC_b03_intel.png", "anim_b03_intel.mp4", None, False),
 ("b04_lowballers",  "scene",    "m01_LC_b04_lowballers_v2.png", None, None, False),
 ("b05_timeline",    "scene",    "m01_LC_b05_timeline.png", None, None, False),
 ("b06_anchor",      "scene",    "m01_LC_b06_anchor.png", "anim_b06_anchor.mp4", None, False),
 ("b07_cash-road",   "scene",    "m01_LC_b07_cash-road_v3.png", None, None, False),
 ("b08_123",         "scene",    "m01_LC_b08_123-stairs.png", None, None, False),
 ("b09_higher-offer","scene",    "m01_LC_b09_higher-offer_v2_clean.png", None, None, False),
 ("b10_quiet",       "hero",     None, None, "hero_b10_quiet.mp4",  False),
 ("b11_movie",       "movie",    "m01_LC_b11_movie.png", None, None, False),
 ("b12_not-buyer",   "scene",    "m01_LC_b12_not-buyer_v2.png", None, None, False),
 ("b13_too-high",    "hero",     None, None, "hero_b13_too-high.mp4", False),
 ("b14_align",       "scene",    "m01_LC_b14_align.png", "anim_b14_align.mp4", None, False),
 ("b15_win-window",  "calendar", "m01_LC_b15_win-window_v2.png", None, None, False),
 ("b16_cash-truth",  "scene",    "m01_LC_b16_cash-truth_v2.png", None, None, False),
 ("b17_perform",     "scene",    "m01_LC_b17_perform_v2.png", None, None, False),
 ("b18_headline",    "card",     "m01_LC_b18_headline.png", None, None, False),
 ("b19_no-number",   "drive",    None, None, "hero_b19_no-number.mp4", False),
 ("b20_movie2",      "hero",     None, None, "hero_b20_movie2.mp4", False),
 ("b21_deposition",  "scene",    "m01_LC_b21_canyon.png", None, None, False),
 ("b22_outro",       "hero",     None, None, "hero_b22_outro.mp4",  False),
]
DRIVE = {"car": "m01_LC_b19_car-plate_v2.png", "strip": "m01_LC_b19_scenery-strip_v2.png"}

LABELS = {  # beat -> (text, trigger, first|last)
 "b02_open-line":   ("“Catch me up to speed. Where are you at in the process?”", "Catch", "first"),
 "b04_lowballers":  ("BE THE DIFFERENT ONE", "different", "first"),
 "b05_timeline":    ("TIMING + CERTAINTY", "Timing", "first"),
 "b06_anchor":      ("“Do you and your family have a number you are looking for?”", "number", "first"),
 "b07_cash-road":   ("“If I were making a cash offer, I would probably be around X.”", "cash", "first"),
 "b09_higher-offer":("“Is that offer cash, or are there contingencies attached?”", "contingencies", "first"),
 "b11_movie":       ("WRITE THE ENDING FIRST", "ending", "first"),
 "b12_not-buyer":   ("“I might not be your buyer — and that is okay.”", "buyer", "first"),
 "b14_align":       ("“Totally get why you want that number.”", "Totally", "first"),
 "b15_win-window":  ("“What needs to be true for this to feel like a win?”", "win", "first"),
 "b16_cash-truth":  ("“Is that where others are?”", "others", "first"),
 "b17_perform":     ("A NUMBER I CAN PERFORM ON", "perform", "first"),
 "b18_headline":    ("Price is a headline. Terms are the story.", "headline", "first"),
 "b19_no-number":   ("“Imagine you did know — what would that look like?”", "Imagine", "first"),
 "b21_deposition":  ("“I would rather point you to the right path.”", "path", "first"),
}
# word-timed extras: beat -> {key: (trigger, first|last)}
EXTRAS = {
 "b03_intel": {"q1": ("investors", "first"), "q2": ("agent", "first")},
 "b08_123":   {"step1": ("one", "first"), "step2": ("two", "first"), "step3": ("three", "first")},
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

for d_ in ("stills","hero","anim"):
    os.makedirs(f"{PUB}/{d_}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# 1. master audio with inter-beat gaps
silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i",f"anullsrc=r=44100:cl=mono",
    "-t",str(GAP), silence,"-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i,(tag, *_ ) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS)-1:
            f.write(f"file '{silence}'\n")
subprocess.run(["ffmpeg","-v","error","-f","concat","-safe","0","-i",concat_list,
    "-c:a","aac","-b:a","192k", f"{PUB}/master.m4a","-y"], check=True)

def bg_hex(path, is_video=False):
    src = f'-i "{path}"'
    return subprocess.check_output(
        f'ffmpeg -v error {src} -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()

def normalize(src_name):
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp): return None
    bgc = bg_hex(sp)
    dst = f"{PUB}/stills/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y',
        shell=True, check=True)
    return f"lesson1C/stills/{src_name}"

def rekey_clip(name):
    """Key anim clip bg to ALPHA (ProRes 4444) — code owns the canonical blue.
    Baking blue into yuv clips is banned: Remotion's decode matrix shifts it ±4/channel
    regardless of how the clip was encoded/tagged (found in 1C QC, 2026-07-04)."""
    sp = f"{HG}/grok/{name}"
    if not os.path.exists(sp): return None
    bgc = bg_hex(sp, True)
    dst_name = name.replace(".mp4", ".mov")
    dst = f"{PUB}/anim/{dst_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -filter_complex '
        f'"[0:v]scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
        f'colorkey=0x{bgc}:0.15:0.02,format=rgba[v]" '
        f'-map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
        shell=True, check=True)
    return f"lesson1C/anim/{dst_name}"

manifest, missing = [], []
for i,(tag, mode, still, anim, hero, badge) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    frames = round((d + (GAP if i < len(BEATS)-1 else 0)) * FPS)
    e = {"tag": tag, "mode": mode, "durationInFrames": frames, "voFrames": round(d*FPS)}
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
            e["hero"] = f"lesson1C/hero/{hero}"
        else: missing.append(f"hero:{tag}")
    if anim:
        r = rekey_clip(anim)
        if r: e["anim"] = r
        else: missing.append(f"anim:{anim}")
    if still:
        r = normalize(still)
        if r: e["still"] = r
        else: missing.append(f"still:{still}")
    if mode == "drive":
        e["drive"] = {}
        # Andrea speaks first; cut to the drive rig on "Craigslist" (Jarrad 2026-07-04)
        sw = word_frame(tag, "Craigslist", "first")
        if sw is not None: e["switchFrame"] = sw
        for k, fn in DRIVE.items():
            if k == "car":
                # car must be an ALPHA cutout — an opaque plate would cover the scrolling strip
                sp = f"{SCN}/{fn}"
                if os.path.exists(sp):
                    bgc = bg_hex(sp)
                    alpha_name = fn.replace(".png", "_alpha.png")
                    subprocess.run(
                        f'ffmpeg -v error -i "{sp}" -vf "colorkey=0x{bgc}:0.12:0.03" -c:v png "{PUB}/stills/{alpha_name}" -y',
                        shell=True, check=True)
                    e["drive"][k] = f"lesson1C/stills/{alpha_name}"
                else: missing.append(f"drive:{fn}")
            else:
                r = normalize(fn)
                if r: e["drive"][k] = r
                else: missing.append(f"drive:{fn}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson1C/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total/FPS,1), "missing": missing}, indent=1))
