import hashlib, json, os, subprocess, time, urllib.request
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson17"
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

def wav_sig(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_b11_split_wavs():
    src = state["b12_outro"]["wav"]
    split_at = 8.25  # gap between "sync." (7.90) and "Then" (8.60) in the v3 outro wav
    take1 = f"{OUT}/b12_outro_take1.wav"
    take2 = f"{OUT}/b12_outro_take2.wav"
    src_sig = wav_sig(src)
    split_meta = {
        "source": src,
        "source_wav_sha256": src_sig,
        "split_at_seconds": split_at,
        "take1": take1,
        "take2": take2,
    }
    if state.get("b12_outro_split") == split_meta and os.path.exists(take1) and os.path.exists(take2):
        return take1, take2, split_at
    subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-t", str(split_at), "-c:a", "pcm_s16le", take1, "-y"], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-ss", str(split_at), "-i", src, "-c:a", "pcm_s16le", take2, "-y"], check=True)
    state["b12_outro_split"] = split_meta
    json.dump(state, open(f"{OUT}/_state.json", "w"), indent=1)
    return take1, take2, split_at


b11_take1, b11_take2, _b11_split_at = ensure_b11_split_wavs()

# (output name, source wav path, avatar id, motion prompt, background color or None)
CLIPS = [
    ("hero_b01_intro", state["b01_intro"]["wav"], AV_CAFE, "seated at the cafe table, warm and direct money-talk opener, subtle natural gestures, hands mostly relaxed", None),
    ("hero_b10_that_direct", state["b10_that_direct"]["wav"], AV_HEADSET, "standing on course-blue background, direct and sincere delivery, minimal natural hand gestures, warm steady eye contact", BLUE),
    ("hero_b12_outro_take1", b11_take1, AV_CAFE, "seated at the cafe table, warm upbeat closing delivery, minimal natural gestures, hands relaxed on the table", None),
    ("hero_b12_outro_take2", b11_take2, AV_CAFE, "seated at the cafe table, warm upbeat closing delivery, minimal natural gestures, hands relaxed on the table", None),
]
ACTIVE_CLIP_NAMES = {name for name, *_rest in CLIPS}

cp = f"{OUT}/_clips.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}

for _name, _clip in C.items():
    if is_credit_error(str(_clip.get("error", ""))):
        _clip.pop("video_id", None)
        _clip.pop("file", None)
        _clip.pop("error", None)


def save():
    json.dump(C, open(cp, "w"), indent=1)


for name, wav_path, avid, motion, bg in CLIPS:
    c = C.setdefault(name, {})
    sig = wav_sig(wav_path)
    if c.get("file") and c.get("source_wav_sha256") != sig:
        c.pop("audio_asset", None)
        c.pop("video_id", None)
        c.pop("file", None)
        c.pop("error", None)
        save()
    if not c.get("audio_asset"):
        out = subprocess.check_output(
            ["curl", "-s", "-X", "POST", "https://api.heygen.com/v3/assets",
             "-H", f"x-api-key: {KEY}", "-F", f"file=@{wav_path}"]
        )
        j = json.loads(out)
        if "data" not in j or not j["data"].get("asset_id"):
            msg = str(j)[:300]
            print("ASSET FAIL", name, msg, flush=True)
            if is_credit_error(msg):
                print("17 AVATAR HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
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
            "title": f"17-{name}",
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
                print("17 AVATAR HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            raise
    time.sleep(2)

pending = {n: c["video_id"] for n, c in C.items() if n in ACTIVE_CLIP_NAMES and c.get("video_id") and not c.get("file")}
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
            wav_path = next(w for n, w, *_rest in CLIPS if n == name)
            C[name]["source_wav_sha256"] = wav_sig(wav_path)
            del pending[name]
            print("downloaded", name, flush=True)
        elif d["status"] == "failed":
            msg = str(d.get("failure_message"))[:300]
            C[name]["error"] = msg
            if is_credit_error(msg):
                C[name].pop("video_id", None)
                save()
                print("17 AVATAR HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
                raise SystemExit(2)
            del pending[name]
            print("CLIP FAILED", name, msg, flush=True)
        save()

done = sum(1 for name, c in C.items() if name in ACTIVE_CLIP_NAMES and c.get("file"))
print("17 AVATAR v3 CLIPS DONE:", done, "/", len(CLIPS), flush=True)
