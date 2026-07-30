import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lessonGLOA"
AV_OFFICE = "e527528e584a404f9da68ee4faca1353"  # 1A solo headset Andrea (Jarrad watch-through pick 2026-07-10) — render on course blue via background param (2A recipe)
MOTION = "standing alone, hands resting still at her sides, barely any hand movement, NO large or sweeping gestures, warm calm delivery"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state = json.load(open(f"{OUT}/_state.json"))

# office Andrea clips: heroes b01/b05, corner-circle sources b02/b07/b11/b20, side-full b10/b15/b21
CLIPS = [
 ("hero_b01",   "b01_open"),
 ("circle_b02", "b02_library"),
 ("hero_b05",   "b05_why"),
 ("circle_b07", "b07_asis_call"),
 ("side_b10",   "b10_mls"),
 ("circle_b11", "b11_onmarket"),
 ("side_b15",   "b15_garage_sale"),
 ("circle_b20", "b20_seller_fin"),
 ("side_b21",   "b21_recap"),
]
cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp, "w"), indent=1)

for name, tag in CLIPS:
    c = C.setdefault(name, {})
    try:
        if not c.get("audio_asset"):
            out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
                "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
            j = json.loads(out)
            if "data" not in j or not j["data"]:
                print("ASSET FAIL", name, str(j)[:200], flush=True); break
            c["audio_asset"] = j["data"]["asset_id"]; save()
            print("audio asset", name, flush=True)
        if not c.get("video_id") and not c.get("error"):
            r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV_OFFICE,"audio_asset_id":c["audio_asset"],
                "title":f"GLOA-{name}","resolution":"720p","aspect_ratio":"16:9",
                "background":{"type":"color","value":"#62b3f3"},
                "expressiveness":"low","motion_prompt":MOTION})
            c["video_id"] = r["data"]["video_id"]; save()
            print("video submitted", name, flush=True)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        print("SUBMIT FAIL", name, e.code, body, flush=True)
        if "credit" in body.lower() or e.code == 402:
            print("HEYGEN CREDITS EXHAUSTED — STOPPING (do not drain pool retrying)", flush=True)
            break
    time.sleep(2)

pending = {n:c["video_id"] for n,c in C.items() if c.get("video_id") and not c.get("file") and not c.get("error")}
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
print("GLOA CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
