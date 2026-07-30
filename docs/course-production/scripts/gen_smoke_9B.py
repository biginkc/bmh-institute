#!/usr/bin/env python3
import os
"""Lesson 9B smoke test — 2 seller ask-clips (Q6 Aditya M, Q7 Jin F) via the proven 7B recipe.
Builds the durable 5-row seller map (voices distinct from 7B's 32), TTS's the two smoke lines
(/v3/voices/speech, speed 1.0, loudnorm + 2.5s idle tail), then renders both avatars on canonical
blue #62b3f3 via /v2/video/generate (public studio avatars reject v3/v4). Poll /v1/video_status.get.
Approved by Jarrad 2026-07-09 (storyboard v2 drill + 5 picks). Owns only lesson9B paths.
"""
import json, os, re, sys, time, urllib.request, subprocess, pathlib

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

ROOT = pathlib.Path(BMH_ROOT)
OUT  = ROOT/"course-assets/heygen/lesson9B"; OUT.mkdir(parents=True, exist_ok=True)
KEY  = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()

def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

# ---- 5 approved picks (Jarrad 2026-07-09), drill order M/F/M/F/M ----
CANDS = {a["avatar_name"]: a for a in json.load(open(
    "/private/tmp/claude-502/-Users-jarradhenry-BMH-OS/9fc9be95-6681-43e3-b63a-a82a6eed54d6/scratchpad/9b_candidates.json"))}
PICKS = [
    ("q6_seller",  "Aditya in Blue t-shirt", "male",   "Do I need to make any repairs?"),
    ("q7_seller",  "Jin Vest Front",         "female", "Are there any fees or commissions?"),
    ("q8_seller",  "Justin in Black Shirt",  "male",   "What happens after I sign?"),
    ("q9_seller",  "Imelda Coat Front",      "female", "Can I stay in the house after selling?"),
    ("q10_seller", "Minho in Blue blazer",   "male",   "What if I change my mind?"),
]

MAP = OUT/"_seller_map.json"
if not MAP.exists():
    used_voices = {r["voice_id"] for r in json.load(open(ROOT/"course-assets/heygen/lesson7B/_seller_map.json"))}
    voices = api("GET","/v2/voices")["data"]["voices"]
    def clean(n): return re.sub(r"\s+"," ",n).strip()
    def bank(gender):
        byname={}
        for v in voices:
            if v.get("language")!="English" or not v.get("support_locale") or v.get("emotion_support"): continue
            if v.get("gender")!=gender or v["voice_id"] in used_voices: continue
            n=clean(v["name"])
            if re.fullmatch(r"[A-Z][a-z]{2,10}", n): byname.setdefault(n, v["voice_id"])
        return sorted(byname.items())
    banks={"male":bank("male"),"female":bank("female")}; idx={"male":0,"female":0}
    rows=[]
    for tag,name,g,text in PICKS:
        vname,vid = banks[g][idx[g]]; idx[g]+=1
        rows.append({"tag":tag,"avatar_name":name,"avatar_id":CANDS[name]["avatar_id"],
                     "gender":g,"voice_name":vname,"voice_id":vid,"text":text})
    json.dump(rows, open(MAP,"w"), indent=1)
    print("MAP BUILT:", [(r["avatar_name"],r["voice_name"]) for r in rows], flush=True)
rows = json.load(open(MAP))

SMOKE = rows[:2]
state_p = OUT/"_state.json"; state = json.load(open(state_p)) if state_p.exists() else {}
def save(): json.dump(state, open(state_p,"w"), indent=1)

# ---- TTS ----
for r in SMOKE:
    st = state.setdefault(r["tag"], {})
    if st.get("wav") and os.path.exists(st["wav"]): continue
    d = api("POST","/v3/voices/speech",{"text":r["text"],"voice_id":r["voice_id"],"speed":1.0})["data"]
    raw = str(OUT/(r["tag"]+"_raw.wav")); wav = str(OUT/(r["tag"]+".wav"))
    urllib.request.urlretrieve(d["audio_url"], raw)
    subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=2.5",
                    "-ar","44100",wav,"-y"], check=True)
    st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=r["text"], voice=r["voice_id"])
    save(); print("TTS OK", r["tag"], flush=True)

# ---- clips ----
vids={}
for r in SMOKE:
    st = state[r["tag"]]
    if st.get("mp4") and os.path.exists(st["mp4"]): continue
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H","x-api-key: "+KEY,"-F","file=@"+st["wav"]])
    asset = json.loads(out)["data"]["asset_id"]
    body = {"video_inputs":[{"character":{"type":"avatar","avatar_id":r["avatar_id"],"avatar_style":"normal"},
        "voice":{"type":"audio","audio_asset_id":asset},
        "background":{"type":"color","value":"#62b3f3"}}],
        "dimension":{"width":1280,"height":720}}
    resp = api("POST","/v2/video/generate",body)
    vids[r["tag"]] = resp["data"]["video_id"]
    print("SUBMITTED", r["tag"], vids[r["tag"]], flush=True)

for tag,vid in vids.items():
    for _ in range(90):
        time.sleep(20)
        d = api("GET","/v1/video_status.get?video_id="+vid)["data"]
        print("...", tag, d["status"], flush=True)
        if d["status"]=="completed":
            f=str(OUT/(tag+"_smoke.mp4")); urllib.request.urlretrieve(d["video_url"], f)
            state[tag]["mp4"]=f; save(); print("DOWNLOADED", f, flush=True); break
        if d["status"]=="failed":
            print("FAILED", tag, d.get("error"), flush=True); break
print("SMOKE DONE", flush=True)
