#!/usr/bin/env python3
"""Build Lesson 8A manifest ("Complex Objections") — master Slot 11 cues 1-9 + written bridge outro, 10 beats.
audio = master clock + 1.0s inter-beat gaps (PLAYBOOK 7.14). BEACH-Andrea hero bookends (b01/b10, Jarrad
2026-07-06 override of cafe) + beach-Andrea corner circles (b04/b07/b09 — crop MEASURED per 9.4, seated
framing differs from the 1A standing crop). Seedance anim clips -> alpha ProRes .mov over CODE blue
(7A rekey_anim recipe); freeze tail = each clip's OWN last frame (11.7). b08 = FROZEN STILL (scene mode,
gentle push-in) — two Seedance attempts failed on this composition; Jarrad-approved freeze per 10.7.
Word-timed labels/captions/pills from _state.json. Modes: hero | video | scene (see Lesson8A.tsx).
Trigger notes from the 11.5 audit: b02 label triggers on "framework" (not "depth" — lands at 85%);
b07 caption triggers on the SECOND "leaseback" (the definition, not the opening word)."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson8A"
GK = f"{HG}/grok"
SCN = f"{B}/course-assets/scenes/module-08"
PUB = f"{B}/docs/course-production/remotion/public/lesson8A"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0

# ordered beats: (tag = wav/_state tag, mode)
BEATS = [
 ("b01_intro",      "hero"),
 ("b02_weight",     "video"),
 ("b03_underwater", "video"),
 ("b04_response",   "video"),
 ("b05_tenants",    "video"),
 ("b06_squatters",  "video"),
 ("b07_leaseback",  "video"),
 ("b08_privacy",    "scene"),
 ("b09_contract",   "video"),
 ("b10_outro",      "hero"),
]

HEROES = {"b01_intro": "hero_b01_intro.mp4", "b10_outro": "hero_b10_outro.mp4"}
BADGE = {"b01_intro"}
CIRCLES = {"b04_response": "circle_b04.mp4", "b07_leaseback": "circle_b07.mp4", "b09_contract": "circle_b09.mp4"}

# video beats: tag -> anim clip in grok/
VIDEO = {
 "b02_weight":     "anim_b02.mp4",
 "b03_underwater": "anim_b03.mp4",
 "b04_response":   "anim_b04.mp4",
 "b05_tenants":    "anim_b05.mp4",
 "b06_squatters":  "anim_b06.mp4",
 "b07_leaseback":  "anim_b07.mp4",
 "b09_contract":   "anim_b09.mp4",
}

# scene beats (frozen still + push-in): tag -> source still in module-08/
SCENE = {"b08_privacy": "m08_L8A_b08_privacy.png"}

# clip-end trims: tag -> media seconds to play before freezing. b06's same-frame clamp snaps from the
# drifted-in framing back to the wide start pose only in the file's final instants — timestamps
# Remotion's near-EOF frame picking never displays — so the -sseof tail (wide) popped 6.9/255 against
# the on-screen zoomed frame (QC boundary diff). Freeze at 14.5s instead, with the tail extracted at
# that SAME timestamp so the held frame is the one actually shown.
TRIM = {"b06_squatters": 14.5}

# primary word-timed label: tag -> (text, trigger, place, which)
# place: top | bottom | topleft | topright  (topCenter / bottomCenter / absolute corners — see tsx)
LABELS = {
 "b02_weight":     ("SAME FRAMEWORK, MORE DEPTH",      "framework", "bottom",   "first"),
 "b03_underwater": ('"I OWE MORE THAN IT\'S WORTH"',   "owe",       "bottom",   "first"),
 "b04_response":   ("GET THE FULL PICTURE",            "picture",   "topright", "first"),
 "b05_tenants":    ('"I HAVE TENANTS"',                "tenants",   "topleft",  "first"),
 "b06_squatters":  ("SQUATTERS",                       "squatter",  "topleft",  "first"),
 "b07_leaseback":  ('"CAN I STAY AFTER SELLING?"',     "stay",      "topright", "first"),
 "b09_contract":   ('"WHAT IF I CHANGE MY MIND?"',     "mind",      "topright", "first"),
}

# secondary caption (bottom-center strip): tag -> (text, trigger, which)
CAPTIONS = {
 "b05_tenants":   ("YES — WE BUY WITH TENANTS",      "yes",       "first"),
 "b07_leaseback": ("LEASEBACK — STAY AS A TENANT",   "leaseback", "last"),
 "b08_privacy":   ("A PRIVATE TRANSACTION",          "private",   "first"),
}

# word-timed pill stacks (narrated enumerations, rule 6b): tag -> (place, [(text, trigger), ...])
PILLS = {
 "b08_privacy": ("topleft", [
   ("NO LISTING",     "MLS"),
   ("NO SIGN",        "sign"),
   ("NO OPEN HOUSES", "houses"),
   ("NO STRANGERS",   "strangers"),
 ]),
 "b09_contract": ("right", [
   ("INSPECTION PERIOD",   "inspection"),
   ("WALKED THROUGH FIRST","walked"),
   ("ATTORNEY REVIEW",     "attorney"),
 ]),
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
    return f"lesson8A/stills/{src_name}"


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
    return f"lesson8A/anim/{base}", round(dur(dst) * FPS)


def anim_mov_abs(src_mp4_name):
    return f"{PUB}/anim/{os.path.basename(src_mp4_name).replace('.mp4', '.mov')}"


def tail_frame(mov_abs, name, at=None):
    """The anim clip's OWN LAST frame (alpha RGBA PNG) held as the seamless freeze tail (PLAYBOOK 11.7).
    `at` (media seconds) overrides the end-of-file extract for TRIM'd clips."""
    if not os.path.exists(mov_abs):
        return None
    dst = f"{PUB}/stills/{name}_tail.png"
    seek = f'-ss {at} -i "{mov_abs}"' if at is not None else f'-sseof -0.06 -i "{mov_abs}"'
    subprocess.run(f'ffmpeg -v error {seek} -frames:v 1 -pix_fmt rgba "{dst}" -y',
                   shell=True, check=True)
    return f"lesson8A/stills/{name}_tail.png"


