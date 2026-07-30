import json, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lessonGLOA"
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
AV = "e527528e584a404f9da68ee4faca1353"
TEXT = "That's your core vocabulary. Hang onto these terms — you'll hear them again and again out in the field. Let's keep moving."

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"; state = json.load(open(sp))
if not state.get("b22_outro", {}).get("wav"):
    d = api("POST","/v3/voices/speech",{"text":TEXT,"voice_id":FRIENDLY,"speed":1.0})["data"]
    raw, wav = f"{OUT}/b22_outro_raw.wav", f"{OUT}/b22_outro.wav"
    urllib.request.urlretrieve(d["audio_url"], raw)
    subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"], check=True)
    state["b22_outro"] = {"wav":wav,"duration":d.get("duration"),"words":d.get("word_timestamps"),"text":TEXT}
    json.dump(state, open(sp,"w"), indent=1)
    print("outro audio", round(d.get("duration") or 0,1), flush=True)

out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
    "-H",f"x-api-key: {KEY}","-F",f"file=@{OUT}/b22_outro.wav"])
asset = json.loads(out)["data"]["asset_id"]
r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV,"audio_asset_id":asset,
    "title":"GLOA-hero_b22","resolution":"720p","aspect_ratio":"16:9",
    "background":{"type":"color","value":"#62b3f3"},
    "expressiveness":"low","motion_prompt":"standing alone, hands resting still at her sides, barely any hand movement, NO large or sweeping gestures, warm farewell"})
vid = r["data"]["video_id"]; print("submitted", vid, flush=True)
for _ in range(60):
    time.sleep(15)
    d = api("GET", f"/v3/videos/{vid}")["data"]
    if d["status"] == "completed":
        urllib.request.urlretrieve(d["video_url"], f"{OUT}/hero_b22.mp4"); print("downloaded", flush=True); break
    if d["status"] == "failed":
        print("FAILED:", d.get("failure_message"), flush=True); raise SystemExit(1)
subprocess.run(["ffmpeg","-v","error","-i",f"{OUT}/hero_b22.mp4",
    "-vf","colorspace=bt709:iall=bt709,colorkey=0x67B6EE:0.15:0.02",
    "-c:v","prores_ks","-profile:v","4444","-pix_fmt","yuva444p10le","-an",f"{OUT}/hero_b22_alpha.mov","-y"], check=True)
print("OUTRO CLIP READY (alpha)", flush=True)
