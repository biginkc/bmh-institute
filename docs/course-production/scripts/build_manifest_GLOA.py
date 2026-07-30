#!/usr/bin/env python3
"""Build Lesson GLO-A manifest. Audio = master clock; 1.0s inter-beat gaps (7.14);
anim beats hold their clip's OWN last frame (7.7/11.7); label QUEUE per beat (3b);
modes: hero | scene (still/anim, optional circle) | swap (hero clip -> still)."""
import json, os, subprocess

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
HG = f"{B}/course-assets/heygen/lessonGLOA"
SCN = f"{B}/course-assets/scenes/module-glossary"
PUB = f"{B}/docs/course-production/remotion/public/lessonGLOA"
FPS = 30
GAP = 1.0
TAIL = 3.5   # hold after the final VO: recap board + NEXT label + close
BLUE = "0x62b3f3"

# tag, mode, still, anim clip, hero clip, circle clip, badge
BEATS = [
 ("b01_open",        "hero", None, None, "hero_b01_alpha.mov", None, True),
 ("b02_library",     "scene","mGLO_LGLOA_b02_library-priya.png",      "anim_b02.mp4", None, "circle_b02_alpha.mov", False),
 ("b03_distressed",  "scene","mGLO_LGLOA_b03_distressed-property.png","anim_b03.mp4", None, None, False),
 ("b04_car",         "scene","mGLO_LGLOA_b04_roadside-car.png",       "anim_b04.mp4", None, None, False),
 ("b05_why",         "hero", None, None, "hero_b05_alpha.mov", None, False),
 ("b06_asis",        "scene","mGLO_LGLOA_b06_as-is-house.png",        None, None, None, False),
 ("b07_asis_call",   "scene","mGLO_LGLOA_b07_as-is-call-signal.png",  "anim_b07.mp4", None, "circle_b07_alpha.mov", False),
 ("b08_offmarket",   "scene","mGLO_LGLOA_b08_off-market-home.png",    None, None, None, False),
 ("b09_sweetspot",   "scene","mGLO_LGLOA_b09_bullseye.png",           None, None, None, False),
 ("b10_mls",         "swap", "mGLO_LGLOA_b10_zillow-listing.png",     None, "side_b10_alpha.mov", None, False),
 ("b11_onmarket",    "scene","mGLO_LGLOA_b11_on-market-flag.png",     None, None, "circle_b11_alpha.mov", False),
 ("b12_listed_expired","scene","mGLO_LGLOA_b12_listed-expired.png",   None, None, None, False),
 ("b13_dom",         "scene","mGLO_LGLOA_b13_dom-calendar.png",       None, None, None, False),
 ("b14_fsbo",        "scene","mGLO_LGLOA_b14_fsbo.png",               None, None, None, False),
 ("b15_garage_sale", "swap", "mGLO_LGLOA_b15_garage-sale.png",        None, "side_b15_alpha.mov", None, False),
 ("b16_wholesale_re","scene","mGLO_LGLOA_b16_contract-to-buyer.png",  "anim_b16.mp4", None, None, False),
 ("b17_assignment",  "scene","mGLO_LGLOA_b17_assignment.png",         "anim_b17.mp4", None, None, False),
 ("b18_double_close","scene","mGLO_LGLOA_b18_double-close.png",       "anim_b18.mp4", None, None, False),
 ("b19_subject_to",  "scene","mGLO_LGLOA_b19_subject-to.png",         None, None, None, False),
 ("b20_seller_fin",  "scene","mGLO_LGLOA_b20_seller-financing.png",   None, None, "circle_b20_alpha.mov", False),
 ("b21_recap",       "swap", "mGLO_LGLOA_b21_recap-board.png",        None, "side_b21_alpha.mov", None, False),
 ("b22_outro",       "hero", None, None, "hero_b22_alpha.mov", None, False),
]

