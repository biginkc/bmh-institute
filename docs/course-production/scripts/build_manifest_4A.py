#!/usr/bin/env python3
import os
"""Build Lesson 4A manifest ("Sales Pipeline & Stage Ownership") — master Slot 06 cues 1-12, 13 beats.
audio = master clock + 1.0s inter-beat gaps (PLAYBOOK 7.14). Cafe-Andrea hero bookends (b01/b10),
headset corner-circles (b02/b09). Visual spine = code-rendered SIX-stage pipeline diagram (Lesson4A.tsx).
Each pipeline beat carries `stage` (1-6 active | 0=ownership b09), optional vignette still (normalized to
canonical blue), a word-timed label + word-timed exit caption, plus per-beat structured overlays
(checkLabels for b04, crmFields for b05b, tag captions, recap verbs for b09).
Two-phase beats (b05a/b06a): anim clip (alpha .mov) plays P1, then a full-body Andrea clip (alpha .mov)
takes over at `andreaCut`. Timing delays are derived from _state.json word timestamps (word_frame),
same recipe as build_manifest_2A.py.
Modes: hero | pipeline | crm.
"""
import json, os, subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson4A"
GK = f"{HG}/grok"
SCN = f"{B}/course-assets/scenes/module-04"
PUB = f"{B}/docs/course-production/remotion/public/lesson4A"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0

# tag, mode, stage(1-6 active; 0=ownership b09/hero), still, hero, circle, badge
BEATS = [
 ("b01_intro",           "hero",     0, None,                          "hero_b01_intro.mp4", None,             True),
 ("b02_overview",        "pipeline", 1, None,                          None,                 "circle_b02.mp4", False),
 ("b03a_capture",        "pipeline", 1, "m04_L4A_v1_capture.png",       None,                 None,             False),
 ("b03b_firstcontact",   "pipeline", 1, "m04_L4A_v2_firstcontact.png",  None,                 None,             False),
 ("b04_qualify",         "pipeline", 2, "m04_L4A_v3_qualify_v3.png",    None,                 None,             False),
 ("b05a_discovery",      "pipeline", 3, None,                          None,                 None,             False),
 # b05b holds the discovery art (v4) — its old code CRM card just re-typed Andrea's field list (cut).
 ("b05b_discovery_exit", "pipeline", 3, "m04_L4A_v4_discovery.png",     None,                 None,             False),
 ("b06a_handoff",        "pipeline", 4, None,                          None,                 None,             False),
 ("b06b_handoff_clean",  "pipeline", 4, "m04_L4A_v6_handoff.png",       None,                 None,             False),
 ("b07_offer",           "pipeline", 5, "m04_L4A_v7_offer.png",         None,                 None,             False),
 ("b08_contract",        "pipeline", 6, "m04_L4A_v8_contract_v2.png",   None,                 None,             False),
 ("b09_ownership",       "pipeline", 0, None,                          None,                 "circle_b09.mp4", False),
 ("b10_outro",           "hero",     0, None,                          "hero_b10_outro.mp4", None,             False),
]

# two-phase beats: P1 = grok anim clip (alpha), P2 = full-body Andrea clip (alpha), cut at ~fraction of beat.
# (clip_name, andrea_clip, cut_fraction, keep_swappable_note)
TWO_PHASE = {
 "b05a_discovery": (f"{GK}/anim_b05a_discovery_v2.mp4", f"{HG}/hero_b05a_andrea.mp4", 0.46),
 "b06a_handoff":   (f"{GK}/kling_b06a_priya-handoff-v2.mp4", f"{HG}/hero_b06a_andrea.mp4", 0.35),
}

# primary word-timed label:  tag -> (text, trigger word)
LABELS = {
 "b02_overview":        ("6 STAGES", "six"),
 "b03a_capture":        ("STAGE 1 · LEAD CAPTURE", "Capture"),
 "b03b_firstcontact":   ("STAGE 1 · LEAD CAPTURE", "Stage"),  # still stage-1; exit carries the real callout
 "b04_qualify":         ("STAGE 2 · QUALIFICATION", "Qualification"),
 "b05a_discovery":      ("STAGE 3 · DISCOVERY", "Discovery"),
 "b06a_handoff":        ("STAGE 4 · HANDOFF", "Handoff"),
 "b07_offer":           ("STAGE 5 · OFFER REVIEW", "Offer"),
 "b08_contract":        ("STAGE 6 · CONTRACT", "Contract"),
 "b09_ownership":       ("YOU OWN STAGES 1 → 4", "own"),
}
# TEXT-DENSITY PASS (Option B, Jarrad `walk` 2026-07-05): all of the overlay text below re-typed
# Andrea's narration word-for-word (exit criteria, the four qualify checks, the six CRM rows, the four
# ownership verbs). It was the "slop." Cut entirely — the vignette art + her voice carry these beats,
# and a single active-stage pill (rendered from `stage` in Lesson4A.tsx) is the only per-beat text.
# The full six-pill row + the one "YOU OWN STAGES 1 → 4" caption survive ONLY on the two map beats
# (b02 overview, b09 ownership). Tables kept as empty dicts so the build loop below is unchanged.
EXITS = {}
CHECK_LABELS = {}
CRM_FIELDS = {}
RECAP_VERBS = {}


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
    return f"lesson4A/stills/{src_name}"


