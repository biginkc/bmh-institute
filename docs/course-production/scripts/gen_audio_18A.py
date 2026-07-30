#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import time
import urllib.error
import urllib.request

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson18A"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Lesson 18A "Operator Playbook" — locked master Slot 18 first block,
# cues 1-14, verbatim. Keep BEATS text locked; use TTS_OVERRIDES only for pronunciation.
BEATS = [
    (
        "b01_put_it_together",
        "You've covered a lot of ground. Sellers, the offer, the pipeline, scripts, objections, tools, KPIs, compensation, advanced situations, FAQs. Now we're going to put all of it together into what a real day actually looks like. Because knowing the pieces is one thing. Running the whole day is something else.",
    ),
    (
        "b02_command_center_priorities",
        "You clock in on HubStaff and open Sandra. That's your command center. First thing you do is look at your follow-up list. How many callbacks are scheduled for today? What stage are they in? Who's the hottest lead, the one closest to being ready for a handoff? Sort your priorities. Stage 3 leads come first because they're closest to moving forward. Then Stage 2, the ones that still need qualification. Then Stage 1, people you haven't been able to connect with yet.",
    ),
    (
        "b03_research_prep",
        "For the first half hour, you open PropStream and do quick research on your top 10 to 15 leads. Verify ownership. Check property details. Look for anything useful, liens, tax status, mortgage info, anything you can reference on the call. This half hour of prep makes every conversation you have for the rest of the day better. You'll sound like you've done your homework, because you actually did.",
    ),
    (
        "b04_first_call_block",
        "Then you start dialing. Your first calling block is the most important one. Follow-ups first, always. Start with your scheduled callbacks, the people who are expecting to hear from you at a specific time. After that, move to the other follow-up leads in your pipeline. Then new leads that haven't been contacted. You're aiming for 60 to 80 dials in this first block. After every call, you log notes in Sandra immediately. Between dials, you fire off follow-up texts.",
    ),
    (
        "b05_break_reset",
        "Take a break. Seriously. Step away from the screen for fifteen minutes. Stretch. Get some water. Reset your energy. The next block needs the same energy as the first one, and it won't get it if you're running on fumes.",
    ),
    (
        "b06_second_block_lunch",
        "Second calling block. Keep working your list. Mix in texts and emails between calls. If you cleared all your follow-ups in the first block, focus on new leads and re-contacts. By the time you break for lunch, you should be somewhere around 110 to 150 dials for the day. Lunch. Eat real food. Not a protein bar at your desk while scrolling your phone.",
    ),
    (
        "b07_admin_block",
        "After lunch, you've got an admin block. Send follow-up emails for the conversations you had that morning. Update lead stages in the CRM. If any leads are ready for handoff, complete those checklists now. Clean up any notes that need detail.",
    ),
    (
        "b08_final_call_block",
        "Then your final calling block. This is the last push. Hit the remaining leads on your list. Try re-dials on the people who didn't pick up in the morning. Make sure every lead scheduled for today has been attempted. By the end of this block, you should be at 150 to 200 total dials.",
    ),
    (
        "b09_pipeline_review",
        "Last half hour of the day is pipeline review. Step back and look at the big picture. How many leads are sitting at each stage? Are there any stuck in Stage 1 that haven't connected after multiple attempts, maybe they need a different approach? Are there any in Stage 3 that are ripe for handoff but haven't been moved yet? Update every stage. Make sure every active lead has a next action with a specific date. No leads floating around without a plan. Then schedule your follow-ups for tomorrow. Make sure your task list in Sandra is ready for when you sit down in the morning. Clean up anything that's stale. Clock out.",
    ),
    (
        "b10_worked_the_day",
        "You've \"worked the day\" when all of this is true. You hit your dial target. You completed every scheduled follow-up. You logged detailed notes on every conversation. You sent follow-up texts and emails to all active leads. You updated all lead stages that needed updating. Every active lead has a next action. Your pipeline is clean. And you clocked your full hours. If all of that is true, you worked the day.",
    ),
    (
        "b11_control_consistency",
        "It doesn't matter if nobody picked up. It doesn't matter if you didn't close a deal. You controlled what you could control. And over time, over weeks and months, that consistency is what produces results. It's not one heroic day. It's showing up and doing it every single day.",
    ),
    (
        "b12_energy_management",
        "This job is a marathon. You're making 150-plus calls a day, five days a week. If you don't manage your energy, you will burn out. Smile before you dial, because people can hear your energy through the phone. Take your breaks, don't skip them. Stay hydrated. Eat real food. If you're having a rough stretch on the phone and nothing's connecting, take a five minute walk outside and reset. Celebrate small wins throughout the day. A good conversation. A lead that moved to the next stage. A callback that finally connected. Those add up.",
    ),
    (
        "b13_one_call_humans",
        "And remember something. It takes one call to completely change your day. One conversation can turn a zero day into the best day you've had. This is a numbers game, but it's run by humans. The numbers matter. The consistency matters. But the thing that actually makes it work is the genuine care you bring to every conversation. The sellers who close with us do it because someone cared enough to keep calling, to keep listening, to follow through when everyone else dropped off. That's what this job is.",
    ),
    (
        "b14_daily_sync_tease",
        "Your capstone roleplay is coming: a full-cycle scenario, cold outreach all the way through to framing the handoff. Everything you've learned is on the table. But before you run it, one more piece: how the team stays in sync day to day.",
    ),
]

