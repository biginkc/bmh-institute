# Lesson 1B v4 fix — b01_intro opener referenced content that doesn't exist yet at
# course position #02 ("responses in the script", "are you feeling more confident"
# implying prior calls already happened). No script has been taught by lesson #02,
# and 1B's body is entirely the ten-mindset-principles framework. Jarrad approved a
# replacement opener verbatim.
# Pipeline: same as the original b01 regen in gen_avatar_clips_TEMPLATE.py (which IS
# the script that produced lessonB v2's b01) — same voice, same speed, same loudnorm,
# same cafe avatar + motion prompt. Only b01_intro touched; nothing else in lessonB.
import json, os, time, urllib.request, subprocess, pathlib

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lessonB"
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"  # same TTS voice as every other lessonB beat
AV = json.load(open(f"{OUT}/_avatars.json"))
AV_CAFE = AV["cafe"]["avatar_id"]

B01_TEXT = ("Hey, it's me, Andrea again. Let's keep building on where we left off. "
            "In this module, we're covering the mindset behind every call — ten "
            "principles that'll shape how you think and how you sound before you "
            "ever pick up the phone.")

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"
state = json.load(open(sp))
def save_state(): json.dump(state, open(sp, "w"), indent=1)

# 1. regenerate b01 audio with the new approved line
st = state["b01_intro"]
if st.get("text") != B01_TEXT:
    d = api("POST", "/v3/voices/speech", {"text": B01_TEXT, "voice_id": FRIENDLY, "speed": 1.0})["data"]
    raw = f"{OUT}/b01_intro_raw.wav"; wav = f"{OUT}/b01_intro.wav"
    urllib.request.urlretrieve(d["audio_url"], raw)
    subprocess.run(["ffmpeg", "-v", "error", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", "44100", wav, "-y"], check=True)
    state["b01_intro"] = {"wav": wav, "duration": d.get("duration"),
                           "words": d.get("word_timestamps"), "text": B01_TEXT}
    save_state()
    print("b01 audio regenerated", round(d.get("duration") or 0, 1), flush=True)
else:
    print("b01 audio already matches approved text, skipping TTS", flush=True)

# 2. hero avatar clip (cafe Andrea) — same motion prompt as the original b01 clip
cp = f"{OUT}/_clips2.json"
C = json.load(open(cp)) if os.path.exists(cp) else {}
def save(): json.dump(C, open(cp, "w"), indent=1)

name, tag, avid, motion = ("hero_b01_intro", "b01_intro", AV_CAFE,
                            "seated at the cafe table, warm and friendly, minimal natural gestures")

# force regen: this beat's text changed, so wipe any stale asset/video ids first
c = C.get(name, {})
if c.get("text_used") != B01_TEXT:
    c = {}
C[name] = c

if not c.get("audio_asset"):
    out = subprocess.check_output(["curl", "-s", "-X", "POST", "https://api.heygen.com/v3/assets",
        "-H", f"x-api-key: {KEY}", "-F", f"file=@{state[tag]['wav']}"])
    c["audio_asset"] = json.loads(out)["data"]["asset_id"]; c["text_used"] = B01_TEXT; save()
    print("audio asset", name, flush=True)
if not c.get("video_id"):
    r = api("POST", "/v3/videos", {"type": "avatar", "avatar_id": avid, "audio_asset_id": c["audio_asset"],
        "title": f"1B-v4-{name}-fix", "resolution": "720p", "aspect_ratio": "16:9",
        "expressiveness": "low", "motion_prompt": motion})
    c["video_id"] = r["data"]["video_id"]; save()
    print("video submitted", name, flush=True)

for _ in range(90):
    if C[name].get("file"):
        break
    time.sleep(20)
    try:
        d = api("GET", f"/v3/videos/{C[name]['video_id']}")["data"]
    except Exception:
        continue
    if d["status"] == "completed":
        f = f"{OUT}/{name}.mp4"; urllib.request.urlretrieve(d["video_url"], f)
        C[name]["file"] = f; save(); print("downloaded", name, flush=True)
    elif d["status"] == "failed":
        C[name]["error"] = str(d.get("failure_message")); save()
        print("FAILED", name, C[name]["error"], flush=True)
        break

print("B01 FIX DONE:", "file" in C[name], flush=True)
