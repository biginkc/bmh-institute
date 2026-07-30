import json, os, time, urllib.request, subprocess
import pathlib
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lessonGLOA"
os.makedirs(OUT, exist_ok=True)
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"

BEATS = [
 ('b01_open', "We already talked about mindset previously, and now you have a general sense of what we do and who we serve. This module isn't going to repeat any of that. What we're doing here is giving you the vocabulary to match the conversations you're already starting to have."),
 ('b02_library', "Terminology is different from any other kind of training. You're not going to absorb all of this in one sitting and that's completely normal. Expect to come back to this video. Expect to watch certain sections two or three times. The goal right now is familiarity, not memorization. The more calls you make, the more these terms will start clicking into place naturally. Let's get into it."),
 ('b03_distressed', "A distressed property is a home that's either in rough physical shape, or owned by someone going through a hard situation in life. Maybe the roof is caving in. Maybe the owner just lost their job. Maybe someone passed away and left the house to a family member who lives three states away and has no idea what to do with it."),
 ('b04_car', "Think of it like this. You know how sometimes you see a car on the side of the road with the hood up, hazard lights on, and nobody around? That car isn't going to sell at full price on a dealership lot. Someone is going to come along, fix it up, and resell it. That's essentially what happens with distressed properties. We come in, we make a fast cash offer, and we help the seller move on."),
 ('b05_why', "Why does this matter? Because every single person we engage with is a potential distressed property owner. The first job in any conversation is to find out if they're in that situation — and to make sure the right person at BMH takes them through the next step."),
 ('b06_asis', "When we say we buy as-is, we mean we're not asking the seller to fix anything. No repairs, no cleaning, no staging. We take the house exactly the way it is."),
 ('b07_asis_call', 'This is a huge relief for sellers who don\'t have the money or the energy to fix things up. On a call, a seller might say something like "the place needs a lot of work" or "I haven\'t been able to keep up with repairs." That\'s actually good news. That\'s your signal to say "that\'s totally fine, we buy homes in any condition."'),
 ('b08_offmarket', "An off-market property is a home that is not listed for sale anywhere publicly. There's no sign in the yard. There's no listing online. The seller hasn't hired a real estate agent. They may not have even decided they want to sell yet."),
 ('b09_sweetspot', "This is the sweet spot for the BMH Group. We reach out directly to homeowners before they ever consider going the traditional route. Think of it like getting a reservation at a restaurant that hasn't even opened to the public yet. You're in before anyone else knows about it."),
 ('b10_mls', "Now here's an important distinction. On-market means the property is listed on something called the MLS. MLS stands for Multiple Listing Service. It's a database that licensed real estate agents use to post homes for sale. When you see a house listed on Zillow or Realtor.com, it almost always came from the MLS."),
 ('b11_onmarket', 'Here\'s the thing. We don\'t target on-market properties. By the time a house hits the MLS, there\'s usually an agent involved, the price reflects the market, and there\'s not much room for us to make the numbers work. If a seller on a call says "I already have it listed with an agent" or "it\'s on Zillow," that\'s an important flag. Don\'t hang up, but do note it and let the acquisition manager know. Sometimes listed properties don\'t sell and that seller comes back around.'),
 ('b12_listed_expired', "A listed property is simply one currently for sale through an agent on the MLS. An expired listing is one that was listed but never sold. The seller tried the traditional route and it didn't work out. Now they might be frustrated, more motivated, and very open to a direct cash offer. Expired listings can be great leads."),
 ('b13_dom', 'Days on market is how long a property has been sitting on the MLS without selling. A house listed for 200 days is a house the seller is probably desperate to get rid of. High days on market is a motivation signal.'),
 ('b14_fsbo', "FSBO means the seller is trying to sell the house themselves without an agent. They're not paying a commission. They're handling everything directly. This often means they're motivated and willing to talk, which makes them a good potential lead for us."),
 ('b15_garage_sale', "Now let's talk about what the BMH Group does with the properties we put under contract. Our primary strategy is wholesaling. Imagine you find a garage sale where someone is selling a rare collectible for $5 because they don't know what it's worth. You know a collector who would pay $500 for it. So you make a deal with the garage sale owner to buy it for $5, then you go sell it to your collector for $500. Your profit is the difference. That's wholesaling in real estate."),
 ('b16_wholesale_re', "We find a distressed property, get it under contract at a price that works for the seller's situation, and then we sell that contract to an end buyer or cash buyer who will renovate and resell or rent the property. We never have to actually close on the house ourselves most of the time. We just facilitate the deal."),
 ('b17_assignment', 'When we wholesale, we do it through something called an assignment of contract. This is where we transfer our rights in the purchase agreement to another buyer. Instead of us closing on the property, the end buyer closes on it. Our fee for finding the deal and putting it together is called the assignment fee.'),
 ('b18_double_close', "Sometimes instead of assigning the contract, we do what's called a double close. This means we actually purchase the property and then immediately sell it to the end buyer in two back-to-back closings. This is a little more involved but it protects our profit margin when needed."),
 ('b19_subject_to', "Subject-To means we purchase a property subject to the existing mortgage staying in place. The seller's loan doesn't get paid off. We take ownership but the original mortgage stays in the seller's name. Think of it like taking over someone's car payments."),
 ('b20_seller_fin', "Seller Financing means the seller acts as the bank. Instead of us going to a lender, we make payments directly to the seller over time. You likely won't negotiate these on calls, but knowing they exist lets you confidently say our team has several ways to structure this depending on the situation."),
 ('b21_recap', 'We target distressed, off-market properties. We buy as-is for cash. We primarily wholesale, which means we get a property under contract and sell that contract to an end buyer for a profit. The MLS is the public listing database agents use, and we generally avoid on-market properties. Expired listings and FSBO sellers are worth noting as potential leads. The first job in any conversation is identifying motivated sellers and getting them talking.'),
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
print("GLOA AUDIO DONE:", done, "/", len(BEATS), flush=True)
