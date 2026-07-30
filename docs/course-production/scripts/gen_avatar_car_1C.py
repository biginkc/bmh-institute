import os
import json, os, time, urllib.request, subprocess, pathlib

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
BASE = BMH_ROOT
OUT = f"{BASE}/course-assets/heygen/lesson1C"
IMG = f"{BASE}/course-assets/scenes/module-01/andrea_car_v2.png"
TEST_WAV = f"{OUT}/smoke/smoke.wav"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

def curl_asset(path):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{path}"])
    return json.loads(out)["data"]["asset_id"]

ap = f"{OUT}/_avatars.json"
A = json.load(open(ap)) if os.path.exists(ap) else {}
def save(): json.dump(A, open(ap, "w"), indent=1)

car = A.setdefault("car", {})
try:
    if not car.get("avatar_id"):
        img_asset = curl_asset(IMG)
        print("CAR image asset OK", flush=True)
        r = api("POST","/v3/avatars",{"type":"photo","name":"Car Andrea (course)","file":{"type":"asset_id","asset_id":img_asset}})
        car["avatar_id"] = r["data"]["avatar_item"]["id"]; save()
        print("CAR avatar created:", car["avatar_id"], flush=True)
        time.sleep(45)
    if not car.get("test_video_id"):
        wav_asset = curl_asset(TEST_WAV)
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":car["avatar_id"],"audio_asset_id":wav_asset,
            "title":"1C-car-avatar-test","resolution":"720p","aspect_ratio":"16:9",
            "expressiveness":"low","motion_prompt":"seated in the car, hands relaxed on the wheel, warm and friendly, minimal natural gestures"})
        car["test_video_id"] = r["data"]["video_id"]; save()
        print("CAR test clip submitted", flush=True)
except Exception as e:
    detail = e.read().decode()[:300] if hasattr(e,'read') else str(e)
    marker = "CREDIT-ERROR" if any(k in detail.lower() for k in ("credit","insufficient","quota")) else "FAIL"
    print(f"CAR-AVATAR {marker}: {detail}", flush=True); raise SystemExit(1)

for _ in range(45):
    time.sleep(20)
    try: d = api("GET", f"/v3/videos/{car['test_video_id']}")["data"]
    except Exception: continue
    if d["status"] == "completed":
        f = f"{OUT}/avatar_car_test.mp4"
        urllib.request.urlretrieve(d["video_url"], f)
        car["test_file"] = f; save()
        print("CAR-AVATAR TEST DONE:", f, flush=True); raise SystemExit(0)
    if d["status"] == "failed":
        print("CAR-AVATAR FAIL at render:", d.get("failure_message"), flush=True); raise SystemExit(1)
    print("polling...", d["status"], flush=True)
print("CAR-AVATAR FAIL: poll timeout", flush=True)
