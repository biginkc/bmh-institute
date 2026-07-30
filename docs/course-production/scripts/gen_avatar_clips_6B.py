import hashlib
import json
import os
import pathlib
import secrets
import time
import urllib.error
import urllib.request

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


ROOT = pathlib.Path(BMH_ROOT)
OUT = ROOT / "course-assets/heygen/lesson6B"
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
AVATAR = "e527528e584a404f9da68ee4faca1353"
BLUE = "#62b3f3"
MOTION = (
    "standing full body, warm and engaged, hands relaxed at her sides, "
    "hands completely still, no hand gestures at all"
)
FORCE = {name.strip() for name in os.environ.get("FORCE_CLIPS_6B", "").split(",") if name.strip()}

CLIPS = [
    ("hero_b01_intro", "b01_intro"),
    ("circle_b03_briefam", "b03_briefam"),
    ("hero_b08_outro", "b08_outro"),
]


def api(method, path, body=None):
    request = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read())


def upload_asset(path):
    boundary = f"----bmh6b{secrets.token_hex(12)}"
    file_path = pathlib.Path(path)
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    data = head + file_path.read_bytes() + tail
    request = urllib.request.Request(
        "https://api.heygen.com/v3/assets",
        method="POST",
        headers={
            "x-api-key": KEY,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(data)),
        },
        data=data,
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read())


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def error_text(error):
    if isinstance(error, urllib.error.HTTPError):
        try:
            return error.read().decode()[:500]
        except Exception:
            pass
    return str(error)


state = json.load(open(OUT / "_state.json"))
clips_path = OUT / "_clips.json"
clips = json.load(open(clips_path)) if clips_path.exists() else {}


def save():
    with open(clips_path, "w") as handle:
        json.dump(clips, handle, indent=1)


for name, tag in CLIPS:
    wav = pathlib.Path(state[tag]["wav"])
    signature = sha256(wav)
    clip = clips.setdefault(name, {})
    if name in FORCE:
        clip["attempt"] = int(clip.get("attempt", 1)) + 1
        for key in ("video_id", "file", "error"):
            clip.pop(key, None)
        save()
    if clip.get("source_wav_sha256") and clip["source_wav_sha256"] != signature:
        for key in ("audio_asset", "video_id", "file", "error"):
            clip.pop(key, None)
        save()
    if clip.get("file") and pathlib.Path(clip["file"]).exists() and clip.get("source_wav_sha256") == signature:
        print("exists", name, flush=True)
        continue
    clip.setdefault("attempt", 1)
    if not clip.get("audio_asset"):
        uploaded = upload_asset(wav)
        clip["audio_asset"] = uploaded["data"]["asset_id"]
        save()
        print("audio asset", name, flush=True)
    if not clip.get("video_id"):
        body = {
            "type": "avatar",
            "avatar_id": AVATAR,
            "audio_asset_id": clip["audio_asset"],
            "title": f"6B-{name}-take{clip['attempt']}",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "expressiveness": "low",
            "motion_prompt": MOTION,
            "background": {"type": "color", "value": BLUE},
        }
        try:
            clip["video_id"] = api("POST", "/v3/videos", body)["data"]["video_id"]
        except Exception as error:
            message = error_text(error)
            clip["error"] = message
            save()
            if any(word in message.lower() for word in ("credit", "insufficient", "balance")):
                raise SystemExit("6B AVATAR HALT: INSUFFICIENT CREDITS")
            raise
        save()
        print("submitted", name, clip["video_id"], flush=True)
    time.sleep(2)

pending = {
    name: clips[name]["video_id"]
    for name, _ in CLIPS
    if clips.get(name, {}).get("video_id") and not clips[name].get("file")
}

for _ in range(180):
    if not pending:
        break
    time.sleep(20)
    for name, video_id in list(pending.items()):
        try:
            data = api("GET", f"/v3/videos/{video_id}")["data"]
        except Exception:
            continue
        status = data.get("status")
        print("status", name, status, flush=True)
        if status == "completed":
            video_url = data.get("video_url")
            if not video_url:
                clips[name]["error"] = "completed without video_url"
                pending.pop(name)
                save()
                continue
            file_path = OUT / f"{name}_take{clips[name]['attempt']}.mp4"
            urllib.request.urlretrieve(video_url, file_path)
            tag = next(tag for clip_name, tag in CLIPS if clip_name == name)
            clips[name]["file"] = str(file_path)
            clips[name]["source_wav_sha256"] = sha256(state[tag]["wav"])
            clips[name]["motion_prompt"] = MOTION
            clips[name]["background"] = BLUE
            pending.pop(name)
            save()
            print("downloaded", name, flush=True)
        elif status == "failed":
            clips[name]["error"] = str(data.get("failure_message"))
            pending.pop(name)
            save()
            print("FAILED", name, clips[name]["error"], flush=True)

done = sum(1 for name, _ in CLIPS if clips.get(name, {}).get("file") and pathlib.Path(clips[name]["file"]).exists())
print("6B CLIPS DONE", done, "/", len(CLIPS), flush=True)
if done != len(CLIPS):
    raise SystemExit(1)
