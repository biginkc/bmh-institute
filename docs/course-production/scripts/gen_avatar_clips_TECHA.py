import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lessonTECHA"
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
 ("circle_b03", "b03_sandra"),
 ("circle_b09", "b09_dialpad"),
 ("circle_b12", "b12_tasks"),
 ("circle_b15", "b15_institute"),
 ("hero_b17",   "b17_recap"),
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
                "title":f"TECHA-{name}","resolution":"720p","aspect_ratio":"16:9",
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
print("TECHA CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)

import glob
for f in glob.glob(f"{OUT}/hero_b*.mp4") + glob.glob(f"{OUT}/circle_b*.mp4"):
    mov = f.replace(".mp4", "_alpha.mov")
    subprocess.run(["ffmpeg","-v","error","-i",f,
        "-vf","colorspace=bt709:iall=bt709,colorkey=0x67B6EE:0.15:0.02",
        "-c:v","prores_ks","-profile:v","4444","-pix_fmt","yuva444p10le","-an",mov,"-y"], check=True)
    print("keyed", mov, flush=True)
print("TECHA ALPHA DONE", flush=True)
