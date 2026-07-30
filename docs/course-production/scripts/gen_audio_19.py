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
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson19"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED = "91120f72682e4459a19e311ba2ee4cb2"

BEATS = [
    (
        "b01_career_path_opener",
        "Where you're starting is not where you have to stay. The BMH Group is growing, and the people who grow with us are the ones who master what's in front of them and consistently show they're ready for more. There's a real path here, and I want you to see it clearly.",
        FRIENDLY,
    ),
    (
        "b02_foundation_role",
        "Regardless of the role, you're either working leads, qualifying sellers, or building pipelines. That's the foundation. Everything else at this company builds on top of that.",
        FRIENDLY,
    ),
    (
        "b03_clean_handoffs",
        "Master it. Understand the sellers. Internalize the pipeline. Hit your KPIs consistently. Become the kind of person the team can rely on — because what you deliver is clean, well-documented, and actually ready.",
        FRIENDLY,
    ),
    (
        "b04_readiness_checkpoint",
        "Once you've proven you can do that consistently, hitting your numbers for 90-plus days, keeping your CRM spotless, showing leadership qualities, you move up.",
        FRIENDLY,
    ),
    (
        "b05_complex_leads_mentor",
        "At the next level you're handling more complex leads. Probate situations with emotional family dynamics. Multi-owner properties where you've got three siblings who can't agree on anything. Sellers who are in financial distress and need someone who can navigate a sensitive conversation. You're also mentoring the newer people coming in behind you. Earnings can grow with performance. You've got more autonomy. Less daily oversight.",
        FRIENDLY,
    ),
    (
        "b06_deal_closer_level",
        "Beyond that, the next level is where you're presenting offers, negotiating terms, and closing deals directly. You own the full sales cycle from handoff all the way through to a signed contract. The earning potential is significantly higher because you're earning commission on the deals you close, not just the ones you source.",
        FRIENDLY,
    ),
    (
        "b07_creative_deal_skill",
        "But the expectations are higher too. You need real negotiation skills. Market knowledge. The ability to structure deals creatively when the straightforward approach doesn't work.",
        FRIENDLY,
    ),
    (
        "b08_management_path",
        "And if you have a leadership drive, if you're the kind of person who gets energy from building a team and developing other people, there's a management path where you're hiring, training, coaching, and owning the performance of an entire team. Your compensation at that level is tied to your team's output. When they win, you win.",
        FRIENDLY,
    ),
    (
        "b09_no_fixed_schedule",
        "Now, what actually gets you promoted here? It's not time. Some people advance in six months. Some take a year. There's no fixed schedule. It's entirely based on demonstrated performance and readiness.",
        FRIENDLY,
    ),
    (
        "b10_daily_performance_criteria",
        "The things we look at are pretty straightforward. Are you hitting your numbers consistently? Not on good days, not when you feel like it, but every day for extended stretches. Do your calls actually sound good? Is your CRM clean? Every lead has notes, a stage, and a next action. No leads sitting there with no plan.",
        FRIENDLY,
    ),
    (
        "b11_team_contribution_coachability",
        "We also look at how you contribute to the team. Do you help people? Share what's working? Are you someone others want to work with? And are you coachable? When someone points out a gap in your process, do you fix it, or do you get defensive? The people who advance fastest are the ones who hear feedback, apply it, and come back better. Every time.",
        FRIENDLY,
    ),
    (
        "b12_revenue_opportunity",
        "And the most obvious one. Is your work producing revenue? Are the people you hand off actually turning into closed deals? That speaks louder than anything else. The BMH Group is expanding. New markets, new teams, new positions. The people who are performing well right now are the first ones considered for every opportunity that opens up. How far you go here is up to you.",
        FRIENDLY,
    ),
    (
        "b13_course_close",
        "I hope this gives you a clear picture of the growth paths available at BMH. Your path will depend on what you're good at, where you want to go, and the results you produce. We're confident you can continue growing here if you keep improving and stay open to coaching. Keep the conversation going about where you want to grow next.",
        FRIENDLY,
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


def error_text(exc):
    if isinstance(exc, urllib.error.HTTPError):
        return exc.read().decode(errors="replace")[:1000]
    return str(exc)


sp = f"{OUT}/_state.json"
state = json.load(open(sp)) if os.path.exists(sp) else {}
force_tags = {tag.strip() for tag in os.environ.get("FORCE_TAGS", "").split(",") if tag.strip()}


def save():
    json.dump(state, open(sp, "w"), indent=1)


for tag, text, voice in BEATS:
    if force_tags and tag not in force_tags:
        print("not selected", tag, flush=True)
        continue
    st = state.setdefault(tag, {})
    if tag not in force_tags and st.get("wav") and os.path.exists(st["wav"]) and st.get("words") and st.get("text") == text:
        print("skip", tag, flush=True)
        continue
    try:
        data = api("POST", "/v3/voices/speech", {"text": text, "voice_id": voice, "speed": 1.0})["data"]
        raw = f"{OUT}/{tag}_raw.wav"
        wav = f"{OUT}/{tag}.wav"
        raw_tmp = f"{raw}.tmp"
        wav_tmp = f"{wav}.tmp"
        urllib.request.urlretrieve(data["audio_url"], raw_tmp)
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                raw_tmp,
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ar",
                "44100",
                "-f",
                "wav",
                wav_tmp,
                "-y",
            ],
            check=True,
        )
        os.replace(raw_tmp, raw)
        os.replace(wav_tmp, wav)
        st.update(wav=wav, duration=data.get("duration"), words=data.get("word_timestamps"), text=text, voice=voice)
        st.pop("error", None)
        print("audio", tag, round(data.get("duration") or 0, 1), flush=True)
    except Exception as exc:
        msg = error_text(exc)
        print("AUDIO FAIL", tag, msg[:500], flush=True)
        st["error"] = msg
        save()
        if "credit" in msg.lower() or "insufficient" in msg.lower():
            raise SystemExit("INSUFFICIENT CREDIT")
        raise
    save()
    time.sleep(1.5)

def valid(tag, text):
    st = state.get(tag, {})
    return bool(st.get("wav") and os.path.exists(st["wav"]) and st.get("words") and st.get("text") == text and not st.get("error"))


done = sum(1 for tag, text, _ in BEATS if valid(tag, text))
total = sum(state.get(tag, {}).get("duration") or 0 for tag, _, _ in BEATS)
print("19 AUDIO DONE:", done, "/", len(BEATS), "total", round(total, 1), "s", flush=True)
if done != len(BEATS):
    raise SystemExit("Lesson 19 audio validation incomplete")
