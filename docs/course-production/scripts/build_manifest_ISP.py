#!/usr/bin/env python3
import os
"""Build the word-timed Lesson ISP Remotion manifest and master audio."""
import json, math, os, re, shutil, subprocess
from pathlib import Path

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

ROOT = Path(BMH_ROOT)
HG = ROOT / "course-assets/heygen/lessonISP"
SEEDANCE_WHITE = HG / "seedance-white-skin"
SCN = ROOT / "course-assets/scenes/module-isp"
PUB = ROOT / "docs/course-production/remotion/public/lessonISP"
FPS, GAP = 30, 1.0
BLUE = "62b3f3"
TAGS = [
"b01_isp_open","b02_target_seller","b03_seller_types","b04_regions","b05_needs","b06_property_stress","b07_financial_pressure","b08_life_events_inheritance","b09_urgent_events","b10_severe_damage","b11_landlords_exit","b12_hard_filters","b13_realtor_equity_disqualifiers","b14_key_phrases","b15_messaging_speed_certainty","b16_no_repairs_commissions_cleanup","b17_discovery_condition_motivation","b18_timeline_repairs_legal","b19_occupancy_authority","b20_realtor_or_faster_option","b21_powerful_closing_question","b22_outro_offer_playbook_tease"]

STILLS = {
2:"mISP_LISP_b02_target-seller.png",3:"mISP_LISP_b03_seller-types.png",4:"mISP_LISP_b04_regions.png",5:"mISP_LISP_b05_needs-comparison.png",6:"mISP_LISP_b06_david-repairs.png",7:"mISP_LISP_b07_financial-pressure.png",9:"mISP_LISP_b09_urgency-board.png",10:"mISP_LISP_b10_severe-damage.png",11:"mISP_LISP_b11_david-landlord-exit.png",12:"mISP_LISP_b12_hard-filter-gate.png",13:"mISP_LISP_b13_fit-vs-avoid.png",14:"mISP_LISP_b14_key-phrases-call.png",15:"mISP_LISP_b15_message-speed-certainty.png",16:"mISP_LISP_b16_no-repairs-simple.png",17:"mISP_LISP_bA_magnifier.png",18:"mISP_LISP_bA_magnifier.png",19:"mISP_LISP_bA_magnifier.png",20:"mISP_LISP_bB_fork.png",21:"mISP_LISP_bC_question.png"}
HEROES = {1:"hero_b01_isp_open_1a",8:"hero_b08_life_events_1a",22:"hero_b22_outro_1a"}
ANIMS = {2:"anim_b02.mp4",6:"anim_b06.mp4",9:"anim_b09.mp4",11:"anim_b11.mp4",16:"anim_b16.mp4",21:"anim_b21.mp4"}
ASSEMBLY_ANIMS = {16:"anim_b16_clean_exit.mp4"}
SLIDE_IN = {6,8,10,11,14,16,21,22}

