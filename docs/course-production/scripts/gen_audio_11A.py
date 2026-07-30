import json
import os
import pathlib
import subprocess
import time
import urllib.request

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson11A"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Locked master Slot 15, cues 1-11. These are split to match the approved b01-b16
# storyboard, but the transcript wording is unchanged.
BEATS = [
    (
        "b01_reframe_close",
        "I want to reframe how you think about closing. Because if you've done everything right up to this point, if you've built real rapport, done thorough discovery, handled objections with empathy, and stayed consistent in your follow-up, closing should actually be the easiest part. Seriously.",
    ),
    (
        "b02_formal_agreement",
        "By the time you get to this stage, the seller is talking to someone they like, someone they trust, and someone they want to do business with. They've already decided. The close is really just the formal agreement that makes it official. The hard work already happened in the calls and follow-ups that got you here.",
    ),
    (
        "b03_handoff_role",
        "Now, you're not the person presenting the offer or negotiating the final terms. That's the acquisition team's job. But you play a real role in making the close possible because you're the one who delivered a qualified, motivated, well-documented lead.",
    ),
    (
        "b04_why_understand",
        "And you'll continue to support the process after the handoff. You need to understand how closing works for a few practical reasons. You'll sometimes be asked to help with follow-ups during the offer stage. Understanding closing also makes you better at discovery because you know what information the acquisition team actually needs. And as you grow in your career, you may take on acquisition responsibilities yourself.",
    ),
    (
        "b05_offer_range",
        "After you hand off a qualified lead, the acquisition team reviews your notes and the property data. They use comparable sales to generate an offer range. Then they contact the seller, ideally on a call that you helped set up, and present the offer.",
    ),
    (
        "b06_clean_offer",
        "A good offer presentation is clean and simple. Something like \"Based on everything we've looked at, the condition of the property, what similar homes have sold for, and the repairs that would be needed, we're able to offer $X in cash. We'd close on your timeline, handle all the paperwork, and you wouldn't need to do any repairs or pay any fees. How does that sound?\" No pressure. No gimmicks. Just a clear, honest offer.",
    ),
    (
        "b07_hoping_more",
        "The most common response to any offer is some version of \"I was hoping for more.\" That's normal. Expected. Not a dealbreaker.",
    ),
    (
        "b08_close_gap",
        "The acquisition team handles negotiation, but the framework they use is worth understanding. They start by acknowledging. \"I hear you, and I completely understand.\" Then they reframe the value. Then they ask what works. \"What number would you need to see to feel good about this?\" And from there they figure out if there's a gap they can close.",
    ),
    (
        "b09_respect",
        "The thing about negotiation that matters most is this: it's not about winning. It's about finding a number both sides can feel good about. If the seller walks away feeling like they lost, the deal falls apart after the contract is signed. Both parties need to feel respected.",
    ),
    (
        "b10_contract_signed",
        "When the seller agrees to the offer verbally, the next step is getting the contract signed. The acquisition team confirms all terms on the call. A purchase agreement gets prepared and sent to the seller. The seller reviews and signs, usually electronically. And once it's signed, the deal moves to the transaction team for closing.",
    ),
    (
        "b11_transaction_work",
        "After the contract is signed, there's still work happening. The title company verifies ownership, checks for liens, and prepares for closing. The team may inspect the property. Closing logistics get coordinated, including the date, signing location, and funds transfer. The transaction coordinator manages all of this. Your involvement is minimal at this stage, but you might be asked to reassure a seller if they're getting nervous, help with scheduling if they have questions, or relay any new information that comes up.",
    ),
    (
        "b12_sellers_remorse",
        "Deals do fall apart sometimes, and it's worth knowing why so you can help prevent it. Seller's remorse is one of the most common reasons. They signed but now they're second-guessing the decision. This usually happens when the seller didn't feel heard during the process. It's exactly why good discovery and genuine rapport matter so much.",
    ),
    (
        "b13_deal_risks",
        "Family interference is another one. A relative finds out about the deal and talks the seller into backing out. This is why identifying all the decision-makers during discovery is so critical. Title issues come up too. Liens, boundary disputes, unclear ownership. And occasionally another buyer comes in with a higher number. It happens.",
    ),
    (
        "b14_trust_beats_price",
        "But here's what's interesting. If you built a genuine relationship with the seller, they often stick with you even when a competitor offers more. Because they trust you. Trust beats price more often than you'd think.",
    ),
    (
        "b15_your_impact",
        "Even though you're not the one signing the contract, don't lose sight of the fact that you're the person who made the deal possible. That lead wouldn't have gotten anywhere near a closing table without your follow-up. Your discovery built the foundation. Your empathy built the trust. Your consistency kept the opportunity alive when another rep would have moved on. When a deal closes and revenue comes in, it started with a conversation you had.",
    ),
    (
        "b16_next_kpis",
        "That's the real impact of the work you do every day. On to the next section.",
    ),
]

TTS_OVERRIDES = {
    # TTS-only pronunciation fixes. Keep BEATS locked to the approved master text.
    # TTS read the literal "$X" as an isolated "ex" token (defect at 1:49).
    # "X dollars in cash" only reordered the broken placeholder (still isolated "X").
    # "X amount in cash" is idiomatic spoken English and resolves the grammar defect.
    "b06_clean_offer": {"$X in cash": "X amount in cash"},
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
            print("11A AUDIO HALT: INSUFFICIENT CREDITS - STOP AND TELL JARRAD", flush=True)
            raise SystemExit(2)
        raise
    save()
    time.sleep(1.5)

done = sum(1 for s in state.values() if isinstance(s, dict) and s.get("wav"))
print("11A AUDIO DONE:", done, "/", len(BEATS), flush=True)
