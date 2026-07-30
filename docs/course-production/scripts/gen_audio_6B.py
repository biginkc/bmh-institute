import json
import os
import pathlib
import subprocess
import time
import urllib.request

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
OUT = f"{BMH_ROOT}/course-assets/heygen/lesson6B"
os.makedirs(OUT, exist_ok=True)

FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
FORCE = {tag.strip() for tag in os.environ.get("FORCE_AUDIO_6B", "").split(",") if tag.strip()}

BEATS = [
    (
        "b01_intro",
        "Alright, let's talk about the handoff. This is Stage Four in the pipeline, and it is make-or-break. You've done discovery. You know the story. The seller is qualified, they're motivated, and they're ready to hear an offer. Now it's time to hand this lead to the acquisition team. And I cannot stress enough how much a good handoff matters. Bad handoffs kill deals that should have closed.",
    ),
    (
        "b02_crmnotes",
        "Here's what the process looks like. First, complete your CRM notes. Every field filled out. Every detail from discovery documented. The acquisition manager should be able to read your notes and understand the seller's full situation without having to call you and ask twenty questions. If they have to chase you down for basic info, that's on you.",
    ),
    (
        "b03_briefam",
        "Second, brief the acquisition manager. And I don't mean just drop a lead in their queue and walk away. Give them real context. Something like, \"This is Diane in Dayton. She's had a duplex for eleven years and she's completely burned out from tenant issues. She's two months behind on taxes and wants to sell before the end of summer. She inherited the place from her father and there's some emotional attachment there, so be sensitive to that.\" See how much information is packed into that? The acquisition manager can walk into that call completely prepared. They know the story, they know the pressure points, and they know where to be careful.",
    ),
    (
        "b04_transfer",
        "Third, either warm-transfer the seller directly to the acquisition manager while you've still got them on the phone, or set a specific appointment. You might say something like, \"What I'd like to do next is connect you with our acquisitions team. They're the ones who'll evaluate the property and put together a formal offer for you. Can I set up a call for tomorrow at 2pm?\" Give them a specific time. Don't leave it vague.",
    ),
    (
        "b05_frame",
        "And fourth, frame the handoff for the seller so they know what's coming. Don't just disappear on them. Say something like, \"So here's what happens next. Our acquisition manager is going to reach out to you. They'll ask a few more detailed questions about the property, and then they'll put together an offer for you. No pressure, no obligation. You can take as long as you need to think about it.\" That gives the seller confidence that there's a real process here. Real people are involved. They're not being bounced around randomly between strangers.",
    ),
    (
        "b06_checklist",
        "Before you move any lead to Stage 4, make sure you've got the full seller story documented, their motivation clearly articulated, their timeline confirmed, the property condition described, their price expectations noted, the decision-maker confirmed, their financial situation understood including mortgage balance and any liens or back taxes, their best contact time and method noted, any hot buttons or sensitivities flagged, and the acquisition manager briefed. If you can check all of those, you've done your job. A thorough handoff is what separates someone who's just okay at this from someone who's genuinely good.",
    ),
    (
        "b07_killers",
        "Let me tell you what kills handoffs, because I've seen all of these happen. Incomplete information. The acquisition manager has to re-ask everything you already covered, and the seller gets frustrated. \"I already told the other person all of this.\" That's a terrible start to what should be a smooth process. Next, no context on motivation. The acquisition manager doesn't know the emotional drivers, accidentally steps on a landmine, and the seller shuts down completely. And no warm introduction. The seller gets a random call from someone new and their guard goes right back up. They're thinking \"oh great, here we go again.\" Avoid those three things and you're going to be in great shape.",
    ),
    (
        "b08_outro",
        "That's discovery and handoff. Now let's go practice. Your roleplay for this module is a tired landlord who's been dealing with a duplex for eleven years and has just about had it. Show us what you've got.",
    ),
]


def api(method, path, body=None):
    request = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read())


state_path = f"{OUT}/_state.json"
state = json.load(open(state_path)) if os.path.exists(state_path) else {}


def save():
    with open(state_path, "w") as handle:
        json.dump(state, handle, indent=1)


for tag, text in BEATS:
    beat_state = state.setdefault(tag, {})
    if tag in FORCE:
        beat_state.clear()
    if beat_state.get("wav"):
        continue
    try:
        data = api(
            "POST",
            "/v3/voices/speech",
            {"text": text, "voice_id": FRIENDLY, "speed": 1.0},
        )["data"]
        raw_path = f"{OUT}/{tag}_raw.wav"
        wav_path = f"{OUT}/{tag}.wav"
        urllib.request.urlretrieve(data["audio_url"], raw_path)
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                raw_path,
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ar",
                "44100",
                wav_path,
                "-y",
            ],
            check=True,
        )
        beat_state.update(
            wav=wav_path,
            duration=data.get("duration"),
            words=data.get("word_timestamps"),
            text=text,
            voice=FRIENDLY,
        )
        print("audio", tag, round(data.get("duration") or 0, 1), flush=True)
    except Exception as error:
        detail = (
            error.read().decode()[:200]
            if hasattr(error, "read")
            else str(error)
        )
        print("AUDIO FAIL", tag, detail, flush=True)
    save()
    time.sleep(1.5)

done = sum(1 for beat_state in state.values() if beat_state.get("wav"))
total = sum(beat_state.get("duration") or 0 for beat_state in state.values())
print("6B AUDIO DONE:", done, "/", len(BEATS), "total", round(total, 1), "s", flush=True)
