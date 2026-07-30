import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
OUT = f"{B}/course-assets/heygen/lesson2A"
SRC = f"{B}/course-assets/scenes/module-02/m02_L2A_office_andrea_v3b.png"  # standing full-body office

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state = json.load(open(f"{OUT}/_state.json"))
av = json.load(open(f"{OUT}/_office_standing_avatar.json")) if os.path.exists(f"{OUT}/_office_standing_avatar.json") else {}
def save_av(): json.dump(av, open(f"{OUT}/_office_standing_avatar.json","w"), indent=1)

if not av.get("image_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets","-H",f"x-api-key: {KEY}","-F",f"file=@{SRC}"])
    av["image_asset"] = json.loads(out)["data"]["asset_id"]; save_av(); print("image asset", av["image_asset"], flush=True)
if not av.get("avatar_id"):
    r = api("POST","/v3/avatars",{"type":"photo","name":"Office Andrea Standing BMH","file":{"type":"asset_id","asset_id":av["image_asset"]}})
    av["avatar_id"] = r["data"]["avatar_item"]["id"]; save_av(); print("avatar_id", av["avatar_id"], flush=True)
    print("waiting 50s...", flush=True); time.sleep(50)
AV = av["avatar_id"]

c = av.get("b01_clip", {})
if not c.get("audio_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets","-H",f"x-api-key: {KEY}","-F",f"file=@{state['b01_intro']['wav']}"])
    c["audio_asset"] = json.loads(out)["data"]["asset_id"]; av["b01_clip"]=c; save_av(); print("audio asset ok", flush=True)
if not c.get("video_id"):
    try:
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV,"audio_asset_id":c["audio_asset"],
            "title":"2A-office-standing-b01","resolution":"720p","aspect_ratio":"16:9","expressiveness":"low",
            "motion_prompt":"standing in her office, calm and composed, hands relaxed at her sides, only gentle head nods and natural blinking, minimal natural gestures, no big arm movements"})
        c["video_id"] = r["data"]["video_id"]; av["b01_clip"]=c; save_av(); print("video submitted", flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
        print("SUBMIT FAIL", msg, flush=True)
        if "credit" in msg.lower() or "insufficient" in msg.lower(): print("!!! CREDIT ERROR — STOP", flush=True); raise

for _ in range(120):
    if c.get("file"): break
    time.sleep(15)
    try: d = api("GET", f"/v3/videos/{c['video_id']}")["data"]
    except Exception: continue
    if d["status"]=="completed":
        f=f"{OUT}/hero_b01_intro.mp4"; urllib.request.urlretrieve(d["video_url"], f); c["file"]=f; av["b01_clip"]=c; save_av(); print("downloaded -> hero_b01_intro.mp4", flush=True)
    elif d["status"]=="failed":
        print("FAILED", d.get("failure_message"), flush=True); break
print("DONE", flush=True)
