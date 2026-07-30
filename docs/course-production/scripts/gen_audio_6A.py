import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson6A"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
EXCITED  = "91120f72682e4459a19e311ba2ee4cb2"
BEATS = []
BEATS.append(("b01_intro", "In the last module, you learned how to open a call and run the basic fact find. Now we're going a level deeper, into discovery. So stick with me here, because this is where the real skill shows up.", FRIENDLY))
BEATS.append(("b02_qualify", "Let me draw a clear line between qualification and discovery, because they are not the same thing. Qualification is basically asking, can we do business with this person? Do they own the property? Is it residential? Is it in our market? Is there some reason they want to sell? Those are the basics, and you covered a lot of that in the fact find.", FRIENDLY))
BEATS.append(("b03_discovery", "Discovery is a completely different question. Discovery is asking, why should we do business with this person right now? What's really going on underneath the surface? What's the actual pain? What happens if nothing changes in their situation? How urgent is this? Qualification confirms the basics. Discovery uncovers the real motivation. Both matter, but discovery is where deals are actually made. You can qualify someone all day long, but if you don't understand what's really driving them, you're just collecting data.", FRIENDLY))
BEATS.append(("b04_motivation", "So you've already established rapport, you've asked the qualification questions, you've confirmed the basics. Now you go deeper. And the first place to go is the real motivation. Here's the thing about sellers. Most of them won't tell you the real reason they're selling on the first answer. They just won't. They'll give you the surface-level version. I just want to see what it's worth. Or, I'm thinking about downsizing. That's the polished answer. The real story is usually something messier and more human than that.", FRIENDLY))
BEATS.append(("b05_askwhy", "Your job is to go underneath. And the way you do it is by asking why in different ways, without sounding like a five-year-old. You might say, you mentioned you're thinking about selling, what's driving that? Or, how long has this been on your mind? Or, what changed that made you start thinking about it now? Or, what would it mean for you to have this handled? Each one of those follow-up questions peels back another layer. Don't accept the first answer. Keep digging, gently but persistently. People want to tell you what's going on. They just need to feel safe enough to do it.", FRIENDLY))
BEATS.append(("b06_financial", "The next area to explore is financial burden, and this is a big one. Financial pressure is one of the strongest motivators out there. But people are often embarrassed about it, so you have to create safety around the topic. You might ask something like, is the property costing you anything to hold onto right now, like mortgage, taxes, insurance, maintenance? Or, are there any payments you've fallen behind on? Or, if you don't mind me asking, do you have a rough idea of what's owed on the property? If they reveal financial strain, if they're behind on payments, if there are tax liens, if there's a foreclosure looming, that is critical information for the acquisition team. That changes the entire picture.", FRIENDLY))
BEATS.append(("b07_whatif", "There's one more question, and it's so important I want to call it out on its own. The what if question. What happens if you don't sell? What does that look like six months from now? This question forces them to confront the consequences of doing nothing. And their answer tells you everything you need to know about urgency. If they say something like, I'd just keep renting it out, no big deal, that's low motivation. They're not in pain. But if they say, I'll probably lose it to the bank, or, I honestly can't keep dealing with this anymore, that's high motivation. That's someone who needs to move.", FRIENDLY))
BEATS.append(("b08_decision", "And before you hand this lead off, you absolutely need to know who actually makes the call. Ask them, is there anyone else involved in making this decision? A spouse, a sibling, an attorney? And, if we were to present an offer, who would need to sign off on it? And, what would that conversation look like on their end? You need these answers, because nothing kills a deal faster than spending weeks working with someone who can't actually say yes. If there's a spouse who needs to be on board, you need to know that now, not after the acquisition team has spent hours putting an offer together.", FRIENDLY))
BEATS.append(("b09_outro", "So that's discovery. You've gone past the basics and found what's really driving this seller: the real motivation, the money pressure, the urgency, and who actually signs. But knowing the story isn't enough. Next, we'll talk about one of the most critical moments in the entire pipeline: handing this lead to the acquisition team without dropping any of it. Because bad handoffs kill deals that should have closed. I'll see you there.", EXCITED))

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
print("6A AUDIO DONE:", done, "/", len(BEATS), "total", round(tot,1),"s", flush=True)
