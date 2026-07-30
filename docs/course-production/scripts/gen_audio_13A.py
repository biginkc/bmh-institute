import json
import os
import pathlib
import subprocess
import time
import urllib.request

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson13A"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Locked master Slot 17, cues 1-13. Keep text verbatim unless a future TTS-only
# pronunciation fix is explicitly documented here.
BEATS = [
    (
        "b01_money_connection",
        "Alright, let's talk about money. Specifically, how your performance turns into a paycheck. I'm going to lay out the whole compensation structure so there's no mystery about it. The more you understand this, the clearer the connection between your daily work and what you earn.",
    ),
    (
        "b02_three_pieces",
        "There are three pieces to your compensation. Base pay during your ramp period, commissions on deals you source, and bonuses for hitting appointment milestones.",
    ),
    (
        "b03_ramp_to_commission",
        "When you start, you receive an hourly base rate while you're ramping up. You're learning, building skills, getting comfortable with the process. The base pay makes sure you've got income coming in while your pipeline is still developing. Once you're consistently hitting your KPIs for 30 or more consecutive days, you graduate to the full commission structure. That's the transition point.",
    ),
    (
        "b04_your_deal",
        "Commissions are where the real money is. You earn a commission on every deal that closes where you were the person who sourced and qualified the lead. You did the follow-up. You built the relationship. You handed it off with a clean, complete package. And the acquisition team closed it. That's your deal.",
    ),
    (
        "b05_commission_tiers",
        "The commission amount scales with how many deals you source in a given month. If you source one or two deals in a month, you earn $500 per deal. Three or four deals, that goes up to $750 per deal. Five or more, it's $1,000 per deal. And the way the tiers work, all your deals for the month pay at the highest tier you reached. So if you hit five deals, all five of them pay at a thousand each. That's five grand in commissions in a single month, and that's on top of your base during ramp.",
    ),
    (
        "b06_appointment_bonus",
        "On top of commissions, there's an appointment bonus. Every 25 qualified appointments you set in a month earns you a $250 bonus. And just to be clear, an appointment counts when the seller actually shows up for the call with the acquisition team. Not when you schedule it. When they actually show. So if you set 50 kept appointments in a month, that's $500 in appointment bonuses on top of whatever you're earning in commissions.",
    ),
    (
        "b07_example_tier_two",
        "Let me run through an example so you can see how this adds up. Say you're a few months in. You're hitting your stride. In a given month, you set 30 kept appointments and you sourced 3 deals that closed. Your base hourly is whatever your rate is for the month. You hit the 25 appointment threshold, so that's a $250 bonus. And 3 deals puts you at Tier 2, which is $750 per deal, so $2,250 in commissions. Total bonus and commission on top of your base is $2,500.",
    ),
    (
        "b08_example_tier_three",
        "Imagine this: a few months down the line, you improve your performance. You secure 40 appointments and close 5 deals. Exciting, right? You've just earned a $250 bonus for hitting the 25 appointment milestone. However, the next bonus threshold is at 50 appointments, so you only receive that one bonus. Now, since you closed 5 deals, you're in Tier 3, which means you earn $1,000 for each deal. That's a total of $5,000 in commissions. When you add the $250 appointment bonus, your total for the month is $5,250. And if you reach 50 appointments, you can add another $250 to that total.",
    ),
    (
        "b09_direct_math_no_cap",
        "The math is direct. The better you get at follow-up and qualification, the more you make. There's no cap on commissions.",
    ),
    (
        "b10_attribution_pipeline",
        "A deal gets attributed to you when you were the person who worked the lead, you completed the handoff to the acquisition team, and the deal closed with a signed contract and completed transaction. If a lead you worked three months ago finally closes, you still get credit. Your pipeline stays with you. You're not getting punished because a seller took their time.",
    ),
    (
        "b11_what_top_earners_do",
        "The people who earn the most here aren't necessarily the ones with the most raw volume. They're the ones who are thorough, consistent, and don't let good leads die from neglect. More quality conversations means more deals in your pipeline. Consistent follow-up means those deals actually convert instead of going cold. And clean handoffs mean the acquisition team can close efficiently instead of scrambling for missing information.",
    ),
    (
        "b12_money_on_table",
        "Every lead you let slip is potential commission you left on the table. Every thorough handoff is money you're putting in your own pocket. It's that direct.",
    ),
    (
        "b13_operator_playbook_tease",
        "Alright, next up: what a real day actually looks like here — how you run your day and how the team stays in sync. Then we'll close out with where you can go from here.",
    ),
]


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        return json.loads(response.read())


def is_credit_error(message):
    lowered = message.lower()
    return "credit" in lowered or "insufficient" in lowered or "balance" in lowered


state_path = f"{OUT}/_state.json"
state = json.load(open(state_path)) if os.path.exists(state_path) else {}


def save():
    json.dump(state, open(state_path, "w"), indent=1)


for tag, text in BEATS:
    beat_state = state.setdefault(tag, {})
    if beat_state.get("wav") and beat_state.get("text") == text:
        continue

    try:
        data = api("POST", "/v3/voices/speech", {"text": text, "voice_id": FRIENDLY, "speed": 1.0})["data"]
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
        beat_state.update(
            wav=wav,
            raw_wav=raw,
            duration=data.get("duration"),
            words=data.get("word_timestamps"),
            text=text,
            voice_id=FRIENDLY,
            speed=1.0,
        )
        print("audio", tag, round(data.get("duration") or 0, 1), flush=True)
    except Exception as exc:
        message = getattr(exc, "read", lambda: b"")().decode()[:300] if hasattr(exc, "read") else str(exc)
        beat_state["error"] = message
        print("AUDIO FAIL", tag, message, flush=True)
        save()
        if is_credit_error(message):
            print("13A AUDIO HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise

    beat_state.pop("error", None)
    save()
    time.sleep(1.5)

done = sum(1 for value in state.values() if isinstance(value, dict) and value.get("wav"))
print("13A AUDIO DONE:", done, "/", len(BEATS), flush=True)
