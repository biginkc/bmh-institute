#!/usr/bin/env python3
"""Build Lesson 7A manifest ("Objection Architecture") — master Slot 09 cues 1-11 + 17 + 18, 13 beats.
audio = master clock + 1.0s inter-beat gaps (PLAYBOOK 7.14). Cafe-Andrea hero bookends (b01/b13),
headset corner-circles (b03/b05/b11). Seedance anim clips -> alpha ProRes .mov over CODE blue
(2B/4A rekey_anim recipe: colorkey bg, bt709 both ways, scale 1600x900) so Remotion owns the canonical
blue and there is never a seam. The base still (normalized to canonical blue) holds as the seamless
tail after each 15s clip (clips end on their start pose). Word-timed labels/captions from _state.json.
Modes: hero | video | calltype | grid4 | steps | lockup (see remotion/src/Lesson7A.tsx).
"""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson7A"
GK = f"{HG}/grok"
SCN = f"{B}/course-assets/scenes/module-07"
PUB = f"{B}/docs/course-production/remotion/public/lesson7A"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0

# ordered beats: (tag = wav/_state tag, mode)
BEATS = [
 ("b01_intro",          "hero"),
 ("b02_goodsign",       "video"),
 ("b03_reframe",        "video"),
 ("b04_calltype",       "calltype"),
 ("b05_fourtypes",      "grid4"),
 ("b06_silence",        "video"),
 ("b07_complaints",     "video"),
 ("b08_reactionary",    "video"),
 ("b09_realobjections", "video"),
 ("b10_framework",      "steps"),
 ("b11_sequence",       "lockup"),
 ("b12_doorway",        "video"),
 ("b13_outro",          "hero"),
]

HEROES = {"b01_intro": "hero_b01_intro.mp4", "b13_outro": "hero_b13_outro.mp4"}
BADGE = {"b01_intro"}
CIRCLES = {"b03_reframe": "circle_b03.mp4", "b05_fourtypes": "circle_b05.mp4", "b11_sequence": "circle_b11.mp4"}

# single-clip video beats: tag -> (anim in grok/, base still in module-07/)
VIDEO = {
 "b02_goodsign":       ("anim_b02_goodsign.mp4",    "m07_L7A_b02_goodsign.png"),
 "b03_reframe":        ("anim_b03_reframe.mp4",      "m07_L7A_b03_reframe.png"),
 "b06_silence":        ("anim_b06_silence.mp4",      "m07_L7A_b06_silence.png"),
 "b07_complaints":     ("anim_b07_complaints.mp4",   "m07_L7A_b07_complaints.png"),
 "b08_reactionary":    ("anim_b08_reactionary.mp4",  "m07_L7A_b08_reactionary.png"),
 "b09_realobjections": ("anim_b09_real.mp4",         "m07_L7A_b09_real.png"),
 "b12_doorway":        ("anim_b12_doorway.mp4",      "m07_L7A_b12_doorway.png"),
}

# primary word-timed label: tag -> (text, trigger, place)  place in {bottom, top, center}
LABELS = {
 "b02_goodsign":       ("A GOOD SIGN",                          "good",        "bottom"),
 "b03_reframe":        ("NOT A REJECTION",                      "rejection",   "top"),
 "b05_fourtypes":      ("4 RESPONSE TYPES",                     "four",        "top"),
 "b06_silence":        ("1 · SILENCE",                          "silence",     "top"),
 "b07_complaints":     ("2 · COMPLAINTS",                       "complaints",  "top"),
 "b08_reactionary":    ("3 · REACTIONARY DEFENSE",              "reactionary", "top"),
 "b09_realobjections": ("4 · REAL OBJECTIONS",                  "real",        "top"),
 "b11_sequence":       ("LISTEN · ACKNOWLEDGE · ASK · REDIRECT","Listen",      "center"),
 "b12_doorway":        ("A DOORWAY, NOT A DEAD END",            "doorway",     "bottom"),
}

# secondary caption (2nd Sticker, opposite edge) for the 4 grid-type beats: tag -> (text, trigger)
CAPTIONS = {
 "b06_silence":        ("→ GIVE SPACE, WAIT",         "space"),
 "b07_complaints":     ("→ ACKNOWLEDGE & REDIRECT",   "redirect"),
 "b08_reactionary":    ("→ DON'T TAKE THE BAIT",      "bait"),
 "b09_realobjections": ("→ THE FRAMEWORK",            "framework"),
}

