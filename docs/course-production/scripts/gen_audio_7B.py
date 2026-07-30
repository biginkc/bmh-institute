import json, os, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson7B"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"   # Elizabeth-Friendly (all Andrea narration)
EXCITED  = "91120f72682e4459a19e311ba2ee4cb2"   # Elizabeth-Excited (unused for now)

# ---- ANDREA narration: intro (cue1 verbatim) + your-turn (reworded) + 32 comebacks + summary + outro ----
# em-dashes normalized to commas for clean TTS (script file keeps the dashes for on-screen text).
ANDREA = [
 ("b01_intro", "Welcome. If you're here, that means you've already put in work. You know the framework, listen, acknowledge, ask, redirect, and you've seen the most common objections. This lesson is where it becomes muscle memory. We're going to drill real objections, one after another. The exact lines sellers throw at you on real calls. Here's the honest truth about objection practice. You're not going to walk away from one watch with all of this locked in. That's not how it works and that's not the expectation. What we want is reps. Every objection you drill here makes the real one easier to hear, and every time one shows up on a call, you'll handle it a little better than the last time.", FRIENDLY),
 ("b02_yourturn", "Here's how each drill works. A seller throws the objection. You take a beat, your turn, and think about how you'd handle it. Then I'll give you the line I'd use, so you can compare it against yours. Ready for our first objection?", FRIENDLY),
 ("d01_comeback", "I think we are probably capped but I can see if there is room, but before I do that, are you ready to sign and move forward today?", FRIENDLY),
 ("d02_comeback", "You really don't want my number yet. If I lead, you'll just shop it and kick me out before I even see the house. Since you know it best, where would you like to be so I can see if I can come up toward it? If you truly don't know, imagine you did know, what would that look like? Or think Craigslist: you wouldn't list a car for zero dollars and say make me an offer. Give me your start-high number so I know the target.", FRIENDLY),
 ("d03_comeback", "That can be a great path if you've got time and the house is list-ready. If you want speed and convenience, I'm your cash-or-terms lane. Which matters more right now, highest possible price or certainty and timeline? If price wins, I can often meet it with terms; if speed wins, I'll keep it simple and certain.", FRIENDLY),
 ("d04_comeback", "No problem. What has to happen before selling makes sense? When that happens, do you want me to bring a clean cash option, a terms option that gets you closer to your price, or both so you've got a simple choice?", FRIENDLY),
 ("d05_comeback", "Absolutely. When do you two usually connect? I'll text a simple summary so it's easy to review together, then we can confirm what fits after you've both looked it over.", FRIENDLY),
 ("d06_comeback", "Happy to share. We are a partnership, and we close with a local title company so everything's transparent. Do you prefer I email you a quick one-pager with our info?", FRIENDLY),
 ("d07_comeback", "I get it. No rush at all. When's a good time to chat again? I can answer more questions at that time if you want.", FRIENDLY),
 ("d08_comeback", "Yes. I can send current proof of funds and a couple of recent settlement statements so you can see we actually close. We'll keep it simple and verifiable through title.", FRIENDLY),
 ("d09_comeback", "Public records and standard outreach. If you prefer text or email going forward, I'm good with that. Is the property something you're open to selling if the timing and terms make sense?", FRIENDLY),
 ("d10_comeback", "I would encourage you to. There are attorneys at the title company as well. They can answer questions for you too.", FRIENDLY),
 ("d11_comeback", "Makes sense if time, cash, and contractors line up. What's the budget and timeline you're expecting? If you're over that by even a little, I can trade you convenience for price and keep you out of contractor roulette.", FRIENDLY),
 ("d12_comeback", "Totally fair. Let's make this painless. Do you want me to bring you a simple cash number with no showings and a quick close, or a terms option that gets you closer to your price without you lifting a finger?", FRIENDLY),
 ("d13_comeback", "I'm probably not your buyer for a bidding circus. I'm the certain, no-drama lane. If that route doesn't deliver what you want, I'll be here with a clean number and performance.", FRIENDLY),
 ("d14_comeback", "Good to hear. Out of curiosity, what path did you choose and what would make it even better? If there's a gap on timing, certainty, or hassle, I can fill it without blowing up your plan.", FRIENDLY),
 ("d15_comeback", "That can work if you're prepared for vacancies, repairs, and collections. If a tenant misses a month, are you set to float it and handle the calls? If not, I can turn this into mailbox money for you without landlording, by buying on terms at your price and making the payment painless.", FRIENDLY),
 ("d16_comeback", "Totally fine. Quick heads-up though, if I lead before I see everything, you'll just shop my number. Since you know the house best, where would you like to be so I can see if I can come up toward it? If you truly don't know, give me your start-high number so I know the target, then I'll confirm it after a quick walk.", FRIENDLY),
 ("d17_comeback", "Fair question. I do buy a lot when it fits my portfolio, and when it doesn't, I still solve the problem. Sometimes I keep it, sometimes I partner, sometimes I place it with someone on my team. Either way, you get a clean, certain outcome without games. What matters more to you, speed or squeezing every last dollar?", FRIENDLY),
 ("d18_comeback", "I place deals in a few lanes, sometimes I buy, sometimes I keep it as a rental, and sometimes I assign it to a partner who's the better fit. Regardless of the lane, your price, timeline, and certainty don't change. Do you care who's on the other side of the table if you get the exact outcome we agree on?", FRIENDLY),
 ("d19_comeback", "You won't have to. I buy as-is and keep it simple. One quick walkthrough for photos so I know what I'm buying, no punch lists, no nickel-and-diming. If something major pops up we didn't know about, we talk like adults or I release you cleanly. Certainty over drama, fair?", FRIENDLY),
 ("d20_comeback", "No problem. Title will pull a payoff so we have exact numbers. Ballpark, do you think you're above water, at break-even, or a little short? Once we see the payoff, I'll bring you a cash option and a terms option so you can choose what fits.", FRIENDLY),
 ("d21_comeback", "Happens a lot. I buy with occupants in place and take the problem off your plate. I'll handle cash-for-keys or the legal process after closing so you don't have to. If I make this my headache and keep you out of court, are you open to moving forward?", FRIENDLY),
 ("d22_comeback", "You're not stuck. If price is the blocker, we can trade price for terms. I can take over the existing payment and structure the rest so you're not writing a check to sell. If I cover arrears and make the monthly painless, does that solve it?", FRIENDLY),
 ("d23_comeback", "There's still a path if we move now. I can bring the loan current, stop the sale, and take over payments so you can breathe again and rebuild your credit with on-time pays showing up each month. If I handle the catch-up and line up your move, is that the outcome you want?", FRIENDLY),
 ("d24_comeback", "Understood. Let's reverse-engineer it. If that's your walk-away number, we can get there two ways: a lower cash price with zero fees and speed, or closer to your number on terms. If I can guarantee your net without you lifting a finger, which lane do you prefer, cash or terms?", FRIENDLY),
 ("d25_comeback", "Easy. I can close, fund you, and let you stay for an agreed period with a simple per-day use fee and a holdback so you feel safe and I feel safe. If I give you certainty now and the time to move later, are we good to button this up?", FRIENDLY),
 ("d26_comeback", "Same page. I don't play that game. I give a number I can actually close on, and if something truly major comes up that neither of us knew about, we either talk like adults or I release you cleanly so you can move on. Certainty over games, fair?", FRIENDLY),
 ("d27_comeback", "Totally fair. Most folks haven't had it explained clearly. Terms just means we can trade flexibility for price, payment, interest, or timeline, so you get what you want without drama. If I can hit your price and make the monthly painless while we close at a local title company, does that ease the concern?", FRIENDLY),
 ("d28_comeback", "Understood. We'll keep it fully off-market. No signs, no photos online, one discreet walkthrough, and we close through a local title company. Only the people who need to know are involved. If privacy stays intact and the numbers work, are you comfortable moving forward?", FRIENDLY),
 ("d29_comeback", "Got it. I can bring a clean cash number with a short timeline and no repair requests. The only box we have to check is clear title so funds are safe and you're protected. If I make it simple and certain on your schedule, are we good?", FRIENDLY),
 ("d30_comeback", "I can send a clean number. Quick heads-up though, if I shoot blind without two minutes of context, I'll either overbid or underbid and waste your time. Give me condition, timing, and what you need to walk away with, and I'll send my best in writing and keep it straightforward.", FRIENDLY),
 ("d31_comeback", "Absolutely, it's a big decision and I'd never want you to feel rushed. Can I ask what specifically you're weighing? I might be able to give you some more information that helps.", FRIENDLY),
 ("d32_comeback", "Completely understand. Before I let you go, is there a reason you responded to our outreach in the first place? Sometimes things change over time and I just want to make sure we haven't missed something.", FRIENDLY),
 ("b_summary", "You just covered a lot of ground. Dozens of real objections that are going to show up in your calls every single day. Here's what I want you to take with you. You don't need a perfect answer memorized for every one of these. What you need is the framework, listen, acknowledge, ask, redirect, and enough reps that when a seller pushes back, a bell goes off. That's when this training starts doing its job.", FRIENDLY),
 ("b_outro", "Come back to these drills. Rewatch the ones that didn't fully land yet. That's not a sign you missed something. That's just how practice works. It sticks when you start hearing it in real conversations. Next up: the complex stuff, the objections that make most people on the phone freeze. You've got the foundation. Let's build on it.", FRIENDLY),
]

