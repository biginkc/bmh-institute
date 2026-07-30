#!/usr/bin/env python3
import os
"""Build Lesson 3A manifest ("BMH Offer Playbook A") — verbatim master Slot 05-A, 18 beats.
audio = master clock + 1.0s inter-beat gaps (PLAYBOOK 7.14). Office-Andrea hero bookends.
Modes: hero | panel | wand | roadmap. All text = code white-card Stickers (positioned/word-timed).
Stills normalized to canonical blue at ingest. Zero Seedance (all code motion)."""
import json, os, subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson3A"
SCN = f"{B}/course-assets/scenes/module-03"
PUB = f"{B}/docs/course-production/remotion/public/lesson3A"
FPS = 30
BLUE = "0x62b3f3"
GAP = 1.0

state = json.load(open(f"{HG}/_state.json"))


def word_frame(tag, trigger, which="first", fallback=8):
    words = state.get(tag, {}).get("words") or []
    t = trigger.lower().strip('.,?!"“”$')
    hits = [w["start"] for w in words if t in w["word"].lower().strip('.,?!"“”$')]
    if not hits:
        return fallback
    t0 = hits[-1] if which == "last" else hits[0]
    return max(0, round(t0 * FPS))


def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", p]).strip())


def bg_hex(path):
    return subprocess.check_output(
        f'ffmpeg -v error -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()


def normalize(src_name):
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp):
        return None
    bgc = bg_hex(sp); dst = f"{PUB}/stills/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y', shell=True, check=True)
    return f"lesson3A/stills/{src_name}"


# --- beat table: tag, mode, still, house1, house2, hero, badge, step, push ---
BEATS = [
 ("b01_intro",       "hero",    None, None, None, "hero_b01_intro.mp4", True,  None, False),
 ("b02_offer-core",  "panel",   "m03_L3A_family-driveway.png", None, None, None, False, None, False),
 ("b03_cash",        "panel",   "m03_L3A_handshake.png", None, None, None, False, None, True),
 ("b04_asis",        "wand",    "m03_L3A_rep-wand.png", "m03_L3A_house-disrepair.png", "m03_L3A_house-restored.png", None, False, None, False),
 ("b05_commissions", "video",   "m03_L3A_devil-agent.png", None, None, None, False, None, False),
 ("b06_speed",       "panel",   "m03_L3A_clock-kick.png", None, None, None, False, None, False),
 ("b07_step1",       "roadmap", "m03_L3A_steps-board.png", None, None, None, False, 1, False),
 ("b08_step2",       "roadmap", "m03_L3A_steps-board.png", None, None, None, False, 2, False),
 ("b09_step3",       "roadmap", "m03_L3A_steps-board.png", None, None, None, False, 3, False),
 ("b10_step4",       "roadmap", "m03_L3A_steps-board.png", None, None, None, False, 4, False),
 ("b11_foursteps",   "roadmap", "m03_L3A_steps-board.png", None, None, None, False, 0, False),
 ("b12_honest",      "video",   None, None, None, None, False, None, False),
 ("b13_whychoose",   "panel",   None, None, None, None, False, None, False),
 ("b14_tradeoff",    "panel",   "m03_L3A_peace.png", None, None, None, False, None, True),
 ("b15_dealmath",    "board",   "m03_L3A_whiteboard.png", None, None, None, False, None, False),
 ("b16_example",     "board",   "m03_L3A_whiteboard.png", None, None, None, False, None, False),
 ("b17_answer",      "hero",    None, None, None, "hero_b17_answer.mp4", False, None, False),
 ("b18_outro",       "hero",    None, None, None, "hero_b18_outro.mp4", False, None, False),
]

# single bottom-center word-timed label: tag -> (text, trigger)
LABELS = {
 "b03_cash":      ("CERTAINTY", "certainty"),
 "b04_asis":      ("SOLD AS-IS — ANY CONDITION", "fix"),
 "b05_commissions": ("NO COMMISSIONS", "commissions"),
 "b12_honest":    ("BELOW RETAIL — WE TAKE ON THE RISK", "below"),
 "b14_tradeoff":  ("SPEED + PEACE OF MIND", "peace"),
 "b07_step1":     ("1  ·  WE TALK", "talk"),
 "b08_step2":     ("2  ·  WE LOOK", "look"),
 "b09_step3":     ("3  ·  WE OFFER", "offer"),
 "b10_step4":     ("4  ·  WE CLOSE", "close"),
 "b11_foursteps": ("FOUR STEPS", "Four"),
}

