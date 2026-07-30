#!/usr/bin/env python3
"""9B v3 outro: standing full-body 1A Andrea (Jarrad redline 2026-07-10) speaking the full
b09_outro wav — replaces the bench b09a/b09b split take. Calm-hands motion prompt."""
import json, subprocess, time, urllib.request, pathlib

ROOT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
OUT  = ROOT/"course-assets/heygen/lesson9B"
KEY  = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
AV_STANDING = "e527528e584a404f9da68ee4faca1353"   # 1A standing full-body Andrea

def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

clips_p = OUT/"_clips.json"; clips = json.load(open(clips_p))
c = clips.setdefault("outro_1a_standing", {})
def save(): json.dump(clips, open(clips_p, "w"), indent=1)

if not c.get("audio_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H","x-api-key: "+KEY,"-F",f"file=@{OUT}/b09_outro.wav"])
    c["audio_asset"] = json.loads(out)["data"]["asset_id"]; save()

if not c.get("video_id"):
    r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV_STANDING,
        "audio_asset_id":c["audio_asset"],"title":"9B-outro-standing","resolution":"720p",
        "aspect_ratio":"16:9","expressiveness":"low",
        "motion_prompt":"standing full body, relaxed warm send-off, hands relaxed at her sides, hands completely still, no hand gestures at all"})
    c["video_id"] = r["data"]["video_id"]; save(); print("SUBMITTED", c["video_id"], flush=True)

for _ in range(90):
    if c.get("file"): break
    time.sleep(20)
    try: d = api("GET", f"/v3/videos/{c['video_id']}")["data"]
    except Exception: continue
    if d["status"] == "completed":
        f = str(OUT/"outro_1a_standing.mp4"); urllib.request.urlretrieve(d["video_url"], f)
        c["file"] = f; save(); print("DOWNLOADED", flush=True); break
    if d["status"] == "failed":
        print("FAILED", d.get("failure_message")); break
print("DONE", c.get("file"))
