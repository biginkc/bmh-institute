import json
import os
import pathlib
import subprocess
import time
import urllib.request

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
ROOT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
OUT = ROOT / "course-assets/heygen/lesson11A"
IMG = ROOT / "course-assets/scenes/module-11/m11_L11A_andrea-table.png"
OUT.mkdir(parents=True, exist_ok=True)


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def is_credit_error(msg):
    msg = msg.lower()
    return "credit" in msg or "insufficient" in msg or "balance" in msg


def read_json(path, default):
    return json.load(open(path)) if os.path.exists(path) else default


def write_json(path, data):
    json.dump(data, open(path, "w"), indent=1)


avatar_path = OUT / "_andrea_table_avatar.json"
avatar = read_json(avatar_path, {})

if not IMG.exists():
    raise SystemExit(f"missing Andrea still: {IMG}")

if not avatar.get("asset_id"):
    out = subprocess.check_output(
        [
            "curl",
            "-s",
            "-X",
            "POST",
            "https://api.heygen.com/v3/assets",
            "-H",
            f"x-api-key: {KEY}",
            "-F",
            f"file=@{IMG}",
        ]
    )
    j = json.loads(out)
    if "data" not in j or not j["data"].get("asset_id"):
        msg = str(j)[:300]
        print("IMAGE ASSET FAIL", msg, flush=True)
        if is_credit_error(msg):
            print("11A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise SystemExit(1)
    avatar["asset_id"] = j["data"]["asset_id"]
    write_json(avatar_path, avatar)
    print("image asset created", flush=True)

if not avatar.get("avatar_id"):
    try:
        r = api(
            "POST",
            "/v3/avatars",
            {
                "type": "photo",
                "name": "Lesson 11A Andrea table",
                "file": {"type": "asset_id", "asset_id": avatar["asset_id"]},
            },
        )
    except Exception as e:
        msg = getattr(e, "read", lambda: b"")().decode()[:300] if hasattr(e, "read") else str(e)
        print("AVATAR CREATE FAIL", msg, flush=True)
        if is_credit_error(msg):
            print("11A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise
    avatar["avatar_id"] = r["data"]["avatar_item"]["id"]
    write_json(avatar_path, avatar)
    print("photo avatar created", flush=True)
    time.sleep(45)

state = json.load(open(OUT / "_state.json"))
clips_path = OUT / "_clips.json"
clips = read_json(clips_path, {})

clip = clips.setdefault("hero_b01_reframe_close_TEST", {})
if not clip.get("audio_asset"):
    out = subprocess.check_output(
        [
            "curl",
            "-s",
            "-X",
            "POST",
            "https://api.heygen.com/v3/assets",
            "-H",
            f"x-api-key: {KEY}",
            "-F",
            f"file=@{state['b01_reframe_close']['wav']}",
        ]
    )
    j = json.loads(out)
    if "data" not in j or not j["data"].get("asset_id"):
        msg = str(j)[:300]
        print("AUDIO ASSET FAIL", msg, flush=True)
        if is_credit_error(msg):
            print("11A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise SystemExit(1)
    clip["audio_asset"] = j["data"]["asset_id"]
    write_json(clips_path, clips)
    print("audio asset created", flush=True)

if not clip.get("video_id"):
    body = {
        "type": "avatar",
        "avatar_id": avatar["avatar_id"],
        "audio_asset_id": clip["audio_asset"],
        "title": "11A-hero_b01_andrea_table-TEST",
        "resolution": "720p",
        "aspect_ratio": "16:9",
        "expressiveness": "low",
        "motion_prompt": "seated at the table, warm direct narrator delivery, hands resting calmly near the mug, minimal natural gestures, no large or sweeping gestures",
    }
    try:
        r = api("POST", "/v3/videos", body)
        clip["video_id"] = r["data"]["video_id"]
        write_json(clips_path, clips)
        print("video submitted", flush=True)
    except Exception as e:
        msg = getattr(e, "read", lambda: b"")().decode()[:300] if hasattr(e, "read") else str(e)
        print("VIDEO SUBMIT FAIL", msg, flush=True)
        if is_credit_error(msg):
            print("11A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise

for _ in range(90):
    time.sleep(20)
    d = api("GET", f"/v3/videos/{clip['video_id']}")["data"]
    if d["status"] == "completed":
        f = OUT / "hero_b01_reframe_close_TEST.mp4"
        urllib.request.urlretrieve(d["video_url"], f)
        clip["file"] = str(f)
        write_json(clips_path, clips)
        print("downloaded hero_b01_reframe_close_TEST", flush=True)
        break
    if d["status"] == "failed":
        clip["error"] = str(d.get("failure_message"))
        write_json(clips_path, clips)
        print("FAILED", clip["error"], flush=True)
        raise SystemExit(1)

if not clip.get("file"):
    print("TIMEOUT waiting for test clip", flush=True)
    raise SystemExit(1)

print("11A ANDREA TEST CLIP DONE", flush=True)