# ---- SELLER pushbacks: loaded from the durable seller map (built by build_seller_map_7B.py) ----
# Each seller wav gets ~2.5s trailing silence so the HeyGen clip ends on a natural idle for the ~30s hold.
# Run with --sellers to generate. Map = course-assets/heygen/lesson7B/_seller_map.json.
_map_path = OUT + "/_seller_map.json"
SELLER = ([(r["tag"], r["text"], r["voice_id"]) for r in json.load(open(_map_path))]
          if os.path.exists(_map_path) else [])

# ---- THEME section intros (Andrea VO over each divider still; generated by default at speed 1.0) ----
THEME = [
 ("t_price",       "First up, price. This is when a seller pushes back on the number, they want more, or they want you to name yours first.", FRIENDLY),
 ("t_competition", "Next, competition. These come up when the seller's shopping around, talking to other investors, or thinking about listing.", FRIENDLY),
 ("t_delay",       "Now, delay. This is the seller who wants to slow things down, they need time, or they want to talk to someone first.", FRIENDLY),
 ("t_trust",       "Let's talk trust. These are the moments a seller isn't sure who you are, or whether they can believe what you're telling them.", FRIENDLY),
 ("t_asis",        "Now, as-is. These are about the house itself, repairs, condition, and who deals with the work.", FRIENDLY),
 ("t_distress",    "And finally, distress. The hardest spots, foreclosure, underwater, behind on payments, where you're really there to solve a problem.", FRIENDLY),
]

