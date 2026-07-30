import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson3B"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Lesson 3B "BMH Offer Playbook B" — 8 beats, VERBATIM from locked master
# _master-transcripts.md Slot 05-B (Chapter 3A.srt, lines 1099-1175).
# b01 is the ONLY deviation: intro TRIMMED (drops process/pricing/objections = 3A's material; "we are"->"we're").
# b06 (seller monologue) is generated SEPARATELY with a MAN's voice (not here) — see gen_avatar_clips_3B.py.
BEATS = [
 ("b01_intro", "Welcome back! In this lesson we're conducting a deep-dive into the BMH Group Offer Playbook. This five-minute session will equip you with everything you need to know about our core service. We'll cover our offer, who it's for, the problems we solve, and the transformation we deliver. Let's get started.", FRIENDLY),
 ("b02_offer-recap", "First, let's define exactly what we sell. Our core product is the 'As-Is Cash Home Purchase.' It's a specialized real estate solution. In one sentence: We buy residential properties as-is and close quickly so sellers can exit without repairs, commissions, or long listing timelines.", FRIENDLY),
 ("b03_ideal-seller", "Understanding who this is for is critical for your outreach. We look for a very specific type of seller — our Ideal Seller Profile. As we went over in previous modules, our Ideal Seller is a motivated homeowner or landlord with a distressed property who needs to sell quickly and avoid the traditional process. They must want to sell within thirty days and have the legal authority to sell the property themselves. They should not be actively listed with a realtor and must be motivated to trade a higher price for speed and convenience. Lastly, the property itself usually has condition, financial, or management problems that make a traditional sale difficult.", FRIENDLY),
 ("b04_not-a-fit", "Who is NOT a fit? Anyone already listed with a realtor, or sellers with unrealistic price expectations that don't match the property's condition. Also, if they cannot legally sell, or if the environmental hazards exceed our repair budget, they are not a fit for our program.", FRIENDLY),
 ("b05_core-problems", "Now, let's look at the core problems these sellers face. Empathy is key here — understanding their stress helps you communicate our value. The most common problem is a property requiring repairs the owner simply cannot afford. It becomes a physical and financial burden. Many sellers need cash quickly and cannot wait the months it typically takes for a traditional, financed sale to close.", FRIENDLY),
 ("b07_transformation", "When we solve these problems, what is the outcome for the seller? This is the 'transformation' we provide. The seller gets to walk away from a property sold exactly as-is. No repairs, no cleaning, and absolutely no upgrades required. There are no realtor commissions to pay, and no stressful listing process with constant showings to manage. The result is a fast, predictable closing timeline where the seller walks away with cash in hand and no property burden left behind.", FRIENDLY),
 ("b08_outro", "You now have the full Offer Playbook. Use this knowledge to build trust and provide real solutions to the sellers you speak with. That's the playbook. Next, we'll see how deals actually move through our system — from first contact to signed contract.", FRIENDLY),
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
print("3B AUDIO DONE:", done, "/", len(BEATS), flush=True)
