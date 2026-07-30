import json, os, time, urllib.request, subprocess
import pathlib

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson17"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED = "91120f72682e4459a19e311ba2ee4cb2"

# v3 "master texture, no numbers" (LOCKED by Jarrad 2026-07-09) — master deviation on record.
# Rebuilt from master Slot 17 cue-by-cue; all dollar amounts, tiers, thresholds, the 30-day
# ramp figure, "no cap", and attribution-policy phrasing removed (V5/V8 softer alts locked).
# Do not reuse older Lesson 17 audio (v1 numbers-era or v2 ultra-generic) without regenerating.
BEATS = [
    ("b01_intro", "Alright, let's talk about money. Specifically, how your performance turns into a paycheck. I'm going to lay out how compensation works here so there's no mystery about it. The more you understand this, the clearer the connection between your daily work and what you earn."),
    ("b02_three_pieces", "Whatever seat you're in, compensation here is built around the same idea: a base while you ramp up, performance pay on the results your role owns, and bonuses for hitting milestones along the way."),
    ("b03_base_ramp", "When you start, you receive a base rate while you're ramping up. You're learning, building skills, getting comfortable with the process. The base pay makes sure you've got income coming in while you're still getting up to speed. Once you're consistently hitting your role's KPIs, you graduate to the full performance structure. That's the transition point."),
    ("b04_your_deal", "Take the lead-sourcing seat as an example. You earn a commission on every deal that closes where you were the person who sourced and qualified the lead. You did the follow-up. You built the relationship. You handed it off with a clean, complete package. And the acquisition team closed it. That's your deal."),
    ("b05_strong_months", "And performance pay moves with your performance. Strong months show up in your paycheck."),
    ("b06_real_outcomes", "Milestone bonuses work the same way in every seat: they count on real outcomes. In lead sourcing, an appointment counts when the seller actually shows up for the call — not when you put it on the calendar. Real results, not activity for its own sake."),
    ("b07_math_direct", "The math is direct. The better you get at your craft, the more you make."),
    ("b08_long_tail", "And good work has a long tail. Deals you worked months ago can still close — and that follow-through is exactly what gets noticed and rewarded here."),
    ("b09_earnings_logic", "The people who earn the most here aren't necessarily the ones with the most raw volume. They're the ones who are thorough, consistent, and don't let good leads die from neglect. More quality conversations means more deals in your pipeline. Consistent follow-up means those deals actually convert instead of going cold. And clean handoffs mean the acquisition team can close efficiently instead of scrambling for missing information."),
    ("b10_that_direct", "Every lead you let slip is potential commission you left on the table. Every thorough handoff is money you're putting in your own pocket. It's that direct."),
    ("b11_your_plan", "Now, your exact numbers — your base rate, how your performance pay is calculated, your bonus milestones — those live in your offer letter or your comp plan. If you ever have a question about what applies to you, go there first, or ask your manager."),
    ("b12_outro", "Alright, next up: what a real day actually looks like here — how you run your day and how the team stays in sync. Then we'll close out with where you can go from here."),
]

# Outro uses the Excited finale voice per house convention.
VOICE_OVERRIDES = {"b12_outro": EXCITED}

TTS_OVERRIDES = {}


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


sp = f"{OUT}/_state.json"
state = json.load(open(sp)) if os.path.exists(sp) else {}


def save():
    json.dump(state, open(sp, "w"), indent=1)


def is_credit_error(msg):
    msg = msg.lower()
    return "credit" in msg or "insufficient" in msg or "balance" in msg


for tag, text in BEATS:
    st = state.setdefault(tag, {})
    tts_text = text
    for old, new in TTS_OVERRIDES.get(tag, {}).items():
        tts_text = tts_text.replace(old, new)
    if st.get("wav") and st.get("tts_text") == tts_text:
        continue
    try:
        voice = VOICE_OVERRIDES.get(tag, FRIENDLY)
        d = api("POST", "/v3/voices/speech", {"text": tts_text, "voice_id": voice, "speed": 1.0})["data"]
        raw = f"{OUT}/{tag}_raw.wav"
        wav = f"{OUT}/{tag}.wav"
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", wav, "-y"],
            check=True,
        )
        st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=text, tts_text=tts_text)
        print("audio", tag, round(d.get("duration") or 0, 1), flush=True)
    except Exception as e:
        msg = getattr(e, "read", lambda: b"")().decode()[:300] if hasattr(e, "read") else str(e)
        print("AUDIO FAIL", tag, msg, flush=True)
        save()
        if is_credit_error(msg):
            print("17 AUDIO HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise
    save()
    time.sleep(1.5)

v3_tags = {t for t, _ in BEATS}
done = sum(1 for k, s in state.items() if k in v3_tags and isinstance(s, dict) and s.get("wav"))
print("17 AUDIO v3 DONE:", done, "/", len(BEATS), flush=True)