def api(method, path, body=None):
    req = urllib.request.Request("https://api.heygen.com"+path, method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

sp = OUT+"/_state.json"
state = json.load(open(sp)) if os.path.exists(sp) else {}
def save(): json.dump(state, open(sp, "w"), indent=1)

import sys
SELLER_SILENCE = 2.5  # trailing idle tail seconds for seller clips
do_sellers = "--sellers" in sys.argv
BEATS = ANDREA + THEME + (SELLER if do_sellers else [])

for tag, text, voice in BEATS:
    st = state.setdefault(tag, {})
    if st.get("wav") and os.path.exists(st["wav"]): continue
    try:
        d = api("POST","/v3/voices/speech",{"text":text,"voice_id":voice,"speed":1.0})["data"]
        raw = OUT+"/"+tag+"_raw.wav"; wav = OUT+"/"+tag+".wav"
        urllib.request.urlretrieve(d["audio_url"], raw)
        af = "loudnorm=I=-16:TP=-1.5:LRA=11"
        if tag.endswith("_seller"):
            af += f",apad=pad_dur={SELLER_SILENCE}"   # idle tail for the ~30s hold
        subprocess.run(["ffmpeg","-v","error","-i",raw,"-af",af,"-ar","44100",wav,"-y"], check=True)
        st.update(wav=wav, duration=d.get("duration"), words=d.get("word_timestamps"), text=text, voice=voice)
        print("OK", tag, round(d.get("duration") or 0,1), flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:200] if hasattr(e,'read') else str(e)
        print("FAIL", tag, msg, flush=True)
    save(); time.sleep(1.5)
print("7B AUDIO:", sum(1 for s in state.values() if s.get("wav")), "wavs saved", flush=True)
