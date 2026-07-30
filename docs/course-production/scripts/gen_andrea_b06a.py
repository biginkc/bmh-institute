import json, os, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson4A"
HEADSET = "e527528e584a404f9da68ee4faca1353"  # standing full-body Andrea
state = json.load(open(f"{OUT}/_state.json"))
def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())
wav = state["b06a_handoff"]["wav"]
out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
    "-H",f"x-api-key: {KEY}","-F",f"file=@{wav}"])
asset = json.loads(out)["data"]["asset_id"]
print("audio asset", asset, flush=True)
r = api("POST","/v3/videos",{"type":"avatar","avatar_id":HEADSET,"audio_asset_id":asset,
    "title":"4A-hero_b06a_andrea","resolution":"720p","aspect_ratio":"16:9",
    "expressiveness":"low","motion_prompt":"standing full body, calm and serious, gentle emphasis, hands relaxed at sides, minimal natural gestures"})
vid = r["data"]["video_id"]; print("submitted", vid, flush=True)
for _ in range(90):
    time.sleep(15)
    d = api("GET", f"/v3/videos/{vid}")["data"]
    if d["status"] == "completed":
        f=f"{OUT}/hero_b06a_andrea.mp4"; urllib.request.urlretrieve(d["video_url"], f)
        print("downloaded", f, flush=True); break
    if d["status"] == "failed":
        print("FAILED", d.get("failure_message"), flush=True); break