# positioned word-timed sticker arrays: tag -> [(text, trigger, top, left, bg)]
STICKERS = {
 "b02_offer-core": [
   ("CASH",          "cash",        110, 140,  "yellow"),
   ("AS-IS",         "as-is",       110, 1210, "white"),
   ("NO REPAIRS",    "repairs",     360, 110,  "white"),
   ("NO AGENTS",     "agents",      360, 1210, "white"),
   ("NO COMMISSIONS","commissions", 720, 110,  "white"),
   ("NO WAITING",    "waiting",     720, 1180, "white"),
 ],
 "b06_speed": [
   ("60–90 DAYS", "90",  120, 150,  "white"),
   ("1–2 WEEKS",  "two", 650, 1050, "yellow"),
 ],
 "b13_whychoose": [
   ("SPEED",       "Speed",       410, 150,  "white"),
   ("SIMPLICITY",  "Simplicity",  320, 520,  "white"),
   ("CERTAINTY",   "Certainty",   320, 900,  "white"),
   ("CONVENIENCE", "convenience", 410, 1220, "white"),
 ],
}
# b15/b16 deal-math = INK text written INSIDE the whiteboard (board white area ≈ x455-1155, y195-640)
# tuple: (text, trigger, top, left, size)
BOARD = {
 "b15_dealmath": [
   ("ARV  (fixed-up value)", "value",  210, 500, 54),
   ("−  Repairs",            "costs",  305, 500, 54),
   ("−  Our margin",         "margin", 400, 500, 54),
   ("=  YOUR OFFER",         "number", 495, 500, 60),  # "offer" is spoken before "margin"; trigger on "number" for top-to-bottom order
 ],
 "b16_example": [
   ("ARV                $200,000", "200",   210, 500, 50),
   ("−  Repairs         $50,000",  "50",    305, 500, 50),
   ("−  Our costs",                "costs", 400, 500, 50),
   ("=  $100K – $110K offer",      "100",   495, 500, 56),
 ],
}
# b17 answer caption (word-timed to the modeled line)
ANSWER_CAPTION = ("“…for cash. No repairs, no commissions — close on your timeline.”", "cash")
# animation clips (present after Stage-5 gen; else the beat falls back to its still)
CLIPS = {
 "b04_asis":      f"{HG}/anim/anim_b04_wand.mp4",     # rep waving the wand (clipped left in WandBeat)
 "b05_commissions": f"{HG}/anim/anim_b05_devil.mp4",  # greedy devil agent (video beat)
 "b12_honest":    f"{HG}/anim/b12_A_seedance-walk.mp4", # walk-and-talk shot 1 (side) — Jarrad picked cand A
}
# b12 = a 2-shot cut: side-view (A) then an aerial shot, filling the beat (multi-shot)
B12_SHOTS = [f"{HG}/anim/b12_A_seedance-walk.mp4", f"{HG}/anim/b12_aerial.mp4"]
B12_CLIP = CLIPS["b12_honest"]


def vid_bg_hex(path):
    return subprocess.check_output(
        f'ffmpeg -v error -ss 0.15 -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()


def alpha_key(src, dst_name):
    """Key the clip's flat-blue field to ALPHA (prores 4444) so the code owns the blue and the
    character composites over the canonical field with no seam / no blue-jump (PLAYBOOK 7.11)."""
    os.makedirs(f"{PUB}/anim", exist_ok=True)
    bgc = vid_bg_hex(src)
    dst = f"{PUB}/anim/{dst_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{src}" -filter_complex '
        f'"[0:v]scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
        f'colorkey=0x{bgc}:0.16:0.05,format=rgba[v]" -map "[v]" -c:v prores_ks -profile:v 4444 '
        f'-pix_fmt yuva444p10le -an "{dst}" -y', shell=True, check=True)
    return f"lesson3A/anim/{dst_name}", round(dur(dst) * FPS)


os.makedirs(f"{PUB}/stills", exist_ok=True)
os.makedirs(f"{PUB}/hero", exist_ok=True)

# 1. master audio with 1.0s inter-beat gaps
silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(GAP), silence, "-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i, b in enumerate(BEATS):
        f.write(f"file '{HG}/{b[0]}.wav'\n")
        if i < len(BEATS) - 1:
            f.write(f"file '{silence}'\n")
subprocess.run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", concat_list,
    "-c:a", "aac", "-b:a", "192k", f"{PUB}/master.m4a", "-y"], check=True)

