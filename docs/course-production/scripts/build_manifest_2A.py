#!/usr/bin/env python3
import os
"""Build Lesson 2A manifest (Module 02 "Who Sells to Us") — near-verbatim Chapter 2A, 21 beats.
audio = master clock + 1.5s inter-beat gaps. Office-Andrea bookends + mid (b17 full-body + labels).
Modes: hero|herolabels|grid|scene|vs|anim|cascade|card. Anim clips → alpha ProRes; missing → fallback."""
import json, os, subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson2A"
SCN = f"{B}/course-assets/scenes/module-02"
PUB = f"{B}/docs/course-production/remotion/public/lesson2A"
FPS = 30
BLUE = "0x62b3f3"
GAP = 0.9

# tag, mode, still, still2, anim, hero, badge
BEATS = [
 ("b01_intro",        "hero",       None, None, None, "hero_b01_intro.mp4", True),  # merged b01+b02 (Rev7), 1A avatar
 ("b03_situations",   "grid",       None, None, None, None, False),
 ("b04_inherited",    "scene",      "m02_L2A_grid1_inherited.png", None, None, None, False),
 ("b05_financial",    "scene",      "m02_L2A_grid5_payments.png", None, None, None, False),
 ("b06_landlord",     "scene",      "m02_L2A_grid2_landlord.png", None, None, None, False),
 ("b07_condition",    "anim",       "m02_L2A_b03_profile.png", None, "anim_b03_profile.mp4", None, False),
 ("b08_divorce",      "scene",      "m02_L2A_grid3_divorce.png", None, None, None, False),
 ("b09_life",         "scene",      "m02_L2A_grid4_relocating.png", None, None, None, False),
 ("b10_outofstate",   "scene",      "m02_L2A_b10_outofstate.png", None, None, None, False),
 ("b11_vs",           "vs",         "m02_L2A_b12_motivated_stand.png", "m02_L2A_b13_curious_stand.png", None, None, False),
 ("b12_motivated",    "scene",      "m02_L2A_b12_motivated_stand.png", None, None, None, False),
 ("b13_unmotivated",  "scene",      "m02_L2A_b13_curious_stand.png", None, None, None, False),
 ("b14_notobvious",   "scene",      "m02_L2A_b14_overshoulder.png", None, None, None, False),
 ("b15_phrases",      "cascade",    None, None, None, None, False),
 ("b16_writedown",    "scene",      "m02_L2A_b16_notes.png", None, None, None, False),
 ("b17_disqualifiers","herolabels", None, None, None, "hero_b17_disqualifiers.mp4", False),
 ("b18_empathy",      "anim",       "m02_L2A_b18_angrycaller.png", None, "anim_b18_angrycaller.mp4", None, False),
 ("b19_different",    "hero",       None, None, None, "hero_b19_different.mp4", False),
 ("b20_trust",        "scene",      "m02_L2A_b20_handshake.png", None, None, None, False),
 ("b21_outro",        "hero",       None, None, None, "hero_b21_outro.mp4", False),
]

GRID = [f"m02_L2A_grid{i}_{n}.png" for i,n in
        [(1,"inherited"),(2,"landlord"),(3,"divorce"),(4,"relocating"),(5,"payments"),(6,"repairs")]]

# single word-timed label over a scene: tag -> (text, trigger)
LABELS = {
 "b04_inherited":   ("INHERITED PROPERTY", "Inherited"),
 "b05_financial":   ("FINANCIAL PRESSURE", "Financial"),
 "b06_landlord":    ("TIRED LANDLORD", "Tired"),
 "b07_condition":   ("PROPERTY CONDITION", "Property"),
 "b08_divorce":     ("DIVORCE", "Divorce"),
 "b09_life":        ("LIFE HAPPENS", "happens"),
 "b10_outofstate":  ("OUT-OF-STATE OWNER", "state"),
 "b12_motivated":   ("MOTIVATED", "motivated"),
 "b13_unmotivated": ("JUST CURIOUS", "exploring"),
 "b14_notobvious":  ("NOT ALWAYS OBVIOUS", "obvious"),
 "b20_trust":       ("THEY TRUST US", "trust"),
}
VS_TRIGGER = ("b11_vs", "curious")
CASCADE = {
 "b15_phrases": [
   ("“I inherited this house”", "inherited"),
   ("“I can’t afford to fix it up”", "afford"),
   ("“I’m behind on payments”", "behind"),
   ("“My tenants trashed the place”", "tenants"),
   ("“Going through a divorce”", "divorce"),
   ("“I need to sell fast”", "fast"),
 ],
 "b17_disqualifiers": [
   ("Listed with a Realtor", "Realtor"),
   ("Not the owner", "owner"),
   ("No equity", "equity"),
   ("Commercial or vacant", "commercial"),
 ],
}

