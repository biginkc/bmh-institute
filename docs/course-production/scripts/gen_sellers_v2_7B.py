#!/usr/bin/env python3
"""Render Lesson 7B seller clips via classic /v2/video/generate (studio avatars reject /v3 Avatar IV).
Reads course-assets/heygen/lesson7B/_seller_map.json (32 drills). Renders each avatar on #62b3f3 for
Remotion chroma-key. Resumable via _clips.json (shared with Andrea clips). Hard-stop on credit error.

Usage:  python3 gen_sellers_v2_7B.py [N]     # N = optional cap for a partial batch (default all 32)
"""
import json, os, time, urllib.request, subprocess, pathlib, sys
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson7B"
BLUE = "#62b3f3"

def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state = json.load(open(OUT+"/_state.json"))
rows  = json.load(open(OUT+"/_seller_map.json"))
if len(sys.argv) > 1 and sys.argv[1].isdigit():
    rows = rows[:int(sys.argv[1])]

cp = OUT+"/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp,"w"), indent=1)

for r in rows:
    name = r["tag"]                                   # dNN_seller
    if C.get(name, {}).get("file"): continue          # already done
    if not state.get(name, {}).get("wav"):
        print("NO WAV", name, flush=True); continue
    c = C.setdefault(name, {})
    if not c.get("audio_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H","x-api-key: "+KEY,"-F","file=@"+state[name]["wav"]])
        j = json.loads(out)
        if not j.get("data",{}).get("asset_id"):
            print("ASSET FAIL", name, str(j)[:200], flush=True); continue
        c["audio_asset"] = j["data"]["asset_id"]; save()
    if not c.get("video_id"):
        body = {"video_inputs":[{
            "character":{"type":"avatar","avatar_id":r["avatar_id"],"avatar_style":"normal"},
            "voice":{"type":"audio","audio_asset_id":c["audio_asset"]},
            "background":{"type":"color","value":BLUE},
        }],"dimension":{"width":1280,"height":720}}
        try:
            resp = api("POST","/v2/video/generate",body)
            c["video_id"] = resp["data"]["video_id"]; c["engine"]="v2"; save()
            print("submitted", name, r["avatar_name"], flush=True)
        except Exception as e:
            msg = getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
            print("SUBMIT FAIL", name, msg, flush=True)
            if "credit" in msg.lower() or "insufficient" in msg.lower():
                print("!!! CREDIT ERROR — STOPPING", flush=True); raise
    time.sleep(2)

# poll v2 renders via /v1/video_status.get
pending = {n:c["video_id"] for n,c in C.items() if n.endswith("_seller") and c.get("video_id") and not c.get("file")}
for _ in range(180):
    if not pending: break
    time.sleep(20)
    for name, vid in list(pending.items()):
        try: d = api("GET","/v1/video_status.get?video_id="+vid)["data"]
        except Exception: continue
        if d["status"]=="completed":
            f=OUT+"/"+name+".mp4"; urllib.request.urlretrieve(d["video_url"], f)
            C[name]["file"]=f; del pending[name]; print("downloaded", name, flush=True)
        elif d["status"]=="failed":
            C[name]["error"]=str(d.get("error")); del pending[name]; print("FAILED", name, C[name]["error"], flush=True)
        save()
print("7B SELLERS:", sum(1 for n,c in C.items() if n.endswith('_seller') and c.get('file')), "/", len(rows), flush=True)
