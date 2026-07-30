#!/usr/bin/env python3
import hashlib
import json
import mimetypes
import os
import pathlib
import secrets
import time
import urllib.error
import urllib.request

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson12A"
AV_CAFE = "b2cd05454d284058ad8d7303545821e6"
FORCE_CLIPS = {name.strip() for name in os.environ.get("FORCE_CLIPS_12A", "").split(",") if name.strip()}


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        return json.loads(response.read())


def upload_asset(path):
    file_path = pathlib.Path(path)
    boundary = f"----bmh12a{secrets.token_hex(12)}"
    mime = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    prefix = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode()
    suffix = f"\r\n--{boundary}--\r\n".encode()
    payload = prefix + file_path.read_bytes() + suffix
    req = urllib.request.Request(
        "https://api.heygen.com/v3/assets",
        method="POST",
        headers={
            "x-api-key": KEY,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(payload)),
        },
        data=payload,
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        return json.loads(response.read())


def is_credit_error(message):
    message = message.lower()
    return "credit" in message or "insufficient" in message or "balance" in message


def wav_sig(path):
    h = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


state = json.load(open(f"{OUT}/_state.json"))

CLIPS = [
    (
        "hero_b01_numbers_work",
        "b01_numbers_work",
        "seated at the cafe table, warm direct opening, calm confident narrator delivery, minimal natural hand gestures",
    ),
    (
        "hero_b18_final_close",
        "b18_final_close",
        "both hands remain resting flat on the table for the ENTIRE clip and never move independently of each other, no gestures, no raised hands, no waving, no finger movement, no hand shapes of any kind including when saying the word sign, minimal head motion only, warm closing delivery",
    ),
]

clips_path = f"{OUT}/_clips.json"
clips = json.load(open(clips_path)) if os.path.exists(clips_path) else {}


def save():
    json.dump(clips, open(clips_path, "w"), indent=1)


for name, tag, motion in CLIPS:
    clip = clips.setdefault(name, {})
    sig = wav_sig(state[tag]["wav"])
    if name in FORCE_CLIPS:
        for key in ("video_id", "file", "error"):
            clip.pop(key, None)
        clip["forced_reroll_reason"] = "QC v7 b18 calm-hands-no-gestures reroll"
        save()
    if clip.get("file") and clip.get("source_wav_sha256") == sig:
        continue
    if clip.get("file") and clip.get("source_wav_sha256") != sig:
        for key in ("audio_asset", "video_id", "file", "error"):
            clip.pop(key, None)
        save()

    if not clip.get("audio_asset"):
        try:
            response = upload_asset(state[tag]["wav"])
        except urllib.error.HTTPError as exc:
            message = exc.read().decode(errors="replace")[:500]
            clip["error"] = message
            save()
            print("ASSET FAIL", name, message, flush=True)
            if is_credit_error(message):
                print("12A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise
        asset_id = response.get("data", {}).get("asset_id")
        if not asset_id:
            message = str(response)[:500]
            clip["error"] = message
            save()
            print("ASSET FAIL", name, message, flush=True)
            if is_credit_error(message):
                print("12A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise SystemExit(1)
        clip["audio_asset"] = asset_id
        save()
        print("audio asset", name, flush=True)

    if not clip.get("video_id"):
        body = {
            "type": "avatar",
            "avatar_id": AV_CAFE,
            "audio_asset_id": clip["audio_asset"],
            "title": f"12A-{name}",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "expressiveness": "low",
            "motion_prompt": motion,
        }
        try:
            response = api("POST", "/v3/videos", body)
            clip["video_id"] = response["data"]["video_id"]
            save()
            print("video submitted", name, flush=True)
        except urllib.error.HTTPError as exc:
            message = exc.read().decode(errors="replace")[:500]
            clip["error"] = message
            save()
            print("SUBMIT FAIL", name, message, flush=True)
            if is_credit_error(message):
                print("12A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise
    clip["source_wav_sha256"] = sig
    clip.pop("error", None)
    save()
    time.sleep(2)

pending = {name: data["video_id"] for name, data in clips.items() if data.get("video_id") and not data.get("file")}
for _ in range(120):
    if not pending:
        break
    time.sleep(20)
    for name, video_id in list(pending.items()):
        try:
            data = api("GET", f"/v3/videos/{video_id}")["data"]
        except Exception:
            continue
        status = data.get("status")
        if status == "completed":
            output = f"{OUT}/{name}.mp4"
            urllib.request.urlretrieve(data["video_url"], output)
            clips[name]["file"] = output
            del pending[name]
            print("downloaded", name, flush=True)
        elif status == "failed":
            clips[name]["error"] = str(data.get("failure_message"))
            del pending[name]
            print("FAILED", name, clips[name]["error"], flush=True)
            if is_credit_error(clips[name]["error"]):
                print("12A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                save()
                raise SystemExit(2)
        save()

done = sum(1 for name, data in clips.items() if name in {item[0] for item in CLIPS} and data.get("file"))
print("12A CAFE ANDREA CLIPS DONE:", done, "/", len(CLIPS), flush=True)
if done < len(CLIPS):
    raise SystemExit(1)
