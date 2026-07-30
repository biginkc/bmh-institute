import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson9A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Verbatim master Slot 12 cues 1-13 + Jarrad-approved bridge outro.
# TTS-only respell (PLAYBOOK 8.10): "ARV"->"A-R-V", "MAO"->"M-A-O" in b05_q2 spoken text; script file keeps master wording.
BEATS = [
 ("b01_intro", "By now you know our process, our offer, and how to handle objections when sellers push back. But sellers also ask straightforward questions. Not objections, just questions. And how you answer those matters just as much."),
 ("b02_decoder", "The goal here is not to memorize a list of answers. It's to understand what the seller is really asking underneath the words, and to respond with confidence and clarity in your own voice. Every seller question maps back to one of three things. \"Can I trust you?\" \"Am I getting a fair deal?\" \"Is this going to be complicated?\" If your answer addresses whichever one of those is actually driving the question, the specific words you use matter a lot less."),
 ("b03_ten", "Here are the ten questions that come up most often, and how to think about each one."),
 ("b04_q1", "\"How does this work?\" This is someone who wants simplicity. They don't want a ten-minute explanation. They want to know the basic flow. Keep it short. We have a conversation, our team evaluates the property, we put together a cash offer, and if it works for you, we handle the closing. No repairs needed on your end, no commissions, we take care of the paperwork. That's it. If they want more detail, they'll ask."),
 ("b05_q2", "\"How do you come up with the offer?\" They want to know it's not a random number. Tell them you look at what similar houses in their area have actually sold for, you factor in the condition of the property and what repairs would cost, and you come up with a number that works for both sides. Keep it simple. Don't say \"A-R-V\" or \"M-A-O formula\" or any of that. Just say it like a normal person would."),
 ("b06_q3", "\"Is this a scam?\" This comes from a real place. They've probably had bad experiences or at least heard stories. Don't get defensive. Say you understand the caution. Everything goes through a licensed title company. They'll have attorney review available on all the paperwork. You never ask for money upfront. They never pay you anything, ever. And you're happy to share your company information so they can look you up before anything moves forward."),
 ("b07_q4", "\"Why can't you offer more?\" They want to feel like the deal is fair, and right now it doesn't feel fair to them. Explain the trade-off. You're buying the property as-is. You're taking on all the risk, all the repair costs, and all the carrying costs. The reason the price is what it is, is because of what they get in return. Speed. Certainty. No hassle. No commissions. That's the exchange. Some people will get it. Some won't."),
 ("b08_q5", "\"How fast can you close?\" They're trying to figure out if you can actually solve their problem on their timeline. Tell them as fast as a couple of weeks if they need to move quickly, or on whatever timeline works for them. They pick the closing date. We work around it."),
 ("b09_outro", "Alright, that's the first five questions, decoded. Next up: the other five — repairs, fees, what happens after they sign, and what to say when a seller asks, \"What if I change my mind?\" I'll see you there."),
]

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = f"{OUT}/_state.json"
state = json.load(open(sp)) if os.path.exists(sp) else {}
def save(): json.dump(state, open(sp, "w"), indent=1)

for tag, text in BEATS:
    st = state.setdefault(tag, {})
    if st.get("wav"): continue
    try:
        d = api("POST","/v3/voices/speech",{"text":text,"voice_id":FRIENDLY,"speed":1.0})["data"]
        raw = f"{OUT}/{tag}_raw.wav"; wav = f"{OUT}/{tag}.wav"
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"], check=True)
        st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=text)
        print("audio", tag, round(d.get("duration") or 0, 1), flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:200] if hasattr(e,'read') else str(e)
        print("AUDIO FAIL", tag, msg, flush=True)
        if "credit" in msg.lower() or "insufficient" in msg.lower() or "balance" in msg.lower():
            print("9A AUDIO HALT: INSUFFICIENT CREDITS — STOP AND TELL JARRAD", flush=True)
            break
    save(); time.sleep(1.5)
done = sum(1 for s in state.values() if isinstance(s, dict) and s.get("wav"))
print("9A AUDIO DONE:", done, "/", len(BEATS), flush=True)
