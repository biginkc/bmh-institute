import json, os, time, urllib.request, subprocess, pathlib, sys
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson7B"
AV_CAFE = "b2cd05454d284058ad8d7303545821e6"   # Cafe Andrea (intro/yourturn/summary/outro + 32 comebacks)
BLUE = "#62b3f3"

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state = json.load(open(f"{OUT}/_state.json"))

# ---- ANDREA clips (cafe-Andrea): intro, your-turn, 32 comebacks, summary, outro ----
CAFE_MOTION = "seated at the cafe table, warm and friendly, minimal natural gestures, relaxed hands"
CB_MOTION   = "seated at the cafe table, warm and encouraging coaching tone, minimal natural gestures, relaxed hands"
ANDREA_CLIPS = [
 ("hero_intro",    "b01_intro",   AV_CAFE, CAFE_MOTION, None),
 ("hero_yourturn", "b02_yourturn",AV_CAFE, CAFE_MOTION, None),
]
for i in range(1,33):
    ANDREA_CLIPS.append((f"cb{i:02d}", f"d{i:02d}_comeback", AV_CAFE, CB_MOTION, None))
ANDREA_CLIPS += [
 ("hero_summary", "b_summary", AV_CAFE, CAFE_MOTION, None),
 ("hero_outro",   "b_outro",   AV_CAFE, "seated at the cafe table, warm and upbeat, friendly send-off, relaxed hands", None),
]

# ---- SELLER clips: rendered on #62b3f3, keyed onto our world in Remotion. Loaded from the durable map. ----
# (name, seller-wav-tag, avatar_id, motion, BLUE)
SELLER_MOTION = "speaking to camera, natural conversational gestures, then settles to a calm idle"
_smap = f"{OUT}/_seller_map.json"
SELLER_CLIPS = ([(r["tag"], r["tag"], r["avatar_id"], SELLER_MOTION, BLUE)
                 for r in json.load(open(_smap))] if os.path.exists(_smap) else [])

mode = sys.argv[1] if len(sys.argv)>1 else "andrea"   # andrea | sellers | all  [+ optional int limit]
CLIPS = ANDREA_CLIPS if mode=="andrea" else SELLER_CLIPS if mode=="sellers" else ANDREA_CLIPS+SELLER_CLIPS
if len(sys.argv)>2 and sys.argv[2].isdigit():         # smoke-test: cap number of clips
    CLIPS = CLIPS[:int(sys.argv[2])]

cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp, "w"), indent=1)

for name, tag, avid, motion, bg in CLIPS:
    if tag not in state or not state[tag].get("wav"):
        print("NO WAV", name, tag, flush=True); continue
    c = C.setdefault(name, {})
    if not c.get("audio_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H",f"x-api-key: {KEY}","-F",f"file=@{state[tag]['wav']}"])
        j = json.loads(out)
        if "data" not in j or not j["data"].get("asset_id"):
            print("ASSET FAIL", name, str(j)[:200], flush=True); continue
        c["audio_asset"] = j["data"]["asset_id"]; save(); print("audio asset", name, flush=True)
    if not c.get("video_id"):
        body = {"type":"avatar","avatar_id":avid,"audio_asset_id":c["audio_asset"],
                "title":f"7B-{name}","resolution":"720p","aspect_ratio":"16:9",
                "expressiveness":"low","motion_prompt":motion}
        if bg: body["background"] = {"type":"color","value":bg}
        try:
            r = api("POST","/v3/videos",body)
            c["video_id"] = r["data"]["video_id"]; save(); print("submitted", name, flush=True)
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
print("7B CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