LABELS = {
2:[("RESIDENTIAL PROPERTY OWNER","residential property owner"),("DISTRESSED SELLER","distressed seller"),("ALTERNATIVE TO TRADITIONAL SALE","alternative")],
3:[("HOMEOWNERS","individual homeowners"),("SMALL LANDLORDS","small independent landlords"),("ESTATE EXECUTORS","executors"),("HANDLE QUICKLY","quickly")],
4:[("UP TO 10 PROPERTIES","up to ten"),("KANSAS CITY","Kansas City"),("ST. LOUIS","St. Louis"),("DAYTON","Dayton"),("LAKE OF THE OZARKS","Lake of the Ozarks"),("WHERE WE CAN HELP MOST","most difference")],
5:[("SPEED","speed"),("CERTAINTY","certainty"),("CONVENIENCE","convenience"),("FASTER RELIABLE SOLUTION","faster")],
6:[("DAMAGED","damaged"),("NEGLECTED","neglected"),("REPAIRS THEY CAN'T AFFORD","cannot afford"),("STRESS + UNCERTAINTY","stress")],
7:[("UNPAID TAXES","unpaid taxes"),("LIENS","liens"),("MORTGAGE ISSUES","mortgage issues"),("FORECLOSURE RISK","foreclosure")],
8:[("LIFE EVENTS","Life events"),("FAST DECISION","fast decision"),("QUICK CLOSE","quick-close"),("TRIGGERS MATTER","Triggers"),("INHERITED PROPERTY","inherited property")],
9:[("FORECLOSURE","foreclosure"),("BANKRUPTCY","bankruptcy"),("TAX SALE","tax sale"),("SPEED + CERTAINTY","speed and certainty")],
10:[("FIRE DAMAGE","fire"),("FLOOD DAMAGE","floods"),("LONG-TERM NEGLECT","long-term neglect"),("AS-IS MODEL","as-is purchasing model")],
11:[("READY TO EXIT","ready to exit"),("STOP MANAGING TENANTS","stop managing"),("CLEAN SIMPLE WAY OUT","clean and simple"),("PROPERTY BURDEN","burdens")],
12:[("HARD FILTERS","hard filters"),("CLOSE WITHIN 30 DAYS","thirty days"),("LEGAL OWNER OR AUTHORITY","authority")],
13:[("NOT CURRENTLY LISTED","not be currently working with a realtor"),("SPEED + CONVENIENCE TRADEOFF","speed and convenience"),("PROTECT TIME","protect our time"),("ALREADY LISTED","already listed"),("NO LEGAL AUTHORITY","lack the legal authority")],
14:[('"SELL AS-IS"',"as-is"),('"NO REALTORS"',"realtors"),('"SELL FAST"',"fast"),("SIGNALS FOR SUCCESS","signals")],
15:[("SPEED OF CLOSING","speed of closing"),("CERTAINTY","certainty"),("CASH OFFER","cash offer"),("NO TRADITIONAL DELAYS","traditional delays")],
16:[("NO REPAIRS","no repairs"),("NO COMMISSIONS","no commissions"),("NO CLEANUP","no cleanup"),("SIMPLE + EMPATHETIC","empathetic")],
17:[("PROPERTY CONDITION","condition"),("TRUE MOTIVATION","motivation"),("WHAT'S DRIVING THE SALE?","driving")],
18:[("HOW SOON TO CLOSE?","how soon"),("SPECIFIC REPAIRS?","repairs"),("LEGAL ISSUES?","legal issues"),("FAST CLOSE FILTERS","fast close")],
19:[("OCCUPANCY STATUS","occupancy status"),("LEGAL OWNER","legal owner"),("NEXT STEPS","next steps"),("SMOOTH TRANSITION","smooth transition")],
20:[("CONSIDERED A REALTOR?","realtor"),("LOOKING FOR FASTER?","faster option"),("SIMPLE","simple"),("EFFECTIVE","effective"),("TRUSTWORTHY","trustworthy")],
21:[("IF WE MADE THIS SIMPLE...","simple"),("...AND CLOSED QUICKLY...","close quickly"),("WOULD THAT SOLVE IT?","solve the situation")],
22:[("OBJECTION HANDLING LATER","objection handling"),("MASTER THE PROFILE","Mastering this profile"),("FOCUS YOUR EFFORTS","focus"),("HELP SELLERS MOVE FORWARD","move forward"),("NEXT: OFFER PLAYBOOK","what we offer"),("WHY IT WORKS","why it works")],
}

def duration(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(p)]))
def sample_bg_hex(path, x=8, y=8):
    rgb = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-vf",
        f"crop=2:2:{x}:{y},scale=1:1,format=rgb24", "-frames:v", "1",
        "-f", "rawvideo", "-",
    ])
    if len(rgb) < 3:
        raise RuntimeError(f"Could not sample background color from {path}")
    return rgb[:3].hex()

def run(command):
    subprocess.run(command, check=True)

