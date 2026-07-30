import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson8A"
AV_HEADSET = "e527528e584a404f9da68ee4faca1353"   # Headset Andrea (corner circles b04/b07/b09)
AV_BEACH   = None  # Beach Andrea photo avatar — set after Jarrad approves the still + test clip gate
BLUE = "#62b3f3"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"
state = json.load(open(sp))
# (name, beat-tag, avatar, motion, background)  bg=None keeps the avatar's own scene (beach)
CLIPS = []
CLIPS.append(("circle_b04", "b04_response",  AV_HEADSET, "standing still, hands relaxed at sides, minimal natural gestures, warm reassuring smile", BLUE))
CLIPS.append(("circle_b07", "b07_leaseback", AV_HEADSET, "standing still, hands relaxed at sides, minimal natural gestures, warm reassuring smile", BLUE))
CLIPS.append(("circle_b09", "b09_contract",  AV_HEADSET, "standing still, hands relaxed at sides, minimal natural gestures, warm reassuring smile", BLUE))
if AV_BEACH:
    CLIPS.append(("hero_b01_intro", "b01_intro", AV_BEACH, "relaxing in the beach chair, warm and friendly, hands resting easy on the chair arms, minimal natural gestures", None))
    CLIPS.append(("hero_b10_outro", "b10_outro", AV_BEACH, "relaxing in the beach chair, warm and upbeat, hands resting easy, minimal natural gestures, friendly send-off", None))

cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp, "w"), indent=1)

for name, tag, avid, motion, bg in CLIPS:
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
        body = {"type":"avatar","avatar_id":avid,"audio_asset_id":c["audio_asset"],
                "title":f"8A-{name}","resolution":"720p","aspect_ratio":"16:9",
                "expressiveness":"low","motion_prompt":motion}
        if bg: body["background"] = {"type":"color","value":bg}
        try:
            r = api("POST","/v3/videos",body)
            c["video_id"] = r["data"]["video_id"]; save()
            print("video submitted", name, flush=True)
        except Exception as e:
            msg = getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
            print("SUBMIT FAIL", name, msg, flush=True)
            if "credit" in msg.lower() or "insufficient" in msg.lower():
                print("!!! CREDIT ERROR — STOPPING", flush=True); raise
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
print("8A CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
