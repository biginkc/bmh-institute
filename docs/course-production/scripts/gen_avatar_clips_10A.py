import json, os, time, urllib.request, subprocess
import pathlib
import hashlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson10A"
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


def is_credit_error(msg):
    msg = msg.lower()
    return "credit" in msg or "insufficient" in msg or "balance" in msg


state = json.load(open(f"{OUT}/_state.json"))

# (output name, beat tag, avatar id, motion prompt, background color or None)
CLIPS = [
    ("hero_b01_intro", "b01_intro", AV_CAFE, "seated at the cafe table, warm and direct, lightly emphasizing the repeated follow-up line with subtle natural gestures", None),
    ("hero_b06_monthly_cadence", "b06_monthly_cadence", AV_HEADSET, "standing on course-blue background, calm and instructional, minimal natural hand gestures, warm steady smile", BLUE),
    ("hero_b12_daily_priority", "b12_daily_priority", AV_HEADSET, "standing on course-blue background, focused and encouraging, minimal natural hand gestures, confident steady delivery", BLUE),
    ("hero_b13_outro", "b13_outro", AV_CAFE, "hands relaxed, resting calmly on the table, minimal natural gestures", None),
]

FORCE_CLIPS = {"hero_b13_outro"}

cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}


def save():
    json.dump(C, open(cp, "w"), indent=1)


def wav_sig(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


for name, tag, avid, motion, bg in CLIPS:
    c = C.setdefault(name, {})
    sig = wav_sig(state[tag]["wav"])
    if c.get("file") and not c.get("source_wav_sha256") and name not in FORCE_CLIPS:
        c["source_wav_sha256"] = sig
        save()
    if c.get("file") and c.get("source_wav_sha256") != sig:
        c.pop("audio_asset", None)
        c.pop("video_id", None)
        c.pop("file", None)
        c.pop("error", None)
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
            if is_credit_error(msg):
                print("10A AVATAR HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            continue
        c["audio_asset"] = j["data"]["asset_id"]
        save()
        print("audio asset", name, flush=True)

    if not c.get("video_id"):
        body = {
            "type": "avatar",
            "avatar_id": avid,
            "audio_asset_id": c["audio_asset"],
            "title": f"10A-{name}",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "expressiveness": "low",
            "motion_prompt": motion,
        }
        if bg:
            body["background"] = {"type": "color", "value": bg}
        try:
            r = api("POST", "/v3/videos", body)
            c["video_id"] = r["data"]["video_id"]
            save()
            print("video submitted", name, flush=True)
        except Exception as e:
            msg = getattr(e, "read", lambda: b"")().decode()[:300] if hasattr(e, "read") else str(e)
            print("SUBMIT FAIL", name, msg, flush=True)
            save()
            if is_credit_error(msg):
                print("10A AVATAR HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
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
            tag = next(t for n, t, *_rest in CLIPS if n == name)
            C[name]["source_wav_sha256"] = wav_sig(state[tag]["wav"])
            del pending[name]
            print("downloaded", name, flush=True)
        elif d["status"] == "failed":
            C[name]["error"] = str(d.get("failure_message"))
            del pending[name]
            print("FAILED", name, C[name]["error"], flush=True)
        save()

done = sum(1 for c in C.values() if c.get("file"))
print("10A CLIPS DONE:", done, "/", len(CLIPS), flush=True)
if done < len(CLIPS):
    raise SystemExit(1)
