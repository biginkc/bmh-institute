#!/usr/bin/env python3
"""Build Lesson 11A manifest ("Closing & Deal Engineering").

Audio is the master clock with 1.0s inter-beat gaps. Park-bench Andrea hero
clips cover b01/b08/b15/b16. Seedance scene clips are full-frame, so copy them
as opaque video and hold each clip's own last frame as the tail.
"""
import json
import os
import subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson11A"
SD = f"{HG}/seedance"
PUB = f"{B}/docs/course-production/remotion/public/lesson11A"
FPS = 30
GAP = 1.0

BEATS = [
    ("b01_reframe_close", "hero"),
    ("b02_formal_agreement", "video"),
    ("b03_handoff_role", "video"),
    ("b04_why_understand", "video"),
    ("b05_offer_range", "video"),
    ("b06_clean_offer", "video"),
    ("b07_hoping_more", "video"),
    ("b08_close_gap", "hero"),
    ("b09_respect", "video"),
    ("b10_contract_signed", "video"),
    ("b11_transaction_work", "video"),
    ("b12_sellers_remorse", "video"),
    ("b13_deal_risks", "video"),
    ("b14_trust_beats_price", "video"),
    ("b15_your_impact", "hero"),
    ("b16_next_kpis", "hero"),
]

HEROES = {
    "b01_reframe_close": "hero_b01_reframe_close.mp4",
    "b08_close_gap": "hero_b08_close_gap.mp4",
    "b15_your_impact": "hero_b15_your_impact.mp4",
    "b16_next_kpis": "hero_b16_next_kpis.mp4",
}
BADGE = {"b01_reframe_close"}

VIDEO = {
    "b02_formal_agreement": "anim_b02_formal_agreement.mp4",
    "b03_handoff_role": "anim_b03_handoff_role.mp4",
    "b04_why_understand": "anim_b04_why_understand.mp4",
    "b05_offer_range": "anim_b05_offer_range.mp4",
    "b06_clean_offer": "anim_b06_clean_offer.mp4",
    "b07_hoping_more": "anim_b07_hoping_more.mp4",
    "b09_respect": "anim_b09_arm_wrestling_respect.mp4",
    "b10_contract_signed": "anim_b10_contract_signed.mp4",
    "b11_transaction_work": "anim_b11_transaction_work.mp4",
    "b12_sellers_remorse": "anim_b12_sellers_remorse.mp4",
    "b13_deal_risks": "anim_b13_deal_risks.mp4",
    "b14_trust_beats_price": "anim_b14_trust_beats_price.mp4",
}

LABELS = {
    "b01_reframe_close": [("CLOSING SHOULD BE THE EASIEST PART", "easiest", "bottom")],
    "b02_formal_agreement": [("FORMAL AGREEMENT", "official", "bottom")],
    "b03_handoff_role": [("HANDOFF", "delivered", "bottom")],
    "b04_why_understand": [("SUPPORT", "follow-ups", "bottom"), ("DISCOVERY", "discovery", "bottom"), ("GROWTH", "grow", "bottom")],
    "b05_offer_range": [("OFFER RANGE", "range", "bottom")],
    "b06_clean_offer": [("CLEAR HONEST OFFER", "honest", "bottom")],
    "b07_hoping_more": [("NOT A DEALBREAKER", "dealbreaker", "bottom")],
    "b08_close_gap": [("ACKNOWLEDGE", "acknowledging", "bottom"), ("REFRAME", "reframe", "bottom"), ("ASK", "ask", "bottom"), ("CLOSE THE GAP", "gap", "bottom")],
    "b09_respect": [("NOT ABOUT WINNING", "winning", "bottom"), ("BOTH SIDES FEEL RESPECTED", "respected", "bottom")],
    "b10_contract_signed": [("VERBAL YES", "verbally", "bottom"), ("PURCHASE AGREEMENT", "purchase", "bottom"), ("E-SIGN", "electronically", "bottom")],
    "b11_transaction_work": [("CLOSING LOGISTICS", "logistics", "bottom")],
    "b12_sellers_remorse": [("SELLER'S REMORSE", "remorse", "bottom"), ("FEEL HEARD", "heard", "bottom")],
    "b13_deal_risks": [("FAMILY INTERFERENCE", "family", "bottom")],
    "b14_trust_beats_price": [("TRUST BEATS PRICE", "trust", "bottom")],
    "b15_your_impact": [("YOU MADE THE DEAL POSSIBLE", "possible", "bottom")],
    "b16_next_kpis": [("NEXT: KPIs & SALES TELEMETRY", "section", "bottom")],
}