TTS_OVERRIDES = {
    "b01_put_it_together": {"KPIs": "K P I's", "FAQs": "F A Q's"},
    "b02_command_center_priorities": {"HubStaff": "Hub Staff", "Stage 3": "Stage three", "Stage 2": "Stage two", "Stage 1": "Stage one"},
    "b03_research_prep": {"PropStream": "Prop Stream", "10 to 15": "ten to fifteen"},
    "b04_first_call_block": {"60 to 80": "sixty to eighty"},
    "b06_second_block_lunch": {"110 to 150": "one hundred ten to one hundred fifty"},
    "b07_admin_block": {"CRM": "C R M"},
    "b08_final_call_block": {"150 to 200": "one hundred fifty to two hundred"},
    "b09_pipeline_review": {"Stage 1": "Stage one", "Stage 3": "Stage three"},
    "b12_energy_management": {"150-plus": "one hundred fifty plus", "five minute": "five-minute"},
}


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def save_state(state_path, state):
    with open(state_path, "w") as f:
        json.dump(state, f, indent=1)


def is_credit_error(message):
    lowered = message.lower()
    return "credit" in lowered or "insufficient" in lowered or "balance" in lowered


def error_message(exc):
    if isinstance(exc, urllib.error.HTTPError):
        try:
            return exc.read().decode()[:500]
        except Exception:
            return str(exc)
    return str(exc)


state_path = f"{OUT}/_state.json"
state = json.load(open(state_path)) if os.path.exists(state_path) else {}

for tag, text in BEATS:
    st = state.setdefault(tag, {})
    tts_text = text
    for old, new in TTS_OVERRIDES.get(tag, {}).items():
        tts_text = tts_text.replace(old, new)

    if st.get("wav") and st.get("tts_text") == tts_text:
        continue

    try:
        data = api("POST", "/v3/voices/speech", {"text": tts_text, "voice_id": FRIENDLY, "speed": 1.0})["data"]
        raw = f"{OUT}/{tag}_raw.wav"
        wav = f"{OUT}/{tag}.wav"
        urllib.request.urlretrieve(data["audio_url"], raw)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", wav, "-y"],
            check=True,
        )
        st.update(
            wav=wav,
            duration=data.get("duration"),
            words=data.get("word_timestamps"),
            text=text,
            tts_text=tts_text,
            voice=FRIENDLY,
            speed=1.0,
        )
        print("audio", tag, round(data.get("duration") or 0, 1), flush=True)
    except Exception as exc:
        message = error_message(exc)
        print("AUDIO FAIL", tag, message, flush=True)
        save_state(state_path, state)
        if is_credit_error(message):
            print("18A AUDIO HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise

    save_state(state_path, state)
    time.sleep(1.5)

done = sum(1 for s in state.values() if isinstance(s, dict) and s.get("wav"))
total = sum((s.get("duration") or 0) for s in state.values() if isinstance(s, dict))
print("18A AUDIO DONE:", done, "/", len(BEATS), "total", round(total, 1), "s", flush=True)
