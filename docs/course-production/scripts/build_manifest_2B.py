#!/usr/bin/env python3
import os
"""Lesson 2B manifest — multi-voice seller beats. audio=master clock, 1.0s inter-beat gaps.
Seller beat: portrait (canonical blue, push-in) during Andrea setup+tag; talking-avatar clip during the seller line.
All stills + clips normalized/re-keyed to canonical blue so switches & beats stay seamless."""
import json, os, subprocess

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
B = BMH_ROOT
HG = f"{B}/course-assets/heygen/lesson2B"
SCN = f"{B}/course-assets/scenes/module-02-lesson2B"
PUB = f"{B}/docs/course-production/remotion/public/lesson2B"
FPS = 30; BLUE = "0x62b3f3"; BLUEH = "62b3f3"; GAP = 1.0
# tag, mode, [seg wav tags], portrait, scene, clip, hero, badge, label, label_trigger
BEATS = [
 ("b01","hero",["b01"],None,None,None,"andrea_b01.mp4",True,None,None),
 ("b02_david","seller",["b02a_andrea","b02b_david","b02c_andrea"],"m02_L2B_david.png","m02_L2B_david_scene.png","seller_david_test.mp4",None,False,"DAVID   ·   Tired Landlord   ·   Kansas City","David"),
 ("b03_beth","seller",["b03a_andrea","b03b_beth","b03c_andrea"],"m02_L2B_beth.png","m02_L2B_beth_scene.png","seller_beth.mp4",None,False,"BETH   ·   Inherited Estate   ·   St. Louis","Beth"),
 ("b04_ray","seller",["b04a_andrea","b04b_ray"],"m02_L2B_ray.png","m02_L2B_ray_scene.png","seller_ray.mp4",None,False,"RAY   ·   Behind on Payments   ·   Dayton","Ray"),
 ("b05_carol","seller",["b05a_andrea","b05b_carol","b05c_andrea"],"m02_L2B_carol.png","m02_L2B_carol_scene.png","seller_carol.mp4",None,False,"CAROL   ·   Title Lien   ·   Lake of the Ozarks","Carol"),
 ("b06_marcus","seller",["b06a_andrea","b06b_marcus","b06c_andrea"],"m02_L2B_marcus.png","m02_L2B_marcus_scene.png","seller_marcus.mp4",None,False,"MARCUS   ·   Underwater   ·   Kansas City","Marcus"),
 ("b07_recap","grid",["b07"],None,None,None,None,False,"FAST   ·   CERTAIN   ·   SIMPLE","fast"),
 ("b08_you","hero",["b08"],None,None,None,"andrea_b08.mp4",False,"PROVIDE OPTIONS","options"),
 ("b09_outro","hero",["b09"],None,None,None,"andrea_b09.mp4",False,None,None),
]
GRID = ["m02_L2B_david.png","m02_L2B_beth.png","m02_L2B_ray.png","m02_L2B_carol.png","m02_L2B_marcus.png"]
# Seller beats whose Andrea "tag" plays an animated clip (alpha ProRes) instead of the clean portrait.
# tag -> (anim clip in HG/anim/, hold still in SCN/). Tag (17s) > Seedance max (15s), so the clip
# plays then holds on its start-pose still for the remainder (MODULE-GUIDE §5 hold-tail rule).
TAGCLIPS = {"b05_carol":("anim_carol_argue.mp4","m02_L2B_carol_argue.png")}
state = json.load(open(f"{HG}/_state.json"))
for d_ in ("stills","clips","hero","anim"): os.makedirs(f"{PUB}/{d_}", exist_ok=True)

