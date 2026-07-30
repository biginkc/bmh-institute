#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import time
import urllib.error
import urllib.request

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson12A"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Locked master Slot 16, cues 1-16. Split into approved storyboard beats.
# v5 applies Jarrad-directed evergreen deviations: remove role-variable targets,
# remove the role-specific target beat, and replace the old next-topic tease.
BEATS = [
    (
        "b01_numbers_work",
        "You've learned the sales process. You've practiced calls. You know the tools. Now we need to talk about how we know if any of that is actually working. Because in this business, feelings don't close deals. Numbers do.",
    ),
    (
        "b02_gaps_not_guesses",
        "You can feel like you had a productive day, feel like you're making progress, feel like things are going well, and still be falling behind. That happens all the time. The people who improve fastest and earn the most are the ones who actually look at their numbers, figure out where the gaps are, and fix them. Everyone else just guesses and hopes.",
    ),
    (
        "b03_kpi_definition",
        "KPI stands for Key Performance Indicator. These are the numbers that tell you and your manager whether you're on track or not. Think of them like the dashboard in your car. You don't need to be a mechanic to know that if your fuel gauge is on empty, you've got a problem. KPIs work the same way. One glance and you know where you're strong and where something needs fixing.",
    ),
    (
        "b04_flying_blind",
        "The biggest mistake people make when they start is flying blind. Making calls all day, staying busy, feeling productive, but never actually checking whether any of it is converting. Being busy and being productive are two completely different things, and KPIs are what separates them.",
    ),
    (
        "b05_six_metrics_funnel",
        "We track six metrics, and we track them from left to right. That means we follow the lead from the moment it enters the pipeline all the way to a signed contract. Each metric feeds into the next, and when something breaks, you can trace it back to exactly where it broke.",
    ),
    (
        "b06_dial_count",
        "The first metric is dial count. This is the total number of outbound calls you make in a day. It's one of the clearest measures of outbound effort. You can't control whether someone picks up. You can't control whether they want to sell. But you can control whether you keep working the list with real effort and consistency.",
    ),
    (
        "b07_dial_quality",
        "Now here's something worth explaining. We do not hold people to a strict dial count as the goal by itself. If someone is chasing a number late in the day, they can start speed-dialing through their list just to make the count look right. No real conversations. No quality. Just tapping the phone as fast as possible. That's completely useless. So we track dial count as a leading indicator of effort, but it is not the goal. It tells us whether someone is putting in the work, but the work itself has to be real.",
    ),
    (
        "b08_connection_rate",
        "The second metric is connection rate. Out of all those dials, how many people actually picked up? This one tells you about list quality and whether your phone number is getting flagged as spam. If your connection rate drops below the normal range for your role and market, something is wrong. Your number might be getting marked as spam, the list might be stale, or you might be calling at bad times. If you see that happening, flag it to your manager right away.",
    ),
    (
        "b09_quality_conversations",
        "The third metric is quality conversations. Out of the people who picked up, how many of them genuinely want to sell? This doesn't mean they'll accept our price. It means they have a property and they're interested in hearing an offer. A quality conversation filters out wrong numbers, people who say \"take me off your list,\" and people who have zero interest in selling. If that number is low, it usually means the list is off, your opening isn't connecting, or you're calling into a market where the leads aren't matched to what we do.",
    ),
    (
        "b10_process_calls",
        "The fourth metric is process calls. Out of those quality conversations, how many went all the way through your qualification and discovery process? This means you ran the full fact find, confirmed they qualify for our offer, gathered all the information needed to move forward. If your quality conversations are high but your process calls are low, you're probably disqualifying people too fast, not handling objections well enough, or not going deep enough in your discovery conversations. That's a coaching moment, and it usually shows up clearly in call recordings.",
    ),
    (
        "b11_offers_made",
        "The fifth metric is offers made. How many official offers went out from the acquisition team? This is primarily tracked on their side, but it reflects the quality of leads you're handing off. If the acquisition team is having lots of conversations but making very few offers, the leads coming across might not be as qualified as they looked on paper. That's worth looking into.",
    ),
    (
        "b12_contracts_signed",
        "The sixth metric is contracts signed. This is the one everyone cares about. How many offers turned into signed contracts? If that conversion is weaker than expected, something in the negotiation or pricing process needs attention.",
    ),
    (
        "b13_breakdown_map",
        "The reason we track left to right is that when something is off, you can pinpoint exactly where the breakdown is happening. Low dials? That's an effort problem. Good dials but low connections? Check the phone number and list quality. Good connections but few quality conversations? The audience is wrong or the opening needs work. Good conversations but few process calls? Discovery is weak or you're disqualifying too fast. Good process calls but few offers? The handoff might be incomplete. Good offers but few contracts? Something's off in the negotiation.",
    ),
    (
        "b14_funnel_health",
        "Each step narrows the funnel. Your job is to keep the funnel as healthy as possible at the stages you control, which is everything from dials through handoff.",
    ),
    (
        "b16_coaching_questions",
        "The question is always \"where's the gap, and what do we do about it?\" If your dials are low, is it an effort issue, or are you spending too long on individual calls and running out of time? If your conversations aren't converting, do we need to pull up your recordings and listen together? If your process calls are dropping, are you disqualifying people too aggressively based on the first thing they say? That's the whole point of tracking.",
    ),
    (
        "b17_embrace_numbers",
        "Not to micromanage. Not to punish. To find the gaps and close them. The people who embrace their numbers instead of avoiding them are the ones who improve the fastest. So know your numbers. Look at them every day. And when something looks off, don't ignore it.",
    ),
    (
        "b18_final_close",
        "You've got the numbers down. Next up, we'll talk about exactly how your work translates into what you take home — the offer letter you'll sign is where that gets spelled out.",
    ),
]

TTS_OVERRIDES = {}


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
    message = message.lower()
    return "credit" in message or "insufficient" in message or "balance" in message


state_path = f"{OUT}/_state.json"
state = json.load(open(state_path)) if os.path.exists(state_path) else {}


def save():
    json.dump(state, open(state_path, "w"), indent=1)


for tag, text in BEATS:
    beat_state = state.setdefault(tag, {})
    tts_text = text
    for old, new in TTS_OVERRIDES.get(tag, {}).items():
        tts_text = tts_text.replace(old, new)
    if beat_state.get("wav") and beat_state.get("tts_text") == tts_text:
        continue
    try:
        data = api("POST", "/v3/voices/speech", {"text": tts_text, "voice_id": FRIENDLY, "speed": 1.0})["data"]
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
            duration=data.get("duration"),
            words=data.get("word_timestamps"),
            text=text,
            tts_text=tts_text,
            voice_id=FRIENDLY,
            speed=1.0,
        )
        print("audio", tag, round(data.get("duration") or 0, 1), flush=True)
    except urllib.error.HTTPError as exc:
        message = exc.read().decode(errors="replace")[:500]
        print("AUDIO FAIL", tag, message, flush=True)
        beat_state["error"] = message
        save()
        if is_credit_error(message):
            print("12A AUDIO HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise
    except Exception as exc:
        message = str(exc)
        print("AUDIO FAIL", tag, message, flush=True)
        beat_state["error"] = message
        save()
        if is_credit_error(message):
            print("12A AUDIO HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise
    beat_state.pop("error", None)
    save()
    time.sleep(1.5)

done = sum(1 for beat in state.values() if isinstance(beat, dict) and beat.get("wav"))
print("12A AUDIO DONE:", done, "/", len(BEATS), flush=True)
