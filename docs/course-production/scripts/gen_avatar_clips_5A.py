import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson5A"
AV_CAFE = "b2cd05454d284058ad8d7303545821e6"   # cafe Andrea (bookends)

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"
state = json.load(open(sp))

# hero bookends only (all scene beats are voice-only, animated by Seedance)
CLIPS = [
 ("hero_b01_intro", "b01_intro", AV_CAFE, "seated at the cafe table, warm and friendly, minimal natural gestures"),
 ("hero_b13_outro", "b13_outro", AV_CAFE, "seated at the cafe table, warm and friendly, minimal natural gestures, a warm reassuring smile at the end"),
]
cp = f"{OUT}/_clips.json"
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
            "title":f"5A-{name}","resolution":"720p","aspect_ratio":"16:9",
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
print("5A CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