def rekey_hero(name):
    """Full-frame cafe-Andrea hero (b01/b10) → alpha ProRes 4444 so Remotion owns the canonical blue."""
    sp = f"{HG}/{name}"
    if not os.path.exists(sp):
        return None
    bgc = subprocess.check_output(
        f'ffmpeg -v error -ss 1 -i "{sp}" -vf "crop=8:8:16:16,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()
    dst_name = name.replace(".mp4", ".mov")
    dst = f"{PUB}/hero/{dst_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -filter_complex '
        f'"[0:v]scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
        f'colorkey=0x{bgc}:0.12:0.05,format=rgba[v]" -map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
        shell=True, check=True)
    return f"lesson4A/hero/{dst_name}", round(dur(dst) * FPS)


def _sample(sp, x, y):
    return subprocess.check_output(
        f'ffmpeg -v error -ss 1 -i "{sp}" -vf "crop=8:8:{x}:{y},scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()


def rekey_anim(src_path):
    """Grok anim clip (1280x720, HeyGen/flat blue) → full-frame alpha ProRes, scaled to 1600x900."""
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
    return f"lesson4A/anim/{base}", round(dur(dst) * FPS)


def rekey_andrea(src_path):
    """Full-body Andrea headset clip (1280x720): content strip = 480px at x=400. Crop 480:720:400:0,
    key the HeyGen panel blue, pad transparent back to full width, scale to 1600x900. Alpha ProRes."""
    if not os.path.exists(src_path):
        return None, None
    panel = _sample(src_path, 636, 8)  # center-top HeyGen panel blue
    base = os.path.basename(src_path).replace(".mp4", ".mov")
    dst = f"{PUB}/andrea/{base}"
    # crop the 480 content strip, key panel blue, pad transparent to 1280 wide, then scale to 1600x900
    vf = (f'[0:v]crop=480:720:400:0,scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
          f'colorkey=0x{panel}:0.16:0.06,format=rgba,pad=1280:720:400:0:color=0x00000000,'
          f'scale=1600:900:flags=lanczos[v]')
    subprocess.run(
        f'ffmpeg -v error -i "{src_path}" -filter_complex "{vf}" '
        f'-map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
        shell=True, check=True)
    return f"lesson4A/andrea/{base}", round(dur(dst) * FPS)


def copy_circle(name):
    sp = f"{HG}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/circle/{name}"
    subprocess.run(["cp", sp, dst], check=True)
    return f"lesson4A/circle/{name}"


for d_ in ("stills", "hero", "circle", "anim", "andrea"):
    os.makedirs(f"{PUB}/{d_}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# 1. master audio = beat wavs + 1.0s silence between beats (rebuild — reuses same recipe as before)
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
for i, (tag, mode, stage, still, hero, circle, badge) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    frames = round((d + (GAP if i < len(BEATS) - 1 else 0)) * FPS)
    e = {"tag": tag, "mode": mode, "stage": stage, "durationInFrames": frames, "voFrames": round(d * FPS)}
    if badge:
        e["badge"] = True

    if tag in LABELS:
        text, trig = LABELS[tag]
        e["label"] = text
        e["labelDelay"] = word_frame(tag, trig) or 8
    if tag in EXITS:
        text, trig = EXITS[tag]
        e["exit"] = text
        e["exitDelay"] = word_frame(tag, trig) or round(d * FPS * 0.5)

    # b04 checkmark labels
    if tag in CHECK_LABELS:
        e["checkLabels"] = [
            {"text": t, "delay": (word_frame(tag, trig) or (10 + k * 20))}
            for k, (t, trig) in enumerate(CHECK_LABELS[tag])
        ]
    # b05b CRM field rows
    if tag in CRM_FIELDS:
        e["crmFields"] = [
            {"text": t, "delay": (word_frame(tag, trig) or (6 + k * 18))}
            for k, (t, trig) in enumerate(CRM_FIELDS[tag])
        ]
    # b09 recap verbs
    if tag in RECAP_VERBS:
        e["recap"] = [
            {"text": t, "delay": (word_frame(tag, trig) or (30 + k * 25))}
            for k, (t, trig) in enumerate(RECAP_VERBS[tag])
        ]

    # two-phase anim + andrea
    if tag in TWO_PHASE:
        clip_path, andrea_path, frac = TWO_PHASE[tag]
        cut = round(frames * frac)
        e["andreaCut"] = cut
        v1, f1 = rekey_anim(clip_path)
        if v1:
            e["videos"] = [v1]
            e["videoFrames"] = [f1]
        else:
            missing.append(f"anim:{os.path.basename(clip_path)}")
        v2, f2 = rekey_andrea(andrea_path)
        if v2:
            e["andrea"] = v2
        else:
            missing.append(f"andrea:{os.path.basename(andrea_path)}")

    if still:
        r = normalize(still)
        if r:
            e["still"] = r
        else:
            missing.append(f"still:{still}")
    if hero:
        r = rekey_hero(hero)
        if r:
            e["hero"], e["heroFrames"] = r
        else:
            missing.append(f"hero:{hero}")
    if circle:
        r = copy_circle(circle)
        if r:
            e["circle"] = r
        else:
            missing.append(f"circle:{circle}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson4A/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1), "missing": missing}, indent=1))
