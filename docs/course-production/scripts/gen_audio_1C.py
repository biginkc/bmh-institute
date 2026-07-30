import json, os, time, urllib.request, subprocess
import pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson1C"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

BEATS = [
 ("b01_intro", "Now let's walk through the conversation flow. This is not a telemarketer read-off."),
 ("b02_open-line", "Open with this exact line. \"Catch me up to speed. Where are you at in the process right now?\" That line works because it gets people talking without feeling interrogated. It signals that you are not starting from zero."),
 ("b03_intel", "From there, ask \"How have the other investors treated you?\" and \"What did your real estate agent say?\" Assume they have explored other options. That assumption lowers their guard and pulls real intel without sounding nosy."),
 ("b04_lowballers", "A seller who says \"the other investors were all lowballers\" is telling you exactly how to position yourself as different."),
 ("b05_timeline", "Next shift to timeline. If a seller pushes for price early, reframe it. Timing and certainty matter as much as price."),
 ("b06_anchor", "Do not give your number first. Say you are waiting on your partner and ask, \"Do you and your family have a number you are looking for?\" That is how you extract their price anchor without giving up leverage. You learn where they are before you show your hand."),
 ("b07_cash-road", "Then use the cash road to open the door. \"If I were making a cash offer, I would probably be around X. Is that where other offers are?\" That line tests their reaction and opens the door to a terms conversation. It naturally leads to, \"I can do cash or terms. Do you want me to explain what I mean by terms?\""),
 ("b08_123", "It is a simple 1-2-3. Step one, gather information. Step two, test the cash lane. Step three, open creative."),
 ("b09_higher-offer", "A seller says they have another offer on the table and it is higher than yours. Do not panic and do not chase. Ask, \"Is that offer cash or are there contingencies attached?\" When you can close in two weeks with no contingencies, that certainty has real dollar value that a higher number with strings attached does not. Make sure they understand what they are actually comparing."),
 ("b10_quiet", "Another common scenario is the seller who goes quiet after a good first call. Do not read that as rejection. Call back and say, \"Hey, I was thinking about your situation and I wanted to share one idea.\" Bring something new. A different structure, a solution to the logistic problem they mentioned, or just a genuine check-in. Most deals that close after multiple touchpoints close because someone stayed consistent without being pushy."),
 ("b11_movie", "The centerpiece of every call is the thought experiment. Help them write the ending of the movie, then reverse engineer the steps. \"Let's pretend we work together and close in a few weeks. Where are you sleeping the first night after closing? What is the toughest part about getting there?\" Painting that end state surfaces obstacles you can actually solve, like post-possession, moving help, or payoff timing. When their picture of the future is cloudy, fear wins and deals stall. When you make the logistics clear, you become their person."),
 ("b12_not-buyer", "\"I might not be your buyer, and that is okay. If I am not the right fit, I will point you to the right option.\" That move earns you permission to present options without pressure."),
 ("b13_too-high", "Now let's cover what to do when a seller's number is too high. Do not fight it. Reframe, test reality, and invite terms."),
 ("b14_align", "Start by aligning. Totally get why you want that number. If I were you, I would want the most too. That keeps status even and avoids a debate."),
 ("b15_win-window", "Then shift to timeline. \"If we solved this in the next 30 to 90 days, what needs to be true for you to feel like this was a win?\" When they tell you why that date matters, you have found the real lever. Now you can create value instead of arguing over price."),
 ("b16_cash-truth", "Bring the cash lane in to gather truth. \"If I were making a cash offer, I would probably be around X. Is that where others are?\" If they push back or say they owe more, that is exactly what you need to hear to structure it correctly."),
 ("b17_perform", "And be direct about how you operate. Most buyers will tell you any number to get a contract, then come back for reductions later. I would rather give you a number I can actually perform on. Certainty is a form of value, and it is something most buyers cannot offer."),
 ("b18_headline", "If they still want retail, pivot to terms. \"I can come up toward your price if you will give me terms. Do you want me to explain what I mean by terms?\" Price is a headline. Terms are the story. When terms fit their real-life needs, price intensity drops."),
 ("b19_no-number", "If they say they do not know their number, extract it without pressure. Imagine you did know. What would that look like? Or use the Craigslist example. Nobody lists a car with \"make me an offer\" because the first number just gets shopped. Same with houses. Once they feel you are being straight with them, they will give you a target."),
 ("b20_movie2", "Run the thought experiment again here. Let's pretend we close together. Where are you sleeping the first night after closing? How much cash is in your pocket? What is the toughest part of getting there? Once the end is vivid, you reverse engineer from there. That is where post-possession, moving help, or payoff timing often matter more than price, and those are chips you can trade that are not dollars."),
 ("b21_deposition", "If the gap stays too wide and they will not consider terms, de-position gracefully. \"I might not be your buyer at that price, and that is okay. I would rather point you to the right path than promise something I cannot perform on.\" You keep the relationship, and many of those sellers circle back after they test the market and realize your certainty was the real value all along."),
 ("b22_outro", "And that's a wrap on conversation flow. Great work sticking with me through this one. I encourage you to revisit this module frequently for a recap of our discussions. The script will guide you through the flow, but I hope this module has clarified the reasoning behind our responses. Practice the flow until it feels like yours. Next stop: the close. I'll see you there."),
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
        detail = e.read().decode()[:200] if hasattr(e,'read') else str(e)
        marker = "CREDIT-ERROR" if any(k in detail.lower() for k in ("credit","insufficient","quota")) else "AUDIO FAIL"
        print(marker, tag, detail, flush=True)
        if marker == "CREDIT-ERROR": break
    save(); time.sleep(1.5)
done = sum(1 for s in state.values() if s.get("wav"))
print("1C AUDIO DONE:", done, "/", len(BEATS), flush=True)
