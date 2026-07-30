#!/usr/bin/env python3
"""Measure anim->tail handoff pops in a TECH-A render: frame-to-frame YAVG delta across a
7-frame window centered on each anim end boundary. Threshold 1.5 (GLO-A precedent: raw
tails fail at 2.7-4.4; master-cut tails pass at <=0.14).
Usage: qc_handoffs_TECHA.py <render.mp4>"""
import json, subprocess, sys
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

PUB = f"{BMH_ROOT}/docs/course-production/remotion/public/lessonTECHA"
render = sys.argv[1]
m = json.load(open(f"{PUB}/manifest.json"))
fps = m["fps"]

def yavgs(t0, n):
    out = subprocess.check_output(
        ["ffmpeg","-v","info","-ss",f"{t0:.4f}","-i",render,"-frames:v",str(n),
         "-vf","signalstats,metadata=print:key=lavfi.signalstats.YAVG","-f","null","-"],
        stderr=subprocess.STDOUT).decode()
    return [float(l.split("=")[1]) for l in out.splitlines() if "YAVG" in l]

fails, cursor = [], 0
for b in m["beats"]:
    if b.get("anim"):
        boundary = cursor + b["animFrames"]
        ys = yavgs((boundary - 3) / fps, 7)
        deltas = [abs(ys[i+1] - ys[i]) for i in range(len(ys)-1)]
        peak = max(deltas) if deltas else -1
        print(f"{b['tag']}: boundary f{boundary} peak dYAVG {peak:.2f} {'FAIL' if peak > 1.5 else 'PASS'}")
        if peak > 1.5: fails.append(b["tag"])
    cursor += b["durationInFrames"]
print("FAILS:", fails or "NONE")
