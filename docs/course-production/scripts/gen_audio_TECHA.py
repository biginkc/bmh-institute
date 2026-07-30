import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lessonTECHA"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

BEATS = [
 ('b01_open', "Now let's talk tech. These are the tools you'll use daily. Before you start making calls or sending messages to homeowners, I want to walk you through the tools we use every single day."),
 ('b02_why', 'Understanding our tech stack is not optional. These tools are how we stay organized, how we track deals, how we communicate as a team, and how we grow. If you use them the right way they will make your job a lot easier. If you skip steps or try to work around them things will fall through the cracks and deals will get lost. So let me walk you through each one and tell you exactly what it does and why it matters here at the BMH Group.'),
 ('b03_sandra', 'The first tool is Sandra. This is our CRM and it is the center of everything we do at the BMH Group. Every lead we generate, every homeowner we talk to, every deal we are working lives inside Sandra.'),
 ('b04_sandra_wf', 'When you get a new lead it goes into Sandra. When you have a conversation with a homeowner you log notes in Sandra. When a deal moves from one stage to the next you update it in Sandra. Think of it as the single source of truth for our entire operation. If it is not in Sandra it does not exist. That is the standard we hold ourselves to here.'),
 ('b05_sandra_nn', "There's more to Sandra than we'll cover today — when you start working with real leads, the team will walk you through the parts that matter for your role. For now, just understand: this tool is non-negotiable."),
 ('b06_propstream', 'Next is PropStream. This is how we find motivated sellers. PropStream gives us access to property data across the country. We use it to pull lists of distressed homeowners. That includes people who are behind on taxes, people going through probate. Properties with code violations, absentee owners and more. When your manager gives you a list, it came from PropStream. It is also how we look up property details to understand what a house might be worth and what kind of situation the owner is likely in. If Sandra is where we manage our relationships then PropStream is where we find them in the first place.'),
 ('b07_dealmachine', 'DealMachine is another tool we use to source leads. Where PropStream is from your desk, DealMachine is built around driving for dollars. That means going through neighborhoods and flagging properties that look vacant, neglected or distressed. DealMachine lets you tag those properties, pull owner information and drop them directly into a marketing campaign. For our team this tool is part of how we keep a steady pipeline of leads coming in. You need to know how it fits into our process.'),
 ('b08_dealsniper', 'Deal Sniper is a tool we use to generate offers quickly and reliably. Speed is important. The more offers you send the greater your chances of transacting a deal. It helps us filter and evaluate properties. So we can move fast when a good deal shows up. In this business speed matters. When a homeowner is motivated they need to move quickly. We need to be ready to make an offer without wasting their time or ours. Deal Sniper helps us make confident decisions fast.'),
 ('b09_dialpad', "Now let's talk about DialPad. This is our phone system. All outbound calls to homeowners go through DialPad. It records calls, logs your activity and keeps everything organized. Your calls are being recorded."),
 ('b10_coaching', 'That is not there to watch over your shoulder. It is there so we can coach you and help you get better. When your manager listens to your calls and gives you feedback that feedback is coming from real conversations you had. DialPad is also how we track your call volume. How many calls you made and how long you were on the phone are all visible. Show up and make your dials.'),
 ('b11_closerlab', 'Closer Lab is an AI speech coaching tool. We use it specifically for training and role play. Before you ever get on the phone with a real homeowner you are going to practice in Closer Lab with an AI roleplay agent. It listens to how you speak. It gives you feedback on things like filler words, pacing, clarity, and confidence. It lets you practice without the pressure of a live call. You are going to use Closer Lab to work through objection role plays and call simulations. Take it seriously. Put in the reps.'),
 ('b12_tasks', 'Tasks live in Sandra too. If your manager assigns you something, it will be in Sandra. If there is a follow-up that needs to happen, it gets logged in Sandra. If there is a process or a checklist to work through, you will find it there as well. We use those task lists to make sure nothing gets dropped. In this business organization is everything. Check your task list every day. Complete your tasks on time. If something is blocked or you need help, flag it to your manager in Slack.'),
 ('b13_hubstaff', 'HubStaff is our time tracking tool. When you are working you are clocked into HubStaff. It tracks your hours and activity. It helps us make sure you are getting paid accurately for the hours you put in. Clock in when you start. Clock out when you stop. It matters.'),
 ('b14_slack', 'Slack is how we communicate as a team. Email is not how we operate. If you need to reach your manager, do it in Slack. Keep notifications on. Slack is also where we share wins, updates and team announcements so staying active keeps you connected to the business.'),
 ('b15_institute', 'BMH Institute is our training platform and it is where you are right now. All of your onboarding training lives here. Work through the modules in order. Each lesson builds on the one before it and there are quizzes to make sure the material is sticking. Your progress is tracked for your manager.'),
 ('b16_drive', "Finally we use Google Docs for documentation. SOPs, scripts, templates, and reference materials all live here. Get comfortable in Google Drive. We share documents as you move through onboarding. Bookmark the documents that are most relevant to your daily work. Please ask your team lead how to locate specific SOPs or Standard Operating Procedures for the applications and tools we've discussed."),
 ('b17_recap', "We covered a lot. These are the most important tools used in the BMH Group tech stack. They work together to help us find deals, manage leads, and communicate as a team. We invested in them because when we use them the right way we close more deals and serve homeowners better. Take notes, ask questions, and let's get to work — up next, we'll talk about the people behind those leads."),
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
print("TECHA AUDIO DONE:", done, "/", len(BEATS), flush=True)
