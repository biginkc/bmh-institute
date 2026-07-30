import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson4A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED  = "91120f72682e4459a19e311ba2ee4cb2"
BEATS = []
BEATS.append(("b01_intro", "Okay so in the last few modules, you got the lay of the land. You know who we are, you know who our sellers are, and you know what we actually offer them. Now let's talk about how deals move through our system. Like, from the very first time a lead pops into our CRM all the way through to a signed contract. Because there is a system. And you need to know it cold.", FRIENDLY))
BEATS.append(("b02_overview", "This is the BMH Sales Pipeline. It has six stages. Every single lead in our CRM lives in one of these stages at all times. Your entire job boils down to moving them forward through these stages, or disqualifying them and moving on. Nothing just sits there collecting dust. If a lead isn't moving, something's wrong. So let me take you through each one.", FRIENDLY))
BEATS.append(("b03a_capture", "Stage one is Lead Capture. This is ground zero. A lead enters our system from somewhere. Maybe it came from marketing, maybe a cold caller got them on the phone, maybe they called us, maybe they texted back to a campaign, maybe someone referred them. At this point all we really have is the basics. A name, a phone number, a property address, and whatever scraps of info the source captured. Nobody has had a real conversation with this person yet.", FRIENDLY))
BEATS.append(("b03b_firstcontact", "They're just a name sitting in the CRM waiting for somebody to reach out. And that somebody is you. Your job here is simple. Make first contact. Call them, text them, email them, whatever it takes to start a conversation. If you can't reach them, they stay in Stage one with a follow-up task assigned. You don't move them forward until you've actually had a live conversation with the seller. That's the exit. A real, live, two-way conversation.", FRIENDLY))
BEATS.append(("b04_qualify", "Stage two is Qualification. So you've made contact. Cool. Now you need to figure out if this is someone we can actually help. This is where you ask the initial qualifying questions. Is this person the decision maker? Do they actually want to sell, or were they just curious? Is the property in one of our markets? Is there enough equity for a deal to even make sense? Are there any obvious red flags that would kill this before it starts? Your job at this stage is to run through that qualification checklist. Confirm the basics. Ownership, property type, location, general motivation, rough timeline. You move them out of Stage two once the seller passes initial qualification. They're the owner, the property fits what we buy, and there's at least some motivation there.", FRIENDLY))
BEATS.append(("b05a_discovery", "Stage three is Discovery. And honestly, this is where the real magic happens. You've confirmed the basics, great. Now you dig deeper. What's actually going on in this person's life? What's driving them to sell? What happens if they don't sell? What's their real timeline, not the polite answer but the honest one? What have they already tried? This is the heart of what you do. Discovery is where you build trust, where you uncover the real motivation hiding underneath the surface-level answers, and where you gather all the detailed information our acquisition team is going to need to put together an offer. Your job here is to have a deep, genuine conversation. Understand their situation fully. Fill in every detail in the CRM.", FRIENDLY))
BEATS.append(("b05b_discovery_exit", "Condition, motivation, timeline, expectations, financial situation, who's involved in the decision. You're done with Stage three when you can clearly explain to someone else why this person wants to sell, what their timeline looks like, and what they'd need to see to move forward.", FRIENDLY))
BEATS.append(("b06a_handoff", "Stage four is Handoff. The seller is qualified. They're motivated. You've done your part. Now it's time to pass this lead over to the acquisition team so they can evaluate the property and present an offer. And I want to be really clear about this. The handoff is a critical moment. A sloppy handoff kills deals. I've seen it happen more times than I can count.", FRIENDLY))
BEATS.append(("b06b_handoff_clean", "You need to package everything you've learned, the seller's story, what's motivating them, what they're expecting, all the property details, and pass it cleanly to the acquisition manager. Complete the handoff checklist. Brief the acquisition manager on the seller's situation, their hot buttons, what to be careful about. Then either warm-transfer the seller while they're still on the phone with you, or set a specific appointment for the acquisitions call. You're done with Stage four when the acquisition team has accepted the lead and has everything they need to take it from here.", FRIENDLY))
BEATS.append(("b07_offer", "Stage five is Offer Review. The acquisition team presents the offer. The seller reviews it. There might be some negotiation, counter-offers, questions back and forth. This stage is primarily run by the acquisition team, but you might get pulled in. If the acquisition manager needs you to call the seller or provide additional context about something that came up in your conversations, you jump in and help.", FRIENDLY))
BEATS.append(("b08_contract", "Stage six is Contract. The seller accepts the offer. Contract gets signed. The deal moves to the transaction team for closing. At this point, your work on this particular lead is basically done. You might send a congratulatory text or help tie up a loose end, but the transaction team handles the rest. And the relationship you built through all those earlier stages? That's what made it all possible.", FRIENDLY))
BEATS.append(("b09_ownership", "So let me be really clear about where you live in all of this. You own Stages one through four. That's your world. Stage one, you make first contact. Stage two, you qualify. Stage three, you discover. Stage four, you hand off. Stages five and six are handled by the acquisition and transaction teams. You support when they ask, but your primary focus is getting leads from Stage one all the way to Stage four, as many as possible, and as thoroughly as possible.", FRIENDLY))
BEATS.append(("b10_outro", "And that's the pipeline. Six stages, and you own the first four. But here's the thing. Inside every one of these stages, there's a conversation happening. And every conversation you have follows a five-step framework. That's what we'll break down next. I'll see you there.", EXCITED))

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
print("4A AUDIO DONE:", done, "/", len(BEATS), "total", round(tot,1),"s", flush=True)
