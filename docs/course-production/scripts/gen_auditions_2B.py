import json, os, time, urllib.request, subprocess, pathlib
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson2B/auditions"
os.makedirs(OUT, exist_ok=True)

# (seller, candidate label, voice_id, excerpt of that seller's real line)
AUD = [
 ("david","veteran-victor","7628976b151a4741a65bb5760ce71ce5","Being a landlord seemed like a dream at first. But now, I realize it's a nightmare. I wish I had chosen a different path."),
 ("david","warm-william","31e2fd6e7c924bc9be987ac4cfaac5e8","Being a landlord seemed like a dream at first. But now, I realize it's a nightmare. I wish I had chosen a different path."),
 ("ray","adam-stone","88bb9ee1c81b466eb2a08fdde86d3619","Wow, what a whirlwind life has thrown at me. I lost my job, and suddenly I'm the primary caretaker for my mom. I feel lost, but I know I have to figure it out."),
 ("ray","ethan","3293481c5b9e414f8517bbb59b95c082","Wow, what a whirlwind life has thrown at me. I lost my job, and suddenly I'm the primary caretaker for my mom. I feel lost, but I know I have to figure it out."),
 ("marcus","mellow-marcus","6344c50000744023a6fb9e50ec1d1f8b","I did everything I was supposed to — bought the house, worked hard — and I still owe more than it's worth. I just need someone to show me a way out."),
 ("marcus","jude","3295c84534da424db838ee9a0085f24d","I did everything I was supposed to — bought the house, worked hard — and I still owe more than it's worth. I just need someone to show me a way out."),
 ("beth","calm-chloe","77a8b81df32f482f851684c5e2ebb0d2","I still can't bring myself to walk back through that front door. And I know my mom wouldn't have wanted it to become this weight."),
 ("beth","grace","5200d0519c1648f9860bba3c15fcabc8","I still can't bring myself to walk back through that front door. And I know my mom wouldn't have wanted it to become this weight."),
 ("carol","margaret","f0240e6cefd541ac8031eeb9f3b71a82","I trusted the wrong contractor, and now there's a lien on my title and a fight I can't afford to keep having. I just want to be done with it."),
 ("carol","nancy","ac4d9b87d4bb4dc19f2115043b6ab583","I trusted the wrong contractor, and now there's a lien on my title and a fight I can't afford to keep having. I just want to be done with it."),
]

def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.heygen.com{path}", method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

ok = 0
for seller, label, voice, text in AUD:
    base = f"{seller}__{label}"
    out = f"{OUT}/{base}.mp3"
    if os.path.exists(out): ok += 1; continue
    try:
        d = api("POST","/v3/voices/speech",{"text":text,"voice_id":voice,"speed":1.0})["data"]
        raw = f"{OUT}/{base}_raw"
        urllib.request.urlretrieve(d["audio_url"], raw)
        subprocess.run(["ffmpeg","-v","error","-i",raw,"-af","loudnorm=I=-16:TP=-1.5:LRA=11","-ar","44100",out,"-y"], check=True)
        os.remove(raw)
        ok += 1; print("OK", base, round(d.get("duration") or 0,1), flush=True)
    except Exception as e:
        msg = getattr(e,'read',lambda:b'')().decode()[:200] if hasattr(e,'read') else str(e)
        print("FAIL", base, msg, flush=True)
    time.sleep(1.5)
print("AUDITIONS DONE:", ok, "/", len(AUD), flush=True)