# quad indicator (small 2x2 top-left, active cell) for the 4 grid-type beats
QUAD = {"b06_silence": 1, "b07_complaints": 2, "b08_reactionary": 3, "b09_realobjections": 4}

# calltype 2-panel slide (b04): cold panel A -> warm panel B, camera slides on "warmed"
CALLTYPE = {
 "b04_calltype": {
   "coldClip": "anim_b04cold.mp4", "coldStill": "m07_L7A_b04cold_mark.png",
   "coldLabel": "COLD CALL", "coldTrig": "cold",
   "warmClip": "anim_b04warm.mp4", "warmStill": "m07_L7A_b04warm_jim.png",
   "warmLabel": "WARMED UP", "warmTrig": "warmed",
   "slideTrig": "warmed",
 },
}

# steps staircase (b10): (text, trigger) in order — each step pops on its trigger word
STEPS = {
 "b10_framework": [("LISTEN", "listen"), ("ACKNOWLEDGE", "acknowledge"), ("ASK", "ask"), ("REDIRECT", "redirect")],
}


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
    """Still -> canonical blue (sample native bg hex, colorkey it out, overlay on #62b3f3)."""
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp):
        return None
    bgc = bg_hex(sp)
    dst = f"{PUB}/stills/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y', shell=True, check=True)
    return f"lesson7A/stills/{src_name}"


def rekey_anim(src_path):
    """Seedance anim clip (1280x720, flat blue bg) -> full-frame alpha ProRes 4444, scaled 1600x900.
    Code owns the canonical blue (never baked into the clip). bt709 both directions (PLAYBOOK)."""
    if not os.path.exists(src_path):
        return None, None
    bgc = bg_hex(src_path)
    base = os.path.basename(src_path).replace(".mp4", ".mov")
    dst = f"{PUB}/anim/{base}"
    subprocess.run(
        f'ffmpeg -v error -i "{src_path}" -filter_complex '
        f'"[0:v]scale=1600:900:flags=lanczos,scale=in_color_matrix=bt709:out_color_matrix=bt709,'
        f'format=rgb24,colorkey=0x{bgc}:0.15:0.03,format=rgba[v]" '
        f'-map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
        shell=True, check=True)
    return f"lesson7A/anim/{base}", round(dur(dst) * FPS)


def anim_mov_abs(src_mp4_name):
    """Abs path of the rekeyed alpha .mov that rekey_anim wrote for a given grok/*.mp4 name."""
    return f"{PUB}/anim/{os.path.basename(src_mp4_name).replace('.mp4', '.mov')}"


def tail_frame(mov_abs, name):
    """Extract the anim clip's OWN LAST frame (alpha RGBA PNG) to hold as the seamless freeze tail.
    Using the clip's actual final pixels (same colour pipeline as the live OffthreadVideo) kills the
    1-frame colour/edge pop that a separately-normalized start-pose still produced (PLAYBOOK 11.7).
    The clip settles onto its end pose in its last ~second, so the exact last frame is unambiguous."""
    if not os.path.exists(mov_abs):
        return None
    dst = f"{PUB}/stills/{name}_tail.png"
    subprocess.run(f'ffmpeg -v error -sseof -0.06 -i "{mov_abs}" -frames:v 1 -pix_fmt rgba "{dst}" -y',
                   shell=True, check=True)
    return f"lesson7A/stills/{name}_tail.png"


def copy_hero(name):
    """Cafe-Andrea hero clip is a full-frame opaque scene (no key needed) — copy as-is (LessonB HeroBeat)."""
    sp = f"{HG}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/hero/{name}"
    subprocess.run(["cp", "-f", sp, dst], check=True)
    return f"lesson7A/hero/{name}"


def copy_circle(name):
    sp = f"{HG}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/circle/{name}"
    subprocess.run(["cp", "-f", sp, dst], check=True)
    return f"lesson7A/circle/{name}"


for d_ in ("stills", "hero", "circle", "anim"):
    os.makedirs(f"{PUB}/{d_}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# 1. master audio = beat wavs + 1.0s silence between beats
silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP), silence, "-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i, (tag, _mode) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS) - 1:
            f.write(f"file '{silence}'\n")
