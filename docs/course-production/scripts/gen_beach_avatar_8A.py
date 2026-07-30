import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson8A"
IMG = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/scenes/module-08/m08_L8A_andrea-beach.png"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

ap = f"{OUT}/_beach_avatar.json"
A = json.load(open(ap)) if os.path.exists(ap) else {}
def save(): json.dump(A, open(ap, "w"), indent=1)

if not A.get("asset_id"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{IMG}"])
    j = json.loads(out)
    A["asset_id"] = j["data"]["asset_id"]; save()
    print("image asset", A["asset_id"], flush=True)

if not A.get("avatar_id"):
    # `name` is REQUIRED — omitting it 400s (PLAYBOOK 7.4)
    r = api("POST","/v3/avatars",{"type":"photo","name":"Beach Andrea (course 8A)",
        "file":{"type":"asset_id","asset_id":A["asset_id"]}})
    A["avatar_id"] = r["data"]["avatar_item"]["id"]; save()
    print("avatar", A["avatar_id"], flush=True)
    time.sleep(45)  # avatar warm-up

# Test clip = the real b01 hero (gates the batch per guide Stage 4)
state = json.load(open(f"{OUT}/_state.json"))
cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def csave(): json.dump(C, open(cp, "w"), indent=1)

c = C.setdefault("hero_b01_intro", {})
if not c.get("audio_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{state['b01_intro']['wav']}"])
    c["audio_asset"] = json.loads(out)["data"]["asset_id"]; csave()
    print("audio asset b01", flush=True)
if not c.get("video_id"):
    try:
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":A["avatar_id"],
            "audio_asset_id":c["audio_asset"],"title":"8A-hero_b01_beach-TEST",
            "resolution":"720p","aspect_ratio":"16:9","expressiveness":"low",
            "motion_prompt":"relaxing in the beach chair, warm and friendly, hands resting easy on the chair arms, minimal natural gestures"})
        c["video_id"] = r["data"]["video_id"]; csave()
        print("video submitted", flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
        print("SUBMIT FAIL", msg, flush=True)
        if "credit" in msg.lower() or "insufficient" in msg.lower():
            print("!!! CREDIT ERROR — STOPPING", flush=True)
        raise SystemExit(1)

for _ in range(60):
    time.sleep(20)
    d = api("GET", f"/v3/videos/{c['video_id']}")["data"]
    if d["status"] == "completed":
        f = f"{OUT}/hero_b01_intro.mp4"; urllib.request.urlretrieve(d["video_url"], f)
        c["file"] = f; csave(); print("downloaded hero_b01_intro (beach test clip)", flush=True); break
    if d["status"] == "failed":
        c["error"] = str(d.get("failure_message")); csave(); print("FAILED", c["error"], flush=True); break
print("BEACH AVATAR LANE DONE", flush=True)