missing = []
manifest = []
for i, (tag, mode, still, house1, house2, hero, badge, step, push) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    frames = round((d + (GAP if i < len(BEATS) - 1 else 0)) * FPS)
    e = {"tag": tag, "mode": mode, "durationInFrames": frames}
    if badge:
        e["badge"] = True
    if push:
        e["push"] = True
    if step is not None:
        e["step"] = step
    if tag in LABELS:
        text, trig = LABELS[tag]
        e["label"] = text
        e["labelDelay"] = word_frame(tag, trig)
    if tag in STICKERS:
        e["stickers"] = [{"text": t, "delay": word_frame(tag, trig, fallback=8 + k * 20),
                          "top": top, "left": left, "bg": bg}
                         for k, (t, trig, top, left, bg) in enumerate(STICKERS[tag])]
    if tag == "b17_answer":
        txt, trig = ANSWER_CAPTION
        e["stickers"] = [{"text": txt, "delay": word_frame(tag, trig, which="last"),
                          "role": "caption", "bg": "white", "bottomCenter": True}]
    if tag in BOARD:
        e["boardLines"] = [{"text": t, "delay": word_frame(tag, trig, fallback=8 + k * 22),
                            "top": top, "left": left, "size": size}
                           for k, (t, trig, top, left, size) in enumerate(BOARD[tag])]
    if mode == "wand":
        clip = CLIPS.get(tag)
        if clip and os.path.exists(clip):
            # ALPHA-key the rep so it composites over the canonical house field with no seam
            r, nfr = alpha_key(clip, "anim_b04_wand.mov")
            e["videos"] = [r]; e["videoFrames"] = [nfr]; e["alpha"] = True
            e["transformFrame"] = 62  # measured: her first wand-cast (sparkles) ~frame 50-70; sync the flash+crossfade here
        else:
            e["transformFrame"] = word_frame(tag, "handle", fallback=round(d * FPS * 0.45))
            missing.append("b04 wand clip (static rep, code transform only)")
    if mode == "video":
        clip = CLIPS.get(tag)
        if clip and os.path.exists(clip):
            if tag == "b05_commissions":
                # ALPHA-key the 2 characters → canonical field; clamped, so tail = the devil still
                r, nfr = alpha_key(clip, "anim_b05_devil.mov")
                e["videos"] = [r]; e["videoFrames"] = [nfr]; e["alpha"] = True
            else:  # b12 = 2-shot walk (side A → aerial), opaque scenes, filling the beat
                os.makedirs(f"{PUB}/anim", exist_ok=True)
                vids = []; vfr = []; acc = 0
                present = [s for s in B12_SHOTS if os.path.exists(s)]
                for si, sc in enumerate(present):
                    base = f"b12_shot{si + 1}.mp4"; dst = f"{PUB}/anim/{base}"
                    subprocess.run(["cp", "-f", sc, dst], check=True)
                    full = round(dur(dst) * FPS)
                    use = full if si < len(present) - 1 else min(full, max(1, frames - acc))
                    vids.append(f"lesson3A/anim/{base}"); vfr.append(use); acc += use
                e["videos"] = vids; e["videoFrames"] = vfr
                if acc < frames and vids:  # shots don't fill the beat → hold the last shot's final frame
                    tail = f"{PUB}/stills/m03_L3A_b12_tail.png"
                    subprocess.run(f'ffmpeg -v error -sseof -0.08 -i "{PUB}/anim/{os.path.basename(vids[-1])}" -frames:v 1 "{tail}" -y', shell=True, check=True)
                    e["still"] = "lesson3A/stills/m03_L3A_b12_tail.png"
        else:
            e["mode"] = "panel"  # fallback: the still holds until the clip lands
            if tag == "b12_honest":
                r = normalize("m03_L3A_walktalk.png")
                if r:
                    e["still"] = r
            missing.append(f"{tag} clip (fell back to still)")
    if hero:
        src = f"{HG}/{hero}"
        if os.path.exists(src):
            if tag == "b17_answer":
                # headset avatar is pillarboxed portrait → crop bars + alpha-key the cornflower bg
                # (content x400-879, bg ≈ 0x5daeec) so Andrea composites clean on the canonical field
                dst = f"{PUB}/hero/hero_b17_answer.mov"
                subprocess.run(
                    f'ffmpeg -v error -i "{src}" -filter_complex '
                    f'"[0:v]crop=480:720:400:0,scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
                    f'colorkey=0x5daeec:0.16:0.07,format=rgba[v]" -map "[v]" -c:v prores_ks -profile:v 4444 '
                    f'-pix_fmt yuva444p10le -an "{dst}" -y', shell=True, check=True)
                e["hero"] = "lesson3A/hero/hero_b17_answer.mov"; e["alpha"] = True
            else:
                subprocess.run(["cp", "-f", src, f"{PUB}/hero/{hero}"], check=True)
                e["hero"] = f"lesson3A/hero/{hero}"
        else:
            missing.append(f"hero:{tag}")
    for fld, name in (("still", still), ("house1", house1), ("house2", house2)):
        if name:
            r = normalize(name)
            if r:
                e[fld] = r
            else:
                missing.append(f"{fld}:{name}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lesson3A/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json", "w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total / FPS, 1), "missing": missing}, indent=1))
