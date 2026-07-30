#!/usr/bin/env python3
"""Generate Lesson ISP narration from the approved scene-card verbatim VO blocks."""

import json
import os
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.request


ROOT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
SCENECARDS = ROOT / "docs/course-production/shotlists/module-isp-lessonISP-scenecards.md"
OUT = ROOT / "course-assets/heygen/lessonISP"
STATE_PATH = OUT / "_state.json"
KEY = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()
FRIENDLY = "55f8c0f546884f9cbdefa113f5e7b682"
FORCE = {tag.strip() for tag in os.environ.get("FORCE_AUDIO_ISP", "").split(",") if tag.strip()}


def extract_beats():
    source = SCENECARDS.read_text()
    pattern = re.compile(
        r"^### (b\d+_[^\n]+).*?^Verbatim VO:\s*\n\s*>\s*(.+?)(?=\n\nAndrea mode:)",
        re.MULTILINE | re.DOTALL,
    )
    beats = []
    for match in pattern.finditer(source):
        tag = match.group(1).strip()
        text = " ".join(line.lstrip("> ").strip() for line in match.group(2).splitlines()).strip()
        beats.append((tag, text))
    expected = [f"b{i:02d}" for i in range(1, 23)]
    actual = [tag.split("_", 1)[0] for tag, _ in beats]
    if len(beats) != 22 or actual != expected:
        raise RuntimeError(f"Expected ordered b01-b22 VO blocks, got {actual}")
    return beats


BEATS = extract_beats()
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


def tts_text(tag, text):
    # Pronunciation-only expansion. The locked text remains unchanged in state["text"].
    if tag == "b01_isp_open":
        return text.replace("ISP", "I S P")
    if tag == "b04_regions":
        return text.replace("St. Louis", "Saint Lewis")
    return text


for tag, text in BEATS:
    spoken_text = tts_text(tag, text)
    beat = state.setdefault(tag, {})
    wav_path = OUT / f"{tag}.wav"
    if (
        tag not in FORCE
        and wav_path.exists()
        and beat.get("text") == text
        and beat.get("tts_text") == spoken_text
        and beat.get("voice") == FRIENDLY
        and beat.get("speed") == 1.0
    ):
        print("skip", tag, flush=True)
        continue
    try:
        data = api(
            "POST",
            "/v3/voices/speech",
            {"text": spoken_text, "voice_id": FRIENDLY, "speed": 1.0},
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
            provider_words=data.get("word_timestamps") or [],
            words=[],
            text=text,
            tts_text=spoken_text,
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
            raise SystemExit("ISP AUDIO HALT: INSUFFICIENT CREDITS")
        raise
    time.sleep(1.5)


complete = [tag for tag, text in BEATS if state.get(tag, {}).get("text") == text and pathlib.Path(state[tag].get("wav", "")).exists()]
total = sum(float(state[tag].get("duration") or 0) for tag, _ in BEATS)
print("ISP AUDIO DONE", len(complete), "/", len(BEATS), "total", round(total, 2), "s", flush=True)
if len(complete) != len(BEATS):
    raise SystemExit("Lesson ISP audio validation incomplete")
