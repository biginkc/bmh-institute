#!/usr/bin/env python3
import os
"""Lesson 7B manifest — 32 objection drills, theme-grouped under the 6 approved dividers.
Structure:  intro(hero) -> yourturn(hero) -> [ for each of 6 themes: theme_card -> (seller -> comeback) x drills ]
            -> summary(hero) -> outro(hero).
Each drill = SHOT A seller clip (25s, spoken line then held silence, recomposited onto canonical blue)
             SHOT B cafe-Andrea comeback clip.
Single master audio track (2B pattern); all video muted. Seller blue normalized to #62b3f3 so slide
transitions between cards/sellers/Andrea are seamless.
Outputs: remotion/public/lesson7B/{clips,hero,stills}/*, master.m4a, manifest.json.
Never touches lesson7A / module-07 assets.
"""
import json, os, subprocess, pathlib

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
B   = BMH_ROOT
HG  = f"{B}/course-assets/heygen/lesson7B"
SCN = f"{B}/course-assets/scenes/module-07-lesson7B"
PUB = f"{B}/docs/course-production/remotion/public/lesson7B"
FPS = 30; BLUE = "62b3f3"; GAP = 0.35; THEME_HOLD = 1.0
for d in ("clips","hero","stills"): os.makedirs(f"{PUB}/{d}", exist_ok=True)

state = json.load(open(f"{HG}/_state.json"))

# ---- drill -> theme (from lesson-7B-script-clean.txt), theme render order ----
DRILL_THEME = {1:"price",2:"price",3:"competition",4:"competition",5:"delay",6:"trust",7:"delay",
 8:"trust",9:"trust",10:"trust",11:"asis",12:"delay",13:"competition",14:"competition",15:"competition",
 16:"asis",17:"trust",18:"trust",19:"asis",20:"distress",21:"distress",22:"distress",23:"distress",
 24:"price",25:"distress",26:"trust",27:"trust",28:"trust",29:"price",30:"asis",31:"delay",32:"trust"}
THEME_ORDER = [("price","Price"),("competition","Competition"),("delay","Delay"),
               ("trust","Trust"),("asis","As-Is"),("distress","Distress")]

