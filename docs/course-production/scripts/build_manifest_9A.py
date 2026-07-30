#!/usr/bin/env python3
"""Build Lesson 9A manifest ("Seller FAQ Decoder", Slot 12). v2 label model (Jarrad 2026-07-08):
every transient teaching label is a SINGLE bottom-center queue (one at a time, out-then-in) — emit
`overlays: [{text, delay}]` per beat, word-timed + min-spaced (matches approved 11A). Transitions =
1A camera-travel slide (in Lesson9A.tsx). Full-scene Seedance clips + own-last-frame freeze tail."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lesson9A"
GK = f"{HG}/grok"
PUB = f"{B}/docs/course-production/remotion/public/lesson9A"
FPS = 30
GAP = 1.0

BEATS = [
 ("b01_intro",   "hero"),
 ("b02_decoder", "video"),
 ("b03_ten",     "tiles"),
 ("b04_q1",      "video"),
 ("b05_q2",      "video"),
 ("b06_q3",      "video"),
 ("b07_q4",      "video"),
 ("b08_q5",      "video"),
 ("b09_outro",   "hero"),
]
HEROES = {"b01_intro": "hero_b01_intro.mp4", "b09_outro": "hero_b09_outro.mp4"}
BADGE = {"b01_intro"}
CIRCLES = {"b02_decoder": "circle_b02.mp4", "b06_q3": "circle_b06.mp4"}
VIDEO = {
 "b02_decoder": "anim_b02_grace.mp4",
 "b04_q1":      "anim_b04_jim.mp4",
 "b05_q2":      "anim_b05_david.mp4",
 "b06_q3":      "anim_b06_carol.mp4",
 "b07_q4":      "anim_b07_scale.mp4",
 "b08_q5":      "anim_b08_beth.mp4",
}
# single ordered bottom-center label queue per beat: (text, trigger word). One visible at a time.
LABELS = {
 "b02_decoder": [("CAN I TRUST YOU?", "trust"), ("AM I GETTING A FAIR DEAL?", "fair"), ("IS THIS COMPLICATED?", "complicated")],
 "b03_ten":     [("THE 10 MOST COMMON QUESTIONS", "ten")],
 "b04_q1":      [("HOW DOES THIS WORK?", "work"), ("KEEP IT SIMPLE", "simplicity"), ("HAVE A CONVERSATION", "conversation"), ("PUT TOGETHER A CASH OFFER", "offer"), ("NO REPAIRS · NO COMMISSIONS", "commissions")],
 "b05_q2":      [("HOW DO YOU COME UP WITH THE OFFER?", "offer"), ("NOT A RANDOM NUMBER", "random"), ("WHAT SIMILAR HOMES SOLD FOR", "sold"), ("CONDITION + REPAIR COSTS", "repairs"), ("WORKS FOR BOTH SIDES", "both")],
 "b06_q3":      [("IS THIS A SCAM?", "scam"), ("LICENSED TITLE COMPANY", "title"), ("ATTORNEY REVIEW AVAILABLE", "attorney"), ("NO MONEY UPFRONT — EVER", "upfront")],
 "b07_q4":      [("WHY CAN'T YOU OFFER MORE?", "more"), ("WE BUY AS-IS · WE TAKE THE RISK", "risk"), ("SPEED · CERTAINTY · NO HASSLE", "Speed")],
 "b08_q5":      [("HOW FAST CAN YOU CLOSE?", "close"), ("AS FAST AS A COUPLE OF WEEKS", "weeks"), ("THEY PICK THE DATE", "pick")],
}


def word_frame(state, tag, trigger):
    words = state.get(tag, {}).get("words") or []
    needle = trigger.lower().strip('.,?!"“”$—-·')
    for w in words:
        cleaned = w["word"].lower().strip('.,?!"“”$—-·')
        if needle and needle in cleaned:
            return max(0, round(float(w["start"]) * FPS))
    return None


def dur(p):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", p]).strip())


def copy_to(sub, name):
    sp = f"{HG}/{name}" if sub in ("hero", "circle") else f"{GK}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/{sub}/{name}"
    subprocess.run(["cp", "-f", sp, dst], check=True)
    return f"lesson9A/{sub}/{name}"


def copy_anim(name):
    sp = f"{GK}/{name}"
    if not os.path.exists(sp):
        return None, None
    dst = f"{PUB}/anim/{name}"
    subprocess.run(["cp", "-f", sp, dst], check=True)
    return f"lesson9A/anim/{name}", round(dur(dst) * FPS)


def tail_frame(name, tag):
    sp = f"{GK}/{name}"
    if not os.path.exists(sp):
        return None
    dst = f"{PUB}/stills/{tag}_tail.png"
    subprocess.run(f'ffmpeg -v error -sseof -0.06 -i "{sp}" -frames:v 1 "{dst}" -y', shell=True, check=True)
    return f"lesson9A/stills/{tag}_tail.png"


for d_ in ("stills", "hero", "circle", "anim"):
    os.makedirs(f"{PUB}/{d_}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# master audio = beat wavs + 1.0s silence between beats
silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP), silence, "-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i, (tag, _m) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS) - 1:
            f.write(f"file '{silence}'\n")
subprocess.run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list,
                "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"], check=True)

missing = []
manifest = []
for i, (tag, mode) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    frames = round((d + (GAP if i < len(BEATS) - 1 else 0)) * FPS)
    e = {"tag": tag, "mode": mode, "durationInFrames": frames, "voFrames": round(d * FPS)}
    if tag in BADGE:
        e["badge"] = True
    if tag in CIRCLES:
        r = copy_to("circle", CIRCLES[tag])
        if r: e["circle"] = r
        else: missing.append(f"circle:{CIRCLES[tag]}")

    # single ordered bottom-center label queue, word-timed + min 18f spacing
    overlays = []
    last = -100
    for text, trig in LABELS.get(tag, []):
        wf = word_frame(state, tag, trig)
        if wf is None:
            wf = max(8, last + 28)
        wf = max(wf, last + 18)
        last = wf
        overlays.append({"text": text, "delay": wf})
    if overlays:
        e["overlays"] = overlays

    if mode == "hero":
        r = copy_to("hero", HEROES[tag])
        if r: e["hero"] = r
        else: missing.append(f"hero:{HEROES[tag]}")
    elif mode == "video":
        v, vf = copy_anim(VIDEO[tag])
        if v:
            e["videos"] = [v]; e["videoFrames"] = [vf]
            tf = tail_frame(VIDEO[tag], tag)
            if tf: e["still"] = tf
            else: missing.append(f"tail:{tag}")
        else:
            missing.append(f"anim:{VIDEO[tag]}")
    # tiles mode: label queue only (tiles are code in Lesson9A.tsx)

    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson9A/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1), "missing": missing, "totalFrames": total}, indent=1))
for e in manifest:
    bits = [e["tag"], f"{e['durationInFrames']}f"]
    for o in e.get("overlays", []):
        bits.append(f"@{o['delay']} {o['text']}")
    print("  ".join(bits))
