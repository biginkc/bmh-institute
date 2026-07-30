#!/usr/bin/env python3
"""Build Lesson 17 manifest ("Compensation Engine", Slot 17) — v3 script "master texture,
no numbers", v5.1 board, 12 beats. Mirrors build_manifest_7A.py.

audio = master clock + 1.0s inter-beat gaps (PLAYBOOK 7.14). Cafe-Andrea hero bookends:
b01 (single clip + BMH badge) and b12 (hero2: TWO HeyGen takes, straight cut at the take1
audio seam — b12_outro.wav is take1.wav + take2.wav concatenated — fade-out only at the
very end, in the TSX). Seedance anim clips -> alpha ProRes .mov over CODE blue (2B/4A
rekey_anim recipe: colorkey bg, bt709 both ways, scale 1600x900) so Remotion owns the
canonical blue and there is never a seam. The freeze tail after each clip is the clip's
OWN last frame (PLAYBOOK 11.7) — never a separately-normalized start-pose still.

Anim clips are OPTIONAL for this lesson (they land later as
course-assets/scenes/module-17/anim/m17_L17_<beat_tag>_anim.mp4): a video beat with no
clip falls back to its static canonical-blue-normalized still + gentle code push-in in
the TSX. b05 + b11 are ALWAYS code push-in (board v5.1) and never receive anim clips.
b02 is a code-rendered LOCKUP beat (7A b11 lockup pattern): three white pill-cards pop
word-timed with the narration (BASE / PERFORMANCE PAY / BONUSES) — its stacked-blocks
still was rejected, no still dependency. b07 is a TEXT-ONLY beat (no still). b10 is a
HEROMID beat (wallet split retired): full-screen opaque Andrea clip mid-lesson
(hero_b10_that_direct.mp4), freeze tail = its own last frame, bottom sticker stays,
transitions in/out stay SLIDE (mid-lesson fades banned). b11 additionally pins a small
white Sticker label "OFFER LETTER" onto the front document (rides the push-in; coords
QC-tunable in PIN).

Modes: hero | video | lockup | text | heromid | hero2 (see remotion/src/Lesson17.tsx).

--dry-run: check every expected asset and print a MISSING report (required vs optional)
without writing anything or running ffmpeg. Safe while stills/anims are still landing.
"""
import json, os, subprocess, sys

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson17"
SCN = f"{B}/course-assets/scenes/module-17"
ANIM = f"{SCN}/anim"
PUB = f"{B}/docs/course-production/remotion/public/lesson17"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0

# ordered beats: (tag = wav/_state v3 tag, mode)
BEATS = [
 ("b01_intro",          "hero"),
 ("b02_three_pieces",   "lockup"),  # code-rendered word-timed pills — still rejected (Jarrad)
 ("b03_base_ramp",      "video"),
 ("b04_your_deal",      "video"),
 ("b05_strong_months",  "video"),   # ALWAYS code push-in (board v5.1) — never Seedance
 ("b06_real_outcomes",  "video"),
 ("b07_math_direct",    "text"),    # TEXT-ONLY: centered Sticker over canonical blue, no still
 ("b08_long_tail",      "video"),
 ("b09_earnings_logic", "video"),
 ("b10_that_direct",    "heromid"), # full-screen Andrea clip mid-lesson — wallet still retired
 ("b11_your_plan",      "video"),   # ALWAYS code push-in + pinned "OFFER LETTER" label
 ("b12_outro",          "hero2"),   # TWO takes, straight cut, fade-out only at the very end
]

HEROES = {"b01_intro": "hero_b01_intro.mp4"}
BADGE = {"b01_intro"}
HERO_TAKES = {"b12_outro": ("hero_b12_outro_take1.mp4", "hero_b12_outro_take2.mp4")}
TAKE_WAVS = {"b12_outro": ("b12_outro_take1.wav", "b12_outro_take2.wav")}
# mid-lesson full-screen Andrea clips (heromid) — HeyGen renders land here; wired optimistically
HEROES_MID = {"b10_that_direct": "hero_b10_that_direct.mp4"}

