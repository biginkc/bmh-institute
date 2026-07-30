import json, os, time, urllib.request, subprocess, pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson2B"
SA = json.load(open(OUT+"/_seller_avatars.json"))
DESK = "8200f90176d6444a8d6943a664a71c1a"
TALK = "head and shoulders talking, subtle natural movement, minimal gestures"
DESKM = "seated at her office desk, warm and friendly, minimal natural gestures"
CLIPS = [
 ("seller_beth","b03b_beth",SA["beth"]["avatar_id"],TALK),
 ("seller_ray","b04b_ray",SA["ray"]["avatar_id"],TALK),
 ("seller_carol","b05b_carol",SA["carol"]["avatar_id"],TALK),
 ("seller_marcus","b06b_marcus",SA["marcus"]["avatar_id"],TALK),
 ("andrea_b01","b01",DESK,DESKM),
 ("andrea_b08","b08",DESK,"seated at her office desk, warm and sincere, minimal natural gestures"),
 ("andrea_b09","b09",DESK,"seated at her office desk, calm and composed, hands resting still, barely any hand movement, NO large or sweeping gestures, keep hands quiet and low the entire time; only a single small gentle wave at the very end"),
]
def api(method,path,body=None):
    req=urllib.request.Request("https://api.heygen.com"+path,method=method,
        headers={"x-api-key":KEY,"Content-Type":"application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req,timeout=120) as r: return json.loads(r.read())
cp=OUT+"/_clips.json"; C=json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C,open(cp,"w"),indent=1)
for name,tag,avid,motion in CLIPS:
    c=C.setdefault(name,{})
    if c.get("file"): continue
    if not c.get("audio_asset"):
        out=subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets","-H","x-api-key: "+KEY,"-F","file=@"+OUT+"/"+tag+".wav"])
        j=json.loads(out)
        if not j.get("data",{}).get("asset_id"): print("ASSET FAIL",name,str(j)[:150],flush=True); continue
        c["audio_asset"]=j["data"]["asset_id"]; save()
    if not c.get("video_id"):
        try:
            r=api("POST","/v3/videos",{"type":"avatar","avatar_id":avid,"audio_asset_id":c["audio_asset"],"title":"2B-"+name,"resolution":"720p","aspect_ratio":"16:9","expressiveness":"low","motion_prompt":motion})
            c["video_id"]=r["data"]["video_id"]; save(); print("submitted",name,flush=True)
        except Exception as e:
            msg=getattr(e,'read',lambda:b'')().decode()[:250] if hasattr(e,'read') else str(e)
            print("SUBMIT FAIL",name,msg,flush=True)
            if "credit" in msg.lower() or "insufficient" in msg.lower(): print("!!! CREDIT ERROR",flush=True); raise SystemExit
    time.sleep(2)
pending={n:c["video_id"] for n,c in C.items() if c.get("video_id") and not c.get("file")}
for _ in range(120):
    if not pending: break
    time.sleep(20)
    for name,vid in list(pending.items()):
        try: d=api("GET","/v3/videos/"+vid)["data"]
        except Exception: continue
        if d["status"]=="completed":
            f=OUT+"/"+name+".mp4"; urllib.request.urlretrieve(d["video_url"],f); C[name]["file"]=f; del pending[name]; print("downloaded",name,flush=True)
        elif d["status"]=="failed":
            C[name]["error"]=str(d.get("failure_message")); del pending[name]; print("FAILED",name,C[name]["error"],flush=True)
        save()
print("2B CLIPS DONE:", sum(1 for c in C.values() if c.get("file")), "/", len(CLIPS), flush=True)
