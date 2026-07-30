import json, time, urllib.request, subprocess, pathlib
KEY=pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT="/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson4A"
HEADSET="e527528e584a404f9da68ee4faca1353"
state=json.load(open(f"{OUT}/_state.json"))
def api(m,p,b=None):
    r=urllib.request.Request(f"https://api.heygen.com{p}",method=m,headers={"x-api-key":KEY,"Content-Type":"application/json"},data=json.dumps(b).encode() if b else None)
    return json.loads(urllib.request.urlopen(r,timeout=120).read())
wav=state["b05a_discovery"]["wav"]
out=subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets","-H",f"x-api-key: {KEY}","-F",f"file=@{wav}"])
asset=json.loads(out)["data"]["asset_id"]; print("asset",asset,flush=True)
r=api("POST","/v3/videos",{"type":"avatar","avatar_id":HEADSET,"audio_asset_id":asset,"title":"4A-hero_b05a_andrea","resolution":"720p","aspect_ratio":"16:9","expressiveness":"low","motion_prompt":"standing full body, warm and engaged, gentle natural gestures, hands relaxed"})
vid=r["data"]["video_id"]; print("submitted",vid,flush=True)
for _ in range(100):
    time.sleep(15)
    d=api("GET",f"/v3/videos/{vid}")["data"]
    if d["status"]=="completed":
        f=f"{OUT}/hero_b05a_andrea.mp4"; urllib.request.urlretrieve(d["video_url"],f); print("downloaded",f,flush=True); break
    if d["status"]=="failed": print("FAILED",d.get("failure_message"),flush=True); break