def dur(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1", p]).strip())
def bg_hex(path):
    return subprocess.check_output(f'ffmpeg -v error -i "{path}" -vf "crop=2:2:8:8,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6', shell=True).decode().strip()
def word_frame(segtag, trigger):
    words = state.get(segtag, {}).get("words") or []
    hits=[w["start"] for w in words if trigger.lower().strip('.,?') in w["word"].lower().strip('.,?"')]
    return max(0, round(hits[0]*FPS)) if hits else None
def normalize_still(name):
    sp=f"{SCN}/{name}"; 
    if not os.path.exists(sp): return None
    bgc=bg_hex(sp); dst=f"{PUB}/stills/{name}"
    subprocess.run(f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex "[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y', shell=True, check=True)
    return f"lesson2B/stills/{name}"
def rekey_clip(name):
    sp=f"{HG}/{name}"
    if not os.path.exists(sp): return None
    dst=f"{PUB}/clips/{name}"
    subprocess.run(["cp","-f",sp,dst],check=True)
    return f"lesson2B/clips/{name}"
def rekey_anim(name):
    # Seedance animation clip -> alpha ProRes 4444 (.mov): colorkey the bg to transparency, bt709 both ways.
    # Code owns the canonical blue; blue is never baked into the clip (2A/1C pattern).
    sp=f"{HG}/anim/{name}"
    if not os.path.exists(sp): return None,None
    bgc=bg_hex(sp); dst_name=name.replace(".mp4",".mov"); dst=f"{PUB}/anim/{dst_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -filter_complex '
        f'"[0:v]scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,'
        f'colorkey=0x{bgc}:0.15:0.02,format=rgba[v]" '
        f'-map "[v]" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -an "{dst}" -y',
        shell=True, check=True)
    return f"lesson2B/anim/{dst_name}", round(dur(dst)*FPS)

# master audio: per beat concat its seg wavs (no gap within beat), 1.0s gap between beats
silence=f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(GAP),silence,"-y"],check=True)
cl=f"{PUB}/_concat.txt"
with open(cl,"w") as f:
    for i,(tag,mode,segs,*_ ) in enumerate(BEATS):
        for s in segs: f.write(f"file '{HG}/{s}.wav'\n")
        if i<len(BEATS)-1: f.write(f"file '{silence}'\n")
subprocess.run(["ffmpeg","-v","error","-f","concat","-safe","0","-i",cl,"-c:a","aac","-b:a","192k",f"{PUB}/master.m4a","-y"],check=True)

manifest, missing = [], []
for i,(tag,mode,segs,portrait,scene,clip,hero,badge,label,trig) in enumerate(BEATS):
    segdurs=[dur(f"{HG}/{s}.wav") for s in segs]
    vo=sum(segdurs); frames=round((vo+(GAP if i<len(BEATS)-1 else 0))*FPS)
    e={"tag":tag,"mode":mode,"durationInFrames":frames,"voFrames":round(vo*FPS)}
    if badge: e["badge"]=True
    if label:
        e["label"]=label
        wf=word_frame(segs[0],trig) if trig else None
        e["labelDelay"]=wf if wf is not None else 15
    if mode=="hero" and hero:
        subprocess.run(["cp","-f",f"{HG}/{hero}",f"{PUB}/hero/{hero}"],check=True); e["hero"]=f"lesson2B/hero/{hero}"
    if mode=="seller":
        e["lineStart"]=round(segdurs[0]*FPS); e["lineEnd"]=round((segdurs[0]+segdurs[1])*FPS)
        e["hasTag"]=len(segs)>2  # Ray (b04) has no Andrea tag segment -> keep scene through the trailing gap
        r=normalize_still(portrait); e["still"]=r or missing.append(f"still:{portrait}")
        sc=normalize_still(scene); e["scene"]=sc or missing.append(f"scene:{scene}")
        c=rekey_clip(clip); e["clip"]=c or missing.append(f"clip:{clip}")
        tc=TAGCLIPS.get(tag)
        if tc:
            anim_name, hold_name = tc
            ra,rfr=rekey_anim(anim_name)
            if ra: e["tagClip"]=ra; e["tagClipFrames"]=rfr
            else: missing.append(f"tagclip:{anim_name}")
            hold=normalize_still(hold_name)  # start-pose hold frame after the 15s clip
            e["tagHold"]=hold or missing.append(f"taghold:{hold_name}")
    if mode=="grid":
        e["grid"]=[normalize_still(g) for g in GRID]
    manifest.append(e)
total=sum(b["durationInFrames"] for b in manifest)
json.dump({"fps":FPS,"beats":manifest,"audio":"lesson2B/master.m4a","totalFrames":total}, open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats":len(manifest),"totalSec":round(total/FPS,1),"missing":missing},indent=1))
