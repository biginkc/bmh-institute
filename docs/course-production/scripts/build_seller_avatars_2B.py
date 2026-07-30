import os
import json, os, time, urllib.request, subprocess, pathlib

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
B = BMH_ROOT
PNG = B+"/course-assets/scenes/module-02-lesson2B"
OUT = B+"/course-assets/heygen/lesson2B"
os.makedirs(OUT, exist_ok=True)
SELLERS = ["david","beth","ray","carol","marcus"]
def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())
p = OUT+"/_seller_avatars.json"
av = json.load(open(p)) if os.path.exists(p) else {}
def save(): json.dump(av, open(p,"w"), indent=1)
for s in SELLERS:
    rec = av.setdefault(s, {})
    src = PNG+"/m02_L2B_"+s+".png"
    if not rec.get("image_asset"):
        out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
            "-H","x-api-key: "+KEY,"-F","file=@"+src])
        rec["image_asset"] = json.loads(out)["data"]["asset_id"]; save(); print("asset",s,rec["image_asset"],flush=True)
    if not rec.get("avatar_id"):
        r = api("POST","/v3/avatars",{"type":"photo","name":"Seller "+s.capitalize()+" 2B",
            "file":{"type":"asset_id","asset_id":rec["image_asset"]}})
        rec["avatar_id"] = r["data"]["avatar_item"]["id"]; save(); print("avatar",s,rec["avatar_id"],flush=True)
print("SELLER AVATARS:", sum(1 for r in av.values() if r.get("avatar_id")), "/", len(SELLERS), flush=True)
print("waiting 55s for avatars to process...", flush=True); time.sleep(55); print("ready", flush=True)
