import json, os, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson2B"
AV = json.load(open(OUT+"/_seller_avatars.json"))["david"]["avatar_id"]
WAV = OUT+"/b02b_david.wav"
def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())
cp = OUT+"/_david_test.json"; C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp,"w"), indent=1)
if not C.get("audio_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H","x-api-key: "+KEY,"-F","file=@"+WAV])
    C["audio_asset"] = json.loads(out)["data"]["asset_id"]; save(); print("audio asset ok", flush=True)
if not C.get("video_id"):
    try:
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV,"audio_asset_id":C["audio_asset"],
            "title":"2B-david-test","resolution":"720p","aspect_ratio":"16:9",
            "expressiveness":"low","motion_prompt":"head and shoulders talking, subtle natural movement, minimal gestures"})
        C["video_id"] = r["data"]["video_id"]; save(); print("VIDEO SUBMITTED — rendering", C["video_id"], flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
        print("SUBMIT FAIL", msg, flush=True)
        if "credit" in msg.lower() or "insufficient" in msg.lower(): print("!!! CREDIT ERROR", flush=True)
        raise SystemExit
for _ in range(90):
    if C.get("file"): break
    time.sleep(20)
    try: d = api("GET","/v3/videos/"+C["video_id"])["data"]
    except Exception: continue
    if d["status"]=="completed":
        f=OUT+"/seller_david_test.mp4"; urllib.request.urlretrieve(d["video_url"], f)
        C["file"]=f; save(); print("DOWNLOADED", f, flush=True); break
    elif d["status"]=="failed":
        C["error"]=str(d.get("failure_message")); save(); print("FAILED", C["error"], flush=True); break
    else: print("...", d["status"], flush=True)
