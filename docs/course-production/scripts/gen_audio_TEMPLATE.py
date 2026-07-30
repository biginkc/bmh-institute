import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lessonB"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

BEATS = [
 ("b01_intro", "Hey, Andrea again. Needed some time away from the office. Whew! So are you feeling more confident? You should be! You're doing a great job. In this module we'll talk about some of the responses in the script and the mindset attached to those responses."),
 ("b02_guide", "Before you dial a single number, it's crucial to have the right mindset locked in. Your job is not to be the buyer. Your job is to be the guide."),
 ("b03_clarity", "When you stop trying to win the property and start focusing on winning clarity for the seller, the whole dynamic shifts. You are not here to pitch. You are here to diagnose."),
 ("b04_doctor", "Think of it like walking into a doctor's office. The doctor does not start by measuring the cabinets or asking the age of the water heater. They start with, \"What seems to be the problem today?\" That is how you need to open every conversation. Lead with their problem, not the property specs. That is how you earn trust and get to real motivation fast."),
 ("b05_board", "There are ten principles that will shape how you think and how you sound on every call."),
 ("b06a_p1", "First, service over self. You assume you will help this person even if you are not the solution."),
 ("b06b_story1", "Picture a seller who inherited a house two states away. She is not looking for the highest price. She is looking for someone who will make it simple. The moment you stop chasing the deal and start solving her problem, she stops guarding and starts talking. That attitude disarms defenses and unlocks creativity in ways that pressure never will."),
 ("b07a_p2", "Second, alignment. Get on their side of the table. See the world through their lens."),
 ("b07b_story2", "A landlord who has been dealing with the same problem tenant for two years is not thinking about ARV. He is thinking about getting his life back. When you acknowledge that before you talk numbers, you are usually the first person who actually heard him. That is when conversations turn into deals."),
 ("b08a_p3", "Third, clarity beats pressure. Most sellers are frozen because they cannot picture the goal post. A seller who says \"I just need to think about it\" is usually not stalling. They are scared because the path forward is blurry."),
 ("b08b_story3", "Your job is to help them write the movie by starting at the end. Where are you living after closing? How much cash is in your pocket? When they can see it, they can move toward it, and deals become natural next steps instead of hard closes."),
 ("b09_p4", "Fourth, detach from outcomes and attach to actions. You cannot control what a seller decides. You can control reps, tone, and follow-up cadence. Think about this: most deals in this business come from the third, fourth, or fifth follow-up. The rep who stays consistent and never sounds desperate is the one who wins. If you do not feel needy, you will not sound needy."),
 ("b10_p5", "Fifth, curiosity over cleverness. You do not need to be interesting. You need to be interested. Ask simple direct questions and then shut up. A seller will tell you the real reason they are selling if you give them room. Most people never get that room because the person on the other end keeps filling the silence. Do not be that person. Ask the question and wait."),
 ("b11_p6", "Sixth, equal status. You are not beneath them begging and you are not above them lecturing. Peer to peer energy. If a number does not work, say it plainly and keep rapport intact. Sellers respect directness. What they cannot stand is someone who feels either desperate or dismissive."),
 ("b12_p7", "Seventh, long game wins. You do not overcome people. You outlast confusion. A seller who says no in week one might be ready in week six after they realized the certainty you offered was the real value. Follow up with warmth, bring a new angle each time, and let time mature motivation. Most high price sellers are just early in their decision curve."),
 ("b13_p8", "Eighth, problems are puzzles. Every objection is a missing piece, not a wall. When a seller says \"I need more money,\" that is an invitation to find out what the money is for. Is it to pay off a loan? Cover a move? Once you know what the money actually needs to do, you can often find a way to solve it that has nothing to do with raising your price."),
 ("b14_p9", "Ninth, reps create calm. Confidence comes from thousands of conversations, not hype. Be willing to be bad on call one so you can be great on call one thousand. Make the extra call. That is where your edge builds."),
 ("b15_p10", "Tenth, alignment beats argument. When you see the world through their lens, the conversation stops being a numbers fight. You are not trying to win. You are trying to understand. That distinction is everything."),
 ("b16_recap", "Hold these ten principles before every single dial. They are your operating system. If they are sloppy, every script glitches."),
 # OUTRO PATTERN (Jarrad 2026-07-04): recap hook + one-line tease of the NEXT module.
 # Never reuse "stand up, stretch, and hydrate" — retired after 1C. Pull the tease from the
 # locked master's own outro line (_master-transcripts.md names the next slot) — don't guess it.
 ("b17_outro", "Thank you for engaging with this module. I encourage you to revisit it frequently for a recap of these ten principles. Next up, <NEXT-MODULE TEASE — one line on what's coming>. I'll see you there."),
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
print("1B AUDIO DONE:", done, "/", len(BEATS), flush=True)