def normalize_image(src, dst):
    """Replace a source's sampled flat background with the locked ISP blue."""
    sample = sample_bg_hex(src)
    run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x{BLUE}:s=1600x900:r={FPS}",
         "-i", str(src), "-filter_complex",
         f"[1:v]scale=1600:900:flags=lanczos,format=rgb24,colorkey=0x{sample}:0.12:0.03[k];[0:v][k]overlay=0:0:shortest=1,format=rgb24[v]",
         "-map", "[v]", "-frames:v", "1", str(dst), "-y"])
    return sample

def normalize_video(src, dst, sample=None):
    sample = sample or sample_bg_hex(src)
    run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x{BLUE}:s=1600x900:r=24",
         "-i", str(src), "-filter_complex",
         f"[1:v]scale=1600:900:flags=lanczos,format=rgb24,colorkey=0x{sample}:0.12:0.03[k];[0:v][k]overlay=0:0:shortest=1,format=yuv420p[v]",
         "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "14", "-preset", "medium", str(dst), "-y"])
    return sample

def rekey_standing(src, rekeyed, normalized):
    run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x{BLUE}:s=1600x900:r=24",
         "-i", str(src), "-filter_complex",
         "[1:v]crop=480:720:400:0,scale=600:900,format=rgb24,colorkey=0x5eafed:0.16:0.05[fg];[0:v][fg]overlay=x=500:y=0:shortest=1,format=yuv420p[v]",
         "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "14", str(rekeyed), "-y"])
    normalize_video(rekeyed, normalized)
def norm(s): return re.sub(r"[^a-z0-9]+","",s.lower())
def phrase_frame(words, phrase):
    number_alias={"ten":"10","thirty":"30"}
    target=[number_alias.get(norm(x),norm(x)) for x in phrase.split() if norm(x)]
    tokens=[(number_alias.get(norm(w["word"]),norm(w["word"])),w) for w in words if norm(w["word"])]
    got=[x[0] for x in tokens]
    for i in range(len(got)-len(target)+1):
        if got[i:i+len(target)]==target: return round(float(tokens[i][1]["start"])*FPS)
    # Match hyphen compounds whether Whisper emits one token or three.
    joined="".join(target)
    for i in range(len(got)):
        acc=""
        for j in range(i,min(len(got),i+len(target)+2)):
            acc+=got[j]
            if acc==joined: return round(float(tokens[i][1]["start"])*FPS)
            if len(acc)>len(joined): break
    return None

for d in (PUB/P for P in ("stills","hero","anim-v6","scratch-v6")): d.mkdir(parents=True,exist_ok=True)
state=json.loads((HG/"_state.json").read_text())
clip_state=json.loads((HG/"_clips_v4.json").read_text()) if (HG/"_clips_v4.json").exists() else {}

# Every visual source passes through the TECH-A background-normalization pattern.
for name in set(STILLS.values()):
    sample = normalize_image(SCN/name, PUB/"stills"/name)
    print(f"NORMALIZE STILL {name} sampled_bg=0x{sample}")
SAFE_STILLS = {}
for beat_num in (4, 5):
    src = PUB / "stills" / STILLS[beat_num]
    safe_name = f"safe-88-{BLUE}-{STILLS[beat_num]}"
    dst = PUB / "stills" / safe_name
    run([
        "ffmpeg", "-v", "error", "-i", str(src), "-vf",
        f"scale=1408:792:flags=lanczos,pad=1600:900:96:0:color=0x{BLUE}",
        str(dst), "-y",
    ])
    print(f"SAFE PLATE b{beat_num:02d} pad=0x{BLUE}")
    SAFE_STILLS[beat_num] = safe_name
for name in HEROES.values():
    record = clip_state.get(name) or {}
    src = Path(record.get("file", ""))
    if not src.exists(): raise SystemExit(f"Missing v4 standing hero: {name}")
    rekeyed = PUB/"scratch-v6"/f"{name}-rekeyed.mp4"
    rekey_standing(src, rekeyed, PUB/"hero"/f"{name}.mp4")

