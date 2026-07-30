import json, os, time, urllib.request, subprocess, pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson4A"
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
FIX = {
 "b01_intro": "Okay so in the last few modules, you got the lay of the land. You know who we are, you know who our sellers are, and you know what we actually offer them. Now let's talk about how deals move through our system. Like, from the very first time a leed pops into our CRM all the way through to a signed contract. Because there is a system. And you need to know it cold.",
 "b02_overview": "This is the BMH Sales Pipeline. It has six stages. Every single leed in our CRM lives in one of these stages at all times. Your entire job boils down to moving them forward through these stages, or disqualifying them and moving on. Nothing just sits there collecting dust. If a leed isn't moving, something's wrong. So let me take you through each one.",
 "b03a_capture": "Stage one is Leed Capture. This is ground zero. A leed enters our system from somewhere. Maybe it came from marketing, maybe a cold caller got them on the phone, maybe they called us, maybe they texted back to a campaign, maybe someone referred them. At this point all we really have is the basics. A name, a phone number, a property address, and whatever scraps of info the source captured. Nobody has had a real conversation with this person yet.",
 "b06a_handoff": "Stage four is Handoff. The seller is qualified. They're motivated. You've done your part. Now it's time to pass this leed over to the acquisition team so they can evaluate the property and present an offer. And I want to be really clear about this. The handoff is a critical moment. A sloppy handoff kills deals. I've seen it happen more times than I can count.",
 "b06b_handoff_clean": "You need to package everything you've learned, the seller's story, what's motivating them, what they're expecting, all the property details, and pass it cleanly to the acquisition manager. Complete the handoff checklist. Brief the acquisition manager on the seller's situation, their hot buttons, what to be careful about. Then either warm-transfer the seller while they're still on the phone with you, or set a specific appointment for the acquisitions call. You're done with Stage four when the acquisition team has accepted the leed and has everything they need to take it from here.",
 "b09_ownership": "So let me be really clear about where you live in all of this. You own Stages one through four. That's your world. Stage one, you make first contact. Stage two, you qualify. Stage three, you discover. Stage four, you hand off. Stages five and six are handled by the acquisition and transaction teams. You support when they ask, but your primary focus is getting leeds from Stage one all the way to Stage four, as many as possible, and as thoroughly as possible.",
}
def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())
sp = f"{OUT}/_state.json"; state = json.load(open(sp))
def save(): json.dump(state, open(sp, "w"), indent=1)
for tag, text in FIX.items():
    try:
        d = api("POST","/v3/voices/speech",{"text":text,"voice_id":FRIENDLY,"speed":1.0})["data"]
        raw = f"{OUT}/{tag}_raw.wav"; wav = f"{OUT}/{tag}.wav"
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",wav,"-y"], check=True)
        state[tag].update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=text)
        print("regen", tag, round(d.get("duration") or 0,1), flush=True)
    except Exception as e:
        print("FAIL", tag, getattr(e,'read',lambda:b'')().decode()[:200] if hasattr(e,'read') else e, flush=True)
    save(); time.sleep(1.5)
print("LEADFIX DONE", flush=True)