# label queue per beat: list of (text, trigger word, first|last). None trigger => after the VO resolves.
LABELQ = {
 "b02_library": [("REFERENCE VIDEO","come","first"),("FAMILIARITY, NOT MEMORIZATION","familiarity","first")],
 "b03_distressed": [("DISTRESSED PROPERTY","distressed","first"),("ROUGH SHAPE OR HARD SITUATION","rough","first")],
 "b04_car": [("NEEDS WORK","hood","first"),("FIX IT UP","fix","first"),("HELP THE SELLER MOVE ON","move","last")],
 "b05_why": [("FIND THE SITUATION","find","first"),("RIGHT PERSON AT BMH","right","last")],
 "b06_asis": [("AS-IS","as-is","first"),("NO REPAIRS","repairs","first"),("EXACTLY THE WAY IT IS","exactly","first")],
 "b07_asis_call": [("NEEDS A LOT OF WORK","needs","first"),("ANY CONDITION","condition","first")],
 "b08_offmarket": [("OFF-MARKET","off-market","first"),("NO SIGN. NO LISTING. NO AGENT.","sign","first")],
 "b09_sweetspot": [("BEFORE THE PUBLIC","before","first"),("SWEET SPOT","sweet","first")],
 "b10_mls": [("ON-MARKET","On-market","first"),("MLS","MLS","first")],
 "b11_onmarket": [("WE DON'T TARGET ON-MARKET","target","first"),("FLAG IT","flag","first"),("DON'T HANG UP","hang","first")],
 "b12_listed_expired": [("LISTED PROPERTY","listed","first"),("EXPIRED LISTING","expired","first"),("CAN BE GREAT LEADS","great","first")],
 # acronym labels spell out their meaning (Jarrad 2026-07-10)
 "b13_dom": [("DOM = DAYS ON MARKET","Days","first"),("HIGH DOM = MOTIVATION SIGNAL","High","first")],
 "b14_fsbo": [("FSBO = FOR SALE BY OWNER","FSBO","first"),("WITHOUT AN AGENT","without","first"),("WILLING TO TALK","willing","first")],
 "b15_garage_sale": [("WHOLESALING","wholesaling","first"),("PROFIT IS THE DIFFERENCE","profit","first")],
 "b16_wholesale_re": [("GET IT UNDER CONTRACT","contract","first"),("SELL THE CONTRACT","sell","first"),("FACILITATE THE DEAL","facilitate","first")],
 "b17_assignment": [("ASSIGNMENT OF CONTRACT","assignment","first"),("END BUYER CLOSES","closes","first"),("ASSIGNMENT FEE","fee","first")],
 "b18_double_close": [("DOUBLE CLOSE","double","first"),("BUY THEN SELL","purchase","first"),("PROTECTS PROFIT MARGIN","protects","first")],
 "b19_subject_to": [("SUBJECT-TO","Subject-To","first"),("EXISTING MORTGAGE STAYS","staying","first"),("LIKE CAR PAYMENTS","payments","first")],
 "b20_seller_fin": [("SELLER FINANCING","Financing","first"),("SELLER ACTS AS THE BANK","bank","first"),("SEVERAL WAYS TO STRUCTURE THIS","several","first")],
 # "NEXT: SELLER SITUATIONS" label removed (Claude QC, 2026-07-12): same broken tease as the old
 # spoken outro — referenced GLO-B, a lesson that was never produced. Dropped rather than reworded
 # since the new outro line makes no forward-reference to replace it with.
 "b21_recap": [("CORE TERMS COMPLETE","target","first"),("GET THEM TALKING","motivated","first")],
}
# swap beats: cut from Andrea hero to the still on this trigger word
SWAP = {"b10_mls": ("MLS","first"), "b15_garage_sale": ("garage","first"), "b21_recap": ("wholesale","first")}

def word_frame(tag, trigger, which):
    words = state.get(tag, {}).get("words") or []
    hits = [w["start"] for w in words if trigger.lower().strip('.,?') in w["word"].lower().strip('.,?”“"')]
    if not hits: return None
    t0 = hits[-1] if which == "last" else hits[0]
    return max(0, round(t0 * FPS))

def dur(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1", p]).strip())

for sub in ("stills","hero","circle","anim","tails"):
    os.makedirs(f"{PUB}/{sub}", exist_ok=True)
state = json.load(open(f"{HG}/_state.json"))

# 1. master audio with 1.0s gaps BETWEEN beats
silence = f"{PUB}/_gap.wav"
subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(GAP),silence,"-y"], check=True)
concat_list = f"{PUB}/_concat.txt"
with open(concat_list, "w") as f:
    for i,(tag, *_ ) in enumerate(BEATS):
        f.write(f"file '{HG}/{tag}.wav'\n")
        if i < len(BEATS)-1:
            f.write(f"file '{silence}'\n")
    tail_sil = f"{PUB}/_tail.wav"
    subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t","3.5",tail_sil,"-y"], check=True)
    f.write(f"file '{tail_sil}'\n")
