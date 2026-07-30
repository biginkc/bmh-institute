import os
import json, os, time, urllib.request, subprocess
import pathlib

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
B = BMH_ROOT
OUT = f"{B}/course-assets/heygen/lesson2A"
SRC = f"{B}/course-assets/scenes/module-02/m02_L2A_office_andrea_v4a.png"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state = json.load(open(f"{OUT}/_state.json"))
av = json.load(open(f"{OUT}/_office_avatar.json")) if os.path.exists(f"{OUT}/_office_avatar.json") else {}
def save_av(): json.dump(av, open(f"{OUT}/_office_avatar.json","w"), indent=1)

# 1. upload v4a as image asset
if not av.get("image_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{SRC}"])
    j = json.loads(out)
    av["image_asset"] = j["data"]["asset_id"]; save_av(); print("image asset", av["image_asset"], flush=True)

# 2. create photo avatar
if not av.get("avatar_id"):
    r = api("POST","/v3/avatars",{"type":"photo","name":"Office Andrea BMH",
        "file":{"type":"asset_id","asset_id":av["image_asset"]}})
    av["avatar_id"] = r["data"]["avatar_item"]["id"]; save_av()
    print("avatar_id", av["avatar_id"], flush=True)
    print("waiting 50s for avatar to process...", flush=True); time.sleep(50)

AV = av["avatar_id"]
# 3. five talking clips (seated at office desk)
CLIPS = [  # (name, beat tag, motion)  — REV4: b01 ONLY (b02/b17/b19/b21 live on the 1A avatar, don't touch)
 ("hero_b01_intro",         "b01_intro",         "seated at her office desk with both hands resting still on the desk, calm and composed, almost no arm movement, only gentle head nods and natural blinking, no big gestures"),
]
cp = f"{OUT}/_office_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp,"w"), indent=1)

for name, tag, motion in CLIPS:
    c = C.setdefault(name, {})
    if c.get("file"): continue
    if not c.get("audio_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
        j = json.loads(out)
        if "data" not in j or not j["data"].get("asset_id"):
            print("ASSET FAIL", name, str(j)[:200], flush=True); continue
        c["audio_asset"] = j["data"]["asset_id"]; save(); print("audio asset", name, flush=True)
    if not c.get("video_id"):
        try:
            r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV,"audio_asset_id":c["audio_asset"],
                "title":f"2A-office-{name}","resolution":"720p","aspect_ratio":"16:9",
                "expressiveness":"low","motion_prompt":motion})
            c["video_id"] = r["data"]["video_id"]; save(); print("video submitted", name, flush=True)
        except Exception as e:
            msg = getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
            print("SUBMIT FAIL", name, msg, flush=True)
            if "credit" in msg.lower() or "insufficient" in msg.lower():
                print("!!! CREDIT ERROR — STOPPING", flush=True); raise
    time.sleep(2)

pending = {n:c["video_id"] for n,c in C.items() if c.get("video_id") and not c.get("file")}
for _ in range(120):
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
print("OFFICE CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
