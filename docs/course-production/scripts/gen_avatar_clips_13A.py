import hashlib
import json
import mimetypes
import os
import pathlib
import time
import urllib.error
import urllib.request

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson13A"
AV_CAFE = "b2cd05454d284058ad8d7303545821e6"
AV_HEADSET = "e527528e584a404f9da68ee4faca1353"
BLUE = "#62b3f3"


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
    boundary = f"----bmh13a{int(time.time() * 1000)}"
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
    lowered = message.lower()
    return "credit" in lowered or "insufficient" in lowered or "balance" in lowered


def wav_sig(path):
    h = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


state = json.load(open(f"{OUT}/_state.json"))

# output name, beat tag, avatar id, motion prompt, background color or None
CLIPS = [
    (
        "hero_b01_money_connection",
        "b01_money_connection",
        AV_CAFE,
        "seated at the cafe table, warm direct opening, calm confident delivery, minimal natural hand gestures",
        None,
    ),
    (
        "hero_b10_attribution_pipeline",
        "b10_attribution_pipeline",
        AV_HEADSET,
        "standing on course-blue background, calm instructional delivery, hands relaxed, minimal natural gestures, steady reassuring smile",
        BLUE,
    ),
    (
        "hero_b13_operator_playbook_tease",
        "b13_operator_playbook_tease",
        AV_CAFE,
        "seated at the cafe table, warm closing delivery, minimal natural gestures, friendly transition to the next lesson",
        None,
    ),
]

clips_path = f"{OUT}/_clips.json"
clips = json.load(open(clips_path)) if os.path.exists(clips_path) else {}


def save():
    json.dump(clips, open(clips_path, "w"), indent=1)


for name, tag, avatar_id, motion, background in CLIPS:
    clip_state = clips.setdefault(name, {})
    sig = wav_sig(state[tag]["wav"])
    if clip_state.get("file") and clip_state.get("source_wav_sha256") == sig:
        continue
    if clip_state.get("file") and clip_state.get("source_wav_sha256") != sig:
        for key in ("audio_asset", "video_id", "file", "error"):
            clip_state.pop(key, None)
        save()

    if not clip_state.get("audio_asset"):
        try:
            response = upload_asset(state[tag]["wav"])
        except urllib.error.HTTPError as exc:
            message = exc.read().decode(errors="replace")[:300]
            clip_state["error"] = message
            save()
            print("ASSET FAIL", name, message, flush=True)
            if is_credit_error(message):
                print("13A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise
        asset_id = response.get("data", {}).get("asset_id")
        if not asset_id:
            message = str(response)[:300]
            clip_state["error"] = message
            save()
            print("ASSET FAIL", name, message, flush=True)
            if is_credit_error(message):
                print("13A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise SystemExit(1)
        clip_state["audio_asset"] = asset_id
        save()
        print("audio asset", name, flush=True)

    if not clip_state.get("video_id"):
        body = {
            "type": "avatar",
            "avatar_id": avatar_id,
            "audio_asset_id": clip_state["audio_asset"],
            "title": f"13A-{name}",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "expressiveness": "low",
            "motion_prompt": motion,
        }
        if background:
            body["background"] = {"type": "color", "value": background}
        try:
            response = api("POST", "/v3/videos", body)
            clip_state["video_id"] = response["data"]["video_id"]
            save()
            print("video submitted", name, flush=True)
        except Exception as exc:
            message = getattr(exc, "read", lambda: b"")().decode()[:300] if hasattr(exc, "read") else str(exc)
            clip_state["error"] = message
            save()
            print("SUBMIT FAIL", name, message, flush=True)
            if is_credit_error(message):
                print("13A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise
    clip_state["source_wav_sha256"] = sig
    clip_state.pop("error", None)
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
        save()

done = sum(1 for name, data in clips.items() if name in {item[0] for item in CLIPS} and data.get("file"))
print("13A CLIPS DONE:", done, "/", len(CLIPS), flush=True)
if done < len(CLIPS):
    raise SystemExit(1)
