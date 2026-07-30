#!/usr/bin/env python3
"""Lesson 9B: (1) Q9 seller swap Imelda→Zosia (Jarrad-board alternate; framing mismatch fix),
(2) all 9 park-bench Andrea clips from the banked wavs (9A bench recipe: /v3/videos, 720p, 16:9,
expressiveness low, calm-hands motion prompts)."""
import json, os, time, urllib.request, subprocess, pathlib

ROOT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
OUT  = ROOT/"course-assets/heygen/lesson9B"
KEY  = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
BENCH = "05fa4c66c4504b929d4d7dd6f679cd4b"   # park-bench Andrea (9A bookends)

def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state_p = OUT/"_state.json"; state = json.load(open(state_p))
def save(): json.dump(state, open(state_p,"w"), indent=1)

# ---- Q9 swap: Imelda -> Zosia ----
rows = json.load(open(OUT/"_seller_map.json"))
q9 = next(r for r in rows if r["tag"]=="q9_seller")
if "Zosia" not in q9["avatar_name"]:
    z = next(a for a in json.load(open("/private/tmp/claude-502/-Users-jarradhenry-BMH-OS/9fc9be95-6681-43e3-b63a-a82a6eed54d6/scratchpad/9b_candidates.json")) if "Zosia" in a["avatar_name"])
    q9["avatar_name"]=z["avatar_name"]; q9["avatar_id"]=z["avatar_id"]
    json.dump(rows, open(OUT/"_seller_map.json","w"), indent=1)
    state["q9_seller"].pop("mp4", None)   # wav + voice stay (Adriana)
    save(); print("Q9 SWAPPED to", z["avatar_name"], flush=True)

st = state["q9_seller"]
if not st.get("mp4"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H","x-api-key: "+KEY,"-F","file=@"+st["wav"]])
    asset = json.loads(out)["data"]["asset_id"]
    body = {"video_inputs":[{"character":{"type":"avatar","avatar_id":q9["avatar_id"],"avatar_style":"normal"},
        "voice":{"type":"audio","audio_asset_id":asset},
        "background":{"type":"color","value":"#62b3f3"}}],
        "dimension":{"width":1280,"height":720}}
    vid = api("POST","/v2/video/generate",body)["data"]["video_id"]
    print("Q9 SUBMITTED", vid, flush=True)
    for _ in range(90):
        time.sleep(20)
        d = api("GET","/v1/video_status.get?video_id="+vid)["data"]
        if d["status"]=="completed":
            f=str(OUT/"q9_seller_ask.mp4"); urllib.request.urlretrieve(d["video_url"], f)
            st["mp4"]=f; save(); print("Q9 DOWNLOADED (Zosia)", flush=True); break
        if d["status"]=="failed": print("Q9 FAILED", d.get("error"), flush=True); break

# ---- Andrea bench clips ----
MOTION = {
 "b01_bridge":  "seated on the park bench, relaxed and warm, welcoming, minimal natural gestures",
 "a06_answer":  "seated on the park bench, calm teaching tone, hands resting in lap, minimal gestures",
 "a07_answer":  "seated on the park bench, direct and reassuring, hands resting in lap, minimal gestures",
 "a08_answer":  "seated on the park bench, calm step-by-step explaining, hands resting in lap, minimal gestures",
 "a09_answer":  "seated on the park bench, easygoing and flexible tone, hands resting in lap, minimal gestures",
 "a10_answer":  "seated on the park bench, gentle and trust-building, hands resting in lap, minimal gestures",
 "b07_close":   "seated on the park bench, sincere and grounded, hands resting in lap, minimal gestures",
 "b08_practice":"seated on the park bench, warm encouraging tone, hands resting folded in lap, hands completely still, no hand gestures at all",
 "b09_outro":   "seated on the park bench, relaxed warm send-off, hands resting folded in lap, hands completely still, no hand gestures at all",
}
clips_p = OUT/"_clips.json"; clips = json.load(open(clips_p)) if clips_p.exists() else {}
def csave(): json.dump(clips, open(clips_p,"w"), indent=1)

for tag, motion in MOTION.items():
    c = clips.setdefault("bench_"+tag, {})
    if c.get("file"): continue
    if not c.get("audio_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H","x-api-key: "+KEY,"-F","file=@"+state[tag]["wav"]])
        c["audio_asset"] = json.loads(out)["data"]["asset_id"]; csave()
    if not c.get("video_id"):
        r = api("POST","/v3/videos",{"type":"avatar","avatar_id":BENCH,"audio_asset_id":c["audio_asset"],
            "title":"9B-"+tag,"resolution":"720p","aspect_ratio":"16:9","expressiveness":"low",
            "motion_prompt":motion})
        c["video_id"] = r["data"]["video_id"]; csave(); print("SUBMITTED", tag, flush=True)
    time.sleep(2)

pending = {t for t in MOTION if not clips["bench_"+t].get("file")}
for _ in range(240):
    if not pending: break
    time.sleep(20)
    for t in list(pending):
        c = clips["bench_"+t]
        try: d = api("GET", f"/v3/videos/{c['video_id']}")["data"]
        except Exception: continue
        if d["status"]=="completed":
            f=str(OUT/("bench_"+t+".mp4")); urllib.request.urlretrieve(d["video_url"], f)
            c["file"]=f; csave(); pending.discard(t); print("DOWNLOADED", t, flush=True)
        elif d["status"]=="failed":
            c["error"]=str(d.get("failure_message")); csave(); pending.discard(t); print("FAILED", t, c["error"], flush=True)
print("ANDREA CLIPS DONE; pending:", pending, flush=True)
