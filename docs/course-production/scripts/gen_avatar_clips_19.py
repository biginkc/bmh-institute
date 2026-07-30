#!/usr/bin/env python3
import json
import hashlib
import mimetypes
import os
import pathlib
import subprocess
import time
import urllib.error
import urllib.request
import uuid

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson19"
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
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def error_text(exc):
    if isinstance(exc, urllib.error.HTTPError):
        return exc.read().decode(errors="replace")[:1000]
    return str(exc)


def upload_asset(path):
    boundary = f"----bmhlesson19{uuid.uuid4().hex}"
    name = os.path.basename(path)
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        data = f.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        "https://api.heygen.com/v3/assets",
        method="POST",
        headers={"x-api-key": KEY, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        data=body,
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        j = json.loads(r.read())
    asset_id = (j.get("data") or {}).get("asset_id")
    if not asset_id:
        raise RuntimeError(f"asset upload failed: {str(j)[:500]}")
    return asset_id


sp = f"{OUT}/_state.json"
state = json.load(open(sp))

B13_TAKE1_TEXT = (
    "I hope this gives you a clear picture of the growth paths available at BMH. "
    "Your path will depend on what you're good at, where you want to go, and the results you produce."
)
B13_TAKE2_TEXT = (
    "We're confident you can continue growing here if you keep improving and stay open to coaching. "
    "Keep the conversation going about where you want to grow next."
)


def clean_word(value):
    return value.lower().strip('.,?!:\"“”')


def ensure_b13_split_wavs():
    beat = state["b13_course_close"]
    words = beat.get("words") or []
    produce_index = next((i for i, word in enumerate(words) if clean_word(word.get("word", "")) == "produce"), None)
    if produce_index is None or produce_index + 1 >= len(words):
        raise RuntimeError("could not locate the b13 split after 'produce'")
    left_end = float(words[produce_index]["end"])
    right_start = float(words[produce_index + 1]["start"])
    split_at = round((left_end + right_start) / 2, 3)
    take1 = f"{OUT}/b13_course_close_take1.wav"
    take2 = f"{OUT}/b13_course_close_take2.wav"
    split_meta = {
        "source_text": beat.get("text"),
        "split_at_seconds": split_at,
        "take1_text": B13_TAKE1_TEXT,
        "take2_text": B13_TAKE2_TEXT,
    }
    if beat.get("avatar_split") != split_meta or not (os.path.exists(take1) and os.path.exists(take2)):
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", beat["wav"], "-t", str(split_at), "-c:a", "pcm_s16le", take1, "-y"],
            check=True,
        )
        subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", str(split_at), "-i", beat["wav"], "-c:a", "pcm_s16le", take2, "-y"],
            check=True,
        )
        beat["avatar_split"] = split_meta
        json.dump(state, open(sp, "w"), indent=1)
    return take1, take2


b13_take1_wav, b13_take2_wav = ensure_b13_split_wavs()

CLIPS = [
    (
        "hero_b01_career_path_opener",
        "b01_career_path_opener",
        AV_CAFE,
        "seated at the cafe table, warm and grounded, minimal natural gestures, relaxed hands, confident course-wrap delivery",
        None,
        None,
        None,
    ),
    (
        "circle_b03_clean_handoffs-v7",
        "b03_clean_handoffs",
        AV_HEADSET,
        "standing still, hands relaxed at sides, minimal natural gestures, warm reassuring smile",
        BLUE,
        None,
        None,
    ),
    (
        "hero_b07_creative_deal_skill",
        "b07_creative_deal_skill",
        AV_CAFE,
        "seated at the cafe table, calm direct explanation of higher expectations, hands resting low or below frame, no large gestures, no expressive waving, confident but grounded delivery",
        None,
        None,
        None,
    ),
    (
        "side_b09_no_fixed_schedule",
        "b09_no_fixed_schedule",
        AV_HEADSET,
        "standing still, speaking as if reading a promotion readiness scorecard beside her, calm focused delivery, minimal hand movement",
        BLUE,
        None,
        None,
    ),
    (
        "circle_b10_daily_performance_criteria",
        "b10_daily_performance_criteria",
        AV_HEADSET,
        "standing still, hands relaxed at sides, minimal natural gestures, clear instructional delivery",
        BLUE,
        None,
        None,
    ),
    (
        "hero_b13_growth_close_take1",
        "b13_course_close",
        AV_CAFE,
        "seated at the cafe table, calm direct career-growth explanation, chest-up framing, hands resting below the visible frame for the entire take, no raised gestures, no props, no phone, no expressive waving, warm and confident but not a finale",
        None,
        b13_take1_wav,
        B13_TAKE1_TEXT,
    ),
    (
        "hero_b13_growth_close_take2",
        "b13_course_close",
        AV_CAFE,
        "seated at the cafe table, calm direct career-growth topic close, chest-up framing, hands resting below the visible frame for the entire take, no raised gestures, no props, no phone, no expressive waving, finish with a natural relaxed expression rather than a celebration",
        None,
        b13_take2_wav,
        B13_TAKE2_TEXT,
    ),
]

