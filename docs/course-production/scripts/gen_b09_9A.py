import json, os, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A"
def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())
state = json.load(open(f"{OUT}/_state.json"))
AVS = json.load(open(f"{OUT}/_avatars.json"))
bench = AVS["bench"]["avatar_id"]
C = json.load(open(f"{OUT}/_clips.json"))
c = C.setdefault("hero_b09_outro", {})
def save(): json.dump(C, open(f"{OUT}/_clips.json","w"), indent=1)
if not c.get("audio_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{state['b09_outro']['wav']}"])
    c["audio_asset"] = json.loads(out)["data"]["asset_id"]; save(); print("audio asset b09", flush=True)
if not c.get("video_id"):
    r = api("POST","/v3/videos",{"type":"avatar","avatar_id":bench,"audio_asset_id":c["audio_asset"],
        "title":"9A-hero_b09_outro","resolution":"720p","aspect_ratio":"16:9","expressiveness":"low",
        "motion_prompt":"seated on the park bench, relaxed and warm, minimal natural gestures, friendly send-off"})
    c["video_id"] = r["data"]["video_id"]; save(); print("submitted b09", flush=True)
for _ in range(90):
    if c.get("file"): break
    time.sleep(20)
    try: d = api("GET", f"/v3/videos/{c['video_id']}")["data"]
    except Exception: continue
    if d["status"]=="completed":
        f=f"{OUT}/hero_b09_outro.mp4"; urllib.request.urlretrieve(d["video_url"], f); c["file"]=f; save(); print("downloaded b09", flush=True); break
    elif d["status"]=="failed":
        c["error"]=str(d.get("failure_message")); save(); print("FAILED b09", c["error"], flush=True); break
print("B09 DONE", flush=True)