# video beats: tag -> base still in module-17/ (board v5.1 mapping — note the two renamed reuses)
STILLS = {
 "b03_base_ramp":      "m17_L17_b03_ramp-calendar.png",
 "b04_your_deal":      "m17_L17_b04_your-deal.png",
 "b05_strong_months":  "m17_L17_b05_strong-months.png",
 "b06_real_outcomes":  "m17_L17_b06_real-outcomes.png",
 "b08_long_tail":      "m17_L17_b07_credit-loop.png",   # board v5.1: beat b08 reuses the FILE named b07
 "b09_earnings_logic": "m17_L17_b09_finish-line.png",
 "b11_your_plan":      "m17_L17_b10_comp-sheet.png",    # board v5.1: beat b11 reuses the FILE named b10
}
NO_ANIM = {"b05_strong_months", "b11_your_plan"}  # ALWAYS push-in — never look for anim clips

# bottom-center one-at-a-time word-timed labels: tag -> (text, trigger word, first|last hit)
# (b07's entry is the centered TEXT-ONLY title, not a bottom label — same word-timing.)
LABELS = {
 "b02_three_pieces":   ("THREE PIECES",                   "idea",     "first"),  # narration never says "three"
 "b03_base_ramp":      ("BASE WHILE YOU RAMP",            "base",     "first"),
 "b04_your_deal":      ("THAT'S YOUR DEAL",               "deal",     "last"),   # pop on the closing "That's your deal"
 "b05_strong_months":  ("STRONG MONTHS SHOW UP",          "strong",   "first"),
 "b06_real_outcomes":  ("REAL OUTCOMES COUNT",            "outcomes", "first"),
 "b07_math_direct":    ("THE MATH IS DIRECT",             "math",     "first"),
 "b08_long_tail":      ("GOOD WORK HAS A LONG TAIL",      "tail",     "first"),
 "b09_earnings_logic": ("THOROUGH. CONSISTENT.",          "thorough", "first"),
 "b10_that_direct":    ("IT'S THAT DIRECT",               "direct",   "last"),   # pop on the closing "It's that direct"
 "b11_your_plan":      ("YOUR OFFER LETTER OR COMP PLAN", "offer",    "first"),
}

# b11 pinned label: small white Sticker card on the front document's blank yellow title bar
# (coords = top-left of the caption card on the 1600x900 canvas; rides the push-in; QC-tunable).
PIN = {"b11_your_plan": {"text": "OFFER LETTER", "trig": "offer", "x": 728, "y": 272}}

# lockup pills (b02): (text, trigger) in order — each pill pops on its trigger word
PILLS = {
 "b02_three_pieces": [("BASE", "base"), ("PERFORMANCE PAY", "performance"), ("BONUSES", "bonuses")],
}


def anim_src(tag):
    return f"{ANIM}/m17_L17_{tag}_anim.mp4"


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
    return f"lesson17/stills/{src_name}"


