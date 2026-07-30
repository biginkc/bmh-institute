import os
import json, os, time, urllib.request, subprocess, pathlib

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
B = BMH_ROOT
OUT = f"{B}/course-assets/heygen/lesson5A"
SCN = f"{B}/course-assets/scenes/module-05"
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
AV_HEADSET = "e527528e584a404f9da68ee4faca1353"   # 1A full-body headset Andrea

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"; state = json.load(open(sp))
def save_state(): json.dump(state, open(sp, "w"), indent=1)

# 1. b04 split audio: b04a (avatar) + b04b (still)
SEG = {
 "b04a_thatsit": "That's it. That's the whole thing. But every piece of that is doing something specific.",
 "b04b_breakdown": "So let me break it down. When you say pre-qualified, that frames the call as a qualification, not a sales pitch. The seller doesn't feel like they're being sold to. They feel like they're being evaluated. It completely flips the dynamic. Suddenly they're wondering if they qualify instead of wondering how to get you off the phone.",
}
for tag, text in SEG.items():
    if state.get(tag, {}).get("wav"): continue
    d = api("POST","/v3/voices/speech",{"text":text,"voice_id":FRIENDLY,"speed":1.0})["data"]
    raw=f"{OUT}/{tag}_raw.wav"; wav=f"{OUT}/{tag}.wav"
    urllib.request.urlretrieve(d["audio_url"], raw)
    subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"], check=True)
    state[tag] = {"wav":wav,"duration":d.get("duration"),"words":d.get("word_timestamps"),"text":text}
    save_state(); print("audio", tag, round(d.get("duration") or 0,1), flush=True); time.sleep(1.5)

cp = f"{OUT}/_clips.json"; C = json.load(open(cp)) if os.path.exists(cp) else {}
def savec(): json.dump(C, open(cp, "w"), indent=1)

# 2. photo avatar from the demo-call doodle still (for b03 lip-sync via Avatar IV)
if not C.get("_b03avatar"):
    o = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{SCN}/m05_L5A_demo-call.png"])
    aid = json.loads(o)["data"]["asset_id"]
    r = api("POST","/v3/avatars",{"type":"photo","name":"5A Demo Andrea desk","file":{"type":"asset_id","asset_id":aid}})
    C["_b03avatar"] = r["data"]["avatar_item"]["id"]; savec()
    print("photo avatar", C["_b03avatar"], flush=True); time.sleep(45)

# 3. clips: b03 lip-sync (demo desk avatar + b03 audio) + b04a full-body (headset + b04a audio)
CLIPS = [
 ("lip_b03_demo",     "b03_demo",     C["_b03avatar"], "seated at a desk on a call, calm and friendly, minimal natural gestures"),
 ("hero_b04a_thatsit","b04a_thatsit", AV_HEADSET,      "standing, hands relaxed at sides, minimal natural gestures, warm smile"),
]
for name, tag, avid, motion in CLIPS:
    c = C.setdefault(name, {})
    if not c.get("audio_asset"):
        o = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
        c["audio_asset"] = json.loads(o)["data"]["asset_id"]; savec()
    if not c.get("video_id"):
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":avid,"audio_asset_id":c["audio_asset"],
            "title":f"5A-{name}","resolution":"720p","aspect_ratio":"16:9","expressiveness":"low","motion_prompt":motion})
        c["video_id"] = r["data"]["video_id"]; savec(); print("submitted", name, flush=True)
    time.sleep(2)

pending = {n:c["video_id"] for n,c in C.items() if isinstance(c,dict) and c.get("video_id") and not c.get("file")}
for _ in range(120):
    if not pending: break
    time.sleep(20)
    for name, vid in list(pending.items()):
        try: d = api("GET", f"/v3/videos/{vid}")["data"]
        except Exception: continue
        if d["status"] == "completed":
            f=f"{OUT}/{name}.mp4"; urllib.request.urlretrieve(d["video_url"], f); C[name]["file"]=f; del pending[name]; print("downloaded", name, flush=True)
        elif d["status"] == "failed":
            C[name]["error"]=str(d.get("failure_message")); del pending[name]; print("FAILED", name, C[name]["error"], flush=True)
        savec()
print("V2 ASSETS DONE", flush=True)