def dur(path):
    return float(subprocess.check_output([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]).strip())


def word_frame(state, tag, trigger):
    words = state.get(tag, {}).get("words") or []
    needle = trigger.lower().strip('.,?!"“”$—-')
    for word in words:
        cleaned = word["word"].lower().strip('.,?!"“”$—-')
        if needle and needle in cleaned:
            return max(0, round(float(word["start"]) * FPS))
    return None


def copy_file(src, dst_dir, name):
    if not os.path.exists(src):
        return None
    os.makedirs(dst_dir, exist_ok=True)
    dst = f"{dst_dir}/{name}"
    subprocess.run(["cp", "-f", src, dst], check=True)
    return dst


def copy_hero(name):
    dst = copy_file(f"{HG}/{name}", f"{PUB}/hero", name)
    return f"lesson11A/hero/{name}" if dst else None


def copy_anim(name):
    dst = copy_file(f"{SD}/{name}", f"{PUB}/anim", name)
    if not dst:
        return None, None
    return f"lesson11A/anim/{name}", round(dur(dst) * FPS)


def tail_frame(name, tag):
    src = f"{SD}/{name}"
    if not os.path.exists(src):
        return None
    dst = f"{PUB}/stills/{tag}_tail.png"
    os.makedirs(f"{PUB}/stills", exist_ok=True)
    subprocess.run(f'ffmpeg -v error -sseof -0.06 -i "{src}" -frames:v 1 "{dst}" -y', shell=True, check=True)
    return f"lesson11A/stills/{tag}_tail.png"


for folder in ("stills", "hero", "anim"):
    os.makedirs(f"{PUB}/{folder}", exist_ok=True)

state = json.load(open(f"{HG}/_state.json"))

silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP), silence, "-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as handle:
    for index, (tag, _mode) in enumerate(BEATS):
        handle.write(f"file '{HG}/{tag}.wav'\n")
        if index < len(BEATS) - 1:
            handle.write(f"file '{silence}'\n")
subprocess.run([
    "ffmpeg",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concat_list,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    f"{PUB}/master.m4a",
    "-y",
], check=True)

missing = []
manifest = []
for index, (tag, mode) in enumerate(BEATS):
    audio_duration = dur(f"{HG}/{tag}.wav")
    frames = round((audio_duration + (GAP if index < len(BEATS) - 1 else 0)) * FPS)
    entry = {"tag": tag, "mode": mode, "durationInFrames": frames, "voFrames": round(audio_duration * FPS)}
    if tag in BADGE:
        entry["badge"] = True

    overlays = []
    last = -100
    for text, trigger, place in LABELS.get(tag, []):
        frame = word_frame(state, tag, trigger)
        if frame is None:
            frame = max(8, last + 28)
        frame = max(frame, last + 18)
        last = frame
        overlays.append({"text": text, "delay": frame, "place": place})
    if overlays:
        entry["overlays"] = overlays

    if mode == "hero":
        hero = copy_hero(HEROES[tag])
        if hero:
            entry["hero"] = hero
        else:
            missing.append(f"hero:{HEROES[tag]}")
    else:
        video, video_frames = copy_anim(VIDEO[tag])
        if video:
            entry["videos"] = [video]
            entry["videoFrames"] = [video_frames]
            tail = tail_frame(VIDEO[tag], tag)
            if tail:
                entry["still"] = tail
            else:
                missing.append(f"tail:{tag}")
        else:
            missing.append(f"anim:{VIDEO[tag]}")
    manifest.append(entry)

total = sum(beat["durationInFrames"] for beat in manifest)
output = {"fps": FPS, "beats": manifest, "audio": "lesson11A/master.m4a", "totalFrames": total}
json.dump(output, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1), "missing": missing, "totalFrames": total}, indent=1))
for entry in manifest:
    bits = [entry["tag"], f"dur={entry['durationInFrames']}f"]
    for overlay in entry.get("overlays", []):
        bits.append(f"{overlay['place']}@{overlay['delay']}f {overlay['text']}")
    print("  ".join(bits))
