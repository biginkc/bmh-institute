#!/usr/bin/env python3
"""One-clip probe: render a Lesson 7B studio-avatar seller via the classic /v2/video/generate path
(the public avatars reject /v3 Avatar IV). Proves endpoint + colored-background swap before batching.
Renders drill 1 (Teodor) only. Poll via /v1/video_status.get."""
import json, os, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson7B"
row = json.load(open(OUT+"/_seller_map.json"))[0]      # drill 1 = Teodor
AV, TAG = row["avatar_id"], row["tag"]
state = json.load(open(OUT+"/_state.json"))
WAV = state[TAG]["wav"]

def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

# upload audio asset
out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
    "-H","x-api-key: "+KEY,"-F","file=@"+WAV])
asset = json.loads(out)["data"]["asset_id"]
print("audio asset", asset, flush=True)

body = {"video_inputs":[{
    "character":{"type":"avatar","avatar_id":AV,"avatar_style":"normal"},
    "voice":{"type":"audio","audio_asset_id":asset},
    "background":{"type":"color","value":"#62b3f3"},
}],"dimension":{"width":1280,"height":720}}
try:
    r = api("POST","/v2/video/generate",body)
    print("SUBMIT RESP:", json.dumps(r)[:300], flush=True)
    vid = r["data"]["video_id"]
except Exception as e:
    msg = getattr(e,'read',lambda:b'')().decode()[:400] if hasattr(e,'read') else str(e)
    print("SUBMIT FAIL", msg, flush=True); raise SystemExit

for _ in range(90):
    time.sleep(20)
    d = api("GET","/v1/video_status.get?video_id="+vid)["data"]
    print("...", d["status"], flush=True)
    if d["status"]=="completed":
        f=OUT+"/"+TAG+".mp4"; urllib.request.urlretrieve(d["video_url"], f)
        print("DOWNLOADED", f, flush=True); break
    if d["status"]=="failed":
        print("FAILED", d.get("error"), flush=True); break