cp = f"{OUT}/_clips.json"
clips = json.load(open(cp)) if os.path.exists(cp) else {}
target_names = {name.strip() for name in os.environ.get("TARGET_CLIPS", "").split(",") if name.strip()}


def save():
    json.dump(clips, open(cp, "w"), indent=1)


for name, tag, avatar_id, motion, bg, audio_path, clip_text in CLIPS:
    if target_names and name not in target_names:
        print("not selected", name, flush=True)
        continue
    c = clips.setdefault(name, {})
    current_text = clip_text or state[tag].get("text")
    source_audio = audio_path or state[tag]["wav"]
    audio_sha256 = hashlib.sha256(pathlib.Path(source_audio).read_bytes()).hexdigest()
    desired = {"text": current_text, "motion": motion, "avatar_id": avatar_id, "background": bg, "audio_sha256": audio_sha256}
    if any(c.get(key) != value for key, value in desired.items()):
        old_file = c.get("file")
        if old_file and os.path.exists(old_file):
            backup = f"{OUT}/{name}_v1.mp4"
            if not os.path.exists(backup):
                os.replace(old_file, backup)
        for key in ("audio_asset", "video_id", "file", "error"):
            c.pop(key, None)
        c.update(desired)
        save()
    if c.get("file") and os.path.exists(c["file"]):
        print("skip", name, flush=True)
        continue
    try:
        if not c.get("audio_asset"):
            c["audio_asset"] = upload_asset(source_audio)
            save()
            print("audio asset", name, flush=True)
        if not c.get("video_id"):
            body = {
                "type": "avatar",
                "avatar_id": avatar_id,
                "audio_asset_id": c["audio_asset"],
                "title": f"19-{name}",
                "resolution": "720p",
                "aspect_ratio": "16:9",
                "expressiveness": "low",
                "motion_prompt": motion,
            }
            if bg:
                body["background"] = {"type": "color", "value": bg}
            r = api("POST", "/v3/videos", body)
            c["video_id"] = r["data"]["video_id"]
            save()
            print("video submitted", name, flush=True)
    except Exception as exc:
        msg = error_text(exc)
        c["error"] = msg
        save()
        print("SUBMIT FAIL", name, msg[:500], flush=True)
        if "credit" in msg.lower() or "insufficient" in msg.lower():
            raise SystemExit("INSUFFICIENT CREDIT")
        raise
    time.sleep(2)

required_names = target_names or {name for name, _, _, _, _, _, _ in CLIPS}
pending = {name: clips[name]["video_id"] for name in required_names if clips.get(name, {}).get("video_id") and not clips[name].get("file")}
poll_errors = {}
for _ in range(120):
    if not pending:
        break
    time.sleep(20)
    for name, video_id in list(pending.items()):
        try:
            data = api("GET", f"/v3/videos/{video_id}")["data"]
        except Exception as exc:
            poll_errors[name] = error_text(exc)
            continue
        status = data.get("status")
        if status == "completed":
            target = f"{OUT}/{name}.mp4"
            urllib.request.urlretrieve(data["video_url"], target)
            clips[name]["file"] = target
            clips[name]["text"] = clips[name].get("text") or state.get(name.replace("hero_", "").replace("circle_", "").replace("side_", ""), {}).get("text")
            pending.pop(name, None)
            poll_errors.pop(name, None)
            print("downloaded", name, flush=True)
        elif status == "failed":
            clips[name]["error"] = str(data.get("failure_message") or data)
            pending.pop(name, None)
            print("FAILED", name, clips[name]["error"], flush=True)
        save()

done = sum(1 for name in required_names if clips.get(name, {}).get("file"))
print("19 CLIPS DONE:", done, "/", len(required_names), flush=True)
failed = [name for name in required_names if not clips.get(name, {}).get("file") or not os.path.exists(clips[name]["file"])]
if failed:
    details = {name: clips.get(name, {}).get("error") or poll_errors.get(name) or "missing or timed out" for name in failed}
    if any("credit" in str(value).lower() or "insufficient" in str(value).lower() for value in details.values()):
        raise SystemExit("INSUFFICIENT CREDIT")
    raise SystemExit(f"Lesson 19 required avatar clips incomplete: {details}")
