import json, os, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
SC = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/scenes/module-09"
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
AV_HEADSET = "e527528e584a404f9da68ee4faca1353"   # proven headset Andrea for corner circles
BLUE = "#62b3f3"
BENCH_STILL = f"{SC}/m09_L9A_bench_andrea.png"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:300]
        print("HTTP", e.code, path, msg, flush=True)
        if "credit" in msg.lower() or "insufficient" in msg.lower() or "balance" in msg.lower():
            print("!!! HEYGEN CREDIT ERROR — STOP AND TELL JARRAD", flush=True)
        raise

st_p = f"{OUT}/_state.json"
state = json.load(open(st_p))  # has b01_intro/b09_outro/b02_decoder/b06_q3 wavs
av_p = f"{OUT}/_avatars.json"
AVS = json.load(open(av_p)) if os.path.exists(av_p) else {}
def save_av(): json.dump(AVS, open(av_p,"w"), indent=1)

# ---- 1. build the park-bench photo avatar (scene-avatar: whole bench scene talks, PLAYBOOK 3.7) ----
b = AVS.setdefault("bench", {})
if not b.get("image_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H",f"x-api-key: {KEY}","-F",f"file=@{BENCH_STILL}"])
    b["image_asset"] = json.loads(out)["data"]["asset_id"]; save_av(); print("bench image asset", b["image_asset"], flush=True)
if not b.get("avatar_id"):
    r = api("POST","/v3/avatars",{"type":"photo","name":"Doodle Andrea park-bench (course)",
        "file":{"type":"asset_id","asset_id":b["image_asset"]}})
    b["avatar_id"] = r["data"]["avatar_item"]["id"]; save_av(); print("bench avatar", b["avatar_id"], flush=True)
    time.sleep(45)

# ---- clips: b01 bench TEST (gate before b09); b02/b06 corner-circles on proven headset avatar ----
# b09 held out of this batch until Jarrad approves the b01 bench-avatar test.
CLIPS = [
  ("hero_b01_intro", "b01_intro",  b["avatar_id"], "seated on the park bench, relaxed and warm, minimal natural gestures, gentle smile", None),
  ("circle_b02",     "b02_decoder", AV_HEADSET,    "standing still, hands relaxed at sides, minimal gestures, warm reassuring smile", BLUE),
  ("circle_b06",     "b06_q3",      AV_HEADSET,    "standing still, hands relaxed at sides, minimal gestures, warm reassuring smile", BLUE),
]
cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save_c(): json.dump(C, open(cp,"w"), indent=1)

for name, tag, avid, motion, bg in CLIPS:
    c = C.setdefault(name, {})
    if not c.get("audio_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
        j = json.loads(out)
        if "data" not in j or not j["data"].get("asset_id"):
            print("ASSET FAIL", name, str(j)[:200], flush=True); continue
        c["audio_asset"] = j["data"]["asset_id"]; save_c(); print("audio asset", name, flush=True)
    if not c.get("video_id"):
        body = {"type":"avatar","avatar_id":avid,"audio_asset_id":c["audio_asset"],
                "title":f"9A-{name}","resolution":"720p","aspect_ratio":"16:9",
                "expressiveness":"low","motion_prompt":motion}
        if bg: body["background"] = {"type":"color","value":bg}
        try:
            r = api("POST","/v3/videos",body); c["video_id"] = r["data"]["video_id"]; save_c()
            print("video submitted", name, flush=True)
        except Exception:
            print("SUBMIT FAIL", name, flush=True); continue
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
        save_c()
print("9A HEYGEN BATCH-1 DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
