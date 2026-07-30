import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
SC = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/scenes/module-01"
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lessonB"
os.makedirs(OUT, exist_ok=True)
GROUP = "3a544482e48d40e38c70960df82e4b11"  # Doodle Andrea (course)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

AVS = [
  ("cafe", f"{SC}/andrea_cafe.png", "Hey, Andrea again. Needed some time away from the office. Whew! So are you feeling more confident? You should be!"),
  ("yoga", f"{SC}/andrea_yoga.png", "Take a moment to stand up, stretch, and hydrate. I look forward to seeing you in the next module."),
]

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, path, e.read().decode()[:300], flush=True)
        raise

sp = f"{OUT}/_avatars.json"
state = json.load(open(sp)) if os.path.exists(sp) else {}
def save(): json.dump(state, open(sp, "w"), indent=1)

for name, img, line in AVS:
    st = state.setdefault(name, {})
    # 1. upload image asset
    if not st.get("image_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H",f"x-api-key: {KEY}","-F",f"file=@{img}"])
        st["image_asset"] = json.loads(out)["data"]["asset_id"]; save()
        print("image asset", name, st["image_asset"], flush=True)
    # 2. create photo avatar (JSON with file={type:asset_id} — proven shape from office avatar)
    if not st.get("avatar_id"):
        r = api("POST","/v3/avatars",{"type":"photo","name":f"Doodle Andrea {name} (course)",
            "file":{"type":"asset_id","asset_id":st["image_asset"]},"group_id":GROUP})
        st["avatar_id"] = r["data"]["avatar_item"]["id"]  # proven shape (office avatar)
        save()
        print("avatar", name, st["avatar_id"], flush=True)
        time.sleep(45)  # avatar processing before video submit
    # 3. test-line speech + loudnorm + audio asset
    if not st.get("audio_asset"):
        d = api("POST","/v3/voices/speech",{"text":line,"voice_id":FRIENDLY,"speed":1.0})["data"]
        raw=f"{OUT}/test_{name}_raw.wav"; wav=f"{OUT}/test_{name}.wav"
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"],check=True)
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H",f"x-api-key: {KEY}","-F",f"file=@{wav}"])
        st["audio_asset"] = json.loads(out)["data"]["asset_id"]; save()
        print("audio asset", name, flush=True)
    # 4. test clip
    if not st.get("video_id"):
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":st["avatar_id"],
            "audio_asset_id":st["audio_asset"],"title":f"1B-avatar-test-{name}",
            "resolution":"720p","aspect_ratio":"16:9","expressiveness":"low",
            "motion_prompt":"seated still, minimal natural gestures, warm smile" if name=="cafe"
                            else "holding the yoga pose steadily, minimal natural movement, warm smile"})
        st["video_id"] = r["data"]["video_id"]; save()
        print("video submitted", name, flush=True)
    time.sleep(2)

pending = {n:s["video_id"] for n,s in state.items() if s.get("video_id") and not s.get("file")}
for _ in range(60):
    if not pending: break
    time.sleep(20)
    for name, vid in list(pending.items()):
        try: d = api("GET", f"/v3/videos/{vid}")["data"]
        except Exception: continue
        if d["status"] == "completed":
            f=f"{OUT}/avatar_test_{name}.mp4"; urllib.request.urlretrieve(d["video_url"], f)
            state[name]["file"]=f; del pending[name]; print("downloaded", name, flush=True)
        elif d["status"] == "failed":
            state[name]["error"]=str(d.get("failure_message")); del pending[name]; print("FAILED", name, state[name]["error"], flush=True)
        save()
print("AVATARS DONE", flush=True)
