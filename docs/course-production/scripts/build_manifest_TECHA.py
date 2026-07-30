#!/usr/bin/env python3
"""Build Lesson TECH-A manifest. Audio = master clock; 1.0s inter-beat gaps (7.14);
anim beats hold their clip's OWN last frame (7.7/11.7); label QUEUE per beat (3b);
LOGO CUTAWAYS (Jarrad 2026-07-10): straight cut to a full-frame doodle logo card on the
tool's first spoken mention, hold ~8s (clamped to the beat), cut back to the scene.
Redundant tool-name stickers are dropped where their own logo card carries the name."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lessonTECHA"
SCN = f"{B}/course-assets/scenes/module-techstack"
PUB = f"{B}/docs/course-production/remotion/public/lessonTECHA"
FPS = 30
GAP = 1.0
TAIL = 2.0   # hold after the final VO: NEXT label pops, then the close-fade takes over
             # (tightened from 3.5s — Jarrad 2026-07-10: no frozen hero at the end)
BLUE = "0x62b3f3"
LOGO_HOLD = 240  # ~8s per Jarrad's cutaway direction
# v4 (Jarrad 2026-07-10): software beats OPEN on their logo card (logoFrame = 0, no
# word-trigger start — he redlined the 0.5-1s scene flash before the cutaway), and the
# super-short b05 non-negotiable beat is MERGED into b04 (audio concat, labels offset).

# tag, mode, still, anim clip, hero clip, circle clip, badge
BEATS = [
 ("b01_open",       "hero", None, None, "hero_b01_alpha.mov", None, True),
 ("b02_why",        "scene","mTECH_LTECHA_b02_hub.png",             "anim_b02.mp4", None, None, False),
 ("b03_sandra",     "scene","mTECH_LTECHA_b03_sandra.png",          "anim_b03.mp4", None, "circle_b03_alpha.mov", False),
 ("b04_sandra_wf",  "scene","mTECH_LTECHA_b04_sandra-workflow.png", "anim_b04.mp4", None, None, False),
 ("b06_propstream", "scene","mTECH_LTECHA_b06_propstream.png",      "anim_b06.mp4", None, None, False),
 ("b07_dealmachine","scene","mTECH_LTECHA_b07_dealmachine.png",     "anim_b07.mp4", None, None, False),
 ("b08_dealsniper", "scene","mTECH_LTECHA_b08_dealsniper.png",      "anim_b08.mp4", None, None, False),
 ("b09_dialpad",    "scene","mTECH_LTECHA_b09_dialpad.png",         None, None, "circle_b09_alpha.mov", False),
 ("b10_coaching",   "scene","mTECH_LTECHA_b10_coaching.png",        None, None, None, False),
 ("b11_closerlab",  "scene","mTECH_LTECHA_b11_closerlab.png",       None, None, None, False),
 ("b12_tasks",      "scene","mTECH_LTECHA_b12_tasks.png",           None, None, "circle_b12_alpha.mov", False),
 ("b13_hubstaff",   "scene","mTECH_LTECHA_b13_hubstaff.png",        None, None, None, False),
 ("b14_slack",      "scene","mTECH_LTECHA_b14_slack.png",           "anim_b14.mp4", None, None, False),
 ("b15_institute",  "scene","mTECH_LTECHA_b15_institute.png",       None, None, "circle_b15_alpha.mov", False),
 ("b16_drive",      "scene","mTECH_LTECHA_b16_drive.png",           "anim_b16.mp4", None, None, False),
 ("b17_recap",      "hero", None, None, "hero_b17_alpha.mov", None, False),
]

# beats whose clip is NOT triple-clamped (end != start) -> hold last frame instead of looping
NO_LOOP = {"b03_sandra"}  # walk-and-meet handoff ends mid-scene by design

# logo cutaways: beat -> (card png, trigger word, first|last)
LOGO = {
 "b03_sandra":      ("mTECH_LTECHA_logo_sandra.png",      "Sandra",     "first"),
 "b06_propstream":  ("mTECH_LTECHA_logo_propstream.png",  "PropStream", "first"),
 "b07_dealmachine": ("mTECH_LTECHA_logo_dealmachine.png", "DealMachine","first"),
 "b08_dealsniper":  ("mTECH_LTECHA_logo_dealsniper.png",  "Sniper",     "first"),
 "b09_dialpad":     ("mTECH_LTECHA_logo_dialpad.png",     "DialPad",    "first"),
 "b11_closerlab":   ("mTECH_LTECHA_logo_closerlab.png",   "Closer",     "first"),
 # Slack cutaway moved b12->b14 (deviation, noted in scenecards): b12's passing mention lands
 # 0.5s before the VO ends -> a 1.5s flash; b14 is Slack's topical intro and fits the 8s hold.
 "b14_slack":       ("mTECH_LTECHA_logo_slack.png",       "Slack",      "first"),
 "b13_hubstaff":    ("mTECH_LTECHA_logo_hubstaff.png",    "HubStaff",   "first"),
 "b15_institute":   ("mTECH_LTECHA_logo_institute.png",   "Institute",  "first"),
 "b16_drive":       ("mTECH_LTECHA_logo_drive.png",       "Drive",      "first"),
}

# label queue per beat: (text, trigger word, first|last). None trigger => after the VO resolves.
# Tool-name stickers coinciding with that tool's own full-frame logo card are omitted.
LABELQ = {
 "b02_why": [("STAY ORGANIZED","organized","first"),("TRACK DEALS","track","first"),
             ("TEAM COMMUNICATION","communicate","first"),("TOOLS MATTER","matters","first")],
 "b03_sandra": [("CENTER OF EVERYTHING","center","first"),("LEADS LIVE HERE","lead","first")],
 # b04 = merged b04+b05 (labels from both; b05 triggers resolve via the merged word list)
 "b04_sandra_wf": [("NEW LEAD","lead","first"),("LOG NOTES","log","first"),("UPDATE THE STAGE","update","first"),
                   ("SINGLE SOURCE OF TRUTH","single","first"),("NOT IN SANDRA? IT DOES NOT EXIST","exist","first"),
                   ("TEAM WALKTHROUGH LATER","walk","first"),("NON-NEGOTIABLE","non-negotiable","first")],
 "b06_propstream": [("PROPERTY DATA","data","first"),("MOTIVATED SELLERS","motivated","first"),
                    ("FIND THEM FIRST","find","last")],
 "b07_dealmachine": [("DRIVING FOR DOLLARS","dollars","first"),("TAG THE PROPERTY","tag","first"),
                     ("STEADY PIPELINE","pipeline","first")],
 "b08_dealsniper": [("MOVE FAST","fast","first"),("READY TO MAKE AN OFFER","ready","first"),
                    ("CONFIDENT DECISIONS","confident","first")],
 "b09_dialpad": [("PHONE SYSTEM","phone","first"),("ACTIVITY LOGGED","logs","first"),
                 ("CALLS RECORDED","recorded","first")],
 "b10_coaching": [("COACHING","coach","first"),("REAL CONVERSATIONS","conversations","first"),
                  ("CALL VOLUME","volume","first"),("MAKE YOUR DIALS","dials","first")],
 "b11_closerlab": [("PRACTICE FIRST","practice","first"),("FEEDBACK","feedback","first"),
                   ("PUT IN THE REPS","reps","first")],
 "b12_tasks": [("TASKS LIVE IN SANDRA","Tasks","first"),("NOTHING GETS DROPPED","dropped","first"),
               ("CHECK DAILY","day","first"),("FLAG BLOCKERS IN SLACK","blocked","first")],
 "b13_hubstaff": [("CLOCK IN","start","first"),("CLOCK OUT","stop","first"),("ACCURATE HOURS","accurately","first")],
 "b14_slack": [("REACH YOUR MANAGER","manager","first"),
               ("KEEP NOTIFICATIONS ON","notifications","first"),("STAY CONNECTED","connected","first")],
 "b15_institute": [("MODULES IN ORDER","order","first"),("QUIZZES","quizzes","first"),
                   ("PROGRESS TRACKED","progress","first")],
 "b16_drive": [("SOPs","SOPs","first"),("SCRIPTS","scripts","first"),
               ("BOOKMARK WHAT MATTERS","Bookmark","first"),("ASK YOUR TEAM LEAD","lead","first")],
 "b17_recap": [("WORK TOGETHER","together","first"),("FIND DEALS","find","first"),("MANAGE LEADS","manage","first"),
               ("COMMUNICATE AS A TEAM","communicate","first"),("NEXT: WHO SELLS TO US",None,None)],
}

def word_frame(tag, trigger, which):
    words = state.get(tag, {}).get("words") or []
    hits = [w["start"] for w in words if trigger.lower().strip('.,?') in w["word"].lower().strip('.,?”“"')]
    if not hits: return None
    t0 = hits[-1] if which == "last" else hits[0]
    return max(0, round(t0 * FPS))

def dur(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1", p]).strip())

for sub in ("stills","hero","circle","anim","tails","logos"):
    os.makedirs(f"{PUB}/{sub}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# --- b04+b05 merge: one wav (b04 + 1.0s gap + b05), b05 word times shifted onto b04 ---
MERGED_WAV = {}
def dur_raw(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1", p]).strip())
_b04d = dur_raw(f"{HG}/b04_sandra_wf.wav")
_mw = f"{PUB}/_b04_merged.wav"
subprocess.run(["ffmpeg","-v","error","-i",f"{HG}/b04_sandra_wf.wav","-i",f"{HG}/b05_sandra_nn.wav",
    "-filter_complex",f"[0:a]apad=pad_dur={GAP}[a0];[a0][1:a]concat=n=2:v=0:a=1[out]",
    "-map","[out]", _mw, "-y"], check=True)
MERGED_WAV["b04_sandra_wf"] = _mw
_shift = _b04d + GAP
state["b04_sandra_wf"]["words"] = state["b04_sandra_wf"]["words"] + [
    {"word": w["word"], "start": w["start"] + _shift, "end": w["end"] + _shift}
    for w in state["b05_sandra_nn"]["words"]]

# 1. master audio with 1.0s gaps BETWEEN beats
silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(GAP),silence,"-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i,(tag, *_ ) in enumerate(BEATS):
        f.write(f"file '{MERGED_WAV.get(tag, f'{HG}/{tag}.wav')}'\n")
        if i < len(BEATS)-1:
            f.write(f"file '{silence}'\n")
    tail_sil = f"{PUB}/_tail.wav"
    subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t","3.5",tail_sil,"-y"], check=True)
    f.write(f"file '{tail_sil}'\n")
subprocess.run(["ffmpeg","-v","error","-f","concat","-safe","0","-i",concat_list,
    "-c:a","aac","-b:a","192k", f"{PUB}/master.m4a","-y"], check=True)

def normalize(src_name, sub="stills"):
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp): return None
    bgc = subprocess.check_output(
        f'ffmpeg -v error -i "{sp}" -vf "crop=2:2:8:8,scale=1:1" -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()
    dst = f"{PUB}/{sub}/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y',
        shell=True, check=True)
    return f"lessonTECHA/{sub}/{src_name}"

manifest, missing, logo_report = [], [], []
for i,(tag, mode, still, anim, hero, circle, badge) in enumerate(BEATS):
    d = dur(MERGED_WAV.get(tag, f"{HG}/{tag}.wav"))
    gap = GAP if i < len(BEATS)-1 else TAIL
    e = {"tag": tag, "mode": mode, "durationInFrames": round((d+gap)*FPS), "voFrames": round(d*FPS)}
    if badge: e["badge"] = True
    if tag == "b17_recap": e["closeFade"] = True
    q = []
    for text, trig, which in LABELQ.get(tag, []):
        if trig is None:
            delay = round(d*FPS) + 6   # after the VO resolves, inside the gap
        else:
            delay = word_frame(tag, trig, which)
            if delay is None:
                missing.append(f"label-trigger:{tag}:{trig}"); delay = 8
        q.append({"text": text, "delay": delay})
    if q: e["labels"] = sorted(q, key=lambda x: x["delay"])
    if tag in LOGO:
        card, trig, which = LOGO[tag]
        # v4: beats OPEN on the logo card — no word-trigger start, no scene flash.
        # v5: logo cards BYPASS normalize (straight copy) — they carry intentional BRAND
        # backgrounds (Sandra navy space, Dialpad plum, Hubstaff navy, …); normalize() was
        # colorkeying those to cornflower (the v4 space-card bug Jarrad caught at 0:43).
        lf = 0
        src = f"{SCN}/{card}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/logos/{card}"], check=True)
            r = f"lessonTECHA/logos/{card}"
            end = min(lf + LOGO_HOLD, e["durationInFrames"])
            e["logo"] = r; e["logoFrame"] = lf; e["logoUntil"] = end
            anim_card = f"{HG}/grok/logoanim_{tag}.mp4"
            if os.path.exists(anim_card):
                subprocess.run(["cp","-f",anim_card, f"{PUB}/logos/logoanim_{tag}.mp4"], check=True)
                e["logoAnim"] = f"lessonTECHA/logos/logoanim_{tag}.mp4"
            logo_report.append({"beat": tag, "at_s": round(lf/FPS,1), "hold_s": round((end-lf)/FPS,1),
                                "vo_s": round(d,1), "anim": "logoAnim" in e})
        else: missing.append(f"logo-card:{card}")
    if hero:
        src = f"{HG}/{hero}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/hero/{hero}"], check=True)
            e["hero"] = f"lessonTECHA/hero/{hero}"
        else: missing.append(f"hero:{tag}")
    if circle:
        src = f"{HG}/{circle}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/circle/{circle}"], check=True)
            e["circle"] = f"lessonTECHA/circle/{circle}"
        else: missing.append(f"circle:{tag}")
    if anim:
        src = f"{HG}/grok/{anim}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/anim/{anim}"], check=True)
            e["anim"] = f"lessonTECHA/anim/{anim}"
            ad = dur(src)
            # v5 (Jarrad, permanent): NO tail stills. Clamped clips LOOP for the whole beat;
            # unclamped clips (NO_LOOP set) hold their own exact last frame via <Freeze>.
            e["loop"] = tag not in NO_LOOP
            # Trim: loop clips keep a MINIMAL 0.1s guard — the clamped end frame equals the
            # start frame, so looping the (nearly) full clip gives a seamless restart. The old
            # 0.55s snap-back trim (PLAYBOOK 15.1) cut the return-to-pose and made loops
            # restart mid-motion (v5 loop-seam FAILs on b04 Δ6.2 / b14 Δ2.4). Hold-last-frame
            # clips (NO_LOOP) keep the full 0.55s trim so no snap-back shows in the freeze.
            trim_t = max(ad - (0.04 if e["loop"] else 0.55), 0.5)
            e["animFrames"] = round(trim_t*FPS)
        else: missing.append(f"anim:{tag}")
    if still:
        r = normalize(still)
        if r: e["still"] = r
        else: missing.append(f"still:{still}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lessonTECHA/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total/FPS,1), "missing": missing,
                  "logos": logo_report}, indent=1))
