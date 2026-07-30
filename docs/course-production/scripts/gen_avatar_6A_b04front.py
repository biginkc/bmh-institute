import json, os, time, urllib.request, subprocess
import pathlib
# b04 "maskreveal" front phase: cafe Andrea speaks the front portion (b04_front.wav) to camera,
# then Remotion cuts to the mask still at swapFrame. Output -> hero_b04_front.mp4.
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson6A"
AV_CAFE = "b2cd05454d284058ad8d7303545821e6"   # Cafe Andrea (bookends + b04 front)
WAV = f"{OUT}/b04_front.wav"
NAME = "hero_b04_front"
MOTION = "seated at the cafe table, warm and direct, explaining thoughtfully to camera, minimal natural gestures"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

cp = f"{OUT}/_clips_b04front.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp, "w"), indent=1)
c = C.setdefault(NAME, {})

assert os.path.exists(WAV), f"missing {WAV}"

if not c.get("audio_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{WAV}"])
    j = json.loads(out)
    if "data" not in j or not j["data"].get("asset_id"):
        print("ASSET FAIL", str(j)[:300], flush=True); raise SystemExit(1)
    c["audio_asset"] = j["data"]["asset_id"]; save(); print("audio asset ok", flush=True)

if not c.get("video_id"):
    try:
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV_CAFE,"audio_asset_id":c["audio_asset"],
            "title":f"6A-{NAME}","resolution":"720p","aspect_ratio":"16:9",
            "expressiveness":"low","motion_prompt":MOTION})
        c["video_id"] = r["data"]["video_id"]; save(); print("video submitted", c["video_id"], flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:300] if hasattr(e,'read') else str(e)
        print("SUBMIT FAIL", msg, flush=True)
        raise

for _ in range(90):
    if c.get("file"): break
    time.sleep(20)
    try: d = api("GET", f"/v3/videos/{c['video_id']}")["data"]
    except Exception: continue
    st = d.get("status")
    if st == "completed":
        f=f"{OUT}/{NAME}.mp4"; urllib.request.urlretrieve(d["video_url"], f)
        c["file"]=f; save(); print("DOWNLOADED", f, flush=True); break
    elif st == "failed":
        c["error"]=str(d.get("failure_message")); save(); print("FAILED", c["error"], flush=True); break
    else:
        print("status", st, flush=True)
print("B04FRONT DONE:", c.get("file") or c.get("error") or "timeout", flush=True)
