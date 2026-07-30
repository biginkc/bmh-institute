import json
import os
import pathlib
import re
import subprocess
import time
import urllib.request


KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson18B"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Lesson 18B "Daily Mission Control" — locked master Slot 18 Daily Mission Control,
# cues 1-10, verbatim. Keep BEATS text locked; use TTS_OVERRIDES only for pronunciation.
BEATS = [
    (
        "b01_command_center",
        "You've got the sales skills down. Now we need to talk about how the team actually communicates and works together day to day. Because it doesn't matter how good your calls are if the rest of the team doesn't know what's happening with your leads. At the BMH Group, Slack is the command center. Sandra is where your leads and data live. Slack is where decisions happen, where approvals flow, and where the team stays in sync.",
    ),
    (
        "b02_county_channels",
        "We organize Slack by county. Every market has its own channel. Jackson County, Clay County, St. Louis County, Montgomery County, Camden County, and so on. When you're working a lead in Jackson County, anything about that lead gets discussed in the Jackson County channel. This keeps everything organized by geography. If someone needs to see what's happening in a specific market, they know exactly where to look.",
    ),
    (
        "b03_approval_flow",
        "When you draft an outbound text or email to a seller, it goes through an approval process before it gets sent. You write the draft and post it in the appropriate county channel. Your manager reviews it. They either approve it or ask for changes. Once it's approved, you send it through DialPad or Gmail.",
    ),
    (
        "b04_quality_check",
        "Every message that goes out to a seller represents the BMH Group, so we want the tone, the content, and the timing to be right. Early on you'll go through this on everything. As you build trust and demonstrate solid judgment, the process speeds up. But it always exists as a quality check.",
    ),
    (
        "b05_handoff_thread",
        "When a lead gets serious, when it's moving through discovery and heading toward a handoff, use threads in Slack to keep the discussion organized. Tag the relevant team members. Something like, \"Lead ready for handoff. Diane Webber, Dayton duplex. Full notes in Sandra. Summary: tired landlord, 11 years, behind on taxes, wants out before fall. Very motivated.\" That kind of post gives everyone immediate context without having to go dig through the CRM. Threads keep deal-specific conversations contained so they don't get buried in the general channel flow.",
    ),
    (
        "b06_sandra_packet",
        "When a lead moves to Stage 4 and you're doing the handoff, make sure everything is pushed to Sandra first. Complete seller profile. All your discovery notes. A motivation summary. Their timeline. Property condition details. Price expectations. Who the decision-maker is. How and when they prefer to be contacted. And any sensitivities or hot buttons the acquisition team should know about.",
    ),
    (
        "b07_dual_handoff",
        "Then post the handoff summary in Slack and tag the acquisition team member who's picking it up. That dual communication, CRM data plus Slack notification, makes sure nothing falls through the cracks.",
    ),
    (
        "b08_response_loop",
        "When sellers respond to your texts or emails, you log the response in Sandra immediately and post it in the appropriate county channel. If the response needs attention, if the seller is ready to move forward or has questions or raised an objection, tag the right person. If it's something you can handle yourself, like a simple follow-up or scheduling a callback, just handle it and log it.",
    ),
    (
        "b09_daily_standup",
        "We do daily standups in Slack. Keep them short. How many dials you made. Any standout conversations. Leads that moved stages or got handed off. Anything you're stuck on. And what you're planning for tomorrow. Three to five lines. That's it. Your manager and the team review these to stay aligned on what's happening across the board.",
    ),
    (
        "b10_ask_manager",
        "If you hit a situation you're not sure how to handle, whether it's a tricky objection, an unusual property, a seller asking about something you haven't seen before, don't guess. Post in Slack and tag your manager. Something like \"Have a seller in KC asking about selling while in Chapter 13 bankruptcy. Not sure how to proceed. Notes in Sandra under their name.\" Then keep working your other leads while you wait for guidance. It is always better to ask than to give a seller wrong information. Always.",
    ),
    (
        "b11_team_norms",
        "A few things about how we operate as a team. Over-communicate. If you're not sure whether something is worth sharing in Slack, share it anyway. It's better to have too much information flowing than not enough. When someone tags you, respond within the hour during work hours. Keep everything professional. Slack is a work tool, not a group chat with friends.",
    ),
    (
        "b12_wins_momentum",
        "And when something good happens, when a deal closes, when someone has a great call, when a lead finally converts after weeks of follow-up, post it. Celebrate it. Wins build momentum for the whole team, not just the person who got the deal.",
    ),
    (
        "b13_systems_wrap",
        "That's how the BMH Group works day to day. Your leads live in the CRM. Your communication lives in Slack. Your calls go through DialPad. And the whole team stays connected through those three systems. Learn the flow, follow the process, and you'll fit right in.",
    ),
    (
        "b14_roleplay_career_tease",
        "Alright. That wraps up your day-to-day playbook. Your roleplay for this section is an elderly seller in Dayton whose adult son is opposed to the sale. You'll need to navigate family dynamics with patience and earn trust from both of them. When you're done, there's one more stop: where this role can take you.",
    ),
]

TTS_OVERRIDES = {
    "b02_county_channels": {"St. Louis County": "Saint Loo-is County"},
    "b03_approval_flow": {"DialPad": "Dial Pad", "Gmail": "G-mail"},
    "b05_handoff_thread": {"11 years": "eleven years"},
    "b10_ask_manager": {"KC": "K C", "Chapter 13 bankruptcy": "Chapter thirteen bankruptcy"},
    "b13_systems_wrap": {"DialPad": "Dial Pad"},
}

LEAD_PRONUNCIATION = {
    "lead": "leed",
    "leads": "leeds",
    "Lead": "Leed",
    "Leads": "Leeds",
}


def apply_common_tts_overrides(text):
    return re.sub(r"\b[Ll]eads?\b", lambda match: LEAD_PRONUNCIATION[match.group(0)], text)


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


state_path = f"{OUT}/_state.json"
state = json.load(open(state_path)) if os.path.exists(state_path) else {}

for tag, text in BEATS:
    st = state.setdefault(tag, {})
    tts_text = text
    for old, new in TTS_OVERRIDES.get(tag, {}).items():
        tts_text = tts_text.replace(old, new)
    tts_text = apply_common_tts_overrides(tts_text)

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
    except Exception as e:
        message = getattr(e, "read", lambda: b"")().decode()[:300] if hasattr(e, "read") else str(e)
        print("AUDIO FAIL", tag, message, flush=True)
        save_state(state_path, state)
        if is_credit_error(message):
            print("18B AUDIO HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise

    save_state(state_path, state)
    time.sleep(1.5)

done = sum(1 for s in state.values() if isinstance(s, dict) and s.get("wav"))
total = sum((s.get("duration") or 0) for s in state.values() if isinstance(s, dict))
print("18B AUDIO DONE:", done, "/", len(BEATS), "total", round(total, 1), "s", flush=True)
