import hashlib
import json
import os
import pathlib
import subprocess
import time
import urllib.request

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
ROOT = pathlib.Path(BMH_ROOT)
OUT = ROOT / "course-assets/heygen/lesson11A"
BENCH_AVATAR = json.load(open(ROOT / "course-assets/heygen/lesson9A/_avatars.json"))["bench"]["avatar_id"]


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


def wav_sig(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def save(path, data):
    json.dump(data, open(path, "w"), indent=1)


state = json.load(open(OUT / "_state.json"))

# Jarrad rejected the new 11A table avatar. Use the already-approved Lesson 9A
# park-bench Andrea avatar for every Andrea appearance in 11A.
MOTION = (
    "seated calmly on the park bench, warm direct narrator delivery, hands resting calmly, "
    "minimal natural gestures, no large gestures, no teeth, gentle closed-mouth expression"
)

CLIPS = [
    ("hero_b01_reframe_close", "b01_reframe_close"),
    ("hero_b08_close_gap", "b08_close_gap"),
    ("hero_b15_your_impact", "b15_your_impact"),
    ("hero_b16_next_kpis", "b16_next_kpis"),
]

clips_path = OUT / "_clips.json"
clips = json.load(open(clips_path)) if clips_path.exists() else {}

for name, tag in CLIPS:
    clip = clips.setdefault(name, {})
    sig = wav_sig(state[tag]["wav"])
    if clip.get("file") and clip.get("source_wav_sha256") != sig:
        for key in ("audio_asset", "video_id", "file", "error"):
            clip.pop(key, None)
        save(clips_path, clips)

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
                f"file=@{state[tag]['wav']}",
            ]
        )
        j = json.loads(out)
        if "data" not in j or not j["data"].get("asset_id"):
            msg = str(j)[:300]
            print("ASSET FAIL", name, msg, flush=True)
            if is_credit_error(msg):
                print("11A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise SystemExit(1)
        clip["audio_asset"] = j["data"]["asset_id"]
        save(clips_path, clips)
        print("audio asset", name, flush=True)

    if not clip.get("video_id"):
        body = {
            "type": "avatar",
            "avatar_id": BENCH_AVATAR,
            "audio_asset_id": clip["audio_asset"],
            "title": f"11A-{name}-bench",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "expressiveness": "low",
            "motion_prompt": MOTION,
        }
        try:
            r = api("POST", "/v3/videos", body)
            clip["video_id"] = r["data"]["video_id"]
            save(clips_path, clips)
            print("video submitted", name, flush=True)
        except Exception as e:
            msg = getattr(e, "read", lambda: b"")().decode()[:300] if hasattr(e, "read") else str(e)
            print("SUBMIT FAIL", name, msg, flush=True)
            if is_credit_error(msg):
                print("11A AVATAR HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise
    time.sleep(2)

pending = {n: clips[n]["video_id"] for n, _ in CLIPS if clips.get(n, {}).get("video_id") and not clips[n].get("file")}
for _ in range(120):
    if not pending:
        break
    time.sleep(20)
    for name, vid in list(pending.items()):
        try:
            d = api("GET", f"/v3/videos/{vid}")["data"]
        except Exception:
            continue
        if d["status"] == "completed":
            f = OUT / f"{name}.mp4"
            urllib.request.urlretrieve(d["video_url"], f)
            clips[name]["file"] = str(f)
            tag = next(tag for n, tag in CLIPS if n == name)
            clips[name]["source_wav_sha256"] = wav_sig(state[tag]["wav"])
            del pending[name]
            print("downloaded", name, flush=True)
        elif d["status"] == "failed":
            clips[name]["error"] = str(d.get("failure_message"))
            del pending[name]
            print("FAILED", name, clips[name]["error"], flush=True)
        save(clips_path, clips)

done = sum(1 for name, _ in CLIPS if clips.get(name, {}).get("file"))
print("11A BENCH ANDREA CLIPS DONE:", done, "/", len(CLIPS), flush=True)
if done < len(CLIPS):
    raise SystemExit(1)
