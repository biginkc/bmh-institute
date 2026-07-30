import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson2A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED  = "91120f72682e4459a19e311ba2ee4cb2"

# Lesson 2A "Who Sells to Us" — 9 beats. (tag, text, voice_id)
BEATS = [
 ("b01_intro", "Hey — Andrea here. Before you ever pick up the phone or send a text, you need to know who we're actually talking to. Because when you understand our seller, everything else — the script, the offer, the follow-up — gets a whole lot easier.", FRIENDLY),
 ("b02_grid", "Here's the first thing to burn into your brain. Our sellers are not selling a house. They're solving a problem. The house is just the thing standing between them and wherever they're trying to get to.", FRIENDLY),
 ("b03_profile", "So who's our ideal seller? Usually someone who owns the place free and clear, or close to it. The property has become a burden — maybe it's dated, maybe it's vacant, maybe it needs more than they can put into it. And the big one: they have a reason to move now, not someday.", FRIENDLY),
 ("b04_situations", "These situations show up over and over. They inherited a house they don't want. A tired landlord who's done with tenants. A divorce that needs a clean split. A job relocating them out of state. Falling behind on payments. Or repairs they just can't afford. Different stories — same feeling: I need this handled.", FRIENDLY),
 ("b05_motivation", "Now here's what trips up new agents. They think it's all about price. It's not. For a motivated seller, speed, certainty, and zero hassle usually beat top dollar. They would rather take a fair cash offer that closes in two weeks than chase a few thousand more over three months of showings and repairs.", FRIENDLY),
 ("b06_vs", "So how do you tell a motivated seller from someone just kicking tires? A motivated seller has a timeline and a real reason — they'll tell you their situation, and they're flexible. The unmotivated one wants full retail, they're in no rush, and they're mostly curious what they could get. One is solving a problem. The other is testing the market.", FRIENDLY),
 ("b07_disqualifiers", "And that brings us to disqualifiers — the signs to politely move on. They want full market value. There's no real reason to sell. The house is already fixed up, with no room in the numbers. Or the price they're chasing just doesn't touch reality. When you see these, don't force it — log it, stay friendly, and spend your energy where there's a real problem to solve.", FRIENDLY),
 ("b08_recap", "Quick recap. Our seller is solving a problem, not selling a house. They're moved by speed and certainty over top dollar. Watch for the real situations — inherited, tired landlord, divorce, relocation, behind on payments. And when the motivation isn't there, walk.", FRIENDLY),
 ("b09_outro", "That's who sells to us. Next up, we go deeper on the ideal seller profile itself — the exact filters and phrases to listen for. I'll see you there.", EXCITED),
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
print("2A AUDIO DONE:", done, "/", len(BEATS), flush=True)
