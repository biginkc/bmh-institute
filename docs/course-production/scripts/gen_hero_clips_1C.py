import json, os, time, urllib.request, subprocess, pathlib

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson1C"
AV_CAR = json.load(open(f"{OUT}/_avatars.json"))["car"]["avatar_id"]
MOTION = "seated in the car, hands relaxed on the wheel, warm and friendly, minimal natural gestures"

CLIPS = [  # (name, beat tag)
 ("hero_b01_intro",   "b01_intro"),
 ("hero_b10_quiet",   "b10_quiet"),
 ("hero_b13_too-high","b13_too-high"),
 ("hero_b19_no-number","b19_no-number"),
 ("hero_b20_movie2",  "b20_movie2"),
 ("hero_b22_outro",   "b22_outro"),
]

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state = json.load(open(f"{OUT}/_state.json"))
cp = f"{OUT}/_hero_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp, "w"), indent=1)

def fail_detail(e):
    return e.read().decode()[:300] if hasattr(e, "read") else str(e)

for name, tag in CLIPS:
    c = C.setdefault(name, {})
    if c.get("error"): c.pop("error"); c.pop("video_id", None)  # clear dead jobs before resume
    try:
        if not c.get("audio_asset"):
            out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
                "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
            c["audio_asset"] = json.loads(out)["data"]["asset_id"]; save()
            print("audio asset", name, flush=True)
        if not c.get("video_id"):
            r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV_CAR,"audio_asset_id":c["audio_asset"],
                "title":f"1C-{name}","resolution":"720p","aspect_ratio":"16:9",
                "expressiveness":"low","motion_prompt":MOTION})
            c["video_id"] = r["data"]["video_id"]; save()
            print("video submitted", name, flush=True)
    except Exception as e:
        d = fail_detail(e)
        if any(k in d.lower() for k in ("credit","insufficient","quota")):
            print("CREDIT-ERROR", name, d, flush=True); raise SystemExit(1)
        print("SUBMIT FAIL", name, d, flush=True)
    time.sleep(2)

pending = {n:c["video_id"] for n,c in C.items() if c.get("video_id") and not c.get("file")}
for _ in range(90):
    if not pending: break
    time.sleep(20)
    for name, vid in list(pending.items()):
        try: d = api("GET", f"/v3/videos/{vid}")["data"]
        except Exception: continue
        if d["status"] == "completed":
            f = f"{OUT}/{name}.mp4"; urllib.request.urlretrieve(d["video_url"], f)
            C[name]["file"] = f; del pending[name]; print("HERO DONE", name, flush=True)
        elif d["status"] == "failed":
            C[name]["error"] = str(d.get("failure_message")); del pending[name]
            print("HERO FAILED", name, C[name]["error"], flush=True)
        save()
print("HERO CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