def rekey_anim(src_path):
    """Seedance anim clip (flat blue bg) -> full-frame alpha ProRes 4444, scaled 1600x900.
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
    return f"lesson17/anim/{base}", round(dur(dst) * FPS)


def anim_mov_abs(src_mp4_name):
    """Abs path of the rekeyed alpha .mov that rekey_anim wrote for a given anim/*.mp4 name."""
    return f"{PUB}/anim/{os.path.basename(src_mp4_name).replace('.mp4', '.mov')}"


def tail_frame(mov_abs, name):
    """Extract the anim clip's OWN LAST frame (alpha RGBA PNG) to hold as the seamless freeze tail.
    Using the clip's actual final pixels (same colour pipeline as the live OffthreadVideo) kills the
    1-frame colour/edge pop that a separately-normalized start-pose still produced (PLAYBOOK 11.7)."""
    if not os.path.exists(mov_abs):
        return None
    dst = f"{PUB}/stills/{name}_tail.png"
    subprocess.run(f'ffmpeg -v error -sseof -0.06 -i "{mov_abs}" -frames:v 1 -pix_fmt rgba "{dst}" -y',
                   shell=True, check=True)
    return f"lesson17/stills/{name}_tail.png"


def copy_hero(name):
    """Cafe-Andrea hero clip is a full-frame opaque scene (no key needed) — copy as-is."""
    sp = f"{HG}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/hero/{name}"
    subprocess.run(["cp", "-f", sp, dst], check=True)
    return f"lesson17/hero/{name}"


# HeyGen photo-avatar renders pillarbox the avatar plate on a *slightly different* blue than the
# requested #62b3f3 fill (measured 2026-07-09 on hero_b10_that_direct: bars (103,182,238), plate
# (93,174,238), seams at x=400/878 on 1280x720). A 10/255 vertical band is visible on flat blue —
# same defect class as the 7A freeze-pop. Fix at source: crop inside the plate, shift +5/+5/+5 so
# plate bg lands EXACTLY on canonical (98,179,243), pad back to 16:9 with true canonical blue.
# If HeyGen re-renders this clip, RE-MEASURE the seam bounds before trusting these constants.
HEROMID_NORMALIZE = {
    "hero_b10_that_direct.mp4": "crop=474:720:402:0,lutrgb=r='min(val+5,255)':g='min(val+5,255)':b='min(val+5,255)',pad=1280:720:403:0:color=0x62B3F3,format=yuv420p"
}


def copy_heromid(name):
    """Heromid clips get bg normalization to canonical blue (see HEROMID_NORMALIZE)."""
    sp = f"{HG}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/hero/{name}"
    vf = HEROMID_NORMALIZE.get(name)
    if vf:
        subprocess.run(["ffmpeg", "-v", "error", "-i", sp, "-vf", vf,
                        "-c:v", "libx264", "-crf", "16", "-preset", "fast",
                        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                        "-an", dst, "-y"], check=True)
    else:
        subprocess.run(["cp", "-f", sp, dst], check=True)
    return f"lesson17/hero/{name}"


# ---------------- dry-run: report missing assets, write NOTHING, run no media commands ----------------
if "--dry-run" in sys.argv:
    missing = []       # required for a correct full build/render
    optional = []      # by-design pending (anims) or degradable (take wavs)
    if not os.path.exists(f"{HG}/_state.json"):
        missing.append("state:_state.json")
    for tag, _mode in BEATS:
        if not os.path.exists(f"{HG}/{tag}.wav"):
            missing.append(f"wav:{tag}.wav")
    for _tag, name in HEROES.items():
        if not os.path.exists(f"{HG}/{name}"):
            missing.append(f"hero:{name}")
    for tag, names in HERO_TAKES.items():
        for name in names:
            if not os.path.exists(f"{HG}/{name}"):
                missing.append(f"hero:{name}")
        for w in TAKE_WAVS.get(tag, ()):
            if not os.path.exists(f"{HG}/{w}"):
                optional.append(f"take-wav:{w} (splitFrame falls back to take1 mp4 duration)")
    for tag, name in STILLS.items():
        if not os.path.exists(f"{SCN}/{name}"):
            missing.append(f"still:{name} (beat {tag})")
    pending = []       # expected but not yet delivered (e.g. HeyGen renders in flight)
    for tag, name in HEROES_MID.items():
        if not os.path.exists(f"{HG}/{name}"):
            pending.append(f"heromid-clip:{name} (beat {tag} — HeyGen rendering; beat is blue+label until it lands)")
    for tag, mode in BEATS:
        if mode == "video" and tag not in NO_ANIM and not os.path.exists(anim_src(tag)):
            optional.append(f"anim:{os.path.basename(anim_src(tag))} (fallback: static still + push-in)")
    trigger_misses = []
    pill_triggers = {}
    if os.path.exists(f"{HG}/_state.json"):
        state = json.load(open(f"{HG}/_state.json"))
        for tag, (_text, trig, which) in LABELS.items():
            if word_frame(tag, trig, which) is None:
                trigger_misses.append(f"label-trigger:{tag}:{trig}")
        for tag, p in PIN.items():
            if word_frame(tag, p["trig"]) is None:
                trigger_misses.append(f"pin-trigger:{tag}:{p['trig']}")
        for tag, pills in PILLS.items():
            pill_triggers[tag] = {}
            for text, trig in pills:
                wf = word_frame(tag, trig)
                pill_triggers[tag][f"{text} ({trig})"] = wf
                if wf is None:
                    trigger_misses.append(f"pill-trigger:{tag}:{trig}")
    print(json.dumps({"MISSING": missing, "MISSING_PENDING": pending, "MISSING_OPTIONAL": optional,
                      "TRIGGER_MISSES": trigger_misses, "PILL_TRIGGERS": pill_triggers,
                      "beats": len(BEATS)}, indent=1))
    sys.exit(0)


# ---------------- full build ----------------
for d_ in ("stills", "hero", "anim"):
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

    # word-timed label (bottom-center on video beats; the centered title on the b07 text beat)
    if tag in LABELS:
        text, trig, which = LABELS[tag]
        e["label"] = text
        ld = word_frame(tag, trig, which)
        e["labelDelay"] = ld if ld is not None else 8
        if ld is None:
            missing.append(f"trigger:{tag}:{trig}")

    if mode == "hero":
        r = copy_hero(HEROES[tag])
        if r:
            e["hero"] = r
        else:
            missing.append(f"hero:{HEROES[tag]}")

    elif mode == "hero2":
        t1, t2 = HERO_TAKES[tag]
        r1 = copy_hero(t1)
        r2 = copy_hero(t2)
        if r1 and r2:
            e["heroTakes"] = [r1, r2]
            # straight cut at the take1 AUDIO seam (b12_outro.wav = take1.wav + take2.wav)
            w1 = f"{HG}/{TAKE_WAVS[tag][0]}"
            cut = round(dur(w1) * FPS) if os.path.exists(w1) else round(dur(f"{PUB}/hero/{t1}") * FPS)
            e["heroTakeFrames"] = [cut, max(1, e["voFrames"] - cut)]
        else:
            for name, r in ((t1, r1), (t2, r2)):
                if not r:
                    missing.append(f"hero:{name}")

    elif mode == "heromid":
        # full-screen opaque Andrea clip mid-lesson; freeze tail = the clip's OWN last frame
        # (PLAYBOOK 11.7) held static through the gap. Label already set above.
        name = HEROES_MID[tag]
        r = copy_heromid(name)
        if r:
            e["hero"] = r
            e["heroFrames"] = round(dur(f"{PUB}/hero/{name}") * FPS)
            tf = tail_frame(f"{PUB}/hero/{name}", tag)
            if tf:
                e["still"] = tf
            else:
                missing.append(f"tail:{tag}")
        else:
            missing.append(f"heromid-clip(pending):{name}")

    elif mode == "lockup":
        # word-timed pills (7A steps mechanism): pop on trigger word, strictly increasing, min 12f apart
        pills = []
        prev = 0
        for k, (txt, trig) in enumerate(PILLS[tag]):
            wf = word_frame(tag, trig)
            if wf is None:
                wf = 20 + k * 40
                missing.append(f"trigger:{tag}:{trig}")
            wf = max(wf, prev + 12)
            prev = wf
            pills.append({"text": txt, "delay": wf})
        e["pills"] = pills

    elif mode == "text":
        pass  # label already set above; code-only beat over canonical blue (Lesson17.tsx)

    elif mode == "video":
        src = anim_src(tag)
        if tag not in NO_ANIM and os.path.exists(src):
            v, vf = rekey_anim(src)
            if v:
                e["videos"] = [v]
                e["videoFrames"] = [vf]
                # freeze tail = the clip's OWN last frame (seamless; no colour pop)
                tf = tail_frame(anim_mov_abs(src), tag)
                if tf:
                    e["still"] = tf
                else:
                    missing.append(f"tail:{tag}")
            else:
                missing.append(f"anim:{os.path.basename(src)}")
        else:
            # static still + gentle code push-in (ALWAYS for b05/b11; fallback elsewhere until anim lands)
            if tag not in NO_ANIM:
                missing.append(f"anim(optional):{os.path.basename(src)} -> push-in fallback")
            r = normalize(STILLS[tag])
            if r:
                e["still"] = r
                e["pushIn"] = True
            else:
                missing.append(f"still:{STILLS[tag]}")
            if tag in PIN:
                p = PIN[tag]
                e["pin"] = p["text"]
                e["pinX"] = p["x"]
                e["pinY"] = p["y"]
                pd = word_frame(tag, p["trig"])
                e["pinDelay"] = pd if pd is not None else 8

    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson17/master.m4a", "totalFrames": total,
       "script": "v3 master-texture no-numbers", "board": "v5.1"}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1),
                  "missing": [m for m in missing if m], "totalFrames": total}, indent=1))