def copy_hero(name):
    """Beach-Andrea hero clip is a full-frame opaque scene — copy as-is."""
    sp = f"{HG}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/hero/{name}"
    subprocess.run(["cp", "-f", sp, dst], check=True)
    return f"lesson8A/hero/{name}"


def copy_circle(name):
    sp = f"{HG}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/circle/{name}"
    subprocess.run(["cp", "-f", sp, dst], check=True)
    return f"lesson8A/circle/{name}"


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

    if tag in LABELS:
        text, trig, place, which = LABELS[tag]
        e["label"] = text
        ld = word_frame(tag, trig, which)
        e["labelDelay"] = ld if ld is not None else 8
        e["labelPlace"] = place
    if tag in CAPTIONS:
        text, trig, which = CAPTIONS[tag]
        e["caption"] = text
        cd = word_frame(tag, trig, which)
        e["captionDelay"] = cd if cd is not None else round(d * FPS * 0.5)
    if tag in PILLS:
        place, items = PILLS[tag]
        pills = []
        prev = -12
        for txt, trig in items:
            wf = word_frame(tag, trig)
            if wf is None:
                wf = (prev if prev > 0 else 20) + 40
            wf = max(wf, prev + 12)  # strictly increasing, min 12f apart
            prev = wf
            pills.append({"text": txt, "delay": wf})
        e["pills"] = pills
        e["pillsPlace"] = place

    if mode == "hero":
        r = copy_hero(HEROES[tag])
        if r:
            e["hero"] = r
        else:
            missing.append(f"hero:{HEROES[tag]}")

    elif mode == "video":
        anim = VIDEO[tag]
        v, vf = rekey_anim(f"{GK}/{anim}")
        if v:
            trim = TRIM.get(tag)
            if trim is not None:
                vf = round(trim * FPS)
            e["videos"] = [v]
            e["videoFrames"] = [vf]
            tf = tail_frame(anim_mov_abs(anim), tag, at=trim)
            if tf:
                e["still"] = tf
            else:
                missing.append(f"tail:{tag}")
        else:
            missing.append(f"anim:{anim}")

    elif mode == "scene":
        r = normalize(SCENE[tag])
        if r:
            e["still"] = r
        else:
            missing.append(f"scene:{SCENE[tag]}")

    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson8A/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1),
                  "missing": [m for m in missing if m], "totalFrames": total}, indent=1))

# 3. dump every word-timed delay for the pre-render eyeball pass (PLAYBOOK 11.5)
for e in manifest:
    row = [e["tag"], f"dur={e['durationInFrames']}f"]
    if "labelDelay" in e:
        row.append(f"label@{e['labelDelay']}f({round(e['labelDelay']/FPS,1)}s) '{e['label']}'")
    if "captionDelay" in e:
        row.append(f"caption@{e['captionDelay']}f({round(e['captionDelay']/FPS,1)}s) '{e['caption']}'")
    for p in e.get("pills", []):
        row.append(f"pill@{p['delay']}f({round(p['delay']/FPS,1)}s) '{p['text']}'")
    print("  ".join(row))