def dur(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=nw=1:nk=1", p]).strip())
def bg_hex(path):
    return subprocess.check_output(
        f'ffmpeg -v error -ss 1 -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()

def recomposite_seller(tag):
    """colorkey the seller's actual blue -> overlay on canonical #62b3f3, scale 1600x900, muted."""
    src = f"{HG}/{tag}.mp4"
    if not os.path.exists(src): return None
    hx = bg_hex(src); dst = f"{PUB}/clips/{tag}.mp4"
    subprocess.run(
        f'ffmpeg -v error -i "{src}" -filter_complex '
        f'"color=c=0x{BLUE}:s=1600x900:r={FPS}[bg];'
        f'[0:v]scale=1600:900,format=rgb24,colorkey=0x{hx}:0.16:0.05[fg];'
        f'[bg][fg]overlay=shortest=1,format=yuv420p[v]" '
        f'-map "[v]" -an -c:v libx264 -crf 19 -preset medium "{dst}" -y',
        shell=True, check=True)
    return f"lesson7B/clips/{tag}.mp4"

def copy_hero(name):
    src=f"{HG}/{name}"
    if not os.path.exists(src): return None
    subprocess.run(["cp","-f",src,f"{PUB}/hero/{name}"],check=True); return f"lesson7B/hero/{name}"
def copy_still(name):
    src=f"{SCN}/{name}"
    if not os.path.exists(src): return None
    subprocess.run(["cp","-f",src,f"{PUB}/stills/{name}"],check=True); return f"lesson7B/stills/{name}"

# ---- assemble beat list: (tag, mode, audio_wavtag|None, video_builder_result, extra) ----
BEATS = []   # each: dict with tag, mode, audioTag(for master), asset info, durationSec
def add(tag, mode, audio_tag, **kw):
    BEATS.append({"tag":tag,"mode":mode,"audioTag":audio_tag, **kw})

add("intro","hero","b01_intro", hero=copy_hero("hero_intro.mp4"), badge=True)
add("yourturn","hero","b02_yourturn", hero=copy_hero("hero_yourturn.mp4"))
for key,label in THEME_ORDER:
    add(f"theme_{key}","theme",f"t_{key}", still=copy_still(f"m07_L7B_theme_{key}.png"), holdSec=THEME_HOLD, label=label)
    drills=[n for n in range(1,33) if DRILL_THEME[n]==key]
    for n in drills:
        sTag=f"d{n:02d}_seller"; cTag=f"d{n:02d}_comeback"
        rawline = dur(f"{HG}/{sTag}_raw.wav") if os.path.exists(f"{HG}/{sTag}_raw.wav") else 2.0
        add(sTag,"seller",sTag, clip=recomposite_seller(sTag), lineEndSec=rawline, drill=n)
        add(cTag,"hero",cTag, hero=copy_hero(f"cb{n:02d}.mp4"))
add("summary","hero","b_summary", hero=copy_hero("hero_summary.mp4"))
# TAIL PAD (v5 fix, 2026-07-10): the master concat runs ~0.38s LONGER than the manifest's frame total
# (banker's rounding on the many exactly-25.0s seller beats loses 0.5 frame each, so video ends before
# the audio does). With noTrailGap alone the outro had ZERO slack, so the render clipped the last ~90ms
# of "Let's build on it." Pad 0.75s of silence + video hold after the outro so the final word always
# survives the drift. Only this beat's duration changes — all other beats stay identical to v4.
add("outro","hero","b_outro", hero=copy_hero("hero_outro.mp4"), noTrailGap=True, tailPadSec=0.75)

# ---- master audio: concat each beat's wav (theme cards get their VO + a hold) + inter-beat gap ----
sil=f"{PUB}/_gap.wav"; subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(GAP),sil,"-y"],check=True)
hold_sil=f"{PUB}/_hold.wav"; subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(THEME_HOLD),hold_sil,"-y"],check=True)
tail_sil=f"{PUB}/_tailpad.wav"; subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t","0.75",tail_sil,"-y"],check=True)
cl=f"{PUB}/_concat.txt"
with open(cl,"w") as f:
    for i,b in enumerate(BEATS):
        f.write(f"file '{HG}/{b['audioTag']}.wav'\n")
        if b["mode"]=="theme": f.write(f"file '{hold_sil}'\n")
        if b.get("tailPadSec"): f.write(f"file '{tail_sil}'\n")
        if not b.get("noTrailGap"): f.write(f"file '{sil}'\n")
subprocess.run(["ffmpeg","-v","error","-f","concat","-safe","0","-i",cl,"-c:a","aac","-b:a","192k",f"{PUB}/master.m4a","-y"],check=True)

# ---- emit manifest ----
manifest=[]; missing=[]
for i,b in enumerate(BEATS):
    if b["mode"]=="theme": segsec=dur(f'{HG}/{b["audioTag"]}.wav') + b["holdSec"]
    else: segsec=dur(f'{HG}/{b["audioTag"]}.wav')
    segsec += b.get("tailPadSec", 0)
    trail = 0 if b.get("noTrailGap") else GAP
    frames=round((segsec+trail)*FPS)
    e={"tag":b["tag"],"mode":b["mode"],"durationInFrames":frames}
    if b.get("badge"): e["badge"]=True
    if b["mode"]=="hero":
        if b.get("hero"): e["hero"]=b["hero"]
        else: missing.append(f"hero:{b['tag']}")
    elif b["mode"]=="seller":
        if b.get("clip"): e["clip"]=b["clip"]
        else: missing.append(f"clip:{b['tag']}")
        e["lineEnd"]=round(b["lineEndSec"]*FPS); e["drill"]=b["drill"]
    elif b["mode"]=="theme":
        if b.get("still"): e["still"]=b["still"]
        else: missing.append(f"still:{b['tag']}")
        e["label"]=b["label"]
    manifest.append(e)
total=sum(b["durationInFrames"] for b in manifest)
json.dump({"fps":FPS,"beats":manifest,"audio":"lesson7B/master.m4a","totalFrames":total},
          open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats":len(manifest),"totalMin":round(total/FPS/60,2),"missing":missing},indent=1))
