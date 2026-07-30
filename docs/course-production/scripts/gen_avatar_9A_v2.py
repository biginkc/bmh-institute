import json, os, time, urllib.request, subprocess, pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
SC = f"{BMH_ROOT}/course-assets/scenes/module-09"
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson9A"
BENCH_STILL = f"{SC}/m09_L9A_bench_andrea.png"   # APPROVED v5 still

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:300]; print("HTTP", e.code, path, msg, flush=True)
        if any(k in msg.lower() for k in ("credit","insufficient","balance")):
            print("!!! HEYGEN CREDIT ERROR — STOP AND TELL JARRAD", flush=True)
        raise

state = json.load(open(f"{OUT}/_state.json"))
av_p = f"{OUT}/_avatars.json"; AVS = json.load(open(av_p)) if os.path.exists(av_p) else {}
# rebuild the bench avatar from the NEW approved still (drop the old terrifying-still avatar)
AVS["bench"] = {}
def save_av(): json.dump(AVS, open(av_p,"w"), indent=1)
b = AVS["bench"]
out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
    "-H",f"x-api-key: {KEY}","-F",f"file=@{BENCH_STILL}"])
b["image_asset"] = json.loads(out)["data"]["asset_id"]; save_av(); print("bench image asset", b["image_asset"], flush=True)
r = api("POST","/v3/avatars",{"type":"photo","name":"Doodle Andrea park-bench v5 (course)",
    "file":{"type":"asset_id","asset_id":b["image_asset"]}})
b["avatar_id"] = r["data"]["avatar_item"]["id"]; save_av(); print("bench avatar", b["avatar_id"], flush=True)
time.sleep(45)

# regenerate BOTH bookend clips (b01 + b09) with the new avatar
cp = f"{OUT}/_clips.json"; C = json.load(open(cp)) if os.path.exists(cp) else {}
for k in ("hero_b01_intro","hero_b09_outro"): C.pop(k, None)  # force fresh
def save_c(): json.dump(C, open(cp,"w"), indent=1)
CLIPS = [
  ("hero_b01_intro", "b01_intro",  "seated on the park bench, relaxed and warm, minimal natural gestures, gentle smile"),
  ("hero_b09_outro", "b09_outro",  "seated on the park bench, relaxed and warm, minimal natural gestures, friendly send-off"),
]
for name, tag, motion in CLIPS:
    c = C.setdefault(name, {})
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
    j = json.loads(out)
    if "data" not in j or not j["data"].get("asset_id"):
        print("ASSET FAIL", name, str(j)[:200], flush=True); continue
    c["audio_asset"] = j["data"]["asset_id"]; save_c()
    r = api("POST","/v3/videos",{"type":"avatar","avatar_id":b["avatar_id"],"audio_asset_id":c["audio_asset"],
        "title":f"9A-{name}","resolution":"720p","aspect_ratio":"16:9","expressiveness":"low","motion_prompt":motion})
    c["video_id"] = r["data"]["video_id"]; save_c(); print("submitted", name, flush=True); time.sleep(2)

pending = {n:C[n]["video_id"] for n in ("hero_b01_intro","hero_b09_outro") if C.get(n,{}).get("video_id") and not C[n].get("file")}
for _ in range(90):
    if not pending: break
    time.sleep(20)
    for name, vid in list(pending.items()):
        try: d = api("GET", f"/v3/videos/{vid}")["data"]
        except Exception: continue
        if d["status"]=="completed":
            f=f"{OUT}/{name}.mp4"; urllib.request.urlretrieve(d["video_url"], f); C[name]["file"]=f; del pending[name]; print("downloaded", name, flush=True)
        elif d["status"]=="failed":
            C[name]["error"]=str(d.get("failure_message")); del pending[name]; print("FAILED", name, C[name]["error"], flush=True)
        save_c()
print("9A AVATAR v2 DONE:", sum(1 for n in ("hero_b01_intro","hero_b09_outro") if C.get(n,{}).get("file")), "/2", flush=True)
