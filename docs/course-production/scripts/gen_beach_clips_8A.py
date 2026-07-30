import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson8A"

AV_BEACH = json.load(open(f"{OUT}/_beach_avatar.json"))["avatar_id"]
MOTION = "relaxing in the beach chair, warm and friendly, hands resting easy on the chair arms, minimal natural gestures"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state = json.load(open(f"{OUT}/_state.json"))
CLIPS = [
    ("circle_b04", "b04_response"),
    ("circle_b07", "b07_leaseback"),
    ("circle_b09", "b09_contract"),
    ("hero_b10_outro", "b10_outro"),
]

cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp, "w"), indent=1)

for name, _ in CLIPS:
    C.pop(name, None)
save()

for name, tag in CLIPS:
    c = C.setdefault(name, {})
    if not c.get("audio_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
        j = json.loads(out)
        if "data" not in j or not j["data"].get("asset_id"):
            print("ASSET FAIL", name, str(j)[:200], flush=True); continue
        c["audio_asset"] = j["data"]["asset_id"]; save()
        print("audio asset", name, flush=True)
    if not c.get("video_id"):
        try:
            r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV_BEACH,"audio_asset_id":c["audio_asset"],
                "title":f"8A-{name}-beach","resolution":"720p","aspect_ratio":"16:9",
                "expressiveness":"low","motion_prompt":MOTION})
            c["video_id"] = r["data"]["video_id"]; save()
            print("video submitted", name, flush=True)
        except Exception as e:
            msg = getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
            print("SUBMIT FAIL", name, msg, flush=True)
            if "credit" in msg.lower() or "insufficient" in msg.lower():
                print("!!! CREDIT ERROR — STOPPING", flush=True); raise SystemExit(1)
    time.sleep(2)

pending = {n:c["video_id"] for n,c in C.items() if n in dict(CLIPS) and c.get("video_id") and not c.get("file")}
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
print("BEACH CLIPS DONE:", sum(1 for n,_ in CLIPS if C.get(n,{}).get("file")), "/", len(CLIPS), flush=True)
