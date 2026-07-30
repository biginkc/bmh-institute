#!/usr/bin/env python3
import os
"""Build Lesson 9B manifest — drill format per module-09-lesson9B-scenecards-v2-drill.md (APPROVED).
Structure: bench b01 bridge -> (seller ask -> bench Andrea answer) x5 (Q6-Q10) -> b07 close ->
b08 practice (+code tiles) -> b09 outro (split take b09a/b09b, straight cut).
- Seller clips: HeyGen native blue drifted to #67b7ee -> rekeyed onto canonical #62b3f3 (7B recipe).
- Bench clips: full-frame park-bench Andrea, own-last-frame freeze tail through the 1.0s gap.
- Labels: single bottom-center queue, word-timed from _state.json timestamps (rule 3b).
- Seller beats carry one static QUESTION N label; decoder chips (TRUST|FAIR|SIMPLE) on answer beats.
- Straight cuts everywhere; fades only at bookends (in Lesson9B.tsx).
Outputs: remotion/public/lesson9B/{clips,tails}/*, master.m4a, manifest.json."""
import json, os, subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B   = BMH_ROOT
HG  = f"{B}/course-assets/heygen/lesson9B"
PUB = f"{B}/docs/course-production/remotion/public/lesson9B"
FPS = 30; GAP = 1.0; BLUE = "62b3f3"
for d in ("clips", "tails"):
    os.makedirs(f"{PUB}/{d}", exist_ok=True)

state = json.load(open(f"{HG}/_state.json"))

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of", "default=nw=1:nk=1", p]).strip())

def word_frame(tag, trigger):
    words = state.get(tag, {}).get("words") or []
    needle = trigger.lower().strip('.,?!"“”$—-·:')
    for w in words:
        if needle and needle in w["word"].lower().strip('.,?!"“”$—-·:'):
            return max(0, round(float(w["start"]) * FPS))
    return None

