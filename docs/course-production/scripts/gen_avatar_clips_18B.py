import hashlib
import json
import os
import pathlib
import secrets
import time
import urllib.error
import urllib.request


KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson18B")
AV_CAFE = "b2cd05454d284058ad8d7303545821e6"
AV_HEADSET = "e527528e584a404f9da68ee4faca1353"
BLUE = "#62b3f3"
FORCE_CLIPS = {name.strip() for name in os.environ.get("FORCE_CLIPS_18B", "").split(",") if name.strip()}


CLIPS = [
    (
        "hero_b01_command_center",
        "b01_command_center",
        AV_CAFE,
        "seated at the cafe table, warm and direct, minimal natural gestures, relaxed hands, steady instructional delivery",
        None,
    ),
    (
        "circle_b04_quality_check",
        "b04_quality_check",
        AV_HEADSET,
        "standing on course-blue background, calm quality-check explanation, hands relaxed, minimal natural gestures, warm reassuring smile",
        BLUE,
    ),
    (
        "hero_b14_roleplay_career_tease_part1",
        "b14_roleplay_career_tease_part1",
        AV_CAFE,
        "both hands remain resting on the table for the ENTIRE clip, no gestures, no raised hands, minimal head motion only",
        None,
    ),
    (
        "hero_b14_roleplay_career_tease_part2",
        "b14_roleplay_career_tease_part2",
        AV_CAFE,
        "both hands remain resting on the table for the ENTIRE clip, no gestures, no raised hands, minimal head motion only",
        None,
    ),
]


def is_credit_error(message):
    lowered = message.lower()
    return "credit" in lowered or "insufficient" in lowered or "balance" in lowered


def error_message(exc):
    if isinstance(exc, urllib.error.HTTPError):
        try:
            return exc.read().decode()[:500]
        except Exception:
            return str(exc)
    return str(exc)


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.loads(res.read())


def upload_asset(path):
    boundary = f"----bmh18b{secrets.token_hex(12)}"
    filename = pathlib.Path(path).name
    file_bytes = pathlib.Path(path).read_bytes()
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    data = head + file_bytes + tail
    req = urllib.request.Request(
        "https://api.heygen.com/v3/assets",
        method="POST",
        headers={
            "x-api-key": KEY,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(data)),
        },
        data=data,
    )
    with urllib.request.urlopen(req, timeout=300) as res:
        return json.loads(res.read())


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def save(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=1)


state_path = OUT / "_state.json"
clips_path = OUT / "_clips.json"
state = json.load(open(state_path))
clips = json.load(open(clips_path)) if clips_path.exists() else {}
clip_names = {name for name, *_ in CLIPS}

for name, tag, avatar_id, motion_prompt, background in CLIPS:
    wav = pathlib.Path(state[tag]["wav"]) if tag in state else OUT / f"{tag}.wav"
    if not wav.exists():
        raise SystemExit(f"missing audio wav for {tag}: {wav}")

    clip = clips.setdefault(name, {})
    sig = sha256_file(wav)
    if name in FORCE_CLIPS:
        for key in ("video_id", "file", "error"):
            clip.pop(key, None)
        clip["forced_reroll_reason"] = "QC v6 b14 split-take reroll"
        save(clips_path, clips)
    if clip.get("source_wav_sha256") and clip["source_wav_sha256"] != sig:
        for key in ("audio_asset", "video_id", "file", "error"):
            clip.pop(key, None)
        save(clips_path, clips)

    if clip.get("file") and pathlib.Path(clip["file"]).exists() and clip.get("source_wav_sha256") == sig:
        print("exists", name, flush=True)
        continue

    if clip.get("error") and not clip.get("file"):
        for key in ("video_id", "error"):
            clip.pop(key, None)
        save(clips_path, clips)

    if not clip.get("audio_asset"):
        try:
            uploaded = upload_asset(wav)
        except Exception as exc:
            msg = error_message(exc)
            print("ASSET FAIL", name, msg, flush=True)
            if is_credit_error(msg):
                print("18B AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise
        asset_id = uploaded.get("data", {}).get("asset_id")
        if not asset_id:
            msg = str(uploaded)[:500]
            print("ASSET FAIL", name, msg, flush=True)
            if is_credit_error(msg):
                print("18B AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise SystemExit(1)
        clip["audio_asset"] = asset_id
        save(clips_path, clips)
        print("audio asset", name, flush=True)

    if not clip.get("video_id"):
        body = {
            "type": "avatar",
            "avatar_id": avatar_id,
            "audio_asset_id": clip["audio_asset"],
            "title": f"18B-{name}",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "expressiveness": "low",
            "motion_prompt": motion_prompt,
        }
        if background:
            body["background"] = {"type": "color", "value": background}
        try:
            response = api("POST", "/v3/videos", body)
            clip["video_id"] = response["data"]["video_id"]
            save(clips_path, clips)
            print("video submitted", name, flush=True)
        except Exception as exc:
            msg = error_message(exc)
            print("SUBMIT FAIL", name, msg, flush=True)
            save(clips_path, clips)
            if is_credit_error(msg):
                print("18B AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise

    time.sleep(2)

pending = {
    name: clips[name]["video_id"]
    for name in clip_names
    if clips.get(name, {}).get("video_id") and not clips[name].get("file")
}

for _ in range(150):
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
                save(clips_path, clips)
                continue
            file_path = OUT / f"{name}.mp4"
            urllib.request.urlretrieve(video_url, file_path)
            tag = next(tag for clip_name, tag, *_ in CLIPS if clip_name == name)
            clips[name]["file"] = str(file_path)
            wav = pathlib.Path(state[tag]["wav"]) if tag in state else OUT / f"{tag}.wav"
            clips[name]["source_wav_sha256"] = sha256_file(wav)
            pending.pop(name)
            save(clips_path, clips)
            print("downloaded", name, flush=True)
        elif status == "failed":
            clips[name]["error"] = str(data.get("failure_message"))
            pending.pop(name)
            save(clips_path, clips)
            print("FAILED", name, clips[name]["error"], flush=True)

done = sum(
    1
    for name in clip_names
    if clips.get(name, {}).get("file") and pathlib.Path(clips[name]["file"]).exists()
)
print("18B CLIPS DONE:", done, "/", len(CLIPS), flush=True)
if done < len(CLIPS):
    raise SystemExit(1)