subprocess.run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list,
                "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"], check=True)

# 2. per-beat manifest
missing = []
manifest = []
for i, (tag, mode) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    frames = round((d + (GAP if i < len(BEATS) - 1 else 0)) * FPS)
    e = {"tag": tag, "mode": mode, "durationInFrames": frames, "voFrames": round(d * FPS)}
    if tag in BADGE:
        e["badge"] = True
    if tag in CIRCLES:
        r = copy_circle(CIRCLES[tag])
        if r:
            e["circle"] = r
        else:
            missing.append(f"circle:{CIRCLES[tag]}")

    # primary word-timed label
    if tag in LABELS:
        text, trig, place = LABELS[tag]
        e["label"] = text
        ld = word_frame(tag, trig)
        e["labelDelay"] = ld if ld is not None else 8
        e["labelPlace"] = place
    # secondary caption (opposite edge)
    if tag in CAPTIONS:
        text, trig = CAPTIONS[tag]
        e["caption"] = text
        cd = word_frame(tag, trig)
        e["captionDelay"] = cd if cd is not None else round(d * FPS * 0.5)
    if tag in QUAD:
        e["quad"] = QUAD[tag]

    if mode == "hero":
        r = copy_hero(HEROES[tag])
        if r:
            e["hero"] = r
        else:
            missing.append(f"hero:{HEROES[tag]}")

    elif mode == "video":
        anim, _startstill = VIDEO[tag]
        v, vf = rekey_anim(f"{GK}/{anim}")
        if v:
            e["videos"] = [v]
            e["videoFrames"] = [vf]
            # freeze tail = the clip's OWN last frame (seamless; no colour pop), not the start-pose still
            tf = tail_frame(anim_mov_abs(anim), tag)
            if tf:
                e["still"] = tf
            else:
                missing.append(f"tail:{tag}")
        else:
            missing.append(f"anim:{anim}")

    elif mode == "calltype":
        c = CALLTYPE[tag]
        cv, cvf = rekey_anim(f"{GK}/{c['coldClip']}")
        if cv:
            e["coldClip"] = cv
            e["coldFrames"] = cvf
            cs = tail_frame(anim_mov_abs(c["coldClip"]), tag + "_cold")  # freeze the cold clip's last frame
            if cs:
                e["coldStill"] = cs
            else:
                missing.append(f"tail:{tag}_cold")
        else:
            missing.append(f"anim:{c['coldClip']}")
        e["coldLabel"] = c["coldLabel"]
        cd = word_frame(tag, c["coldTrig"])
        e["coldDelay"] = cd if cd is not None else 8
        wv, wvf = rekey_anim(f"{GK}/{c['warmClip']}")
        if wv:
            e["warmClip"] = wv
            e["warmFrames"] = wvf
            ws = tail_frame(anim_mov_abs(c["warmClip"]), tag + "_warm")  # freeze the warm clip's last frame
            if ws:
                e["warmStill"] = ws
            else:
                missing.append(f"tail:{tag}_warm")
        else:
            missing.append(f"anim:{c['warmClip']}")
        e["warmLabel"] = c["warmLabel"]
        wd = word_frame(tag, c["warmTrig"])
        sf = word_frame(tag, c["slideTrig"])
        e["warmDelay"] = wd if wd is not None else round(frames * 0.5)
        e["slideFrame"] = sf if sf is not None else round(frames * 0.5)

    elif mode == "grid4":
        pass  # label + circle already set above; the 2x2 grid is code (Lesson7A.tsx)

    elif mode == "steps":
        steps = []
        prev = 0
        for k, (txt, trig) in enumerate(STEPS[tag]):
            wf = word_frame(tag, trig)
            if wf is None:
                wf = 20 + k * 40
            wf = max(wf, prev + 12)  # enforce strictly increasing, min 12f apart
            prev = wf
            steps.append({"text": txt, "delay": wf})
        e["steps"] = steps

    elif mode == "lockup":
        pass  # label (center, split into pills in tsx) + circle already set

    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson7A/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1),
                  "missing": [m for m in missing if m], "totalFrames": total}, indent=1))
