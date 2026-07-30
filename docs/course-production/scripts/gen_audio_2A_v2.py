import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson2A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED  = "91120f72682e4459a19e311ba2ee4cb2"

# Lesson 2A "Who Sells to Us" — near-verbatim from master Chapter 2A (Humanizing the Lead A). 21 beats.
BEATS = [
 ("b01_intro", "Before you ever pick up a phone, I need you to understand something. Every lead sitting in our CRM is a real person going through something real. They're not a number. They're not a hot lead or a cold lead. They're a person with a house and a problem.", FRIENDLY),
 ("b02_why", "If you understand what they're going through before you call, you're going to have better conversations, build more trust, and close more deals than someone who just dials and wings it. That's not a guess. That's what we've seen over and over again.", FRIENDLY),
 ("b03_situations", "Not every homeowner is someone we can help. We're looking for a specific type of seller. Someone who has a property they need to sell, and a situation where going the traditional route just doesn't make sense for them. Here are the situations we see most often.", FRIENDLY),
 ("b04_inherited", "Inherited property. Someone passes away and leaves a house to their kids or their relatives. Those relatives often live in a different city. They don't want to manage the property, they don't have money for repairs, and they don't want to fly in and deal with tenants or contractors. They just want it handled. This is one of our biggest lead sources, and these conversations tend to be emotional, so be ready for that.", FRIENDLY),
 ("b05_financial", "Financial pressure. Behind on mortgage payments. Facing pre-foreclosure, or actual foreclosure. Tax liens piling up. They need to sell fast to stop the bleeding. Going the traditional route, listing it, staging it, waiting for a buyer, waiting for financing to clear, that takes months. These sellers don't have months.", FRIENDLY),
 ("b06_landlord", "Tired landlords. They bought a rental property years ago thinking it would be passive income. Now they've got bad tenants who won't pay, maintenance issues every other week, vacancies eating into their savings, and they're just done. They've hit a wall and they want out. You'll hear a lot of sighing on these calls.", FRIENDLY),
 ("b07_condition", "Property condition. The house needs major work. Roof, foundation, mold, fire damage, hoarding situations. It can't be listed on the M L S in its current condition, and the seller can't afford the repairs to get it there. We buy it as-is, which is exactly what they need to hear.", FRIENDLY),
 ("b08_divorce", "Divorce. When couples decide to part ways, selling their home can become a pressing issue. Emotions run high, and the urgency to sell often increases. As the neutral party, your role is to facilitate a smooth sale, make sure both parties feel heard and respected, and help them move forward.", FRIENDLY),
 ("b09_life", "And sometimes, life just happens. A job relocation on short notice. Health issues that mean they can't maintain the property anymore. A death in the family. Downsizing because the house is too much to handle. These situations create urgency and emotional complexity. The seller needs simplicity and speed, and someone who's not going to make it harder.", FRIENDLY),
 ("b10_outofstate", "Out-of-state owners. They own a property in one of our markets, but they live somewhere else entirely. Managing it from a distance is a headache. They might have a property manager eating into whatever rent they're collecting, or the place might be sitting vacant. They want to cash out without having to deal with any of it.", FRIENDLY),
 ("b11_vs", "Now here's the distinction you need to make on every single call. Is this person motivated to sell, or are they just curious?", FRIENDLY),
 ("b12_motivated", "A motivated seller has a reason and a timeline. They don't just want to sell someday when the stars align. They need to sell soon. There's something pushing them. Financial pressure, a deadline, an emotional weight they can't carry anymore.", FRIENDLY),
 ("b13_unmotivated", "An unmotivated seller is just exploring. They'd sell if someone walked up and offered them full retail, but there's no real urgency. No pain. No reason to accept a discounted offer. These people will waste your time if you let them, so you need to learn to tell the difference fast.", FRIENDLY),
 ("b14_notobvious", "The tricky part is that motivation isn't always obvious. Sometimes the seller says, I'm just seeing what you'd offer, and underneath that, they're three months behind on payments and too embarrassed to say it out loud to a stranger on the phone. That's where good questions come in, and we'll get into that in a later section.", FRIENDLY),
 ("b15_phrases", "When you're on a call, listen for phrases like these. They signal real motivation. I inherited this house and I don't know what to do with it. I just need this off my plate. I can't afford to fix it up. I'm behind on payments. My tenants just trashed the place. I'm going through a divorce. I'm moving and I need to sell fast. I've had it listed and it's not selling. I just want to be done with it.", FRIENDLY),
 ("b16_writedown", "When you hear language like that, you're probably talking to someone we can help. Pay attention to it. Write it down in your notes.", FRIENDLY),
 ("b17_disqualifiers", "There are also situations where we can't help, and you need to recognize those too, so you're not spending time on leads that aren't going anywhere. If they've got an active listing agreement with a Realtor, we generally can't work that deal unless they're willing to cancel. If the person on the phone isn't actually the owner, or they can't make the decision to sell because there's a trust involved or multiple family members who all have to agree, you need to figure that out early. If there's no equity, and they owe more than the property is worth with no creative deal structure possible, it's probably not a fit. And if it's a commercial building or vacant land, that's outside what we do.", FRIENDLY),
 ("b18_empathy", "Here's the thing I really want to stick with you from this section. Before you call a seller, think about what it's like to be on the other end. These sellers are getting five, sometimes ten calls a day from people just like you. Every cold caller, every investor, every we buy houses company is hitting the same lists. By the time that seller gets to you, they've already answered the same questions from multiple strangers. They're skeptical. They're tired of the calls. Some of them are borderline hostile because of it.", FRIENDLY),
 ("b19_different", "Your job is to be different from all those other callers. Not by having a slicker pitch or a faster talk track. By actually listening. By taking the time to understand what's going on in their life. By treating them like a human being instead of a transaction.", FRIENDLY),
 ("b20_trust", "The sellers who end up closing with us don't do it because we offered the most money. We usually don't. They close with us because they trust us. And that trust starts right here, with understanding who they are and what they're going through, before you ever say hello.", FRIENDLY),
 ("b21_outro", "You're doing great. Next up, you'll meet a few of these sellers face to face. I'll see you there.", EXCITED),
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
tot = sum(s.get("duration") or 0 for s in state.values())
print("2A v2 AUDIO DONE:", done, "/", len(BEATS), "total", round(tot,1),"s", flush=True)
