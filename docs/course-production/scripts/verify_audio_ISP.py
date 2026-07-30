#!/usr/bin/env python3
"""Whisper every Lesson ISP WAV, store word timestamps, and diff against locked VO."""

import difflib
import json
import os
import pathlib
import re
import subprocess
import sys
import unicodedata


ROOT = pathlib.Path("/Users/jarradhenry/Sites/BMH apps/BMH Institute")
OUT = ROOT / "course-assets/heygen/lessonISP"
STATE_PATH = OUT / "_state.json"
WHISPER_OUT = OUT / "_whisper"
WHISPER = pathlib.Path("/Users/jarradhenry/Library/Python/3.9/bin/whisper")
MODEL = os.environ.get("WHISPER_MODEL_ISP", "small.en")


CONTRACTIONS = {
    "we're": "we are",
    "we've": "we have",
    "we'll": "we will",
    "let's": "let us",
    "they're": "they are",
    "they've": "they have",
    "they'll": "they will",
    "that's": "that is",
    "what's": "what is",
    "here's": "here is",
    "it's": "it is",
    "doesn't": "does not",
    "don't": "do not",
    "cannot": "can not",
}


def save(state):
    temp = STATE_PATH.with_suffix(".json.tmp")
    temp.write_text(json.dumps(state, indent=1) + "\n")
    os.replace(temp, STATE_PATH)


def normalize(text):
    text = unicodedata.normalize("NFKC", text).lower().replace("’", "'")
    for old, new in CONTRACTIONS.items():
        text = re.sub(rf"\b{re.escape(old)}\b", new, text)
    text = re.sub(r"\b30\b", "thirty", text)
    text = re.sub(r"\b10\b", "ten", text)
    text = re.sub(r"\bst\.?\b", "saint", text)
    text = re.sub(r"\bi\s+s\s+p\b", "isp", text)
    text = re.sub(r"\bb\s+m\s+h\b", "bmh", text)
    text = text.replace("as-is", "as is").replace("quick-close", "quick close")
    return re.findall(r"[a-z0-9]+", text)


def whisper_words(payload):
    words = []
    for segment in payload.get("segments") or []:
        for item in segment.get("words") or []:
            value = (item.get("word") or "").strip()
            if not value:
                continue
            words.append(
                {
                    "word": value,
                    "start": round(float(item.get("start") or 0), 3),
                    "end": round(float(item.get("end") or 0), 3),
                    "probability": item.get("probability"),
                }
            )
    return words


state = json.loads(STATE_PATH.read_text())
tags = sorted((tag for tag in state if re.match(r"^b\d{2}_", tag)), key=lambda tag: int(tag[1:3]))
if len(tags) != 22:
    raise SystemExit(f"Expected 22 audio beats, got {len(tags)}")
wav_paths = [pathlib.Path(state[tag]["wav"]) for tag in tags]
missing = [str(path) for path in wav_paths if not path.exists()]
if missing:
    raise SystemExit(f"Missing WAVs: {missing}")

WHISPER_OUT.mkdir(parents=True, exist_ok=True)
command = [
    str(WHISPER),
    *(str(path) for path in wav_paths),
    "--model",
    MODEL,
    "--language",
    "en",
    "--word_timestamps",
    "True",
    "--output_format",
    "json",
    "--output_dir",
    str(WHISPER_OUT),
    "--fp16",
    "False",
    "--verbose",
    "False",
]
subprocess.run(command, check=True)

failures = []
for tag, wav in zip(tags, wav_paths):
    transcript_path = WHISPER_OUT / f"{wav.stem}.json"
    payload = json.loads(transcript_path.read_text())
    expected = normalize(state[tag]["text"])
    actual = normalize(payload.get("text") or "")
    ratio = difflib.SequenceMatcher(a=expected, b=actual).ratio()
    exact = expected == actual
    opcodes = [
        {
            "op": op,
            "expected": expected[a0:a1],
            "actual": actual[b0:b1],
        }
        for op, a0, a1, b0, b1 in difflib.SequenceMatcher(a=expected, b=actual).get_opcodes()
        if op != "equal"
    ]
    words = whisper_words(payload)
    beat = state[tag]
    beat["words"] = words
    beat["whisper"] = {
        "model": MODEL,
        "transcript": (payload.get("text") or "").strip(),
        "normalized_exact": exact,
        "similarity": round(ratio, 6),
        "diff": opcodes,
        "json": str(transcript_path),
    }
    if not exact:
        failures.append((tag, ratio, opcodes, payload.get("text") or ""))
    print("WHISPER", tag, "PASS" if exact else "FAIL", f"ratio={ratio:.4f}", f"words={len(words)}")

# Explicit unit-expansion checks. Whisper may write digits, so normalize() maps them back to words.
critical = {
    "b04_regions": ["up", "to", "ten", "properties"],
    "b12_hard_filters": ["within", "thirty", "days"],
}
for tag, phrase in critical.items():
    actual = normalize(state[tag]["whisper"]["transcript"])
    hit = any(actual[index:index + len(phrase)] == phrase for index in range(len(actual) - len(phrase) + 1))
    state[tag].setdefault("whisper", {})["critical_phrase_pass"] = hit
    state[tag]["whisper"]["critical_phrase"] = " ".join(phrase)
    if not hit:
        failures.append((tag, 0, [{"critical_phrase_missing": phrase}], state[tag]["whisper"]["transcript"]))
    print("CRITICAL", tag, "PASS" if hit else "FAIL", " ".join(phrase))

save(state)
if failures:
    print(json.dumps({"failures": failures}, indent=2))
    raise SystemExit(f"Whisper verbatim verification failed for {len(failures)} beat(s)")
print("ISP WHISPER VERBATIM PASS 22/22")
