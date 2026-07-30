#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import subprocess
import time
import urllib.request

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
BASE = BMH_ROOT
OUT = f"{BASE}/course-assets/heygen/lesson8B"
AV_BEACH = json.load(open(f"{BASE}/course-assets/heygen/lesson8A/_beach_avatar.json"))["avatar_id"]

MOTION_HERO = "relaxing in the beach chair, calm and direct, hands resting easy on the chair arms, minimal natural gestures, no raised hands"
MOTION_CIRCLE = "relaxing in the beach chair, calm instructional delivery, hands resting easy on the chair arms, minimal natural gestures, no raised hands"


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def credit_error(msg):
    msg = msg.lower()
    return "credit" in msg or "insufficient" in msg or "balance" in msg


def wav_sig(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


state = json.load(open(f"{OUT}/_state.json"))

# (output name, beat tag, motion prompt)
CLIPS = [
    ("hero_b01_bridge", "b01_bridge", MOTION_HERO),
    ("circle_b03_scam_concerns", "b03_scam_concerns", MOTION_CIRCLE),
    ("circle_b04_attorney", "b04_attorney", MOTION_CIRCLE),
    ("hero_b06_disclosure_issues", "b06_disclosure_issues", MOTION_HERO),
    ("circle_b07_belongings_relief", "b07_belongings_relief", MOTION_CIRCLE),
    ("hero_b11_next_stop_faq", "b11_next_stop_faq", MOTION_HERO),
]

cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}


def save():
    json.dump(C, open(cp, "w"), indent=1)


for name, tag, motion in CLIPS:
    c = C.setdefault(name, {})
    sig = wav_sig(state[tag]["wav"])
    if c.get("file") and not c.get("source_wav_sha256"):
        c["source_wav_sha256"] = sig
        save()
    if c.get("file") and c.get("source_wav_sha256") != sig:
        for key in ("audio_asset", "video_id", "file", "error"):
            c.pop(key, None)
        save()

    if not c.get("audio_asset"):
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
            if credit_error(msg):
                print("8B AVATAR HALT: INSUFFICIENT CREDITS", flush=True)
                raise SystemExit(2)
            continue
        c["audio_asset"] = j["data"]["asset_id"]
        save()
        print("audio asset", name, flush=True)

    if not c.get("video_id"):
        body = {
            "type": "avatar",
            "avatar_id": AV_BEACH,
            "audio_asset_id": c["audio_asset"],
            "title": f"8B-{name}",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "expressiveness": "low",
            "motion_prompt": motion,
        }
        try:
            r = api("POST", "/v3/videos", body)
            c["video_id"] = r["data"]["video_id"]
            save()
            print("video submitted", name, flush=True)
        except Exception as e:
            msg = getattr(e, "read", lambda: b"")().decode()[:300] if hasattr(e, "read") else str(e)
            print("SUBMIT FAIL", name, msg, flush=True)
            if credit_error(msg):
                print("8B AVATAR HALT: INSUFFICIENT CREDITS", flush=True)
                raise SystemExit(2)
            raise
    time.sleep(2)

pending = {n: c["video_id"] for n, c in C.items() if c.get("video_id") and not c.get("file")}
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
            f = f"{OUT}/{name}.mp4"
            urllib.request.urlretrieve(d["video_url"], f)
            C[name]["file"] = f
            tag = next(t for n, t, _motion in CLIPS if n == name)
            C[name]["source_wav_sha256"] = wav_sig(state[tag]["wav"])
            del pending[name]
            print("downloaded", name, flush=True)
        elif d["status"] == "failed":
            C[name]["error"] = str(d.get("failure_message"))
            del pending[name]
            print("FAILED", name, C[name]["error"], flush=True)
        save()

done = sum(1 for name, _tag, _motion in CLIPS if C.get(name, {}).get("file"))
print("8B BEACH CLIPS DONE:", done, "/", len(CLIPS), flush=True)
if done < len(CLIPS):
    raise SystemExit(1)
