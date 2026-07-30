import json, os, time, urllib.request, subprocess, pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson2B"
os.makedirs(OUT, exist_ok=True)
FRIENDLY="55f8c0f546884f9cbdefa113f5e7b682"; EXCITED="91120f72682e4459a19e311ba2ee4cb2"
WILLIAM="31e2fd6e7c924bc9be987ac4cfaac5e8"; AARON="66da5fabd6b944b3a42f35aed9631ad2"
JUDE="3295c84534da424db838ee9a0085f24d"; CHLOE="77a8b81df32f482f851684c5e2ebb0d2"
MARGARET="f0240e6cefd541ac8031eeb9f3b71a82"
SEGS = [
 ("b01","In this lesson we'll get to know our sellers a bit more. Please take notes on the motivations indicated. Okay, let's meet more of the people you will be speaking with on each phone call. As we discussed, these are your neighbors, your friends, your coworkers, real people, real situations that have been weighing on them longer than they should have. Picture this.", FRIENDLY),
 ("b02a_andrea","It is a Tuesday morning in the barbecue capital of the world. That's right, Kansas City. A landlord named David wakes up, and before his feet hit the floor he is already thinking about the property on the east side. The one with the tenant who stopped paying three months ago. The one with the roof that needs twelve thousand dollars he does not have. The one he has been meaning to deal with for two years. He checks his phone. There is an email from the city about an ordinance violation. A text from his insurance company.", FRIENDLY),
 ("b02b_david","Being a landlord seemed like a dream at first. I thought I'd make easy money and build wealth. But now, I realize it's a nightmare. The constant calls about broken pipes, late-night emergencies, and tenants who don't pay rent. I spend more time managing problems than enjoying life. The stress is overwhelming, and the financial burden is heavy. I thought owning property would bring freedom, but it feels like a chain. I wish I had chosen a different path. If only I had known the reality of being a landlord, I might have made a different choice.", WILLIAM),
 ("b02c_andrea","David is not a bad landlord. He is a tired one. And he has been carrying this property like a weight around his neck.", FRIENDLY),
 ("b03a_andrea","Or picture Beth. She is an executor of her mother's estate in Saint Lewis. Her mother passed four months ago and left behind a home full of memories and a mortgage that does not care about grief. Beth lives in another state. She has a job. She has kids. And every month that house sits empty it costs money she does not have.", FRIENDLY),
 ("b03b_beth","I still can't bring myself to walk back through that front door. But every month it sits empty it costs me money I don't have, and I know my mom wouldn't have wanted it to become this weight.", CHLOE),
 ("b03c_andrea","She does not need a realtor. She needs someone to make this simple and get it done.", FRIENDLY),
 ("b04a_andrea","Or picture Ray. A homeowner in Dayton who got a letter from his lender sixty days ago. He has been telling himself he will figure it out. But the clock is moving and the options are getting smaller.", FRIENDLY),
 ("b04b_ray","Wow, what a whirlwind life has thrown at me. Just a few months ago, I was on cloud nine, finally buying my first house. I could see my future unfolding, but now? I lost my job and suddenly, I'm the primary caretaker for my mom. It's like everything flipped overnight. I worked so hard to get here, and now I'm not even sure what's next. Do I find a new job? Do I focus on caring for her? I feel lost, but I know I have to figure it out. Life can change so fast, and I just need to find my way again.", AARON),
 ("b05a_andrea","Then there is Carol. A homeowner in Lake of the Ozarks who did some work on the property a couple of years ago and never got around to paying the contractor in full. Now there is a mechanic's lien sitting on the title.", FRIENDLY),
 ("b05b_carol","I trusted the wrong contractor, and now there's a lien sitting on my title and a fight I can't afford to keep having. I just want to be done with it and move on with my life.", MARGARET),
 ("b05c_andrea","She cannot sell through traditional channels without settling it first. The problem is she does not have the cash to clear it and she is in the middle of a nasty fight with her former contractor. She needs someone who can navigate the complexity and still get her to the closing table.", FRIENDLY),
 ("b06a_andrea","And then there is Marcus. A homeowner in Kansas City who bought his house at the top of the market. He owes more than the property is worth right now.", FRIENDLY),
 ("b06b_marcus","I did everything I was supposed to, bought the house, worked hard, and I still owe more than it's worth. Every way out I look at feels like it costs me my future, and I just need someone to show me one that doesn't.", JUDE),
 ("b06c_andrea","He has thought about listing it but he would still owe money. He has thought about walking away but he knows what that does to his credit and his future. Marcus feels stuck. What he needs is someone who can look at his full situation and help him understand his options clearly.", FRIENDLY),
 ("b07","These are your sellers. They are not looking for the highest price. They have already made peace with that. Take a moment to think about all of the various motivating factors we've discussed. What they are looking for is someone they can trust. Someone who can walk them through a solution that is fast, certain, and simple.", FRIENDLY),
 ("b08","That someone is you. Every call you make is a chance to be the answer to a problem that has been keeping someone up at night. You stop selling and you start providing options. And that is exactly where the best reps at the BMH Group live every single day.", FRIENDLY),
 ("b09","You just met five people. A tired landlord, a grieving daughter, a father out of work, a homeowner stuck in a fight, and a family underwater. Not one of them is chasing the highest price. They are looking for someone they can trust to make it simple. Take a breath, and next, we'll turn everything you just felt into the seller profile you'll use on your calls with real people. Ready when you are.", EXCITED),
]
def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())
sp = OUT+"/_state.json"
state = json.load(open(sp)) if os.path.exists(sp) else {}
def save(): json.dump(state, open(sp,"w"), indent=1)
for tag, text, voice in SEGS:
    st = state.setdefault(tag, {})
    if st.get("wav") and os.path.exists(st["wav"]): continue
    try:
        d = api("POST","/v3/voices/speech",{"text":text,"voice_id":voice,"speed":1.0})["data"]
        raw=OUT+"/"+tag+"_raw.wav"; wav=OUT+"/"+tag+".wav"
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"], check=True)
        st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=text, voice=voice)
        print("OK", tag, round(d.get("duration") or 0,1), flush=True)
    except Exception as e:
        msg=getattr(e,'read',lambda:b'')().decode()[:200] if hasattr(e,'read') else str(e)
        print("FAIL", tag, msg, flush=True)
    save(); time.sleep(1.5)
print("2B AUDIO DONE:", sum(1 for s in state.values() if s.get("wav")), "/", len(SEGS), flush=True)
