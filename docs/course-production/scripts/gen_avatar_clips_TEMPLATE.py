import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lessonB"
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
AV_HEADSET = "e527528e584a404f9da68ee4faca1353"
AV = json.load(open(f"{OUT}/_avatars.json"))
AV_CAFE = AV["cafe"]["avatar_id"]

B01_TEXT = "Hey, it's me, Andrea again. Needed some time away from the office. Whew! So are you feeling more confident? You should be! You're doing a great job. In this module we'll talk about some of the responses in the script and the mindset attached to those responses."

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"
state = json.load(open(sp))
def save_state(): json.dump(state, open(sp, "w"), indent=1)

# 1. regenerate b01 audio with the new line
st = state["b01_intro"]
if st.get("text") != B01_TEXT:
    d = api("POST","/v3/voices/speech",{"text":B01_TEXT,"voice_id":FRIENDLY,"speed":1.0})["data"]
    raw=f"{OUT}/b01_intro_raw.wav"; wav=f"{OUT}/b01_intro.wav"
    urllib.request.urlretrieve(d["audio_url"], raw)
    subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"],check=True)
    state["b01_intro"] = {"wav":wav,"duration":d.get("duration"),"words":d.get("word_timestamps"),"text":B01_TEXT}
    save_state()
    print("b01 audio regenerated", round(d.get("duration") or 0,1), flush=True)

# 2. five avatar clips
CLIPS = [  # (name, beat tag, avatar id, motion)
 ("hero_b01_intro", "b01_intro", AV_CAFE,   "seated at the cafe table, warm and friendly, minimal natural gestures"),
 ("circle_b04",     "b04_doctor", AV_HEADSET,"standing still, hands relaxed at sides, minimal natural gestures, warm smile"),
 ("circle_b06b",    "b06b_story1",AV_HEADSET,"standing still, hands relaxed at sides, minimal natural gestures, warm smile"),
 ("cafe_b08a",      "b08a_p3",   AV_CAFE,   "seated at the cafe table, warm and friendly, minimal natural gestures"),
 ("hero_b17_outro", "b17_outro", AV_CAFE,   "seated at the cafe table, warm and friendly, minimal natural gestures, waves goodbye warmly at the end"),
]
cp = f"{OUT}/_clips2.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp, "w"), indent=1)

for name, tag, avid, motion in CLIPS:
    c = C.setdefault(name, {})
    if not c.get("audio_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
        c["audio_asset"] = json.loads(out)["data"]["asset_id"]; save()
        print("audio asset", name, flush=True)
    if not c.get("video_id"):
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":avid,"audio_asset_id":c["audio_asset"],
            "title":f"1B-v2-{name}","resolution":"720p","aspect_ratio":"16:9",
            "expressiveness":"low","motion_prompt":motion})
        c["video_id"] = r["data"]["video_id"]; save()
        print("video submitted", name, flush=True)
    time.sleep(2)

pending = {n:c["video_id"] for n,c in C.items() if c.get("video_id") and not c.get("file")}
for _ in range(90):
    if not pending: break
    time.sleep(20)
    for name, vid in list(pending.items()):
        try: d = api("GET", f"/v3/videos/{vid}")["data"]
        except Exception: continue
        if d["status"] == "completed":
            f=f"{OUT}/{name}.mp4"; urllib.request.urlretrieve(d["video_url"], f)
            C[name]["file"]=f; del pending[name]; print("downloaded", name, flush=True)
        elif d["status"] == "failed":
            C[name]["error"]=str(d.get("failure_message")); del pending[name]; print("FAILED", name, C[name]["error"], flush=True)
        save()
print("CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
