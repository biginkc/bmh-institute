#!/usr/bin/env python3
"""Stage-7 QC harness for the Lesson 8A render (custom-video-qc procedure).
1. Audio: volumedetect (mean -20+/-6dB) + silencedetect (expect the 9x 1.0s inter-beat gaps, no others).
2. Per-beat frame harvest (start+18 / mid / end-18, transition-safe) -> scratchpad for visual judgment.
3. Canonical-blue pixel check on video-beat corners (code owns #62b3f3; hero beach beats exempt, 8.4).
4. Handoff-pop check (11.7): consecutive-frame diff (YAVG of blend=difference) at every clip->tail
   boundary — flag any 1-frame delta > 1.5."""
import json, re, subprocess, sys

B = "/Users/jarradhenry/Sites/BMH apps/BMH Institute"
MP4 = f"{B}/docs/course-production/remotion/out/lesson8A.mp4"
PUB = f"{B}/docs/course-production/remotion/public/lesson8A"
SCRATCH = "/private/tmp/claude-502/-Users-jarradhenry-BMH-OS/3f4055bf-1d2d-4364-9da3-3e41211b64d5/scratchpad"
FPS = 30

man = json.load(open(f"{PUB}/manifest.json"))
beats = man["beats"]
starts = []
acc = 0
for b in beats:
    starts.append(acc)
    acc += b["durationInFrames"]

print("=== 1. AUDIO ===")
out = subprocess.run(
    f'ffmpeg -i "{MP4}" -af "volumedetect,silencedetect=noise=-50dB:d=0.8" -f null - 2>&1',
    shell=True, capture_output=True, text=True).stdout
mean = re.search(r"mean_volume: ([-\d.]+) dB", out)
silences = re.findall(r"silence_duration: ([\d.]+)", out)
print(f"mean_volume: {mean.group(1) if mean else 'MISSING'} dB (target -20 +/- 6)")
print(f"silences >=0.8s: {len(silences)} (expect ~9 gaps)  durations: {[round(float(s),2) for s in silences]}")

print("=== 2. FRAME HARVEST ===")
for b, s in zip(beats, starts):
    d = b["durationInFrames"]
    for name, f in (("a", s + 18), ("m", s + d // 2), ("z", s + d - 18)):
        subprocess.run(
            f'ffmpeg -v error -y -i "{MP4}" -vf "select=eq(n\\,{f})" -vframes 1 "{SCRATCH}/qcr_{b["tag"]}_{name}.png"',
            shell=True, check=True)
print("harvested 30 frames -> scratchpad/qcr_*.png")

print("=== 3. CANONICAL BLUE (video-beat far corners) ===")
def px(fr, x, y):
    return subprocess.check_output(
        f'ffmpeg -v error -i "{MP4}" -vf "select=eq(n\\,{fr}),crop=2:2:{x}:{y},scale=1:1" -vframes 1 -f rawvideo -pix_fmt rgb24 - | xxd -p | head -c6',
        shell=True).decode().strip()
for b, s in zip(beats, starts):
    if b["mode"] != "video":
        continue
    f = s + b["durationInFrames"] // 2
    # sample a corner that is open blue in every 8A video-beat composition (top-left except b04/b07/b09
    # which are left-composed -> use top-right... b09 label sits top-right; use bottom-left instead)
    x, y = (20, 856)
    h = px(f, x, y)
    ok = abs(int(h[0:2], 16) - 0x62) <= 3 and abs(int(h[2:4], 16) - 0xB3) <= 3 and abs(int(h[4:6], 16) - 0xF3) <= 3
    print(f"{b['tag']}: corner({x},{y}) #{h} {'OK' if ok else 'FAIL (b03 water region is scene content — judge visually)'}")

print("=== 4. HANDOFF-POP (clip->tail boundary consecutive-frame diff) ===")
def yavg_diff(f1, f2):
    subprocess.run(f'ffmpeg -v error -y -i "{MP4}" -vf "select=eq(n\\,{f1})" -vframes 1 "{SCRATCH}/_h1.png"', shell=True, check=True)
    subprocess.run(f'ffmpeg -v error -y -i "{MP4}" -vf "select=eq(n\\,{f2})" -vframes 1 "{SCRATCH}/_h2.png"', shell=True, check=True)
    o = subprocess.run(
        f'ffmpeg -i "{SCRATCH}/_h1.png" -i "{SCRATCH}/_h2.png" -filter_complex "blend=all_mode=difference,signalstats,metadata=print" -f null - 2>&1',
        shell=True, capture_output=True, text=True)
    m = re.search(r"YAVG=([\d.]+)", o.stdout + o.stderr)
    return float(m.group(1)) if m else -1

for b, s in zip(beats, starts):
    if b["mode"] != "video":
        continue
    vf = (b.get("videoFrames") or [0])[0]
    if vf >= b["durationInFrames"]:
        print(f"{b['tag']}: clip covers whole beat, no tail")
        continue
    bd = s + vf
    d = yavg_diff(bd - 1, bd)
    d2 = yavg_diff(bd, bd + 1)
    flag = "FAIL" if max(d, d2) > 1.5 else "OK"
    print(f"{b['tag']}: boundary@{bd}  diff(before->at)={d:.2f}  diff(at->after)={d2:.2f}  {flag}")

print("QC script done")
