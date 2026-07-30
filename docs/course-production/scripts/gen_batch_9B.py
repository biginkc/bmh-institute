#!/usr/bin/env python3
"""Lesson 9B batch — smoke test approved by Jarrad 2026-07-09.
Part A: remaining 3 seller ask-clips (q8 Justin, q9 Imelda, q10 Minho) — same recipe as gen_smoke_9B.py.
Part B: all Andrea beat wavs (Elizabeth-Friendly, speed 1.0, word timestamps) — bridge, 5 answers,
close, practice, outro (verbatim lesson-9B-script.txt; em-dashes normalized to commas for TTS).
Park-bench Andrea avatar CLIPS generate in a later step from these wavs.
"""
import json, os, time, urllib.request, subprocess, pathlib

ROOT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
OUT  = ROOT/"course-assets/heygen/lesson9B"
KEY  = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"   # Elizabeth-Friendly (all Andrea narration)

def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

state_p = OUT/"_state.json"; state = json.load(open(state_p))
def save(): json.dump(state, open(state_p,"w"), indent=1)

ANDREA = [
 ("b01_bridge", "Welcome back. In the last lesson, we decoded the first five seller questions. Now we'll finish the set with questions six through ten, then tie the whole thing back to how you sound on a real call."),
 ("a06_answer", "This is huge for a lot of sellers, especially ones who know their house is in rough shape. Tell them no. Zero repairs. We buy properties in any condition, that's the whole point. They can leave the place exactly as it is."),
 ("a07_answer", "They want to know what the real number is. Are you going to hit them with something later? The answer is no. No fees. No commissions. No closing costs on their end. The offer number is what they walk away with at closing. Period."),
 ("a08_answer", "They're nervous about the unknown. What happens between saying yes and actually getting a check? Walk them through it. The transaction team handles everything from there. Title work, any inspections, closing logistics. They'll know what's happening at each step. On closing day, they sign the final paperwork and get their money, usually the same day or the day after."),
 ("a09_answer", "Some sellers need the cash but aren't ready to move immediately. Tell them it's something you can discuss. It's called a leaseback, where they'd stay in the home for a set period after closing, usually for a small monthly amount. The acquisition team works out the specifics. You're just confirming it's possible."),
 ("a10_answer", "They're scared of being locked in. Tell them the contract has an inspection period built in, which gives both sides time to review everything. Nothing is final until both parties are comfortable. And you'd never want them to move forward unless they feel genuinely good about it. Reduce the fear of saying yes."),
 ("b07_close", "The thing that ties all of these together is that you're not performing. You're not delivering lines. You're talking to another person who needs information to make a big decision, and you're giving them that information clearly and honestly. If you can do that while sounding like a real human being and not a recorded message, you'll handle any question that comes your way."),
 ("b08_practice", "Practice saying these answers out loud until they feel natural. Say them to yourself in the car. Say them to your dog. Say them in the mirror if you have to. The point is that when a seller asks one of these questions on a live call, you don't hesitate. You just answer, the way you'd explain it to a friend who asked."),
 ("b09_outro", "All right. Next up: the follow-up game, where most of the money actually gets made."),
]

# ---- Part B first (fast): Andrea wavs ----
for tag, text in ANDREA:
    st = state.setdefault(tag, {})
    if st.get("wav") and os.path.exists(st["wav"]): continue
    try:
        d = api("POST","/v3/voices/speech",{"text":text,"voice_id":FRIENDLY,"speed":1.0})["data"]
        raw = str(OUT/(tag+"_raw.wav")); wav = str(OUT/(tag+".wav"))
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11",
                        "-ar","44100",wav,"-y"], check=True)
        st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=text, voice=FRIENDLY)
        print("TTS OK", tag, round(d.get("duration") or 0,1), flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:200] if hasattr(e,'read') else str(e)
        print("TTS FAIL", tag, msg, flush=True)
    save(); time.sleep(1.5)

# ---- Part A: remaining 3 seller clips ----
rows = json.load(open(OUT/"_seller_map.json"))[2:]
for r in rows:
    st = state.setdefault(r["tag"], {})
    if st.get("wav") and os.path.exists(st["wav"]): continue
    d = api("POST","/v3/voices/speech",{"text":r["text"],"voice_id":r["voice_id"],"speed":1.0})["data"]
    raw = str(OUT/(r["tag"]+"_raw.wav")); wav = str(OUT/(r["tag"]+".wav"))
    urllib.request.urlretrieve(d["audio_url"], raw)
    subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=2.5",
                    "-ar","44100",wav,"-y"], check=True)
    st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=r["text"], voice=r["voice_id"])
    save(); print("TTS OK", r["tag"], flush=True); time.sleep(1.5)

vids={}
for r in rows:
    st = state[r["tag"]]
    if st.get("mp4") and os.path.exists(st["mp4"]): continue
    out = subprocess.check_output(["curl","-s","-X","POST","https://api.heygen.com/v3/assets",
        "-H","x-api-key: "+KEY,"-F","file=@"+st["wav"]])
    asset = json.loads(out)["data"]["asset_id"]
    body = {"video_inputs":[{"character":{"type":"avatar","avatar_id":r["avatar_id"],"avatar_style":"normal"},
        "voice":{"type":"audio","audio_asset_id":asset},
        "background":{"type":"color","value":"#62b3f3"}}],
        "dimension":{"width":1280,"height":720}}
    resp = api("POST","/v2/video/generate",body)
    vids[r["tag"]] = resp["data"]["video_id"]
    print("SUBMITTED", r["tag"], vids[r["tag"]], flush=True)
    time.sleep(2)

for tag,vid in vids.items():
    for _ in range(90):
        time.sleep(20)
        d = api("GET","/v1/video_status.get?video_id="+vid)["data"]
        if d["status"]=="completed":
            f=str(OUT/(tag+"_ask.mp4")); urllib.request.urlretrieve(d["video_url"], f)
            state[tag]["mp4"]=f; save(); print("DOWNLOADED", f, flush=True); break
        if d["status"]=="failed":
            print("FAILED", tag, d.get("error"), flush=True); break
print("BATCH DONE", flush=True)
