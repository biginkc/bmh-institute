import json, os, time, urllib.request, subprocess
import pathlib

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson4B"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED = "91120f72682e4459a19e311ba2ee4cb2"

BEATS = [
    (
        "b01_bridge",
        "Now, inside each of these pipeline stages, there's a conversation happening. And every conversation you have follows a five-step framework.",
        FRIENDLY,
    ),
    (
        "b02_step1_intro",
        "Step one is the Intro, where you set expectations. You tell them who you are, why you're calling, and what they'll get out of the conversation.",
        FRIENDLY,
    ),
    (
        "b03_step2_factfind",
        "Step two is the Fact Find, where you ask questions, qualify, and listen. This is where you should be spending about eighty percent of your conversation time. And notice I said talking about the person, not the house.",
        FRIENDLY,
    ),
    (
        "b04a_pitch",
        "Step three is the Pitch, where you present what BMH does. This is actually the only part of the conversation that's really about the property and the transaction itself.",
        FRIENDLY,
    ),
    (
        "b04b_offer",
        "Step four is the Offer, where you transition toward next steps. For you, that usually means teeing up the handoff rather than throwing out a number.",
        FRIENDLY,
    ),
    (
        "b05_step5_close",
        "And step five is the Close, where you get commitment. That might be setting an appointment with the acquisition team, getting agreement to receive an offer, or just locking in a firm follow-up time.",
        FRIENDLY,
    ),
    (
        "b06_structure_vs_execution",
        "Here's the thing that ties all this together. The pipeline stages are the organizational structure. They tell you where a lead is in the overall process. The five-step framework is how you actually execute within each conversation. Pipeline stages move leads forward through the system. Conversation steps move each individual call forward.",
        FRIENDLY,
    ),
    (
        "b07_8020_rule",
        "One more thing, and this is important. About eighty percent of your conversation should NOT be about the property. Only about twenty percent should actually be about the house itself. The rest is intro, rapport building, fact finding, understanding the person. Because the house is not the problem. The person's situation is the problem. Your job is to find the solution to their problem, and the house just happens to be the vehicle for that solution.",
        FRIENDLY,
    ),
    (
        "b08_slow_down",
        "New people make the mistake of jumping straight to \"tell me about the house\" and trying to race toward an offer as fast as possible. Don't do that. Slow down. Build the relationship. Actually care about what's going on. The deals will follow.",
        FRIENDLY,
    ),
    (
        "b09_outro",
        "Alright, let's keep going. Next up we're going to break down exactly how to open a call and run a fact find.",
        EXCITED,
    ),
]


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


sp = f"{OUT}/_state.json"
state = json.load(open(sp)) if os.path.exists(sp) else {}


def save():
    json.dump(state, open(sp, "w"), indent=1)


for tag, text, voice in BEATS:
    st = state.setdefault(tag, {})
    if st.get("wav"):
        continue
    try:
        d = api("POST", "/v3/voices/speech", {"text": text, "voice_id": voice, "speed": 1.0})["data"]
        raw = f"{OUT}/{tag}_raw.wav"
        wav = f"{OUT}/{tag}.wav"
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", wav, "-y"],
            check=True,
        )
        st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=text, voice=voice)
        print("audio", tag, round(d.get("duration") or 0, 1), flush=True)
    except Exception as e:
        detail = getattr(e, "read", lambda: b"")().decode(errors="replace")[:220] if hasattr(e, "read") else str(e)
        print("AUDIO FAIL", tag, detail, flush=True)
    save()
    time.sleep(1.5)

done = sum(1 for s in state.values() if s.get("wav"))
tot = sum(s.get("duration") or 0 for s in state.values())
print("4B AUDIO DONE:", done, "/", len(BEATS), "total", round(tot, 1), "s", flush=True)