# beats whose anim is >1 chained clip (multi-shot, span the narration) — plays in sequence
MULTI_ANIM = {"b18_empathy": ["anim_b18_angrycaller_1.mp4", "anim_b18_angrycaller_2.mp4"]}

def word_frame(tag, trigger, which="first"):
    words = state.get(tag, {}).get("words") or []
    t = trigger.lower().strip('.,?!"“”')
    hits = [w["start"] for w in words if t in w["word"].lower().strip('.,?!"“”')]
    if not hits: return None
    t0 = hits[-1] if which == "last" else hits[0]
    return max(0, round(t0 * FPS))

def dur(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1", p]).strip())

for d_ in ("stills","hero","anim","circle"):
    os.makedirs(f"{PUB}/{d_}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# 1. master audio with inter-beat gaps — SHORT gap after hero/Andrea beats (no frozen-avatar hold), normal elsewhere
GAP_HERO = 0.25
def gap_after(mode, i):
    if i >= len(BEATS)-1: return 0.0
    return GAP_HERO if mode in ("hero", "herolabels") else GAP
silence = f"{PUB}/_gap.wav"; silence_hero = f"{PUB}/_gap_hero.wav"
subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(GAP), silence,"-y"], check=True)
subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(GAP_HERO), silence_hero,"-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i,(tag, mode, *_ ) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS)-1:
            f.write(f"file '{silence_hero if mode in ('hero','herolabels') else silence}'\n")
subprocess.run(["ffmpeg","-v","error","-f","concat","-safe","0","-i",concat_list,
    "-c:a","aac","-b:a","192k", f"{PUB}/master.m4a","-y"], check=True)

def bg_hex(path):
    return subprocess.check_output(
        f'ffmpeg -v error -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()

def normalize(src_name):
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp): return None
    bgc = bg_hex(sp); dst = f"{PUB}/stills/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y', shell=True, check=True)
    return f"lesson2A/stills/{src_name}"

def _sample(sp, x, y):
    return subprocess.check_output(
        f'ffmpeg -v error -ss 1 -i "{sp}" -vf "crop=8:8:{x}:{y},scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()

def rekey_hero(name, pillar=False):
    """Key the HeyGen avatar clip's background to ALPHA (ProRes 4444) so Remotion's code owns the
    canonical blue (PLAYBOOK: alpha hero recipe). Office clip (b01) = single wall-blue key. The 1A
    headset clips render Andrea as a portrait with lighter pillarbox side bars over a HeyGen-blue
    panel — pillar=True keys BOTH (corner bar color + center-top panel blue) so only Andrea survives."""
    sp = f"{HG}/{name}"
    if not os.path.exists(sp): return None
    dst_name = name.replace(".mp4", ".mov"); dst = f"{PUB}/hero/{dst_name}"
    if pillar:
        # crop OUT the pillarbox bars (keep the center portrait), key the HeyGen panel blue, then pad
        # back to full width with TRANSPARENT so only Andrea remains on the code blue.
        panel = _sample(sp, 636, 8)
        # crop tight INSIDE the pillarbox bars (bars end ~x400 / start ~x880 in the 1280 clip) so no bar
        # slivers survive; Andrea (~x490–790) is safely kept. Then key panel blue + pad transparent.
        vf = (f'[0:v]crop=440:720:420:0,scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
              f'colorkey=0x{panel}:0.16:0.06,format=rgba,pad=1280:720:420:0:color=0x00000000[v]')
    else:
        bar = _sample(sp, 16, 16)             # office wall blue
        vf = (f'[0:v]scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
              f'colorkey=0x{bar}:0.12:0.05,format=rgba[v]')
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -filter_complex "{vf}" '
        f'-map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
        shell=True, check=True)
    return f"lesson2A/hero/{dst_name}"

