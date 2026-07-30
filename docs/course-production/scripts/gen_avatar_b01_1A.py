import json, os, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson2A"
AV = "e527528e584a404f9da68ee4faca1353"  # 1A headset Andrea (on plain blue)
WAV = f"{OUT}/b01_intro.wav"  # merged b01+b02 intro

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

cp = f"{OUT}/_b01_1A.json"
c = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(c, open(cp,"w"), indent=1)

if not c.get("audio_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets","-H",f"x-api-key: {KEY}","-F",f"file=@{WAV}"])
    c["audio_asset"] = json.loads(out)["data"]["asset_id"]; save(); print("audio asset ok", flush=True)
if not c.get("video_id"):
    try:
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV,"audio_asset_id":c["audio_asset"],
            "title":"2A-1A-intro-merged","resolution":"720p","aspect_ratio":"16:9","expressiveness":"low",
            "background":{"type":"color","value":"#62b3f3"},
            "motion_prompt":"standing on plain background, warm and friendly, hands relaxed at her sides, minimal natural gestures, natural head movement while speaking"})
        c["video_id"] = r["data"]["video_id"]; save(); print("video submitted", flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
        print("SUBMIT FAIL", msg, flush=True)
        if "credit" in msg.lower() or "insufficient" in msg.lower(): print("!!! CREDIT ERROR — STOP", flush=True); raise
for _ in range(140):
    if c.get("file"): break
    time.sleep(15)
    try: d = api("GET", f"/v3/videos/{c['video_id']}")["data"]
    except Exception: continue
    if d["status"]=="completed":
        f=f"{OUT}/hero_b01_intro.mp4"; urllib.request.urlretrieve(d["video_url"], f); c["file"]=f; save(); print("downloaded -> hero_b01_intro.mp4", flush=True)
    elif d["status"]=="failed":
        print("FAILED", d.get("failure_message"), flush=True); break
print("DONE", flush=True)