subprocess.run(["ffmpeg","-v","error","-f","concat","-safe","0","-i",concat_list,
    "-c:a","aac","-b:a","192k", f"{PUB}/master.m4a","-y"], check=True)

def normalize(src_name):
    sp = f"{SCN}/{src_name}"
    if not os.path.exists(sp): return None
    bgc = subprocess.check_output(
        f'ffmpeg -v error -i "{sp}" -vf "crop=2:2:8:8,scale=1:1" -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()
    dst = f"{PUB}/stills/{src_name}"
    subprocess.run(
        f'ffmpeg -v error -i "{sp}" -i "{sp}" -filter_complex '
        f'"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color={BLUE}:t=fill[bg];'
        f'[1:v]colorkey=0x{bgc}:0.12:0.03[k];[bg][k]overlay=0:0" "{dst}" -y',
        shell=True, check=True)
    return f"lessonGLOA/stills/{src_name}"

manifest, missing = [], []
for i,(tag, mode, still, anim, hero, circle, badge) in enumerate(BEATS):
    d = dur(f"{HG}/{tag}.wav")
    gap = GAP if i < len(BEATS)-1 else TAIL
    e = {"tag": tag, "mode": mode, "durationInFrames": round((d+gap)*FPS), "voFrames": round(d*FPS)}
    if badge: e["badge"] = True
    q = []
    for text, trig, which in LABELQ.get(tag, []):
        if trig is None:
            delay = round(d*FPS) + 6   # after the VO resolves, inside the gap
        else:
            delay = word_frame(tag, trig, which)
            if delay is None: delay = 8
        q.append({"text": text, "delay": delay})
    if q: e["labels"] = sorted(q, key=lambda x: x["delay"])
    if tag in SWAP:
        trig, which = SWAP[tag]
        e["swapFrame"] = word_frame(tag, trig, which) or round(d*FPS*0.3)
    if hero:
        src = f"{HG}/{hero}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/hero/{hero}"], check=True)
            e["hero"] = f"lessonGLOA/hero/{hero}"
        else: missing.append(f"hero:{tag}")
    if circle:
        src = f"{HG}/{circle}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/circle/{circle}"], check=True)
            e["circle"] = f"lessonGLOA/circle/{circle}"
        else: missing.append(f"circle:{tag}")
    if anim:
        src = f"{HG}/grok/{anim}"
        if os.path.exists(src):
            subprocess.run(["cp","-f",src, f"{PUB}/anim/{anim}"], check=True)
            e["anim"] = f"lessonGLOA/anim/{anim}"
            ad = dur(src)
            # PLAYBOOK 15.1: trim past the end-clamp snap-back; hold the exact frame shown
            trim_t = max(ad - 0.55, 0.5)
            e["animFrames"] = round(trim_t*FPS)
            tail = f"tail_{tag}.png"
            # NEVER clobber curated tails: they are re-cut from the RENDER MASTER after the
            # first render (decode-shift match, see QC-REPORT-v4). Only extract if absent,
            # or when REGEN_TAILS=1 forces a raw re-extract for brand-new clips.
            if os.environ.get("REGEN_TAILS") or not os.path.exists(f"{PUB}/tails/{tail}"):
                subprocess.run(["ffmpeg","-v","error","-ss",f"{trim_t:.3f}","-i",src,"-frames:v","1",
                                f"{PUB}/tails/{tail}","-y"], check=True)
            e["tail"] = f"lessonGLOA/tails/{tail}"
        else: missing.append(f"anim:{tag}")
    if still:
        r = normalize(still)
        if r: e["still"] = r
        else: missing.append(f"still:{still}")
    manifest.append(e)

total = sum(b["durationInFrames"] for b in manifest)
out = {"fps": FPS, "beats": manifest, "audio": "lessonGLOA/master.m4a", "totalFrames": total}
json.dump(out, open(f"{PUB}/manifest.json","w"), indent=1)
print(json.dumps({"beats": len(manifest), "totalSec": round(total/FPS,1), "missing": missing}, indent=1))