def rekey_clip(name):
    sp = f"{HG}/anim/{name}"
    if not os.path.exists(sp): return None, None
    bgc = bg_hex(sp); dst_name = name.replace(".mp4",".mov"); dst = f"{PUB}/anim/{dst_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -filter_complex '
        f'"[0:v]scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
        f'colorkey=0x{bgc}:0.15:0.02,format=rgba[v]" -map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
        shell=True, check=True)
    return f"lesson2A/anim/{dst_name}", round(dur(dst)*FPS)

grid_norm = [normalize(g) for g in GRID]
missing = [GRID[i] for i,g in enumerate(grid_norm) if g is None]

manifest = []
for i,(tag, mode, still, still2, anim, hero, badge) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    frames = round((d + gap_after(mode, i)) * FPS)
    e = {"tag": tag, "mode": mode, "durationInFrames": frames, "voFrames": round(d*FPS)}
    if badge: e["badge"] = True
    if tag in LABELS:
        text, trig = LABELS[tag]; e["label"] = text
        # b16 "write it down" trigger lands late in its VO — pin it early so the card isn't blank
        e["labelDelay"] = 8 if tag == "b16_writedown" else (word_frame(tag, trig) or 8)
        # b12/b13 standing figures look UP at the label → render it at the TOP, not over the head
        if tag in ("b12_motivated", "b13_unmotivated"): e["labelTop"] = True
    if mode == "grid":
        e["grid"] = [g for g in grid_norm if g]
    if mode == "vs":
        sw = word_frame(VS_TRIGGER[0], VS_TRIGGER[1]); e["extras"] = {"fork": sw if sw is not None else round(d*FPS*0.5)}
    if tag in CASCADE:
        e["labels"] = [{"text": t, "delay": (word_frame(tag, trig) or (8 + k*22))} for k,(t,trig) in enumerate(CASCADE[tag])]
    if hero:
        # 1A clips render Andrea on TWO close cornflower blues (avatar panel + HeyGen bg fill). Andrea has
        # NO blue, so KEY the blue → alpha and let Remotion composite on the exact code #62b3f3 → one uniform
        # blue, no seam, white face safe. (Keying WHITE ate her face = smurf; keying BLUE can't touch her.)
        src = f"{HG}/{hero}"
        if os.path.exists(src):
            bar = _sample(src, 10, 360)  # side-bar (bg fill) blue; sim 0.16 also catches the panel blue
            dst_name = hero.replace(".mp4", ".mov"); dst = f"{PUB}/hero/{dst_name}"
            subprocess.run(
                f'ffmpeg -v error -i "{src}" -filter_complex '
                f'"[0:v]colorkey=0x{bar}:0.16:0.06,format=rgba[v]" '
                f'-map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
                shell=True, check=True)
            e["hero"] = f"lesson2A/hero/{dst_name}"
        else:
            missing.append(f"hero:{tag}")
            if mode == "herolabels": e["mode"] = "cascade"   # labels still show on blue until clip lands
    if anim:
        names = MULTI_ANIM.get(tag, [anim])
        vids, frs = [], []
        for nm in names:
            r, nfr = rekey_clip(nm)
            if r: vids.append(r); frs.append(nfr)
        if vids:
            e["videos"] = vids; e["videoFrames"] = frs
        else:
            e["mode"] = "scene"; missing.append(f"anim:{anim} (fell back to scene)")
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
out = {"fps": FPS, "beats": manifest, "audio": "lesson2A/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total/FPS,1), "missing": missing}, indent=1))
