import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson3A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED  = "91120f72682e4459a19e311ba2ee4cb2"

# Lesson 3A "BMH Offer Playbook A" — 18 beats. VERBATIM from locked master
# _master-transcripts.md Slot 05 (Chapter 3 - FINAL.srt), cues 1-19 (18 & 19 merged into b18).
# (tag, text, voice_id). All FRIENDLY: the close is a calm study tip + tease, not a mission send-off.
BEATS = [
 ("b01_intro", "Now that you know who our sellers are, let's talk about what we actually offer them. We will begin by talking about how our solutions help our sellers and then we'll move on to discuss our offer playbook. Because when you're on the phone, you need to be able to explain what the BMH Group does in plain English. The kind of language where a homeowner who's never heard of us can understand it in about 30 seconds.", FRIENDLY),
 ("b02_offer-core", "We buy houses for cash, as-is. No repairs. No agents. No commissions. No waiting around for months. That's the whole offer. But each piece of that matters, so let me walk through them.", FRIENDLY),
 ("b03_cash", "When I say we buy with cash, I mean we don't go through a bank. There's no loan approval process, no appraisal contingency, no waiting 45 days for underwriting to come back. When we say we can close, we mean it. That gives sellers something they can't get from most buyers, which is certainty. They know the deal isn't going to fall apart two weeks before closing because someone's financing didn't come through.", FRIENDLY),
 ("b04_asis", "As-is. The seller doesn't need to fix a single thing. Roof leaking? That's fine. Foundation cracking? We'll handle it. Hoarding situation with stuff piled to the ceiling? We've walked into plenty of those. For sellers who can't afford repairs, or who just don't have the energy to manage a renovation they never wanted in the first place, this is a big deal. They can walk away from the property exactly as it sits.", FRIENDLY),
 ("b05_commissions", "In a traditional sale, the seller is paying 5 to 6 percent in real estate commissions. On a $200,000 house, that's $10,000 to $12,000 gone before they see a dime. With us, there are no commissions. The number we offer is the number they walk away with.", FRIENDLY),
 ("b06_speed", "A traditional sale takes 60 to 90 days minimum, and that's if everything goes smoothly. It often doesn't. We can close in as little as a week or two. For someone facing foreclosure, going through a divorce, or relocating for work on short notice, that speed changes everything.", FRIENDLY),
 ("b07_step1", "When you're explaining our process to a seller, keep it simple. There are four steps. First, we talk. You have a conversation with the homeowner. You learn about their situation, their property, what they need. That's where the relationship starts.", FRIENDLY),
 ("b08_step2", "Second, we look at the property. Our team evaluates it. Sometimes that's virtual, sometimes in person. We look at the condition, the location, what comparable houses have sold for, and what repairs would cost.", FRIENDLY),
 ("b09_step3", "Third, we make an offer. Based on that evaluation, we present a fair cash offer. No pressure, no obligation. If it works for them, we move forward. If it doesn't, no hard feelings. We're not going to chase anyone who doesn't want to do business.", FRIENDLY),
 ("b10_step4", "Fourth, we close. Once the seller accepts, we handle everything from there. Title work, closing logistics, all of it. The seller picks their closing date, signs the paperwork, and gets paid.", FRIENDLY),
 ("b11_foursteps", "Four steps. That's it. When you can walk a seller through that on the phone calmly and clearly, you sound like someone who knows what they're doing. Because you do.", FRIENDLY),
 ("b12_honest", "Now, I want to be honest about something. Sellers don't choose us because we pay the highest price. We don't. Our offers are below retail. That's how this business works. We buy at a discount because we're taking on the risk, the repairs, and the costs of holding and reselling the property.", FRIENDLY),
 ("b13_whychoose", "So why do sellers choose us? Because of what they get in return. Speed. They close in days, not months. Simplicity. No showings, no open houses, no staging, no agents going back and forth. Certainty. Cash means the deal doesn't fall through because a buyer's loan got denied. And convenience. We handle everything. They just sign and walk away.", FRIENDLY),
 ("b14_tradeoff", "For a seller who inherited a house 500 miles away that they haven't been inside in two years, or someone who's three months behind on payments with a foreclosure notice on their kitchen table, or someone staring at a $50,000 repair bill they'll never be able to pay, that trade-off makes sense. They're not giving up money. They're buying speed and peace of mind. You don't need to convince anyone that our price is the best price. That's not the job. The job is helping them see that the total package, speed, certainty, no hassle, is the best solution for their specific situation. Some people will get that immediately. Some will need time. Some will never come around. All of that is fine.", FRIENDLY),
 ("b15_dealmath", "You should also understand the basics of how our offers get calculated, even though you're not the one making them. We look at three numbers. The after repair value, which is what the property would sell for on the open market if it were fully fixed up. The repair costs, which is what it would take to get it to that condition. And our offer, which is the after repair value minus the repairs, minus our margin for profit and carrying costs. That's how we get to a number.", FRIENDLY),
 ("b16_example", "Here's an example. A house has an after repair value of $200,000. It needs $50,000 in work. After accounting for our costs, we might offer somewhere around $100,000 to $110,000. Is that less than $200,000? Obviously. But the seller was never going to get $200,000. Not without putting in $50,000 in repairs, paying $12,000 in commissions, and waiting four months for a buyer. When you actually do the math, our offer isn't as far off as it sounds on the surface.", FRIENDLY),
 ("b17_answer", "Last thing. When a seller asks you \"how does this work?\" on the phone, here's how you answer it. In your own words, something like: \"We buy houses directly from homeowners for cash. You don't need to make any repairs, you don't pay any commissions or fees, and we can close on whatever timeline works for you. We take a look at the property, put together a fair offer, and if it works for you, we handle everything from there.\" Practice saying that until it flows naturally. Remember, it shouldn't sound memorized or robotic.", FRIENDLY),
 ("b18_outro", "The best way to truly internalize a script is to write it out by hand. That's right, grab a pen and paper! Writing engages your brain in a different way and helps reinforce the words. Plus, it makes the delivery feel more authentic and personal. So, take a moment, jot it down, and watch how much easier it becomes to express those thoughts with confidence and ease! Remember this when you are struggling handling an objection. Alright — quick deep-dive next, to lock the full Offer Playbook in.", FRIENDLY),
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

for tag, text, voice in BEATS:
    st = state.setdefault(tag, {})
    if st.get("wav"): continue
    try:
        d = api("POST","/v3/voices/speech",{"text":text,"voice_id":voice,"speed":1.0})["data"]
        raw = f"{OUT}/{tag}_raw.wav"; wav = f"{OUT}/{tag}.wav"
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"], check=True)
        st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=text, voice=voice)
        print("audio", tag, round(d.get("duration") or 0, 1), flush=True)
    except Exception as e:
        print("AUDIO FAIL", tag, getattr(e,'read',lambda:b'')().decode()[:200] if hasattr(e,'read') else e, flush=True)
    save(); time.sleep(1.5)
done = sum(1 for s in state.values() if s.get("wav"))
print("3A AUDIO DONE:", done, "/", len(BEATS), flush=True)