for beat_num, name in ANIMS.items():
    src = SEEDANCE_WHITE / name
    if not src.exists(): raise SystemExit(f"Missing approved white-skin animation: {src}")
    dst = PUB / "anim-v6" / name
    sample = normalize_video(src, dst)
    print(f"WHITE-SKIN ANIMATION b{beat_num:02d} sampled_bg=0x{sample}; background normalization only")
    if beat_num == 16:
        # The supplied 15-second file returns the seller after the house-only interval.
        # End on source frame 205, the last clean house-only frame, then let Remotion
        # freeze that clip's own last frame. Stream copy preserves the approved pixels.
        clean = PUB / "anim-v6" / ASSEMBLY_ANIMS[16]
        run(["ffmpeg", "-v", "error", "-i", str(dst), "-t", "8.458334",
             "-map", "0:v:0", "-c", "copy", str(clean), "-y"])
        print("WHITE-SKIN ANIMATION b16 trimmed by stream copy to 206 frames; final frame is house-only")

gap=PUB/"_gap.wav"
subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(GAP),str(gap),"-y"],check=True)
concat=PUB/"_concat.txt"
concat.write_text("".join(f"file '{HG/tag}.wav'\n"+(f"file '{gap}'\n" if i<21 else "") for i,tag in enumerate(TAGS)))
subprocess.run(["ffmpeg","-v","error","-f","concat","-safe","0","-i",str(concat),"-c:a","aac","-b:a","192k",str(PUB/"master.m4a"),"-y"],check=True)

beats=[]; missing=[]
for i,tag in enumerate(TAGS,1):
    spoken=duration(HG/f"{tag}.wav")
    frames=round((spoken+(GAP if i<22 else .6))*FPS)
    e={"id":f"b{i:02d}","tag":tag,"durationInFrames":frames,"voFrames":round(spoken*FPS),"labels":[],"transition":"slide" if i in SLIDE_IN else "cut"}
    if i in (4, 5): e["safeArtBaked"] = True
    if i in STILLS: e["still"]=f"lessonISP/stills/{SAFE_STILLS.get(i, STILLS[i])}"
    if i in HEROES:
        hero_name=f"{HEROES[i]}.mp4"; hero_path=PUB/"hero"/hero_name
        e["mode"]="hero"; e["video"]=f"lessonISP/hero/{hero_name}"; e["videoFrames"]=round(duration(hero_path)*FPS); e["badge"]=(i==1)
    elif i in ANIMS:
        anim_name=ASSEMBLY_ANIMS.get(i,ANIMS[i]); anim_path=PUB/"anim-v6"/anim_name
        e["mode"]="animation"; e["video"]=f"lessonISP/anim-v6/{anim_name}"; e["videoFrames"]=round(duration(anim_path)*FPS); e["holdLastFrame"]=True
    else:
        e["mode"]="static"
    prev=-10
    for text,trigger in LABELS.get(i,[]):
        f=phrase_frame(state[tag]["words"],trigger)
        if f is None: missing.append(f"trigger:{tag}:{trigger}"); continue
        f=max(f,prev+10); prev=f; e["labels"].append({"text":text,"delay":f})
    beats.append(e)
if missing: raise SystemExit("manifest validation failed: "+", ".join(missing))
manifest={"fps":FPS,"audio":"lessonISP/master.m4a","totalFrames":sum(b["durationInFrames"] for b in beats),"beats":beats,"motionTruth":{"seedance":[b["id"] for b in beats if b["mode"]=="animation"],"static":[b["id"] for b in beats if b["mode"]=="static"],"heroes":[b["id"] for b in beats if b["mode"]=="hero"]}}
tmp=PUB/"manifest.json.tmp"; tmp.write_text(json.dumps(manifest,indent=2)+"\n"); os.replace(tmp,PUB/"manifest.json")
print(json.dumps({"beats":len(beats),"totalFrames":manifest["totalFrames"],"seconds":round(manifest["totalFrames"]/FPS,3),"labels":sum(len(b["labels"]) for b in beats),"motionTruth":manifest["motionTruth"]},indent=2))
