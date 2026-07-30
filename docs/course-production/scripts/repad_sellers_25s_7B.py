#!/usr/bin/env python3
"""Re-pad every Lesson 7B seller wav to EXACTLY 25.0s (line spoken, then real silence to fill).
The HeyGen clip renders the avatar speaking + idling on camera for the full 25s — no Remotion loop.
Re-uses the existing *_raw.wav takes (no new TTS calls). Updates _state.json durations.
"""
import json, os, subprocess, pathlib
OUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/heygen/lesson7B"
TOTAL = 25.0
state = json.load(open(OUT+"/_state.json"))
rows = json.load(open(OUT+"/_seller_map.json"))
done = 0
for r in rows:
    tag = r["tag"]
    raw = f"{OUT}/{tag}_raw.wav"
    wav = f"{OUT}/{tag}.wav"
    if not os.path.exists(raw):
        print("NO RAW", tag); continue
    # loudnorm, then pad with silence and hard-cut to exactly 25.0s
    subprocess.run(["ffmpeg","-v","error","-i",raw,
        "-af","loudnorm=I=-16:TP=-1.5:LRA=11,apad",
        "-t",str(TOTAL),"-ar","44100",wav,"-y"], check=True)
    # verify
    d = float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=nw=1:nk=1",wav]).decode().strip())
    state.setdefault(tag,{})["duration"] = d
    done += 1
    print(f"{tag}: {d:.2f}s")
json.dump(state, open(OUT+"/_state.json","w"), indent=1)
print(f"re-padded {done} seller wavs to {TOTAL}s")
