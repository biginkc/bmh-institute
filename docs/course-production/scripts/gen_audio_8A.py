import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson8A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Lesson 8A — Complex Objections (Slot 11 cues 1-9 VERBATIM + b10 written bridge).
# Diffed against locked master before generation: cues 1-9 exact match (2026-07-06).
BEATS = [
 ("b01_intro", "Earlier in training you learned the listen, acknowledge, ask, redirect framework and the most common objections. That covers probably 80 percent of what you'll hear. This section covers the other 20 percent, which is the complex, unusual, and sometimes uncomfortable stuff that makes most people on the phone freeze up."),
 ("b02_weight", "These situations are harder because they carry more emotional weight, more legal complexity, or more moving pieces. But the framework is the same. You just need more depth in how you apply it."),
 ("b03_underwater", "When a seller says \"I owe more than it's worth,\" that's an underwater property. The mortgage balance is higher than what the house would sell for. This is more common than you'd think, especially in certain markets and with people who bought at the wrong time or took out second mortgages."),
 ("b04_response", "Your job here is to understand the full financial picture. Ask if they're current on their payments or falling behind. Ask roughly what they owe. Sometimes a short sale structure can work. Sometimes it's genuinely not a fit. Either way, don't make them feel bad about it. Being underwater is stressful and a lot of people are embarrassed to talk about it."),
 ("b05_tenants", "When they say \"I have tenants, can I still sell?\" the answer is yes. We buy properties with tenants all the time. The questions you need answered are whether the tenants are on a lease, whether they're paying rent, and whether they'd be willing to stay or need to move."),
 ("b06_squatters", "If there's a squatter situation, someone living in the property without a lease or permission, that's more complicated. Acknowledge how frustrating that is. Say something like \"that sounds incredibly frustrating, and we've dealt with situations like that before. Let me get the details and see what we can do.\" Don't promise a solution. Just gather information."),
 ("b07_leaseback", "Leaseback requests come up when someone needs the cash from selling but isn't ready to move yet. Maybe they're waiting for a new place to be ready, or they need a few months to get situated. They'll ask \"can I stay in the house after selling?\" And the answer is that it's something we can discuss. A leaseback means they'd stay as a tenant for a defined period after closing. You don't need to negotiate the terms yourself. Just say \"that's something our acquisition team handles on the specifics, but yes, we've done arrangements like that before. Let me get the details of what you'd need.\""),
 ("b08_privacy", "Privacy concerns are more common than you might expect. \"I don't want my neighbors to know I'm selling.\" There's usually something behind that. Financial trouble they don't want people to see. A divorce. Family drama. Whatever it is, the answer is simple. When you sell to us, there's no listing on the MLS, no sign in the yard, no open houses, no strangers walking through. It's a private transaction."),
 ("b09_contract", "Contract fears. \"What if I change my mind after signing?\" People are scared of commitment, especially with something as big as their house. Tell them the contracts have an inspection period built in, that everything gets walked through before they sign, that nothing happens until they're comfortable, and that they'll have time to have an attorney or anyone they trust review everything. You're reducing the perceived risk of saying yes."),
 # WRITTEN BRIDGE outro (master deviation recorded in NEXT-SESSION + scene cards) — teases 8B.
 ("b10_outro", "So that's the situation side. The property, the money, the paperwork. But some of the hardest objections aren't about the property at all. They're about trust. Is this a scam? Are you just going to flip it for a profit? My attorney said don't sign anything. My family doesn't agree. That's the next lesson. I'll see you there."),
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
print("8A AUDIO DONE:", done, "/", len(BEATS), flush=True)
