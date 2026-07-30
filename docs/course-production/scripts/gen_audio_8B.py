import json
import os
import pathlib
import subprocess
import time
import urllib.request

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson8B"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Lesson 8B - Complex Objections: Trust & People.
# b01 is the Jarrad-approved written bridge.
# b02-b11 derive from locked master Slot 11 cues 10-16, with b11 keeping the master's verbatim close.
BEATS = [
    (
        "b01_bridge",
        "Let's keep going from the situation objections into the trust objections. This is where sellers are asking whether they can believe you, whether the people around them agree, and whether the problem in the house is too big.",
    ),
    (
        "b02_flip_profit",
        "When someone asks \"are you going to flip this for a profit?\" they're really asking whether they're getting taken advantage of. Be honest. Yes, we're a business. We buy properties, improve them, and resell them. That's how we're able to offer a fast cash sale with no repairs and no commissions on their end. Don't apologize for the business model. Just frame it honestly. Both sides get something they want.",
    ),
    (
        "b03_scam_concerns",
        "Scam concerns come up a lot, especially with sellers who have been burned before. If someone says \"I've been scammed\" or \"is this even legitimate?\" do not get defensive. Say you're sorry they went through that. Explain that everything goes through a licensed title company. There's attorney review available. We never ask for money upfront. They never pay us anything. And offer to share company information so they can verify everything before moving forward.",
    ),
    (
        "b04_attorney",
        "When a seller says their attorney told them not to sign anything, welcome that. Never fight the attorney. Say \"that's great advice, and I'd encourage you to have your attorney review everything. We work with attorneys regularly. If they have questions about our process or the contract, we're happy to connect with them directly.\" Making the attorney your ally instead of your opponent is one of the smartest things you can do.",
    ),
    (
        "b05_family_dynamics",
        "Family dynamics show up constantly. \"I want to sell but my brother doesn't agree.\" Or \"my co-owner doesn't want to do this.\" These are tricky because you're dealing with multiple people who have different priorities. Ask what the other person's main concern is. A lot of times once they understand the full picture, the costs of continuing to hold the property, the market conditions, what their actual options are, they come around. Offer to talk to the other party directly. Sometimes hearing it from an outside person helps more than hearing it from family.",
    ),
    (
        "b06_disclosure_issues",
        "Property issues. Sellers worry about disclosing problems. Code violations, asbestos, mold, foundation issues, all the stuff in the house they've been ignoring. For all of these, the answer is the same. We buy properties in any condition. That's literally what we do. Whatever the issue is, it doesn't change our interest. We just factor it into the evaluation.",
    ),
    (
        "b07_belongings_relief",
        "For personal belongings, tell them they can take whatever they want. Anything they leave behind, we handle. A lot of sellers, especially elderly ones and people dealing with inherited properties, find huge relief in hearing that they don't have to clean the whole place out themselves.",
    ),
    (
        "b08_pattern_framework",
        "The pattern across every one of these is the same framework you already know. Listen to the concern fully. Acknowledge it so they know you heard them. Ask questions to get to the real issue underneath. And redirect toward a solution or a next step. The specific words change depending on the situation. The framework doesn't.",
    ),
    (
        "b09_heart_of_the_work",
        "One thing worth saying about these advanced situations. They often carry heavy emotional weight. Grief, embarrassment, fear, family conflict. The people who handle them best on the phone aren't the ones with the smoothest rebuttals. They're the ones who genuinely care about the person on the other end of the line. You can't fake that. Sellers can tell.",
    ),
    (
        "b10_roleplay_drill",
        "Your roleplay for this section is a cold outreach to someone in pre-foreclosure who thinks you're running a scam. It's as real as it gets.",
    ),
    (
        "b11_next_stop_faq",
        "Once you've run it, one more stop in this section: the questions sellers ask that aren't objections at all — and how to answer them without flinching.",
    ),
]


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.loads(response.read())


state_path = f"{OUT}/_state.json"
state = json.load(open(state_path)) if os.path.exists(state_path) else {}


def save():
    json.dump(state, open(state_path, "w"), indent=1)


for tag, text in BEATS:
    st = state.setdefault(tag, {})
    if st.get("wav"):
        continue
    try:
        data = api(
            "POST",
            "/v3/voices/speech",
            {"text": text, "voice_id": FRIENDLY, "speed": 1.0},
        )["data"]
        raw = f"{OUT}/{tag}_raw.wav"
        wav = f"{OUT}/{tag}.wav"
        urllib.request.urlretrieve(data["audio_url"], raw)
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                raw,
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ar",
                "44100",
                wav,
                "-y",
            ],
            check=True,
        )
        st.update(
            wav=wav,
            duration=data.get("duration"),
            words=data.get("word_timestamps"),
            text=text,
        )
        print("audio", tag, round(data.get("duration") or 0, 1), flush=True)
    except Exception as exc:
        detail = exc.read().decode()[:150] if hasattr(exc, "read") else str(exc)
        print("AUDIO FAIL", tag, detail, flush=True)
    save()
    time.sleep(1.5)

done = sum(1 for s in state.values() if s.get("wav"))
print("8B AUDIO DONE:", done, "/", len(BEATS), flush=True)