def bg_hex(path):
    """sample the clip's own background blue (HeyGen drifts it per avatar/encode)."""
    return subprocess.check_output(
        f'ffmpeg -v error -ss 1 -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()

def rekey_clip(name, mode="seller"):
    """colorkey the clip's drifted blue -> canonical #62b3f3, 1600x900, muted (7B recipe).
    standing: the photo avatar renders as a pillarboxed 480x720 blue strip at x=400 with white
    bars — crop the strip, key its blue (0x5eafed sampled), scale to full height, center."""
    src, dst = f"{HG}/{name}.mp4", f"{PUB}/clips/{name}.mp4"
    if not os.path.exists(dst):
        if mode == "standing":
            fg = f'[0:v]crop=480:720:400:0,scale=600:900,format=rgb24,colorkey=0x5eafed:0.16:0.05[fg];[bg][fg]overlay=x=500:y=0:shortest=1'
        else:
            hx = bg_hex(src)
            fg = f'[0:v]scale=1600:900,format=rgb24,colorkey=0x{hx}:0.16:0.05[fg];[bg][fg]overlay=shortest=1'
        subprocess.run(
            f'ffmpeg -v error -i "{src}" -filter_complex '
            f'"color=c=0x{BLUE}:s=1600x900:r={FPS}[bg];{fg},format=yuv420p[v]" '
            f'-map "[v]" -an -c:v libx264 -crf 19 -preset medium "{dst}" -y',
            shell=True, check=True)
    return f"lesson9B/clips/{name}.mp4"

def copy_clip(name):
    src, dst = f"{HG}/{name}.mp4", f"{PUB}/clips/{name}.mp4"
    subprocess.run(["cp", "-f", src, dst], check=True)
    return f"lesson9B/clips/{name}.mp4"

def tail_png(name):
    """own-last-frame freeze tail (PLAYBOOK 11.7 — no handoff pop)."""
    dst = f"{PUB}/tails/{name}_tail.png"
    subprocess.run(f'ffmpeg -v error -sseof -0.06 -i "{PUB}/clips/{name}.mp4" -frames:v 1 "{dst}" -y',
                   shell=True, check=True)
    return f"lesson9B/tails/{name}_tail.png"

# beat spec: (tag, mode, audio wav tags, clip names, extras)
# v3 (Jarrad redlines 2026-07-10): decoder chips REMOVED; ask-beat static label = the spoken
# question verbatim; outro = standing 1A Andrea (single clip, rekeyed like the sellers).
QUESTIONS = {6: "DO I NEED TO MAKE ANY REPAIRS?", 7: "ARE THERE ANY FEES OR COMMISSIONS?",
             8: "WHAT HAPPENS AFTER I SIGN?", 9: "CAN I STAY IN THE HOUSE AFTER SELLING?",
             10: "WHAT IF I CHANGE MY MIND?"}
Q = lambda n: [(QUESTIONS[n], None)]  # static label, delay 0, holds whole beat
BEATS = [
 dict(tag="b01_bridge", mode="bench", wavs=["b01_bridge"], clips=["bench_b01_bridge"], badge=True),
 dict(tag="b02a_q6", mode="seller", wavs=["q6_seller"], clips=["q6_seller_smoke"], static=Q(6)),
 dict(tag="b02b_a06", mode="bench", wavs=["a06_answer"], clips=["bench_a06_answer"],
      labels=[("ZERO REPAIRS", "zero"), ("ANY CONDITION", "condition"), ("EXACTLY AS IT IS", "exactly")], wtag="a06_answer"),
 dict(tag="b03a_q7", mode="seller", wavs=["q7_seller"], clips=["q7_seller_smoke"], static=Q(7)),
 dict(tag="b03b_a07", mode="bench", wavs=["a07_answer"], clips=["bench_a07_answer"],
      labels=[("NO FEES", "fees"), ("NO COMMISSIONS", "commissions"), ("NO CLOSING COSTS", "costs"), ("WALK-AWAY NUMBER", "walk")], wtag="a07_answer"),
 dict(tag="b04a_q8", mode="seller", wavs=["q8_seller"], clips=["q8_seller_ask"], static=Q(8)),
 dict(tag="b04b_a08", mode="bench", wavs=["a08_answer"], clips=["bench_a08_answer"],
      labels=[("TRANSACTION TEAM TAKES IT", "transaction"), ("TITLE · INSPECTIONS · CLOSING", "title"), ("MONEY SAME DAY OR NEXT", "money")], wtag="a08_answer"),
 dict(tag="b05a_q9", mode="seller", wavs=["q9_seller"], clips=["q9_seller_ask"], static=Q(9)),
 dict(tag="b05b_a09", mode="bench", wavs=["a09_answer"], clips=["bench_a09_answer"],
      labels=[("SOMETHING WE CAN DISCUSS", "discuss"), ("LEASEBACK", "leaseback"), ("ACQUISITION WORKS OUT DETAILS", "acquisition")], wtag="a09_answer"),
 dict(tag="b06a_q10", mode="seller", wavs=["q10_seller"], clips=["q10_seller_ask"], static=Q(10)),
 dict(tag="b06b_a10", mode="bench", wavs=["a10_answer"], clips=["bench_a10_answer"],
      labels=[("INSPECTION PERIOD BUILT IN", "inspection"), ("NOT FINAL UNTIL COMFORTABLE", "final"), ("REDUCE THE FEAR", "reduce")], wtag="a10_answer"),
 dict(tag="b07_close", mode="bench", wavs=["b07_close"], clips=["bench_b07_close"],
      labels=[("NOT PERFORMING", "performing"), ("REAL PERSON", "person"), ("CLEARLY AND HONESTLY", "clearly")], wtag="b07_close"),
 dict(tag="b08_practice", mode="bench", wavs=["b08_practice"], clips=["bench_b08_practice"], tiles=True,
      labels=[("SAY IT OUT LOUD", "loud"), ("DON'T HESITATE", "hesitate")], wtag="b08_practice"),
 dict(tag="b09_outro", mode="standing", wavs=["b09_outro"], clips=["outro_1a_standing"],
      labels=[("NEXT: FOLLOW-UP GAME", "follow-up")], wtag="b09_outro"),
]
TILE_TRIGGERS = [("CAR", "car"), ("HOME", "dog"), ("MIRROR", "mirror"), ("LIVE CALL", "live")]

# Seller wavs carry a 2.5s generation apad (so the avatar holds after the line). Leaving it in
# creates ~4s of dead air per question (v1 QC finding). Trim each seller wav to line end + 0.7s
# hold — the pad is pure silence, so this is lossless.
SELLER_HOLD = 0.7
def seller_wav(w):
    raw = dur(f"{HG}/{w}_raw.wav")
    out = f"{PUB}/{w}_cut.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-i", f"{HG}/{w}.wav", "-t", f"{raw + SELLER_HOLD:.3f}",
                    out, "-y"], check=True)
    return out

