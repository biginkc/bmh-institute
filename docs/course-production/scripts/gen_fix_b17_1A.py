# Lesson 1A v7 fix — b17_send-off was rendered with only the master cue-16 lead-in
# ("Welcome and we are glad you are onboard. Now let's get to work.") and was missing
# the closing clause ("— your training starts now.") entirely from the shipped audio.
#
# Provenance note: the original HeyGen photo-avatar avatar_id used to render the
# shipped lessonA-v5/b17_send-off.mp4 (office desk scene: headset Andrea, monitor on
# nightstand desk, bulletin board, plant) could not be recovered — HeyGen's
# v3/videos GET and v1/video_status.get do not return avatar_id for historical
# renders, and the avatar does not appear under any of the account's 26
# avatar_group.list groups (checked exhaustively, incl. "Andrea" 51-look bucket).
# Fix: extract the LAST frame of the approved, shipped v5 b17_send-off.mp4 (closed,
# neutral smile — the avatar's natural "rest" pose) and upload THAT exact pixel data
# as a brand-new HeyGen photo avatar. Since HeyGen photo avatars only animate the
# mouth/face region over an otherwise-static source image, this reproduces the
# identical visual (same office scene, same everything) with zero guesswork.
# TTS the missing clause (Elizabeth-Friendly, speed 1.0, loudnorm -16), concat onto
# the UNTOUCHED v5 b17 wav (approved audio preserved bit-for-bit), then lip-sync the
# combined wav with the new photo avatar (same pipeline as gen_fix_b05_1A.py).
import json, os, time, urllib.request, subprocess, pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
BASE = f"{BMH_ROOT}/course-assets/heygen"
V5 = f"{BASE}/lessonA-v5"
OUT = f"{BASE}/lessonA-v7"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"  # Elizabeth-Friendly (PLAYBOOK 3.3)
SRC_FRAME = f"{OUT}/b17_source_frame.png"       # last frame of approved v5 b17 clip

# Master Slot 01 cue 16, em-dash normalized to comma-continuation for TTS (repo
# convention, gen_audio_7B) — only the MISSING clause is synthesized; the approved
# lead-in audio is preserved untouched and concatenated ahead of it.
NEW_TEXT = "Your training starts now."

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"
st = json.load(open(sp)) if os.path.exists(sp) else {}
def save(): json.dump(st, open(sp, "w"), indent=1)

# 1. TTS the missing clause (clean decoupled pipeline, speed 1.0)
if not st.get("add_wav"):
    d = api("POST", "/v3/voices/speech", {"text": NEW_TEXT, "voice_id": FRIENDLY, "speed": 1.0})["data"]
    raw = f"{OUT}/b17_add_raw.wav"; wav = f"{OUT}/b17_add.wav"
    urllib.request.urlretrieve(d["audio_url"], raw)
    subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"], check=True)
    st.update(add_wav=wav, add_duration=d.get("duration"), add_words=d.get("word_timestamps"), text=NEW_TEXT, voice=FRIENDLY)
    save(); print("TTS ok", d.get("duration"), flush=True)

# 2. Concat: v5 b17 wav (approved, untouched) + new clause wav
comb = f"{OUT}/b17_send-off.wav"
if not st.get("wav"):
    subprocess.run(["ffmpeg","-v","error",
        "-i", f"{V5}/b17_send-off.wav", "-i", st["add_wav"],
        "-filter_complex","[0:a][1:a]concat=n=2:v=0:a=1[a]","-map","[a]","-ar","44100","-ac","1", comb, "-y"], check=True)
    st["wav"] = comb; save(); print("concat ok", flush=True)

# 3. Upload the source frame (last frame of approved v5 clip) as image asset, then
#    create a new HeyGen photo avatar anchored to it (reproduces the exact office
#    scene since the source pixels are the shipped, approved render itself).
if not st.get("image_asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H", f"x-api-key: {KEY}", "-F", f"file=@{SRC_FRAME}"])
    j = json.loads(out)
    st["image_asset"] = j["data"]["asset_id"]; save(); print("image asset ok", st["image_asset"], flush=True)

if not st.get("avatar_id"):
    r = api("POST", "/v3/avatars", {"type": "photo", "name": "1A b17 send-off office (v7 fix)",
        "file": {"type": "asset_id", "asset_id": st["image_asset"]}})
    st["avatar_id"] = r["data"]["avatar_item"]["id"]; save()
    print("avatar_id", st["avatar_id"], flush=True)
    print("waiting 50s for avatar to process...", flush=True); time.sleep(50)

AV = st["avatar_id"]

# 4. Upload combined wav as audio asset
if not st.get("asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H", f"x-api-key: {KEY}", "-F", f"file=@{st['wav']}"])
    j = json.loads(out)
    st["asset"] = j["data"]["asset_id"]; save(); print("audio asset ok", flush=True)

# 5. Lip-sync avatar video (raw full frame, no background override — office scene
#    is baked into the source photo itself)
if not st.get("video_id"):
    r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV,"audio_asset_id":st["asset"],
        "title":"1A-v7-b17-send-off-fix","resolution":"720p","aspect_ratio":"16:9",
        "expressiveness":"low",
        "motion_prompt":"seated at office desk, hands resting calmly, minimal natural gestures, warm and encouraging"})
    st["video_id"] = r["data"]["video_id"]; save(); print("video submitted", st["video_id"], flush=True)

# 6. Poll + download
for _ in range(140):
    if st.get("file"): break
    time.sleep(15)
    try: d = api("GET", f"/v3/videos/{st['video_id']}")["data"]
    except Exception: continue
    if d["status"] == "completed":
        f = f"{OUT}/b17_send-off.mp4"; urllib.request.urlretrieve(d["video_url"], f)
        st["file"] = f; save(); print("downloaded ->", f, flush=True)
    elif d["status"] == "failed":
        print("FAILED", d.get("failure_message"), flush=True); break
print("DONE", flush=True)
