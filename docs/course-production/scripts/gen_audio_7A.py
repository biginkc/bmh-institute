import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson7A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED  = "91120f72682e4459a19e311ba2ee4cb2"
# Lesson 7A "Objection Architecture" — master Slot 09 cues 1-11 + 17 + 18 (verbatim). All Elizabeth-Friendly.
BEATS = []
BEATS.append(("b01_intro", "This module might genuinely change how you perform in this role. Because here's the thing, the difference between someone who's average on the phone and someone who consistently moves leads forward? It's not the script. It's what happens when the seller pushes back.", FRIENDLY))
BEATS.append(("b02_goodsign", "Objections are not the enemy. They're actually a good sign. Think about it. If a seller truly had zero interest in selling, they wouldn't bother pushing back on your price. They wouldn't say \"I need to think about it.\" They'd just say \"no thanks\" and hang up. When someone objects, they're telling you they're engaged. They have a concern sitting between them and a yes, and your job is to figure out what it is and address it.", FRIENDLY))
BEATS.append(("b03_reframe", "You need to rewire how you hear pushback. An objection is not a rejection. It's a conversation that still has momentum. They haven't hung up. They're still talking to you. There's still something there. So how do you work with that? You hear the concern, you acknowledge it for real, and you guide things forward. Not by being pushy. Not by steamrolling. Just by being genuinely curious about what's actually going on.", FRIENDLY))
BEATS.append(("b04_calltype", "One more thing before we get into them. The objections you hear will depend on the kind of call you're making. On cold outreach, you'll get more of the defensive, who-are-you pushback — \"how did you get my number,\" \"I'm not interested,\" \"stop calling me.\" When a lead has already been vetted and warmed up, the objections shift toward the deal itself — price, timing, needing to talk to a spouse. Depending on your role, you'll live more in one of those worlds than the other. But you need to be ready for all of it, because any objection can show up on any call.", FRIENDLY))
BEATS.append(("b05_fourtypes", "When you're on calls, you're going to hear four types of responses, and they each need a different approach.", FRIENDLY))
BEATS.append(("b06_silence", "The first is silence. You say something and they just go quiet. Most people panic here and start rambling. Don't do that. Silence means they're processing what you said, and that's a good thing. Give them the space. Whoever talks first after a silence usually gives up ground, so just wait.", FRIENDLY))
BEATS.append(("b07_complaints", "The second is complaints. Stuff like \"I'm tired of getting these calls\" or \"you people just want to lowball me.\" This isn't really an objection. It's venting. They're frustrated, probably from getting hammered by other investors. Acknowledge it, show some empathy, and redirect. Something like \"I hear you, and I get that you've probably gotten a lot of calls. I want to make sure this one is actually worth your time. Can I ask you a couple of questions?\"", FRIENDLY))
BEATS.append(("b08_reactionary", "The third type is what I call reactionary defense responses. Things like \"you've got two minutes\" or \"just make me an offer\" or \"I've heard this before.\" These are automatic. It's like when you walk into a store and say \"just looking\" even though you drove there specifically to buy something. Don't take the bait. Don't speed up your process because they told you to hurry. Just acknowledge it and keep moving. \"Totally understand. I'll be respectful of your time. Let me ask you just a couple of quick things so I can see if we can even help.\"", FRIENDLY))
BEATS.append(("b09_realobjections", "And then there are real objections. \"Your price is too low.\" \"I need to talk to my wife.\" \"I want to list with a Realtor first.\" These are genuine concerns, and they deserve a real, thoughtful response. This is where the framework comes in.", FRIENDLY))
BEATS.append(("b10_framework", "For every real objection, you use four steps. First, you listen. And I mean actually listen, not just wait for them to stop talking so you can deliver your rebuttal. Let them finish completely. Second, you acknowledge what they said. Show them you actually heard it. \"I completely understand why you'd feel that way\" or \"that makes total sense.\" Never dismiss what they're saying, and never argue. The moment you argue, you've lost. Third, instead of jumping into a counter-argument, you ask a question. If they say the price is too low, you ask \"what number were you hoping for?\" If they say they need to think about it, you ask \"what specifically are you weighing?\" Questions give you information, and information is how you actually solve problems. Fourth, you redirect. Once you understand the real concern, you guide the conversation toward a solution. \"I hear you, and I want to make sure we find something that works for both of us.\"", FRIENDLY))
BEATS.append(("b11_sequence", "Listen, acknowledge, ask, redirect. That sequence works for everything.", FRIENDLY))
BEATS.append(("b12_doorway", "The one thing you should absolutely never do is treat an objection like a dead end. Every objection is a doorway into a deeper conversation. Your job is not to \"overcome\" objections like it's some kind of battle. It's to understand them. In your written reference materials, you'll find a full objection guide with 28 objections and specific rebuttals for each. Study them, practice them. But more importantly, internalize the framework. Because if you really understand listen, acknowledge, ask, redirect, you can handle any objection, even ones you've never heard before.", FRIENDLY))
BEATS.append(("b13_outro", "Alright — more objection handling up next. Only this time, you're doing the talking.", FRIENDLY))

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
tot = sum(s.get("duration") or 0 for s in state.values())
print("7A AUDIO DONE:", done, "/", len(BEATS), "total", round(tot,1),"s", flush=True)
