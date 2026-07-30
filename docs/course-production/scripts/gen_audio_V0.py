#!/usr/bin/env python3
"""Generate Video Zero cold-open VO (background narration, NOT lip-synced).

Approved verbatim 13-beat full-length script (Jarrad, 2026-07-15; expands the
2026-07-11 5-beat script to fill the 78s picture — original beats verbatim
except b02, revised "Well, not really"). Andrea course voice, speed 1.0
(never 0.95), loudnorm I=-16:TP=-1.5:LRA=11, per-beat wavs + _state.json with
word timings. Audio only — no avatar/video work.
"""

import json
import os
import pathlib
import subprocess
import time
import urllib.error
import urllib.request


ROOT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
OUT = ROOT / "course-assets/heygen/lessonV0"
STATE_PATH = OUT / "_state.json"
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
FORCE = {tag.strip() for tag in os.environ.get("FORCE_AUDIO_V0", "").split(",") if tag.strip()}

BEATS = [
    ("b01_thesis", "People think we buy houses."),
    ("n01_numbers", "That it's all numbers — contracts, closings, commissions."),
    ("b02_notreally", "We don't. Well, not really."),
    ("n02_time", "What we buy is time — for people who've run out of it."),
    (
        "n03_mornings",
        "Every morning starts the same way. The list is already waiting. "
        "And somewhere on that list is a family that thinks nobody's coming.",
    ),
    ("n04_go", "So we go."),
    (
        "b03_foreclosure",
        "Last year, foreclosure came for more than three hundred thousand families. "
        "Most of them never listed — never got the sign in the yard, the open house, the offers.",
    ),
    ("n05_clock", "No agent. No plan. Just a clock running down."),
    (
        "n06_letters",
        "By the time the letters turn certified, most folks stop opening the mail. "
        "Shame does that. Fear does that.",
    ),
    ("b04_showup", "They just needed someone to show up."),
    ("n07_options", "Not to save them... not exactly. More like giving them options they didn't know they had."),
    (
        "n08_thework",
        "That's the work. That's the whole business. "
        "Solve the problem, and the profit follows. Every time.",
    ),
    (
        "b05_theturn",
        "Somewhere out there, a family's running out of options. Today, we get to be one. Let's go.",
    ),
    # 2026-07-15 finale revision: b05 split into narration + on-camera line ("Let's do it")
    ("b05a_somewhere", "Somewhere out there, a family's running out of options."),
    ("b05b_letsdoit", "Today, we get to be an option. Let's do it."),
    # 2026-07-16: on-camera line locked to this wording (Jarrad)
    ("b05c_matters", "Today, we will be the option that matters."),
]

OUT.mkdir(parents=True, exist_ok=True)
state = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}


def save():
    temp = STATE_PATH.with_suffix(".json.tmp")
    temp.write_text(json.dumps(state, indent=1) + "\n")
    os.replace(temp, STATE_PATH)


def api(method, path, body=None):
    request = urllib.request.Request(
        f"https://api.heygen.com{path}",
        method=method,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read())


def error_text(error):
    if isinstance(error, urllib.error.HTTPError):
        return error.read().decode(errors="replace")[:1000]
    return str(error)


for tag, text in BEATS:
    beat = state.setdefault(tag, {})
    wav_path = OUT / f"{tag}.wav"
    if (
        tag not in FORCE
        and wav_path.exists()
        and beat.get("text") == text
        and beat.get("voice") == FRIENDLY
        and beat.get("speed") == 1.0
    ):
        print("skip", tag, flush=True)
        continue
    try:
        data = api(
            "POST",
            "/v3/voices/speech",
            {"text": text, "voice_id": FRIENDLY, "speed": 1.0},
        )["data"]
        raw_path = OUT / f"{tag}_raw.wav"
        raw_temp = raw_path.with_suffix(".wav.tmp")
        wav_temp = wav_path.with_suffix(".wav.tmp")
        urllib.request.urlretrieve(data["audio_url"], raw_temp)
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(raw_temp),
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ar",
                "44100",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                "-f",
                "wav",
                str(wav_temp),
                "-y",
            ],
            check=True,
        )
        os.replace(raw_temp, raw_path)
        os.replace(wav_temp, wav_path)
        beat.clear()
        beat.update(
            wav=str(wav_path),
            duration=data.get("duration"),
            words=data.get("word_timestamps") or [],
            text=text,
            voice=FRIENDLY,
            speed=1.0,
            loudnorm="I=-16:TP=-1.5:LRA=11",
        )
        print("audio", tag, round(data.get("duration") or 0, 2), flush=True)
        save()
    except Exception as error:
        message = error_text(error)
        beat["error"] = message
        save()
        print("AUDIO FAIL", tag, message[:500], flush=True)
        if any(word in message.lower() for word in ("credit", "insufficient", "balance")):
            raise SystemExit("V0 AUDIO HALT: INSUFFICIENT CREDITS")
        raise
    time.sleep(1.5)


complete = [
    tag
    for tag, text in BEATS
    if state.get(tag, {}).get("text") == text and pathlib.Path(state[tag].get("wav", "")).exists()
]
total = sum(float(state[tag].get("duration") or 0) for tag, _ in BEATS)
print("V0 AUDIO DONE", len(complete), "/", len(BEATS), "total", round(total, 2), "s", flush=True)
if len(complete) != len(BEATS):
    raise SystemExit("Video Zero audio validation incomplete")