# master audio: per-beat wavs (b09 = a+b back to back) + 1.0s gap after every beat
# (trailing gap on b09 = the end hold the fade-out runs over).
sil = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                "-t", str(GAP), sil, "-y"], check=True)
for b in BEATS:
    if b["mode"] == "seller":
        b["wav_paths"] = [seller_wav(w) for w in b["wavs"]]
    else:
        b["wav_paths"] = [f"{HG}/{w}.wav" for w in b["wavs"]]
cl = f"{PUB}/_concat.txt"
with open(cl, "w") as f:
    for b in BEATS:
        for p in b["wav_paths"]:
            f.write(f"file '{p}'\n")
        f.write(f"file '{sil}'\n")
subprocess.run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", cl,
                "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"], check=True)

manifest = []
for b in BEATS:
    vo = sum(dur(p) for p in b["wav_paths"])
    frames = round((vo + GAP) * FPS)
    e = {"tag": b["tag"], "mode": b["mode"], "durationInFrames": frames, "voFrames": round(vo * FPS)}
    if b.get("badge"): e["badge"] = True
    if b.get("tiles"):
        tiles, last = [], -100
        for text, trig in TILE_TRIGGERS:
            wf = word_frame(b["wtag"], trig)
            if wf is None: wf = max(8, last + 24)
            wf = max(wf, last + 12); last = wf
            tiles.append({"text": text, "delay": wf})
        e["tiles"] = tiles
    clips, lens = [], []
    for name in b["clips"]:
        ref = rekey_clip(name, b["mode"]) if b["mode"] in ("seller", "standing") else copy_clip(name)
        clips.append(ref)
        lens.append(round(dur(f"{PUB}/clips/{name}.mp4") * FPS))
    e["clips"] = clips; e["clipFrames"] = lens
    e["tail"] = tail_png(b["clips"][-1])

    overlays, last = [], -100
    if b.get("static"):
        overlays = [{"text": t, "delay": 0, "hold": True} for t, _ in b["static"]]
    else:
        for text, trig in b.get("labels", []):
            wf = word_frame(b["wtag"], trig)
            if wf is None: wf = max(8, last + 28)
            wf = max(wf, last + 18); last = wf
            overlays.append({"text": text, "delay": wf})
    if overlays: e["overlays"] = overlays
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
json.dump({"fps": FPS, "beats": manifest, "audio": "lesson9B/master.m4a", "totalFrames": total},
          open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1)}, indent=1))
for e in manifest:
    bits = [e["tag"], f"{e['durationInFrames']}f"]
    for o in e.get("overlays", []): bits.append(f"@{o['delay']} {o['text']}")
    for t in e.get("tiles", []): bits.append(f"tile@{t['delay']} {t['text']}")
    print("  ".join(str(x) for x in bits))
