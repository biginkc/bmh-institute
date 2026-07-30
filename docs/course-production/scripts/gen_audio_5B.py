import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson5B"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Lesson 5B "The Fact Find" — Slot 07 cues 11-16 + cue 17 outro. Source: shotlists/lesson-5B-script.txt
# (em-dashes softened to commas for clean TTS; wording otherwise verbatim from the cleaned script.)
BEATS = [
 ("b01_intro", "You've opened the call, you've taken control, and you're in the conversation. Now comes Step 2: the fact find. This is where you'll spend the vast majority of the call."),
 ("b02_conversation", "The fact find is not an interrogation. It's a conversation. You're genuinely trying to understand what this person is going through. And you are listening way more than you're talking. You have questions you need to cover, yeah, but don't fire them off like you're reading from a clipboard. Weave them into a natural conversation. It should feel like two people talking, not a survey."),
 ("b03_property", "For property basics, you want to find out what type of property it is, single family, or duplex, or whatever. How many bedrooms and bathrooms. What kind of condition it's in, and I like to ask them to rate it on a scale of one to ten, because it gives you a quick picture. And when the last time any major updates were done."),
 ("b04_ownership", "For ownership and decision-making, you want to confirm they're actually the owner. Find out if there's anyone else on the title or involved in the decision. Ask if there's a mortgage on the property and roughly what's owed."),
 ("b05_motivation", "For motivation and timeline, you want to know what's going on with the property that has them considering selling. How long they've been thinking about it. Whether there's a timeline they're working with."),
 ("b06_power", "And then this question, which is one of the most powerful questions you have. What would happen if you didn't sell? What does that look like? That question forces the seller to articulate the pain of not taking action. And that pain? That's what drives deals. That's what creates urgency. Don't skip it."),
 ("b07_energy", "Let me talk about energy for a second, because this matters more than you probably think. Your energy on the call matters more than your words. If you sound bored, or flat, or robotic, the seller will check out in thirty seconds. Doesn't matter how perfect your script is. Even if it's your hundredth call of the day, every call should sound like it's your first. Fresh energy. Genuine interest. Warmth. Here's a trick that actually works. Smile when you talk on the phone. Literally, physically smile. I know it sounds weird, but people can hear it in your voice. It changes your tone, your pace, everything. Try it right now. Say, Hi, how are you doing today, with a flat face. Now say it with a big smile. You can hear the difference, right? Your sellers can too."),
 ("b08_mistakes", "A few things I see new people mess up consistently. Rushing straight to the property. Don't jump right into, tell me about the house. Build some rapport first. Find out about them as a person before you start talking square footage. Talking too much. You should be listening eighty percent of the time. If you catch yourself going on a monologue, just stop. Ask a question. Reading the script like a robot. The script is a framework, not a teleprompter. Know the beats, know the flow, but deliver it in your own voice. If it sounds rehearsed, they're done. Skipping the pen and paper thing. I know it seems small, but it sets the tone for the entire call. Do it every single time. And giving up after one weak response. If they seem short or guarded at first, that's totally normal. They've probably been called by five different people already today. Be patient, be warm, and give them a reason to keep talking."),
 ("b09_outro", "Alright, next up you're going to get your roleplay. You're going to practice opening a call with a warm inbound lead, someone who's curious but a little guarded. Time to put this stuff to work."),
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
        print("AUDIO FAIL", tag, getattr(e,'read',lambda:b'')().decode()[:150] if hasattr(e,'read') else e, flush=True)
    save(); time.sleep(1.5)
done = sum(1 for s in state.values() if s.get("wav"))
print("5B AUDIO DONE:", done, "/", len(BEATS), flush=True)
