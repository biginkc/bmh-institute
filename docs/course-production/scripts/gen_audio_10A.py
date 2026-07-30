import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson10A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Locked master Slot 13, cues 1-14. Do not rewrite these beats except for explicit
# TTS-only fixes approved against the clean script.
BEATS = [
    ("b01_intro", "Welcome to the follow-up game. I'm going to say it three times, because it's that important: follow up, follow up, follow up. Why? Because follow-up is where deals actually happen. That's not a pep talk — it's just how the math works in this business."),
    ("b02_deals_happen", "Most deals do not close on the first call. They close on the second call. The third call. Sometimes the seventh call. The sellers who eventually sign contracts are the ones who had somebody stay in touch with them consistently, professionally, and with real care. Not the person who called once and then vanished."),
    ("b03_not_ready", "Here's what's actually going on when a lead hits your CRM. That seller is dealing with a lot. They've probably gotten calls from multiple investors already. They're navigating whatever situation pushed them toward selling in the first place, whether that's financial pressure, a divorce, an inherited property, or just being done with being a landlord. They might not be ready to make a decision today. But \"not ready today\" does not mean \"not interested.\" It means the timing hasn't lined up yet. Or their situation hasn't gotten urgent enough. Or they haven't built enough trust with anyone calling them. Or they just need more time to sit with it. Your job is to be the person who's there when they're ready. Not the person who tried once and moved on."),
    ("b04_fifth_touch", "The industry data on this is pretty wild. Most follow-up in real estate investing stops after one or two attempts. But most deals close after five or more touches. So if you're the person making that fifth or sixth contact while everybody else quit after two, you're the one who gets the deal. It's not complicated. It just takes discipline."),
    ("b05_day_1_to_30", "Here's the follow-up cadence we use at BMH for active leads. On the first day, you have your initial call or conversation. You log your notes and schedule the follow-up. On day two, you send a follow-up text, something short and personal, not a mass blast. Day four, you make a follow-up call and reference the previous conversation. Day seven, you call again and send a text if they don't answer. Day fourteen, follow-up call with a new angle or new piece of information. Day twenty-one, send a text or email to check in. Day thirty, another call with a simple \"any changes on your end?\""),
    ("b06_monthly_cadence", "After day thirty, you shift to a monthly cadence. One touch per month, alternating between calls and texts, for up to six months. If after six months of consistent follow-up there's been absolutely zero engagement, no answered calls, no returned texts, no responses at all, you can move the lead to long-term nurture or mark it dead."),
    ("b07_second_call", "The first call is all about discovery and qualification. Calls two and beyond are different because you're not starting from scratch anymore. You're building on a relationship that already exists, even if it's a thin one. For the second call, it sounds something like this. \"Hey, this is Andrea with the BMH Group. We talked a few days ago about your property at 123 Main st. I wanted to follow up and see if you've had a chance to think about what we discussed. How are things going?\" The key there is referencing the previous conversation. It shows them you remember who they are."),
    ("b08_bring_new", "For the third call and beyond, you need to bring something new each time. Don't just call to \"check in.\" That's lazy and the seller can feel it. Instead, share something relevant like \"I was looking at some recent sales in your area and wanted to share what I found.\" Or ask about something they mentioned last time. \"You mentioned your brother was coming into town to help with the property. Did you get a chance to talk with him about it?\" Every follow-up should have a reason beyond \"are you ready yet?\""),
    ("b09_silent_seller", "Now, sellers go silent sometimes. It happens. They were engaged on the first call, said they'd think about it, and then nothing. No answered calls, no returned texts. Don't panic and don't write them off. This is where ghost texts come in, which are strategically written messages designed to get a response from someone who's gone quiet."),
    ("b10_ghost_texts", "You can try a casual check-in. \"Hey, it's Andrea from the BMH Group. Haven't heard from you in a bit, just wanted to make sure you're doing okay. Any updates on the property?\" Or try an assumptive approach. \"Hi, I wanted to let you know we're still interested in your property at 123 Main st. If the timing isn't right, no worries at all, just let me know and I'll update my notes.\" There's also the value add angle. \"Hey, I noticed some activity in your neighborhood, a few properties have sold recently. Wanted to see if that changes anything on your end.\" And then there's the simple yes/no, which is surprisingly effective. \"Hi, still thinking about selling the property at 123 Main st? Just a quick yes or no and I'll know how to help.\""),
    ("b11_when_to_stop", "You do need to know when to stop, though. Follow-up should be persistent, not annoying. There is a line. If they explicitly say \"stop calling me\" or \"remove me from your list,\" you respect that immediately. Mark it in the CRM and stop all contact. Full stop. If you've had six months of zero engagement across every channel, move them to long-term nurture or mark the lead dead. Everything else? Keep following up. \"Not right now\" means follow up later. \"I need to think about it\" means follow up in a few days. \"Call me next month\" means you put it in the CRM and you call them next month. People tell you exactly when to call them back. Take them at their word."),
    ("b12_daily_priority", "The biggest challenge with follow-up isn't knowing what to do. It's actually doing it consistently, every single day, even when you don't feel like it. That means at the start of each day, your follow-up list in Sandra is your number one priority. Follow-ups happen before new leads, always. If you have thirty follow-ups scheduled for today, you make all thirty attempts. If you can't reach someone, you leave a voicemail and send a text. And you never, ever skip a follow-up because you've decided in your head that \"they probably aren't interested.\" You don't know that. The seller hasn't told you that. So you make the call."),
    ("b13_outro", "The person who does their follow-ups every day without exception will outperform the person who makes twice as many new calls but ignores their follow-up list. Every single time. That's not an opinion, it's what we've seen play out over and over again. Your roleplay for this module is a probate lead in St. Louis. It's an inherited house, emotionally complex, and the seller needs your empathy just as much as your persistence. Once you've run the roleplay, meet me in the next lesson — we're pulling every script you've learned into one flow."),
]

TTS_OVERRIDES = {
    # TTS-only pronunciation fixes. Keep BEATS locked to the approved master text.
    "b07_second_call": {"123 Main st.": "123 Main Street"},
    "b10_ghost_texts": {"123 Main st.": "123 Main Street", "123 Main st?": "123 Main Street?"},
    "b13_outro": {"St. Louis": "Saint Loo-is"},
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
    if st.get("wav") and tag not in TTS_OVERRIDES:
        if not st.get("tts_text"):
            st["tts_text"] = text
            save()
        continue
    if st.get("wav") and st.get("tts_text") == tts_text:
        continue
    try:
        d = api("POST", "/v3/voices/speech", {"text": tts_text, "voice_id": FRIENDLY, "speed": 1.0})["data"]
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
            print("10A AUDIO HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise
    save()
    time.sleep(1.5)

done = sum(1 for s in state.values() if isinstance(s, dict) and s.get("wav"))
print("10A AUDIO DONE:", done, "/", len(BEATS), flush=True)
