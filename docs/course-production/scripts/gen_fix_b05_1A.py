# Lesson 1A v6 fix — b05_cash-asis was rendered with ONLY the master cue-4 tail
# ("And you are going to help them find a way through it.") and never got the
# master cue-5 beat ("How? The BMH Group buys houses for cash, as-is...").
# Fix: TTS the missing sentence (Elizabeth-Friendly, speed 1.0, loudnorm -16),
# concat onto the UNTOUCHED v5 b05 wav (approved audio preserved bit-for-bit),
# lip-sync the combined wav with the 1A headset Andrea avatar (same pipeline as v5).
import json, os, time, urllib.request, subprocess, pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
BASE = f"{BMH_ROOT}/course-assets/heygen"
V5 = f"{BASE}/lessonA-v5"
OUT = f"{BASE}/lessonA-v6"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"  # Elizabeth-Friendly (PLAYBOOK 3.3)
AV_1A = "e527528e584a404f9da68ee4faca1353"     # 1A headset Andrea photo avatar

# Master Slot 01 cue 5, em-dash normalized to comma for TTS (repo convention, gen_audio_7B)
NEW_TEXT = ("How? The BMH Group buys houses for cash, as-is, so a homeowner who needs "
            "speed and certainty can move on without repairs, agents, or months of waiting. "
            "That's the tool. This training is about how you use it.")

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"
st = json.load(open(sp)) if os.path.exists(sp) else {}
def save(): json.dump(st, open(sp, "w"), indent=1)

# 1. TTS the new sentence (clean decoupled pipeline, speed 1.0)
if not st.get("add_wav"):
    d = api("POST", "/v3/voices/speech", {"text": NEW_TEXT, "voice_id": FRIENDLY, "speed": 1.0})["data"]
    raw = f"{OUT}/b05_add_raw.wav"; wav = f"{OUT}/b05_add.wav"
    urllib.request.urlretrieve(d["audio_url"], raw)
    subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"], check=True)
    st.update(add_wav=wav, add_duration=d.get("duration"), add_words=d.get("word_timestamps"), text=NEW_TEXT, voice=FRIENDLY)
    save(); print("TTS ok", d.get("duration"), flush=True)

# 2. Concat: v5 b05 wav (approved, untouched) + new sentence wav
comb = f"{OUT}/b05_cash-asis.wav"
if not st.get("wav"):
    subprocess.run(["ffmpeg","-v","error",
        "-i", f"{V5}/b05_cash-asis.wav", "-i", st["add_wav"],
        "-filter_complex","[0:a][1:a]concat=n=2:v=0:a=1[a]","-map","[a]","-ar","44100","-ac","1", comb, "-y"], check=True)
    st["wav"] = comb; save(); print("concat ok", flush=True)

# 3. Upload combined wav as asset
if not st.get("asset"):
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H", f"x-api-key: {KEY}", "-F", f"file=@{st['wav']}"])
    j = json.loads(out)
    st["asset"] = j["data"]["asset_id"]; save(); print("asset ok", flush=True)

# 4. Lip-sync avatar video (same avatar + defaults as v5 clips: no background override)
if not st.get("video_id"):
    r = api("POST","/v3/videos",{"type":"avatar","avatar_id":AV_1A,"audio_asset_id":st["asset"],
        "title":"1A-v6-b05-cash-asis-fix","resolution":"720p","aspect_ratio":"16:9",
        "expressiveness":"low",
        "motion_prompt":"standing, hands relaxed at sides, minimal natural gestures, warm and clear"})
    st["video_id"] = r["data"]["video_id"]; save(); print("video submitted", st["video_id"], flush=True)

# 5. Poll + download
for _ in range(140):
    if st.get("file"): break
    time.sleep(15)
    try: d = api("GET", f"/v3/videos/{st['video_id']}")["data"]
    except Exception: continue
    if d["status"] == "completed":
        f = f"{OUT}/b05_cash-asis.mp4"; urllib.request.urlretrieve(d["video_url"], f)
        st["file"] = f; save(); print("downloaded ->", f, flush=True)
    elif d["status"] == "failed":
        print("FAILED", d.get("failure_message"), flush=True); break
print("DONE", flush=True)
