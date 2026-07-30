#!/usr/bin/env python3
"""Generate Lesson ISP v4 standing 1A Andrea bookends from locked WAVs."""
import hashlib, json, mimetypes, os, pathlib, time, urllib.request, uuid

ROOT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
OUT = ROOT / "course-assets/heygen/lessonISP"
STATE = json.loads((OUT / "_state.json").read_text())
CLIPS_PATH = OUT / "_clips_v4.json"
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
AVATAR = "e527528e584a404f9da68ee4faca1353"
CLIPS = [
    ("hero_b01_isp_open_1a", "b01_isp_open", "standing full body, hands relaxed at sides, minimal natural gestures, calm welcoming lesson opening, natural closed-mouth resting expression"),
    ("hero_b08_life_events_1a", "b08_life_events_inheritance", "standing full body, hands relaxed at sides, minimal natural gestures, calm empathetic explanation, natural closed-mouth resting expression"),
    ("hero_b22_outro_1a", "b22_outro_offer_playbook_tease", "standing full body, hands relaxed at sides, minimal natural gestures, warm confident lesson close, natural closed-mouth resting expression"),
]
TARGETS = {x for x in os.environ.get("TARGET_CLIPS_ISP_V4", "").split(",") if x}
FORCE = {x for x in os.environ.get("FORCE_CLIPS_ISP_V4", "").split(",") if x}

def api(method, path, body=None):
    request = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read())

def upload(path):
    boundary = f"----ispv4{uuid.uuid4().hex}"
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\nContent-Type: {mime}\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request("https://api.heygen.com/v3/assets", method="POST",
        headers={"x-api-key": KEY, "Content-Type": f"multipart/form-data; boundary={boundary}"}, data=body)
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.loads(response.read())
    return payload["data"]["asset_id"]

clips = json.loads(CLIPS_PATH.read_text()) if CLIPS_PATH.exists() else {}
def save():
    temp = CLIPS_PATH.with_suffix(".json.tmp")
    temp.write_text(json.dumps(clips, indent=1) + "\n")
    os.replace(temp, CLIPS_PATH)

selected = [x for x in CLIPS if not TARGETS or x[0] in TARGETS]
for name, tag, motion in selected:
    wav = pathlib.Path(STATE[tag]["wav"])
    signature = hashlib.sha256(wav.read_bytes()).hexdigest()
    old = clips.setdefault(name, {})
    desired = {"tag": tag, "avatar_id": AVATAR, "motion": motion, "source_wav_sha256": signature}
    if name in FORCE or any(old.get(k) != v for k, v in desired.items()):
        attempt = int(old.get("attempt") or 0) + 1
        old.clear(); old.update(desired); old["attempt"] = attempt
    old.setdefault("attempt", 1); save()
    if old.get("file") and pathlib.Path(old["file"]).exists():
        print("skip", name, flush=True); continue
    if not old.get("audio_asset"):
        old["audio_asset"] = upload(wav); save(); print("audio asset", name, flush=True)
    if not old.get("video_id"):
        payload = api("POST", "/v3/videos", {"type":"avatar", "avatar_id":AVATAR,
            "audio_asset_id":old["audio_asset"], "title":f"ISP-v4-{name}-take{old['attempt']}",
            "resolution":"720p", "aspect_ratio":"16:9", "background":{"type":"color","value":"#62b3f3"},
            "expressiveness":"low", "motion_prompt":motion})
        old["video_id"] = payload["data"]["video_id"]; save(); print("submitted", name, flush=True)
    time.sleep(2)

pending = {n:clips[n]["video_id"] for n,_,_ in selected if clips[n].get("video_id") and not clips[n].get("file")}
for _ in range(180):
    if not pending: break
    time.sleep(20)
    for name, vid in list(pending.items()):
        try: data = api("GET", f"/v3/videos/{vid}")["data"]
        except Exception: continue
        print("status", name, data.get("status"), flush=True)
        if data.get("status") == "completed":
            target = OUT / f"{name}_take{clips[name]['attempt']}.mp4"
            urllib.request.urlretrieve(data["video_url"], target)
            clips[name]["file"] = str(target); pending.pop(name); save(); print("downloaded", name, flush=True)
        elif data.get("status") == "failed":
            clips[name]["error"] = str(data.get("failure_message") or data); pending.pop(name); save()

missing = [n for n,_,_ in selected if not pathlib.Path(clips.get(n,{}).get("file", "")).exists()]
print("ISP V4 STANDING CLIPS", len(selected)-len(missing), "/", len(selected), flush=True)
if missing: raise SystemExit(f"Missing clips: {missing}")
