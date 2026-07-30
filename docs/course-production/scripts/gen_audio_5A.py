import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson5A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

# Lesson 5A "Opening the Call" — Slot 07 cues 1-10 (+ split rewrites b01/b12/b13). Source: lesson-5A-script-clean.txt
BEATS = [
 ("b01_intro", "Alright, this is where it gets real. Everything up to now has been context and background. This module is about what actually comes out of your mouth when you pick up the phone and dial. In this lesson we're covering Step 1 of the five-step framework: how to open the call. It's short, but it sets the tone for the entire conversation, so pay attention here."),
 ("b02_15sec", "The intro is quick, simple, and to the point, let me demonstrate. You've got about fifteen seconds to set the tone for the entire conversation. Fifteen seconds. That's it. Here's what a solid opening sounds like."),
 ("b03_demo", "Hi Jim, this is Andrea with the BMH Group. How are you doing today? Great. Sounds like you've got a pre-qualification for an offer and I'd like to finalize some details. When we purchase properties, we buy them as-is, we cover all closing costs, and there are no commissions involved. So by the end of this call, I'll be able to do one of two things for you. I can either give you an approval with an offer, or a denial with a reason. Did I catch you at a good time?"),
 ("b04_prequalified", "That's it. That's the whole thing. But every piece of that is doing something specific, so let me break it down. When you say pre-qualified, that frames the call as a qualification, not a sales pitch. The seller doesn't feel like they're being sold to. They feel like they're being evaluated. It completely flips the dynamic. Suddenly they're wondering if they qualify instead of wondering how to get you off the phone."),
 ("b05_intrigue", "When you say approval with an offer or denial with a reason, that creates intrigue. Now they're thinking, wait, am I going to qualify? Instead of, oh great, another person trying to buy my house. It shifts their whole mental frame."),
 ("b06_goodtime", "And when you ask, did I catch you at a good time? You're handling the first objection, which is always time, right upfront. If they say no, you schedule a callback. No big deal. If they say yes, you've just gotten permission to continue. That's huge."),
 ("b07_penpaper", "Now, right after the intro, I want you to say this. Perfect. What I want you to do is grab a pen and paper because there's going to be some information you'll want to jot down as we go through this. Then give them your name, spell your last name out for them. Give them the company name. And at the end of the call, give them your phone number and ask them to repeat it back to you."),
 ("b08_control", "Why does this matter so much? Think about it. You're taking control of the conversation. Whatever this person was doing before you called, watching TV, making lunch, scrolling through their phone, you've now redirected their entire attention to you. They're getting up, finding a pen, sitting down, writing things down. That's engagement."),
 ("b09_compliance", "It's also a compliance test, and I mean that in the best way. If they'll do what you ask, grab a pen, write things down, repeat your number back, you know they're actually engaged. They're present. If they can't repeat your phone number back to you, they weren't really writing it down, and you don't have real engagement yet. Good to know."),
 ("b10_trust", "And you're also building trust early. You're giving them your real information. Your real name, your real number. You're saying, here's who I am, here's how to reach me. That's different from the other callers who just wanted a quick number and then hung up. You're a real person, and you're proving it."),
 ("b11_landline", "One quick thing to ask early on. Are you speaking on a landline or a cell phone? Simple question. But it determines your entire follow-up strategy. Cell phone means you can text them. Landline means you've got to call them at home. That one little detail changes how you stay in touch going forward."),
 ("b12_8020", "One last mindset before you go deeper. When you move into the conversation itself, assume they're motivated until proven otherwise. Don't start the call trying to figure out if this person is worth your time, flip it. Assume this is a deal, and your job is to find out what's driving them. And here's the ratio that matters: you should be listening eighty percent of the time, talking twenty. It's a conversation, not an interrogation."),
 ("b13_outro", "That's your opening. Fifteen seconds to flip the dynamic, take control, and build trust before you ever talk about the house. Next up is Step 2: the fact find, where that eighty percent of listening actually happens. I'll see you there."),
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
print("5A AUDIO DONE:", done, "/", len(BEATS), flush=True)
