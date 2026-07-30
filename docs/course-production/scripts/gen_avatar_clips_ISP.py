#!/usr/bin/env python3
"""Generate the three Lesson ISP office-desk Andrea clips with the existing 2B avatar."""

import hashlib
import json
import mimetypes
import os
import pathlib
import time
import urllib.error
import urllib.request
import uuid

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


ROOT = pathlib.Path(BMH_ROOT)
OUT = ROOT / "course-assets/heygen/lessonISP"
STATE_PATH = OUT / "_state.json"
CLIPS_PATH = OUT / "_clips.json"
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()

# Existing office/desk Andrea from Lesson 2B. Source: gen_clips_2B.py and lesson2A/_office_avatar.json.
# The original Lesson 2B office-avatar ID was retired by HeyGen and now 404s.
# The brief explicitly permits the existing Lesson 11A table-avatar record as
# the fallback. This is an existing avatar, not a newly created identity.
DESK_AVATAR = "b4e4bbf3536245118d1b1d7376343e7a"

CLIPS = [
    (
        "hero_b01_isp_open",
        "b01_isp_open",
        "seated at her office desk, calm welcoming lesson opening, hands resting low on the desk or below frame, minimal natural gestures, no raised hands, no sweeping gestures, warm direct eye contact",
    ),
    (
        "hero_b08_life_events",
        "b08_life_events_inheritance",
        "seated at her office desk, calm empathetic explanation of difficult life events, hands resting low on the desk or below frame, minimal natural gestures, no raised hands, no sweeping gestures, warm composed eye contact",
    ),
    (
        "hero_b22_outro",
        "b22_outro_offer_playbook_tease",
        "seated at her office desk, calm confident lesson close and next-lesson tease, hands resting low on the desk or below frame, minimal natural gestures, no raised hands, no sweeping gestures, finish with a natural relaxed expression",
    ),
]

TARGETS = {name.strip() for name in os.environ.get("TARGET_CLIPS_ISP", "").split(",") if name.strip()}
FORCE = {name.strip() for name in os.environ.get("FORCE_CLIPS_ISP", "").split(",") if name.strip()}


def api(method, path, body=None):
    request = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read())


def error_text(error):
    if isinstance(error, urllib.error.HTTPError):
        return error.read().decode(errors="replace")[:1000]
    return str(error)


def upload_asset(path):
    boundary = f"----bmhlessonisp{uuid.uuid4().hex}"
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        "https://api.heygen.com/v3/assets",
        method="POST",
        headers={"x-api-key": KEY, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        data=body,
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.loads(response.read())
    asset_id = (payload.get("data") or {}).get("asset_id")
    if not asset_id:
        raise RuntimeError(f"Asset upload failed: {str(payload)[:500]}")
    return asset_id


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


state = json.loads(STATE_PATH.read_text())
clips = json.loads(CLIPS_PATH.read_text()) if CLIPS_PATH.exists() else {}


def save():
    temp = CLIPS_PATH.with_suffix(".json.tmp")
    temp.write_text(json.dumps(clips, indent=1) + "\n")
    os.replace(temp, CLIPS_PATH)


selected = [clip for clip in CLIPS if not TARGETS or clip[0] in TARGETS]
for name, tag, motion in selected:
    wav = pathlib.Path(state[tag]["wav"])
    signature = sha256(wav)
    clip = clips.setdefault(name, {})
    desired = {
        "tag": tag,
        "avatar_id": DESK_AVATAR,
        "motion": motion,
        "source_wav_sha256": signature,
    }
    if name in FORCE:
        clip["attempt"] = int(clip.get("attempt") or 1) + 1
        for key in ("audio_asset", "video_id", "file", "error"):
            clip.pop(key, None)
    if any(clip.get(key) != value for key, value in desired.items()):
        for key in ("audio_asset", "video_id", "file", "error"):
            clip.pop(key, None)
        clip.update(desired)
    clip.setdefault("attempt", 1)
    save()
    if clip.get("file") and pathlib.Path(clip["file"]).exists():
        print("skip", name, flush=True)
        continue
    try:
        if not clip.get("audio_asset"):
            clip["audio_asset"] = upload_asset(wav)
            save()
            print("audio asset", name, flush=True)
        if not clip.get("video_id"):
            payload = api(
                "POST",
                "/v3/videos",
                {
                    "type": "avatar",
                    "avatar_id": DESK_AVATAR,
                    "audio_asset_id": clip["audio_asset"],
                    "title": f"ISP-{name}-take{clip['attempt']}",
                    "resolution": "720p",
                    "aspect_ratio": "16:9",
                    "expressiveness": "low",
                    "motion_prompt": motion,
                },
            )
            clip["video_id"] = payload["data"]["video_id"]
            save()
            print("submitted", name, flush=True)
    except Exception as error:
        message = error_text(error)
        clip["error"] = message
        save()
        print("SUBMIT FAIL", name, message[:500], flush=True)
        if any(word in message.lower() for word in ("credit", "insufficient", "balance")):
            raise SystemExit("ISP AVATAR HALT: INSUFFICIENT CREDITS")
        raise
    time.sleep(2)

pending = {
    name: clips[name]["video_id"]
    for name, _, _ in selected
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
            url = data.get("video_url")
            if not url:
                clips[name]["error"] = "completed without video_url"
                pending.pop(name, None)
                save()
                continue
            target = OUT / f"{name}_take{clips[name]['attempt']}.mp4"
            urllib.request.urlretrieve(url, target)
            clips[name]["file"] = str(target)
            clips[name]["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            pending.pop(name, None)
            save()
            print("downloaded", name, flush=True)
        elif status == "failed":
            clips[name]["error"] = str(data.get("failure_message") or data)
            pending.pop(name, None)
            save()
            print("FAILED", name, clips[name]["error"], flush=True)

failed = [name for name, _, _ in selected if not clips.get(name, {}).get("file") or not pathlib.Path(clips[name]["file"]).exists()]
print("ISP CLIPS DONE", len(selected) - len(failed), "/", len(selected), flush=True)
if failed:
    raise SystemExit(f"Missing required clips: {failed}")
