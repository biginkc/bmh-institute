#!/usr/bin/env python3
"""Generate Lesson 12A b17 Andrea avatar clip from the existing loudnorm WAV.

This keeps the course audio pipeline decoupled: the narration already exists as
`b17_embrace_numbers.wav`; this script uploads that WAV as a HeyGen asset and
requests a muted visual avatar clip via `/v3/videos` using `audio_asset_id`.
"""

import hashlib
import json
import os
import pathlib
import time
import urllib.error
import urllib.request

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
OUT = f"{B}/course-assets/heygen/lesson12A"
STATE_PATH = f"{OUT}/_state.json"
CLIPS_PATH = f"{OUT}/_clips.json"
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()

AV_CAFE = "b2cd05454d284058ad8d7303545821e6"
CLIP_NAME = "hero_b17_embrace_numbers"
TAG = "b17_embrace_numbers"


def save(data):
    with open(CLIPS_PATH, "w") as handle:
        json.dump(data, handle, indent=1)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_credit_error(text):
    lowered = text.lower()
    return "credit" in lowered or "insufficient" in lowered or "balance" in lowered


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.loads(response.read())


def upload_asset(path):
    boundary = f"----bmh12a{int(time.time() * 1000)}"
    filename = os.path.basename(path)
    with open(path, "rb") as handle:
        file_bytes = handle.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode() + file_bytes + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        "https://api.heygen.com/v3/assets",
        method="POST",
        headers={
            "x-api-key": KEY,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
        data=body,
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        return json.loads(response.read())


def main():
    state = json.load(open(STATE_PATH))
    clips = json.load(open(CLIPS_PATH)) if os.path.exists(CLIPS_PATH) else {}
    wav = state[TAG]["wav"]
    signature = sha256(wav)

    clip = clips.setdefault(CLIP_NAME, {})
    if clip.get("file") and os.path.exists(clip["file"]) and clip.get("source_wav_sha256") == signature:
        print(f"{CLIP_NAME} already ready")
        return

    if clip.get("source_wav_sha256") and clip.get("source_wav_sha256") != signature:
        for key in ("audio_asset", "video_id", "file", "error"):
            clip.pop(key, None)
        save(clips)

    if not clip.get("audio_asset"):
        try:
            result = upload_asset(wav)
        except urllib.error.HTTPError as exc:
            message = exc.read().decode(errors="replace")[:500]
            if is_credit_error(message):
                print("12A B17 AVATAR HALT: INSUFFICIENT HEYGEN CREDITS")
                raise SystemExit(2)
            raise RuntimeError(message) from exc
        asset_id = result.get("data", {}).get("asset_id")
        if not asset_id:
            message = str(result)[:500]
            if is_credit_error(message):
                print("12A B17 AVATAR HALT: INSUFFICIENT HEYGEN CREDITS")
                raise SystemExit(2)
            raise RuntimeError(f"HeyGen asset upload failed: {message}")
        clip["audio_asset"] = asset_id
        clip["source_wav_sha256"] = signature
        save(clips)
        print("audio asset uploaded")

    if not clip.get("video_id"):
        body = {
            "type": "avatar",
            "avatar_id": AV_CAFE,
            "audio_asset_id": clip["audio_asset"],
            "title": "12A-hero_b17_embrace_numbers",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "expressiveness": "low",
            "motion_prompt": "seated at the cafe table, direct and calm coaching delivery, minimal natural gestures, warm steady expression",
        }
        try:
            result = api("POST", "/v3/videos", body)
        except urllib.error.HTTPError as exc:
            message = exc.read().decode(errors="replace")[:500]
            if is_credit_error(message):
                print("12A B17 AVATAR HALT: INSUFFICIENT HEYGEN CREDITS")
                raise SystemExit(2)
            raise RuntimeError(message) from exc
        video_id = result.get("data", {}).get("video_id")
        if not video_id:
            message = str(result)[:500]
            if is_credit_error(message):
                print("12A B17 AVATAR HALT: INSUFFICIENT HEYGEN CREDITS")
                raise SystemExit(2)
            raise RuntimeError(f"HeyGen video submit failed: {message}")
        clip["video_id"] = video_id
        save(clips)
        print("video submitted")

    for _ in range(90):
        data = api("GET", f"/v3/videos/{clip['video_id']}").get("data", {})
        status = data.get("status")
        if status == "completed":
            target = f"{OUT}/{CLIP_NAME}.mp4"
            urllib.request.urlretrieve(data["video_url"], target)
            clip["file"] = target
            clip["source_wav_sha256"] = signature
            clip.pop("error", None)
            save(clips)
            print(f"downloaded {CLIP_NAME}")
            return
        if status == "failed":
            clip["error"] = str(data.get("failure_message") or data)
            save(clips)
            if is_credit_error(clip["error"]):
                print("12A B17 AVATAR HALT: INSUFFICIENT HEYGEN CREDITS")
                raise SystemExit(2)
            raise RuntimeError(f"HeyGen b17 failed: {clip['error']}")
        time.sleep(20)

    raise TimeoutError("Timed out waiting for HeyGen b17 avatar clip")


if __name__ == "__main__":
    main()
